# Architecture

Drift has one non-negotiable invariant: export is a deterministic evaluation of saved project state, not a recording of a real-time preview.

## Scene path

```text
StudioSettings + ordered assets + time
                  │
                  ▼
          pure evaluate(t)
                  │
      ┌───────────┴───────────┐
      ▼                       ▼
interactive preview     fixed-step export
rAF + input inertia     frame n → n / fps
      │                       │
      └───────────┬───────────┘
                  ▼
       Three.js scene + raw GLSL
```

`src/engine/evaluate.ts` owns spatial geometry and time-derived distance. It has no DOM, GPU, or clock dependency. `CinematicCarousel` owns Three.js resources, input state, texture lifecycle, and preview timing. Export temporarily gives the same renderer an exact output surface and calls `renderAtAsync(time)` for each planned frame.

The moving track is a virtual strip whose slot count is always a complete multiple of the asset count. That prevents duplicated neighbours at the wrap seam for awkward 1, 2, and N-item sets. When more candidates are visible than the 24-mesh pool can draw, nearest-to-centre candidates are selected before transparent draw ordering. Only potentially visible textures are decoded; cache identity includes verified content identity rather than asset ID alone, late decode generations cannot replace newer intent, and source bitmaps are closed on eviction.

## Rendering

- WebGL2 is required for the cinematic renderer.
- The renderer uses sRGB output and `NoToneMapping`; source textures are tagged sRGB.
- The slide vertex shader bends a subdivided plane from bounded, normalised velocity.
- The slide fragment shader handles cover/contain sampling, focal position, antialiased superellipse corners, borders, grain, and alpha.
- A separate shader scene draws animated backgrounds. Transparent mode skips it entirely.
- The pinned frame is a separate scene object. It never inherits moving-track transforms.
- Presenter preview uses `VideoTexture`. Deterministic output instead draws decoded samples into a stable canvas and updates a `CanvasTexture` before rendering each frame. A single binder gives an active export frame strict precedence over preview media, and pinned images are awaited even when they sit outside the moving mesh pool.
- Presenter playback follows the renderer state: user pause, export, context loss, document hiding, or disposal pauses the actual media element. Restore returns both UI and media to the truthful prior state.

WebGPU/TSL is not the v1 primary path. WebGL2 currently gives the project a broader, better-proven route through canvas capture and browser video encoding. The evaluator and settings model are deliberately renderer-independent enough for a later WebGPU backend.

## Export

`src/lib/exportStudio.ts` owns output truth.

1. Validate dimensions, duration, fps, encoder support, canvas support, destination, and presenter tracks.
2. Build exactly `round(duration × fps)` frame records.
3. Decode presenter samples at monotonic timestamps when present.
4. Render frame `n` at `n / fps` and await encoder backpressure before advancing.
5. Finalise through either an in-memory target or rollback-aware File System Access target.
6. Reopen the completed MP4 with Mediabunny and verify the container, video track, fps, dimensions, count, duration, colour metadata, decoded probe frames, and audio track.
7. Reject the artifact if presenter A/V timing exceeds one output frame.

Mediabunny’s [software AAC extension](https://mediabunny.dev/guide/extensions/aac-encoder) is registered for presenter audio because current native WebCodecs AAC paths do not expose priming metadata reliably; see the [WebCodecs specification issue](https://github.com/w3c/webcodecs/issues/626) and [Mediabunny tracking issue](https://github.com/Vanilagy/mediabunny/issues/444). A measured packet-level residual remains, so audio-bearing output is capped at 30 fps. Muted presenter video may use 50/60 fps.

PNG stills and sequence frames are decoded after capture. Transparent output checks both an alpha-capable channel and actual non-opaque pixels. Directory sequences verify names, sizes, dimensions, and frame count. ZIP sequences also byte-compare entries after roundtrip.

## Projects and recovery

`src/lib/projectStore.ts` treats browser storage and portability as separate promises.

- The current project is committed atomically to IndexedDB with original media Blobs.
- Every asset receives a SHA-256 digest.
- A portable `.pitched` ZIP contains a versioned manifest and sanitised asset paths.
- Import validates schema, engine/theme versions, size limits, order, duplicate/missing/unexpected entries, and every asset digest before touching the current project.
- Import failure leaves the previous saved project intact.
- Startup hydration, media decoding, and portable imports share one ordered operation lane. The later user action wins even when earlier hashing or decoding is artificially delayed.
- Autosaves execute in invocation order and expose only the newest revision as current UI state.
- A saved project that cannot hydrate enters a recovery lock. Fallback demos may render, but autosave stays disabled. When storage integrity was verified before app compatibility or hydration failed, portable recovery re-verifies and repackages the preserved manifest and media; corrupt storage is never presented as a recoverable archive.

Object URLs are runtime handles only. They are recreated from stored Blobs and revoked when assets leave the project.

The current recovery protocol is single-tab. Independent tabs writing the same project are not coordinated; one editor tab plus portable backups is the supported workflow.

## Failure boundaries

- WebGL2 denial: show the DOM strip; block cinematic export.
- Context loss: pause drawing, preserve project data, reflag textures on restore.
- Corrupt image or unsupported video codec: reject that asset and keep the project.
- Output larger than browser/encoder capability: fail preflight.
- Unsafe PNG ZIP size: require directory output or smaller settings.
- Cancellation: abort the target; if a platform close already committed, truncate the cancelled file to zero.
- H.264 transparency request: output remains explicitly opaque; use PNG for alpha.
- Presenter audio above 30 fps: fail with a stable sync error; never silently drop audio.

## Privacy

The production application contains no fetch/XHR/WebSocket path and no runtime service integration. Vite is only a local development server. Imported media, saved projects, and renders remain on the device unless the user deliberately moves an exported file.

## Sonic path

Sound follows the same state-first rule as the renderer. `src/sonic/plan.ts` derives semantic passage times from saved motion settings, asset count, slide geometry, and the pure distance evaluator. It does not inspect animation frames or record real-time preview.

Preview uses a lazy, user-gesture-unlocked `AudioContext` with a bounded voice pool. Export uses `OfflineAudioContext` to render the same passage vocabulary into an exact 48 kHz stereo bed. Editor-only grab, release, control, success, and failure cues are excluded from the master.

MP4 contains at most one AAC track. When presenter speech and sound design coexist, decoded presenter PCM is mixed sample-by-sample with the effects bed before AAC encoding. The mixer owns timestamp mapping, interpolation, channel mapping, gain, and clipping. Completed output passes the existing codec, duration, sync, and decoded-probe readback gates.

All cue bytes are local, pinned, and hash-ledgered. Vite compiles committed WAV recordings inline; production sound has no runtime network path. See [Sonic design](SONIC_DESIGN.md).
