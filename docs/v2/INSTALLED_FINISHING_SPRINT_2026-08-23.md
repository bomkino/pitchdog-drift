# Drift V2 finishing sprint — installed checkpoint receipt

Evidence captured: 23 August 2026

Implementation source: `0a011f787a4d5204f5532ecf56777eb99610c760`

Branch: `codex/v2-directors-cut`

Installed application: `/Applications/Drift V2 Dev.app`

Protected production application: `/Applications/Drift.app`

## Verdict

The finishing-sprint implementation is committed, source-tested, browser-tested,
packaged as a universal isolated Mac application, installed for all local users,
launched from `/Applications`, exercised through its real AppKit menus, and
visually inspected on the real WebGL stage. The installed app saved a complete
portable project and exported an opaque 1080 × 1920 Cutting Map still; both files
were read back from their exact paths and independently decoded.

This receipt does **not** claim owner creative approval, a feature-branch push,
exact-head remote CI, merge to `main`, Developer ID signing, notarisation, public
release, or publication. Those remain explicit external gates. The evidence-only
documentation commit follows the implementation source recorded in the bundle.

## What the installed checkpoint contains

- Slides, World, Direct, and Master workspaces around one persistent Stage.
- Per-slide fit, focal point, scale, reset, and metadata-provable health.
- Exact Length and Reading Pace timing; one to one hundred complete deck passes;
  Fast · Slow · Fast and spin-then-read envelopes; cut closure and delivery receipt.
- Independently directable background, slide, and pin entry/exit; body or full-scene
  loops with an explicit repeat count.
- Story, Reel, Combined, and Custom preview-only guides with pin-overlap warnings.
- Sixty-four structural backgrounds across eight families, including eight Cutting
  Map, eight Quiet Grid, and eight Tidal Wave studies. All three new families use
  smooth restrained motion and recompose for horizontal and vertical stages.
- Eight Worlds, sixteen portrait scenes, ten paths, four materials, twelve lights,
  eight lenses, deterministic recuts, transparent bypass, and authored grain.
- A repaired optional pin with independent track membership, layer, size, X/Y,
  safe inset, ratio, fit, focal point, matte, continuous corners, border, shadow,
  presenter level, trim, entry time, and mute.
- Native Open, Save, Save As, and Revert for explicitly selected `.pitched` files,
  without registering V2 as their Finder owner.

## Source, browser, and export evidence

| Gate | Exact evidence | Verdict |
| --- | --- | --- |
| Complete source check | `npm run check`: 54 test files, 382 tests, TypeScript, 11 canonical Swift files, hardening contracts, guides, and production Web build | Pass |
| Browser E2E | All 38 cases green: 37 in the uninterrupted matrix plus the repaired transient-event case in its focused rerun | Pass |
| Optical atlas | 35 native-resolution captures across four ratios, eight Worlds, both-axis new-family samples, eight lenses, five finishes, and four grain-isolation plates; manifest, contact sheet, and SHA-256 inventory present | Pass for inspected cases |
| Long-export gate | 8/8 exact 24 fps Project V4 plans; complete 30 s/8-slide, 60 s/40-slide, and 180 s/200-slide H.264 stress exports; strict Rec.709, duration, frame, decode, resource, unload, WebGL continuity, and cancellation checks | Pass |
| Visual defects named by the owner | Slide border defaults to zero; no inspected translucent halo; fine two-scale 12 fps grain cadence; soft shadows and rear shell inspected | Pass for inspected cases |

The browser automation remains evidence for correctness and representative
optical behavior, not a substitute for the owner's final taste decision.

## Package and installed-runtime evidence

| Gate | Exact evidence | Verdict |
| --- | --- | --- |
| Build identity | Bundle build `282`; source `0a011f787a4d5204f5532ecf56777eb99610c760` | Pass |
| Isolated identity | Bundle `dog.pitch.drift.v2.dev`; executable `DriftV2Dev`; separate sandbox, store, cache, IndexedDB, and document boundary | Pass |
| Universal executable | Mach-O `arm64` and `x86_64` | Pass |
| Installed executable | SHA-256 `b80d53810cf264d64913bea496b041a6e83d249d184d437cdc99e0cc98def4e6` | Pass |
| Candidate → installed bytes | Recursive comparison of `build/macos/v2-dev/Drift V2 Dev.app` and `/Applications/Drift V2 Dev.app` reported no difference | Pass |
| Signature | `codesign --verify --deep --strict` passed; designated requirement satisfied | Pass |
| All-user installation | Bundle is `0755`/`kay:admin`; executable is `0755`; contents are readable and traversable by all local users | Pass |
| Packaged WKWebView matrix | Installed sandboxed ad hoc, derived unsandboxed ad hoc, and derived sandboxed self-signed variants all bound the exact executable identity and source, completed recovery, native document, media, storage, and network-lockdown probes, and reported zero boot diagnostics | 3/3 pass |
| Normal installed launch | Exact `/Applications/Drift V2 Dev.app/Contents/MacOS/DriftV2Dev` process launched as PID `45213` | Pass |
| Installed GUI inspection | Real Stage, World atlas, Cutting Map renderer, expanded pin controls, and native File menu inspected through the Mac accessibility tree and desktop pixels | Pass for inspected surfaces |

The packaged matrix receipt is preserved at
`build/macos/v2-dev/verify-packaged-webview/matrix-summary.json` in the local
build tree.

## Real installed document and still

The normal installed interface used **Save Project As…** through the AppKit save
panel, then used **Export PNG Still…** through the same native boundary.

| Artifact | Readback |
| --- | --- |
| `output/qa/installed-0a011f7/Installed GUI Check.pitched` | 12 MiB ZIP archive; every member passed `unzip -t`; SHA-256 `1ee805fe198a09c04114d5d8872b82276098c8dc09c332605902d2247dc28786` |
| `output/qa/installed-0a011f7/Installed Cutting Map Still.png` | PNG, 1080 × 1920, RGBA; alpha min/max both `1` (fully opaque); SHA-256 `bad91676a5df11c1ee636b0bee9c422c5f48184c92a81779364784c1acb94998` |

The still was opened at original resolution after readback. It shows the selected
Contour Notes Cutting Map world, fine paper/grain structure, an intact continuous
slide silhouette, and no translucent rectangular border around the artwork.

## Recovery and V1 preservation

The displaced V2 Dev installation was preserved rather than deleted:

```text
/Applications/.drift-v2-backups/20260823-123407-0a011f7/Drift V2 Dev.app
```

Production V1 remains `/Applications/Drift.app`, source
`5fd145207235884790ba071c5d84bc3876ff4989`. After the V2 installation its
signature still verifies and its executable remains SHA-256
`d3af7e2824f89c595e6b8a04929afd75b67970cfe810bf5ecb031e2e887a62eb`.

## Exact state boundary

| State | Result |
| --- | --- |
| Implemented | Yes, at `0a011f7` |
| Source-tested | Yes, 382/382 |
| Browser and long-export tested | Yes, within the exact boundaries above |
| Committed | Yes, local feature branch |
| Packaged | Yes, isolated V2 Dev candidate |
| Installed for all local users | Yes |
| Native project saved and decoded | Yes |
| Installed still exported, decoded, and visually inspected | Yes |
| Owner creative approval | Not yet claimed |
| Pushed after the finishing sprint | No |
| Exact-head remote CI | No |
| Merged to `main` | No |
| Developer ID signed/notarised/released/public | No |

## Remaining gates

1. Kay reviews the installed candidate and its defaults, motion, grain, pin, and
   new background families.
2. If approved, push the exact documentation head and verify remote CI on that
   exact SHA.
3. Decide the PR/merge gate explicitly; do not infer it from local green state.
4. Treat Developer ID, notarisation, public binary release, and publication as a
   separate release artifact run.

Until those gates are taken, `/Applications/Drift V2 Dev.app` is the complete
local finishing-sprint candidate and `/Applications/Drift.app` remains the
protected production app.
