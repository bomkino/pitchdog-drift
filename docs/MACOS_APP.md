# Drift for macOS

Drift now includes a small native AppKit shell. It packages the existing deterministic React/WebGL studio inside `WKWebView`; it does not fork the rendering engine or replace the verified fixed-step export path.

## What the native shell owns

- A normal macOS application bundle, window lifecycle, menus, full-screen behavior, and app icon.
- Universal `arm64` and `x86_64` compilation from one dependency-free Swift source target.
- Native `NSSavePanel` and `NSOpenPanel` flows.
- Opaque file grants. JavaScript never receives an arbitrary filesystem path.
- Rollback-safe staged writes for MP4 and PNG-frame output. A destination is replaced only after the writable stream closes successfully.
- Chunked readback so the existing MP4 validator can inspect the actual persisted file.
- A native fallback for ordinary Blob downloads such as still PNGs and `.pitched` project bundles.
- A WebKit content-rule boundary that blocks HTTP, HTTPS, WebSocket, and FTP requests at runtime.
- Persistent WebKit website data, which preserves the existing IndexedDB project library between launches.

The bridge deliberately implements only the narrow File System Access surface Drift already uses. It does not expose general paths, recursive deletion, shell execution, arbitrary native calls, or remote navigation.

## Requirements

- macOS 13 or newer.
- Xcode Command Line Tools with the macOS SDK.
- Node.js 22.12 or newer and npm.

## Build

```bash
npm ci
npm run build:mac
open build/macos/Drift.app
```

The default build:

1. validates the JavaScript bridge, Python icon generator, shell script, and web bundle;
2. rebuilds Vite with file-relative asset URLs;
3. creates `Drift.app`;
4. compiles both Apple Silicon and Intel Swift binaries;
5. merges them with `lipo`;
6. generates `Drift.icns` without third-party tooling;
7. applies an ad-hoc local signature;
8. verifies the signature and runs the bundled smoke test.

Useful overrides:

```bash
# Build only Apple Silicon while iterating.
DRIFT_MACOS_ARCHS=arm64 npm run build:mac

# Reuse an existing dist/ web build.
DRIFT_SKIP_WEB_BUILD=1 npm run build:mac

# Sign with a Developer ID identity rather than an ad-hoc signature.
DRIFT_CODESIGN_IDENTITY="Developer ID Application: Example, Inc. (TEAMID)" npm run build:mac
```

The output directory can be changed with `DRIFT_MACOS_OUTPUT_DIR`. The minimum deployment target defaults to macOS 13 and can be overridden with `DRIFT_MACOS_DEPLOYMENT_TARGET`.

## Verification

```bash
APP="build/macos/Drift.app"
plutil -lint "$APP/Contents/Info.plist"
codesign --verify --deep --strict "$APP"
lipo -verify_arch arm64 x86_64 "$APP/Contents/MacOS/Drift"
"$APP/Contents/MacOS/Drift" --smoke-test
```

CI performs the same source, universal-binary, bundle, signature, and smoke checks on macOS. CI intentionally does **not** upload a compiled `.app` artifact.

Before a public release, run the existing visual and export QA matrix inside the packaged app on physical Apple Silicon and Intel Macs. The shell is capability-gated by the same WebCodecs probes as the browser build; unsupported video encoders must fail visibly rather than silently changing the export format.

## Signing and notarization

A local ad-hoc build opens on the machine that built it. Public distribution requires a Developer ID certificate, hardened runtime signing, notarization, and stapling. A release pipeline should perform those steps only after the licensing boundary below is closed.

## Compiled-distribution boundary

Presenter-audio MP4 export currently uses `@mediabunny/aac-encoder`, whose shipped WebAssembly bundle includes FFmpeg/libavcodec components under LGPL terms. Building Drift locally from source is supported. Redistributing a compiled application is still blocked until the project can ship the exact corresponding FFmpeg source and configuration, preserve the required notices, and provide a compliant relink/replacement path for the LGPL-covered component.

For that reason:

- this branch does not commit or upload a compiled `.app`;
- CI proves that the app can be built from source but does not create a downloadable binary artifact;
- signing and notarization instructions are documented but not automated as a release;
- `THIRD_PARTY_NOTICES.md` remains the source of truth for the unresolved release obligations.

Do not solve this by quietly deleting the notice or calling an ad-hoc build “distribution-ready.” Either satisfy the obligations with auditable provenance and corresponding source, or replace the software AAC path with an independently verified native implementation before shipping binaries.
