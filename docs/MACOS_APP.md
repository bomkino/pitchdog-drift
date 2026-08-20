# Drift for macOS

Drift’s standalone application is a small AppKit host around the exact production web engine. It is not Electron, a development-server launcher, or a second export implementation.

## Architecture

```text
Drift.app
└── Contents
    ├── MacOS/Drift                 universal Swift/AppKit executable
    ├── Info.plist                  document type, minimum OS, app identity
    └── Resources
        ├── Web/                    Vite `--mode macos` bundle
        ├── NativeBridge.js         main-frame-only renderer polyfill
        ├── Drift.icns
        ├── BuildManifest.txt       SHA-256 for executable and resources
        ├── Legal/
        └── Documentation/
```

The native source is deliberately split by responsibility:

- `DriftMain.swift` owns command-line smoke and self-test entry points.
- `DriftAppDelegate.swift` owns the one restored window, menus, Finder documents, navigation policy, native file inputs, process-crash recovery, and close/quit interlocks.
- `NativeBridgeHost.swift` owns reply-based WebKit messages, panels, import validation, runtime state, and broker dispatch.
- `NativeFileBroker.swift` owns opaque grants, staged writes, atomic replacement, readback, directory frames, cleanup, and executable falsification.
- `NativeModels.swift` owns bounded payload parsing and shared contracts.
- `WebViewSelfTest.swift` loads the copied app bundle with a nonpersistent WebKit store and proves the packaged React/bridge runtime starts.

The WebGL scene, project store, deterministic evaluator, media decode, H.264/PNG export, and output verification remain the existing TypeScript implementation. Preview and output therefore keep one source of scene truth.

## Why AppKit + WKWebView

Drift already contains a mature local-first WebGL editor and fixed-step media pipeline. Rewriting that renderer in Metal or Swift would create years of parity work and two sets of bugs. AppKit supplies what the browser cannot supply cleanly:

- application lifecycle;
- native window and menus;
- Finder document association;
- macOS file panels and App Sandbox grants;
- safe destination replacement;
- crash/quit interlocks;
- signing, entitlements, notarization, and packaging.

`WKWebView` supplies the existing HTML, React, Three.js, WebGL2, WebCodecs, IndexedDB, and canvas runtime. The bridge is a narrow capability adapter, not a general native RPC layer.

## Native file bridge

WebKit’s File System Access support is not consistent enough to make the app’s export contract depend on it. `NativeBridge.js` supplies compatible `showSaveFilePicker`, `showDirectoryPicker`, `showOpenFilePicker`, file handles, directory handles, and writable streams.

A renderer handle contains only an opaque random token and safe metadata. Swift keeps the actual URL. Bridge messages are bounded:

- 512 KiB maximum write chunk;
- 1 MiB maximum read chunk;
- 512 MiB maximum full renderer readback;
- 1 GiB maximum native output;
- 96 MiB maximum project/presenter import;
- 80 MiB maximum image batch;
- 512 total live grants.

The broker rejects symbolic links, directories where files are expected, traversal names, oversized offsets, duplicate write sessions, and unknown grants. Recursive deletion does not exist.

### Staged replacement

`createWritable()` does not truncate the selected destination. Swift asks Foundation for an item-replacement directory appropriate to that destination, creates a staging file there, holds one `FileHandle`, and receives chunks. On close it synchronizes and performs a same-volume rename over the destination. On abort it removes staging bytes and leaves the committed destination unchanged.

PNG sequences use the same staged file primitive one frame at a time. The TypeScript exporter preflights collisions and removes frames created by a failed attempt.

## Native imports

Hidden web file inputs are completed by `WKUIDelegate.runOpenPanelWith`. `NativeBridge.js` records each input’s intent before WebKit asks for the panel, allowing Swift to apply the right image/video/project filter and size limits.

The File menu invokes the same controls rather than bypassing React state. Finder-opened `.pitched` files are registered as read-only opaque grants, reconstructed as a JavaScript `File`, and passed through the existing verified project importer. Document association never weakens archive validation.

## Local-only boundary

The signed app has exactly two sandbox entitlements:

```text
com.apple.security.app-sandbox
com.apple.security.files.user-selected.read-write
```

It deliberately has no network client or server entitlement. WebKit content rules block HTTP, HTTPS, WebSocket, and FTP loads. Navigation policy permits bundled file, Blob, data, and about URLs. Explicitly clicked source/help URLs open in the default browser and are cancelled inside Drift.

The native source contains no URLSession, socket, shell, process, AppleScript, or arbitrary method dispatch.

## System-codec-only bundle

The ordinary source project depends on `@mediabunny/aac-encoder` for the browser build’s verified presenter-audio path. That extension embeds FFmpeg WebAssembly and therefore carries a compiled-distribution boundary.

The Mac build runs:

```bash
vite build --mode macos
```

In this mode, Vite aliases `@mediabunny/aac-encoder` to `src/lib/macosAacEncoder.ts`, whose registration function is intentionally empty. Mediabunny can then use AAC only if system WebKit exposes a compatible native `AudioEncoder`.

The app builder and verifier reject every `.wasm` file and any `libavcodec`/FFmpeg AAC marker in `Resources/Web`. The resulting standalone bundle contains no software FFmpeg codec binary.

This changes capability, not honesty. On a Mac with H.264 but no native AAC, muted presenter video can export; presenter audio fails visibly. PNG output remains available when supported. Audio is never dropped silently.

## Build

Requirements:

- macOS 13.3 or newer;
- Xcode Command Line Tools with Swift, AppKit, WebKit, `codesign`, `lipo`, `iconutil`, and `hdiutil`;
- Node.js 22.12 or newer;
- locked npm dependencies.

```bash
npm ci
npm run build:mac
```

Default output:

```text
build/macos/Drift.app
```

The default compiles both `arm64` and `x86_64`. Faster local iteration:

```bash
DRIFT_MACOS_ARCHS=arm64 npm run build:mac
```

The build performs browser checks unless `DRIFT_SKIP_WEB_CHECKS=1`, always performs the native source contract, rebuilds Vite in macOS mode, rejects forbidden codec binaries, generates the icon, compiles the selected slices, writes a byte manifest, applies hardened-runtime signing with `macos/Drift.entitlements`, and invokes full bundle verification.

## Verify

```bash
npm run verify:mac
```

Verification checks:

- bundle identity and `.pitched` document declaration;
- Vite entry point and manifest;
- icon, legal files, and native documentation;
- relative asset paths;
- absence of WASM/FFmpeg AAC markers;
- SHA-256 manifest readback;
- strict code-sign verification and hardened-runtime flag;
- extracted sandbox and user-selected-file entitlements;
- absence of network entitlements;
- exact executable architecture set;
- absence of non-system dynamic libraries;
- bundle smoke test;
- atomic file-broker self-test;
- packaged WKWebView integration test.

The self-tests are executable behavior. They are not comments in a QA file.

## Package a DMG

```bash
npm run package:mac:dmg
```

Output:

```text
build/macos/Drift-0.2.0-macOS-universal.dmg
build/macos/Drift-0.2.0-macOS-universal.dmg.sha256
```

The DMG contains `Drift.app`, an Applications alias, and a plain-language install/privacy/codec note. `hdiutil verify` and SHA-256 run before completion.

CI deliberately does not upload the app or DMG. A public binary requires explicit release authority plus Developer ID signing, notarization, stapling, Gatekeeper testing through a quarantine-setting download, physical-Mac QA, and a completed release receipt.

## Signing and notarization

Local ad-hoc signing is the default:

```bash
DRIFT_CODESIGN_IDENTITY=- npm run build:mac
```

Developer ID candidate:

```bash
DRIFT_CODESIGN_IDENTITY="Developer ID Application: Example (TEAMID)" \
DRIFT_BUILD_NUMBER=42 \
npm run build:mac
```

After the complete QA and release checklist hold, submit the exact app or DMG with `notarytool`, staple the accepted ticket, run `spctl --assess`, and test the quarantined download on a clean Mac. The repository does not automate publication because signing access is not permission to release.

## Known boundaries

- The app minimum is macOS 13.3 because system WebKit must expose the required modern media and WebGL surfaces.
- Presenter AAC availability varies by installed macOS/WebKit; the app does not bundle a fallback encoder.
- The current project store is single-editor. One app instance and one window are supported.
- Cross-compiling Intel proves a slice exists, not that Intel GPU/WebKit/codec behavior is good. Physical Intel evidence remains a release gate.
- The WebView test proves packaged loading, not visual quality or every export format.
- Ad-hoc signing is for local builds only.

See `MACOS_PRODUCT_CONTRACT.md`, `MACOS_THREAT_MODEL.md`, `MACOS_QA.md`, `MACOS_USER_GUIDE.md`, and `MACOS_RELEASE_CHECKLIST.md` before making a stronger claim.
