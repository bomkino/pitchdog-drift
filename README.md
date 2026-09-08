# Drift

Drift turns pitch-deck images and silent video clips into authored moving-image sequences. It runs locally on Apple silicon Macs using AppKit, SwiftUI and Metal. The deployment floor is macOS 13.3.

## Install

Use the [latest stable native release](https://github.com/bomkino/pitchdog-drift/releases/latest). It must contain a matching `Drift-VERSION-macOS-arm64.dmg`, its `.sha256`, `MacReleaseReceipt.json`, and `Install-Drift.command`. Older source-only releases are not native installers. The receipt identifies the tested source, build, signing status and exact download bytes.

Download `Install-Drift.command` from that release and run it with `bash` in Terminal. It downloads and verifies the matching installer before requesting normal Quit, respects cancelled Quit, stages the replacement on the destination volume, and retains the previous app for rollback. Use `--destination "$HOME/Applications"` for an existing writable user Applications folder. Do not use sudo. Projects and originals are preserved.

For the 0.5.0 studio UI candidate, use the [prerelease listing](https://github.com/bomkino/pitchdog-drift/releases) and follow its explicit release-directory installation instructions. Running the installer without that option selects the stable release.

Default builds are **ad-hoc signed and unnotarized**. For a verified trusted download blocked by macOS, use System Settings → Privacy & Security → Open Anyway. Do not disable Gatekeeper or strip quarantine. Developer ID and notarization have a separate required verification lane.

## Direct a sequence

Add media, arrange slides, choose a World and its pressure, then adjust Look, Motion or the selected Slide. Eight authored Worlds retain 72 variants, recorded sound, motion recipes and optical treatments. The new-document canvas is **2576 × 1080**; changing World or using Recut never changes those dimensions.

Pin, Spotlight and Closing are independent assignments. Moving media can occupy each role. Source clips loop independently of deck repeats. A finite presentation has one Closing after all passes; Loop keeps the assignment but disables its use. Video-slide audio stays silent. Optional Drift sound uses the retained recorded palette.

Export MP4, a PNG still or numbered PNG frames. PNG supports transparency; MP4 requires an explicit opaque result. Preview and export evaluate the same native frame plan.

The interface follows macOS **Light, Dark or Auto** appearance. Artwork keeps its own colors. Native `.pitched` documents use a new ZIP64 format with unchanged original media; older web/hybrid projects are not migrated.

## Build and verify

Use an Apple silicon Mac with **full Xcode**, its selected developer directory, Node.js 22+, CMake, glslang, spirv-cross, FFmpeg and XcodeGen. These are build/test tools, not installed-app dependencies. Command Line Tools alone may lack Metal, XCTest or SwiftUI macro plugins.

```sh
npm ci
npm run check
npm run test:mac
python3 scripts/generate-native-fixtures.py
npm run build:mac
DRIFT_SOURCE_REVISION="$(git rev-parse HEAD)" bash scripts/package-native-app.sh
npm run test:mac:app
npm run package:mac
```

Packaging requires a clean committed checkout and the exact app's successful external UI-test receipt. It never rebuilds or re-signs the tested bundle. Required CI `verify` includes source contracts, full native integration, the real application journey and mounted installer verification.

See the [user guide](docs/MACOS_USER_GUIDE.md), [architecture](docs/ARCHITECTURE.md), [release procedure](docs/MACOS_RELEASE.md), [current state](docs/STATUS.md), and [changelog](CHANGELOG.md). Historical browser/hybrid sources remain reference and build-time creative inputs; they are not shipped runtimes or supported products.

Copyright pitch.dog. Source is AGPL-3.0-or-later. Keep [LICENSE](LICENSE), [NOTICE](NOTICE), [third-party notices](THIRD_PARTY_NOTICES.md), [asset licenses](ASSET-LICENSE.md), exact native dependency notices and recorded-sound provenance with distributions. No account, analytics, runtime downloads or cloud service is required.
