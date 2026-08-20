# QA receipt

Checked on 20 August 2026 in desktop Google Chrome 151 on macOS. This receipt separates source checks, browser behavior, decoded media, and limits; none substitutes for the others.

## Frozen source and browser suite

- Frozen application/package source fingerprint: `af6c7258b744d86834b38cfe602f1b016899db1e3b9206e0460d89281ab6557d`.
- Immutable production bundle fingerprint: `63308fbaef88fbd9a03b069f229e2b10075b5b224f56df5996cd8c18e994b648`.
- `npm run check`: TypeScript passed, all 58 focused Vitest checks passed, and the Vite production build passed.
- A clean, cold `CI=1 npm run test:e2e` passed all 16 real-Chrome tests in 2.2 minutes on the frozen source.
- The browser run covers WebGL2 boot, controls, context loss/restore, 320/390 px layouts, keyboard/file-picker access, empty/1/12/corrupt inputs, audio-only presenter rejection, saved starter replacement, presenter pause/export truth, fresh-profile portability, recovery quarantine, stale-save ordering, export lifecycle/preflight recovery, DOM fallback, straight-alpha PNG colour, focal edge reach in both axes, renderer-pool pressure, same-ID media replacement, late presenter decode, and pinned-image export outside the moving mesh pool.
- The immutable production capture used native ANGLE Metal on an Apple M2. It recorded zero console errors and zero page errors.

## Decoded master evidence

The production UI generated the following local QA artifacts. Rendered masters stay in the ignored `artifacts/qa/` folder because the public repository is source-only.

| Artifact | Direct readback |
| --- | --- |
| Opaque master | H.264, 1080 × 1920, yuv420p, exact 30/1 fps, 90/90 decoded frames, 3.000 s, BT.709 primaries/transfer/matrix, no audio |
| Presenter master | H.264 video: 1080 × 1920, 30/1 fps, 90/90 frames, 3.000 s, BT.709. AAC: 48 kHz stereo, 3.008 s. End offset +8 ms, below one 30 fps frame (33.333 ms) |
| Transparent still | PNG, 1080 × 1920, RGBA. Alpha min 0, max 1, mean 0.208331, proving both transparent and visible pixels |
| Public screenshot | PNG, 1440 × 900, captured from the same immutable production run |

SHA-256:

```text
5ce68413dad7f96c927e9817433717c21c594b8bded7155424c38a48490604a2  opaque MP4
a531608d26e6473d52771f73549851d0ca4560e17305ba8a0919ac851f4c26ef  presenter MP4
c51d2240ba7e502f0e6d74c78a8fdaa1a98863754128943e5e7f6be4e01f2560  transparent PNG
fcede1f6cda77717bfba2f5a57c1cafb2c5e6a370f4618bf8d0ed2fa761c38a0  public screenshot
```

Both MP4s passed complete ffmpeg decode with `-xerror`. Frames 0, 45, and 89 were extracted from each master and visually inspected. The moving deck changes across time without black or corrupt frames; the presenter remains pinned while its synthetic mouth state changes, proving time-indexed video decode rather than a frozen poster frame.

Machine-readable local receipts are `artifacts/qa/final-media-verification.json`, `artifacts/qa/final-ui-evidence.json`, and `artifacts/qa/final-sha256-manifest.txt`.

## Renderer falsification

- sRGB regression probe: `#808080` rendered and captured as exact `[128, 128, 128, 255]`; the production MP4 remained within expected codec quantization and carried BT.709 tags.
- Cover focal controls reached the source’s left/top, center, and right/bottom content. Contain preserved the complete source and placed its letterbox band at the requested screen edge.
- A half-alpha gray source round-tripped as `[128, 128, 128, 128]` and composited over white as `[191, 191, 191]`, closing the dark-fringe/double-premultiplication failure.
- All 24 background-style × fit × axis shader paths compiled without a GL error in the targeted browser probe.
- Oversized output was rejected against real GPU limits before renderer or canvas state changed.
- Extreme custom ratios could not evict the centered slide from the 24-mesh renderer pool.
- Replacing an asset with the same project ID but different verified bytes changed the rendered texture; a delayed older presenter decode could not overwrite later preview or fixed-step export intent.
- A pinned image outside the selected moving pool was decoded and bound before its export frame. Presenter grain and animation use the evaluated frame time, not the preview clock.

## Projects and recovery falsification

The persistence module passed eight focused tests plus an isolated Chrome harness for save/load/export/clear, import-without-mutation, and corrupt-import preservation. The integrated app then survived hostile browser replays that ordinary happy-path tests had missed:

- a delayed older autosave could not overwrite a newer imported project;
- delayed import A followed by import B reopened as B;
- delayed startup hydration A followed by early user import B showed a truthful loading lock, then reopened as B;
- overlapping 101 + 101 image batches decoded only remaining capacity, stopped at 200, saved, and reopened normally;
- an unsupported saved project remained quarantined instead of being replaced by fallback demos;
- failed storage of a valid replacement restored the fallback view and retained `recovery locked`; when the locked storage was already integrity-verified, recovery re-verified and repackaged the preserved manifest and media without replacing IndexedDB (the resulting ZIP is not claimed to be byte-identical to an earlier archive);
- malformed engine/theme/settings/descriptors/references and contradictory pin states were rejected without replacement;
- saved starter-study ownership survived reload, so the first real deck still replaced the studies instead of mixing with them;
- removing an unpinned presenter video preserved an unrelated pinned slide;
- an audio-only MP4 and invalid video metadata were rejected before project mutation;
- presenter playback paused with the carousel, export, context loss, and document hiding, then restored to the truthful prior state.

## Responsive and fallback surfaces

Direct browser checks passed at 1440 × 900, 1024 × 768, 390 × 844, and 320 × 568. Below 1120 px, the interface becomes explicit Media / Stage / Director panels. At 320 and 390 px the document width and height remain equal to the viewport, the footer stays reachable, hidden file inputs stay outside Tab order, reorder controls work from the keyboard, and segmented controls expose visible focus.

With WebGL2 denied, media, themes, and portable projects remain usable. MP4 export fails before opening a destination picker and announces that the cinematic renderer is unavailable.

## Release hygiene

- `npm audit` reports zero known vulnerabilities at the checked lockfile.
- Runtime source contains no analytics, remote font, cloud upload, fetch/XHR/WebSocket client, or embedded secret.
- CI actions are pinned to immutable commit SHAs and use read-only repository permissions.
- Local browser traces, rendered masters, portable projects, build output, and environment files are ignored.
- The repository publishes source only. Compiled distribution remains blocked until the embedded FFmpeg WASM provenance and LGPL corresponding-source/relink obligations are satisfied.

## Known, deliberate limits

- Complete export behavior is verified in current desktop Chrome. Brave is a capability-gated target, not an independently verified runtime in this receipt.
- Moving-track video is not v1 scope. One pinned presenter video is.
- Presenter audio masters are limited to 24/25/30 fps. Muted presenter video may export at 50/60 fps.
- Portable assets are capped at 80 MiB total / 64 MiB each; archive input is capped at 96 MiB.
- Full 1080 × 1920 PNG sequences should stream to a directory. The in-memory ZIP route rejects unsafe estimates.
- Simultaneous independent tabs editing the same IndexedDB project were not conflict-tested; use one editor tab and portable backups.
- These checks prove the tool and included study. They do not pre-approve the pacing or legibility of a future user deck.
