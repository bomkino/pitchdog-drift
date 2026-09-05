# Drift

Drift is a local-first Mac directing instrument: turn pitch-deck images and video clips into authored moving-image sequences.

**Mac only.** The maintained product is an Apple-Silicon-only `arm64` application. Intel Macs and Windows are unsupported; Linux and browser builds are not products. Browser tooling remains an internal renderer/test harness during the native migration.

## Current release line

`0.3.0` adds silent video slides with looping and source trim, complete media-aware undo, safer project replacement, native Save-on-close, frame timecode, and a direct export form. Original files remain embedded in portable `.pitched` projects.

The application still uses an AppKit window and native file/audio infrastructure around a WKWebView editor and Three.js renderer. It is **not yet** the planned NSDocument/Metal application. [Status](docs/STATUS.md) records the remaining boundaries. A source tag is not proof of a downloadable or validated Mac binary; use the matching release asset and its build receipt.

## Direct a sequence

Add images or silent video slides. Arrange the deck, select a look, direct motion and timing, and export MP4, a PNG still, or numbered PNG frames. Optional presenter video retains its separate audio/timing and protected composition controls.

Video slides loop by default. Turn **Loop video** off to hold the final frame instead. Their clock begins at master time zero; repeated cards referencing the same clip share that source clock. Source loops and whole-sequence seamless loops are separate. A source cut is not blended automatically, and a whole-master loop is only seamless when its authored timing and all media close together. Video slides are silent; their original audio bytes remain in the project but do not enter the mix. Use the presenter slot for voice. Pinning a moving video slide is not available in this release; image pins and the separate presenter are retained.

The file-backed native AAC backend accepts audio-bearing masters up to 300 seconds at 24, 25, or 30 fps. The 50/60 fps paths remain silent-only. The native encoder probe is required before accepting this increased duration boundary; it does not replace long-form mixed-output testing. Existing project limits remain 64 MiB per original, 80 MiB total originals, and a 96 MiB portable archive. A moving deck admits up to eight video sources with a combined decoded-frame budget of 33,177,600 pixels. These are conservative implementation limits, not measured physical-Mac performance guarantees.

## Build and validate

On an Apple-silicon Mac with Xcode Command Line Tools and Node.js 22:

```sh
npm ci
npm run build:mac
npm run verify:mac
npm run package:mac
```

The deployment floor remains macOS 13.3; the actual operating system tested by a particular build is recorded separately. Ad-hoc signed test DMGs are not notarized and are not represented as Gatekeeper-ready distribution. Developer ID distribution retains its separate signing and notarization gate.

```sh
npm run typecheck
npm test
npm run check:mac-source
CI=1 npx playwright test e2e/video-slides.e2e.ts --project=production
```

The last command is a browser engine regression check, not a packaged-app test. Its fixture is generated with FFmpeg; public CI uses synthetic material only.

## Documentation

- [Mac user guide](docs/MACOS_USER_GUIDE.md): editing, saving, video loops, and outputs.
- [Architecture](docs/ARCHITECTURE.md): current ownership and native migration boundary.
- [Status](docs/STATUS.md): the single current implementation/validation record.
- [Mac packaging and release](docs/MACOS_RELEASE.md): signing and distribution.
- [Changelog](CHANGELOG.md): versioned changes.

Dated QA, programme, and V2 documents describe their own snapshots; they do not certify this version. Historical Linux tooling remains in the repository for provenance, outside active product support.

## Authorship and licensing

Copyright pitch.dog. Source is AGPL-3.0-or-later; see [LICENSE](LICENSE), [NOTICE](NOTICE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [ASSET-LICENSE.md](ASSET-LICENSE.md). Keep attribution and bundled dependency licence texts with distributions. FontBlind v13 and Phosphor icon credits remain in the legal inventory.

## Local-first security boundary

The signed network-client entitlement remains app-wide because of the packaged WebKit topology. WebKit outbound policy is blocked; remote downloads never receive destination authority. This is not containment against arbitrary WebKit or macOS compromise. Default diagnostics use text-only Actions evidence suitable for a public repository. Synthetic test-media artifacts are explicitly separate; never publish client material.
