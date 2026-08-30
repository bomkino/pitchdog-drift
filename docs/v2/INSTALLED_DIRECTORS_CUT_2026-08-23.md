# Drift V2 Director's Cut — installed checkpoint receipt

Evidence captured: 23 August 2026

Implementation source: `39e6cd701dfddfebb02645789b2573e963ea4cbb`

Branch: `codex/v2-directors-cut`

Installed application: `/Applications/Drift V2 Dev.app`

Protected production application: `/Applications/Drift.app`

## Verdict

`39e6cd7` is the complete local V2 Director's Cut implementation checkpoint. It is source-tested, browser-tested, packaged, installed for all local users, launched from `/Applications`, and visually inspected on the real Mac desktop. Project V4, the canonical renderer and exporter, the complete curated creative system, the repaired pinned-frame system, and opt-in tactile sound are integrated.

This receipt does **not** claim a push, current exact-head CI, merge to `main`, Developer ID signature, notarisation, public release, publication, or owner approval. Those remain explicit gates. The evidence-documentation commit follows the installed implementation commit; the app itself truthfully records `39e6cd7` as its source.

## Product checkpoint

- Four editorial cuts, six performances, four motion characters, four pose cadences, and six handcrafted motion stacks.
- Toggleable background, slide, and pin entry/exit; body or whole-scene loops; repeat count; and authored or custom three-point tempo envelopes.
- Ten horizontal/vertical paths, four material systems, twelve light rigs, eight lens recipes, forty structural backgrounds, twenty palettes, eight Worlds at three pressures, and sixteen portrait scenes.
- Transparent and opaque output, deterministic animated grain, continuous corners, repaired borders and shadows, and a deformed rear slide shell.
- Project V4 authority, deterministic World transactions, locks, change receipts, 50-step undo/redo, and temporary non-mutating A/B comparison.
- Optional tactile sound from 23 local provenance-locked CC0 recordings, with three palettes, three grammars, preview audition, exact 48 kHz stereo mastering, and presenter-plus-sound mixing.

## Pinned slide and presenter control

The pin remains optional and off by default. It now exposes:

- still-only or still-plus-moving track membership;
- protected overlay or in-scene composition;
- independent width, X/Y position, and safe inset;
- source or custom aspect ratio;
- cover/contain fit and focal X/Y;
- matte colour and opacity;
- radius and continuous-corner smoothing;
- border width, colour, and opacity;
- shadow opacity, softness, and X/Y offset;
- presenter level, source trim, entry time, and mute.

Protected collision is local: cards near the pin yield into its clear lane without shrinking distant cards or flattening the rest of the composition.

## Source and browser evidence

| Gate | Exact evidence | Verdict |
| --- | --- | --- |
| Complete local source check | `npm run check` passed: TypeScript, 46 Vitest files, 319 tests, native contracts, guides, hardening, and production Web build | Pass |
| V2 browser build | `npm run build:v2-dev` passed | Pass |
| Representative WebGL2 inspection | 9:16 and 16:9 Worlds, atmosphere atlas, pin, thickness, grain, A/B, undo/redo, and sound controls inspected | Pass for inspected cases |
| Tactile MP4 export | Real browser export completed its internal verifier, then decoded as H.264 plus AAC LC, 48 kHz stereo | Pass |
| Tactile MP4 artifact | `256 × 456`, 30 fps, `3.008 s`, `1,184,435` bytes; SHA-256 `03fc6735f8c5ad8fd4bb639700bf3532eae8760f833f167b2fb2a03f3091f85c` | Pass |
| Audio restraint | Sparse test master measured approximately `-49.4 dB` mean and `-16.3 dB` peak | Informational; not listening approval |

The tactile browser session first exposed a real validation bug: sound-only MP4 had inherited the old presenter-required rule. The validator and regression test were repaired, the focused suite passed 12/12, and the subsequent real browser export succeeded. The session retains that historical pre-fix console entry, so this receipt does not misreport that particular session as error-free.

## Package and installation evidence

| Gate | Exact evidence | Verdict |
| --- | --- | --- |
| Source identity | Build receipt records `39e6cd701dfddfebb02645789b2573e963ea4cbb`, build `280` | Pass |
| Isolated identity | Bundle `dog.pitch.drift.v2.dev`; executable `DriftV2Dev`; separate cache, storage, WebKit store, and document boundary | Pass |
| Universal executable | Mach-O `arm64` and `x86_64` | Pass |
| Installed executable | SHA-256 `53d8eda73cd218b03ff8026f0e34c9f5938b05292b152746eb91de82189ac658` | Pass |
| Bundle integrity | `codesign --verify --deep --strict` passed; designated requirement satisfied | Pass |
| Sandbox | App Sandbox, user-selected read/write, and the declared WebKit network entitlement are present | Pass |
| Packaged WKWebView matrix | Sandboxed ad hoc, unsandboxed ad hoc, and sandboxed self-signed all reached `completed-product-pass`; the build and explicit verification each ran the matrix | 3/3 pass twice |
| Runtime diagnostics | Packaged boot diagnostics reported no console errors, uncaught errors, or unhandled rejections | Pass |
| Candidate → installed bytes | Recursive candidate/installed comparison produced no difference | Pass |
| All-user installation | Bundle is `0755`/`kay:admin`; its executable is `0755`; packaged contents are readable and traversable by all local users | Pass |
| Normal installed launch | Exact `/Applications/Drift V2 Dev.app/Contents/MacOS/DriftV2Dev` process launched as PID `7980`; its `1440 × 920` window was discovered | Pass |
| Installed desktop inspection | Retina screenshot `2880 × 1840`; SHA-256 `0e1e145fb39cd1b0fe629add34586c74ab2cdeb436cb56f6e12f8001c8fbf207` | Pass for boot/layout integrity |

The installed screenshot was preserved in the ignored local evidence path `output/installed-v2-dev-39e6cd7.png`; it was not committed, so this dated receipt deliberately does not link to a missing repository file. The installed app reused the existing isolated V2 Dev sandbox state; it was not reset or overwritten merely to manufacture a prettier default screenshot. For a committed representative studio image, see [`docs/media/drift-studio.png`](../media/drift-studio.png); that image is illustrative and is not the hash-bound installed capture above.

## Recovery and V1 preservation

The displaced V2 Dev source `03669850ebda8eb3d064e03bddc94430af6071bb` was copied into two recoverable local backups rather than deleted:

```text
build/install-backups/Drift V2 Dev-03669850ebda8eb3.app
build/install-backups/Drift V2 Dev-03669850ebda8eb3-displaced.app
```

Production V1 remains `/Applications/Drift.app`, source `5fd145207235884790ba071c5d84bc3876ff4989`. Its signature remains valid and its executable remains SHA-256 `d3af7e2824f89c595e6b8a04929afd75b67970cfe810bf5ecb031e2e887a62eb`.

## Exact state boundary

| State | Result |
| --- | --- |
| Implemented | Yes, at `39e6cd7` |
| Source-tested | Yes, 319/319 |
| Browser-export tested | Yes, including one decoded tactile H.264/AAC MP4 |
| Committed | Yes, local feature branch |
| Packaged | Yes, isolated V2 Dev candidate |
| Installed for all local users | Yes |
| Launched and desktop-inspected | Yes |
| Owner visual/listening approval | Not yet claimed |
| Pushed after the Director's Cut work | No |
| Exact-head remote CI | No |
| Merged to `main` | No |
| Developer ID signed/notarised/released/public | No |

## Known limits and next gates

- V2 Dev intentionally does not own production `.pitched` documents. Keep using V1 for real project-document work until that migration is separately authorized.
- The installed development app is ad-hoc signed, not Developer ID signed or notarised.
- The real browser path proved tactile H.264/AAC output and the packaged matrix proved the installed media runtime. An ordinary installed-interface sound MP4 has not yet been manually saved through the native Save panel and decoded.
- Automated visual checks and one installed screenshot cannot grant taste approval. The owner still decides whether the defaults, motion, grain, sound, and pin composition hold artistically.
- The next legitimate release sequence is: owner review → push exact documentation head → exact-head CI → review/PR decision → explicit merge authority → signing/notarisation/release work under a separately named artifact gate.

Until those gates are taken, `/Applications/Drift V2 Dev.app` is the complete local Director's Cut candidate and `/Applications/Drift.app` remains the protected production app.
