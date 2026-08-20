# Drift for macOS

Drift’s standalone application is a small AppKit host around the exact production web engine. It is not Electron, a development-server launcher, or a second export implementation.

## Architecture

```text
Drift.app
└── Contents
    ├── MacOS/Drift                 universal Swift/AppKit executable
    ├── Info.plist                  identity, document type, minimum OS
    └── Resources
        ├── Web/                    Vite `--mode macos` bundle
        ├── NativeBridge.js         main-frame-only capability adapter
        ├── Drift.icns
        ├── BuildReceipt.txt        source/build/policy receipt
        ├── BuildManifest.txt       SHA-256 of every packaged resource
        ├── Legal/
        └── Documentation/
```

There is one canonical Swift implementation under `macos/App/`:

- `DriftMain.swift` owns executable smoke, broker, gauntlet, and packaged-WebView test entry points.
- `DriftAppDelegate.swift` owns the restored window, menus, Finder documents, navigation policy, native panels, process-crash recovery, and close/quit interlocks.
- `NativeBridgeHost.swift` owns reply-based WebKit messages, import validation, runtime state, native panels, and serial broker dispatch.
- `NativeFileBroker.swift` owns opaque grants, staged writes, atomic replacement, exact readback, directory entries, cleanup, and executable self-tests.
- `NativeGauntlet.swift` attacks duplicate writers, oversized messages, output limits, traversal, directory masquerading, abort preservation, and grant pressure.
- `NativeModels.swift` owns bounded payload parsing and shared contracts.
- `WebViewSelfTest.swift` loads the copied bundle with a nonpersistent WebKit store and proves the packaged React/bridge runtime starts.

The WebGL scene, project store, deterministic evaluator, media decode, H.264/PNG export, and output verification remain the existing TypeScript implementation. Preview and output therefore keep one source of scene truth.

## Why AppKit + WKWebView

Drift already contains a mature local-first WebGL editor and fixed-step media pipeline. Rewriting that renderer in Metal or Swift would create two products and two sets of bugs. AppKit supplies what the browser cannot supply cleanly:

- application lifecycle;
- native window and menus;
- Finder document association;
- macOS panels and App Sandbox grants;
- safe destination replacement;
- crash and quit interlocks;
- signing, entitlements, notarization, and packaging.

`WKWebView` supplies the existing HTML, React, Three.js, WebGL2, WebCodecs, IndexedDB, and canvas runtime. The bridge is a narrow capability adapter, not a general native RPC layer.

## User journey

### Install and first launch

The local DMG contains `Drift.app`, an Applications alias, and a plain-language install/privacy/codec note. The app restores one resizable studio window and loads the same authored starter study as the browser build. No account, cloud project, or network permission is required.

### Open work

Users may open a verified `.pitched` project from Finder, the File menu, or the studio. Slides and presenter media use native filtered panels. Every imported file still passes through Drift’s existing decoder, hash, schema, and project-integrity checks.

### Direct and preview

Native Playback and View commands invoke the same React and Three.js actions as the visible interface. Autosave remains IndexedDB inside Drift’s application container. Close and quit are protected while export, project mutation, failed save, or recovery lock could make the user lose unfinished work.

### Export

MP4, PNG still, and PNG sequence destinations use native panels. A selected destination is never exposed as a raw path to JavaScript. Exports stage bytes, commit atomically, reopen the committed artifact for verification, and expose Reveal Last Export in Finder only after a successful commit.

### Recover

A WebKit content-process crash aborts active native writes before offering reload. The locally saved project then rehydrates through the existing project-store recovery path. Portable `.pitched` archives remain the user-controlled backup.

## Native file bridge

WebKit’s File System Access support is not consistent enough to make the app’s export contract depend on it. `NativeBridge.js` supplies compatible save, open, directory, file-handle, directory-handle, and writable-stream surfaces.

A renderer handle contains only an opaque random token and safe metadata. Swift keeps the actual URL. Limits are aligned with what Drift can honestly verify:

- 512 KiB maximum write chunk;
- 1 MiB maximum read chunk;
- 512 MiB maximum native output and full verification readback;
- 96 MiB maximum project or presenter import;
- 80 MiB maximum image batch;
- 512 total live grants;
- eight simultaneous write sessions.

The broker rejects symbolic links, directories where files are expected, traversal names, out-of-range reads, oversized offsets, duplicate write sessions, unknown or released grants, and recursive deletion.

### Staged replacement

`createWritable()` does not mutate the selected destination. Swift asks Foundation for an item-replacement directory appropriate to that destination, creates a staging file there, and receives bounded chunks through one `FileHandle`. On close it synchronizes the file, revalidates the destination and parent, performs a same-volume atomic rename, and best-effort synchronizes the directory entry. On abort or failure it removes staging bytes and leaves the prior committed destination unchanged.

`getFileHandle(name, { create: true })` creates the empty directory entry immediately, matching File System Access semantics. PNG sequences use the same staged file primitive one frame at a time. The TypeScript exporter preflights collisions and removes frames created by a failed attempt.

## Native imports

Hidden web file inputs are completed by `WKUIDelegate.runOpenPanelWith`. `NativeBridge.js` records each input’s intent before WebKit asks for the panel, allowing Swift to apply the correct image, video, or project filter and size limits.

Finder-opened `.pitched` files are registered as read-only opaque grants, reconstructed as a JavaScript `File`, and passed through the existing verified project importer. Document association never weakens archive validation.

## Local-only boundary

The signed app has exactly two sandbox entitlements:

```text
com.apple.security.app-sandbox
com.apple.security.files.user-selected.read-write
```

It deliberately has no network client or server entitlement. WebKit content rules block HTTP, HTTPS, WebSocket, and FTP loads. Navigation policy permits the bundled file runtime plus Blob, data, and about URLs. Explicit source/help links are cancelled inside Drift and opened by macOS in the default browser.

The native source contains no `URLSession`, socket, shell, subprocess, AppleScript, or arbitrary method-dispatch surface.

## Compiled-distribution boundary

The ordinary browser source depends on `@mediabunny/aac-encoder` for its verified presenter-audio path. That extension embeds FFmpeg WebAssembly and cannot be smuggled into a compiled Mac release without the corresponding-source and LGPL relinking work documented in `THIRD_PARTY_NOTICES.md`.

The standalone build always runs:

```bash
vite build --mode macos
```

In `macos` mode, Vite aliases `@mediabunny/aac-encoder` to `src/lib/macosAacEncoder.ts`, whose registration function is intentionally empty. Source maps are also disabled for this mode so dependency source text does not leak into the signed bundle.

The builder and verifier reject every `.wasm` file, every source map, and software AAC/FFmpeg markers in `Resources/Web`. Mediabunny may use AAC only when the installed macOS/WebKit runtime exposes a compatible system `AudioEncoder`.

This changes capability, not honesty. On a Mac with H.264 but no compatible native AAC, muted presenter video can export; presenter audio fails visibly. PNG output remains available when supported. Audio is never dropped silently.

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

The build performs the shared test suite unless `DRIFT_SKIP_WEB_CHECKS=1`, always enforces the native source contract, always rebuilds Vite in macOS mode, rejects forbidden codec artifacts, generates the icon, compiles the selected slices, writes the build receipt and resource manifest, signs with hardened runtime and `macos/Drift.entitlements`, and invokes full bundle verification.

## Verify

```bash
npm run verify:mac
```

Verification checks:

- bundle identity, minimum OS, one-instance policy, and exported `.pitched` type;
- copied Vite entry point, native bridge, icon, legal files, and documentation;
- relative asset paths and JavaScript syntax;
- absence of WASM, source maps, and software AAC/FFmpeg markers;
- complete SHA-256 resource-manifest set and digest readback;
- build-receipt policy fields;
- strict all-architecture signature verification and hardened-runtime flag;
- exact sandbox and user-selected-file entitlements;
- absence of network and dangerous runtime entitlements;
- exact executable architecture set;
- system-only linked dynamic libraries;
- world-writable-file rejection;
- bundle smoke test;
- basic and adversarial native file-broker tests;
- packaged WKWebView integration test.

The tests are executable behavior. They are not claims copied into a QA document.

## Package a DMG

```bash
npm run package:mac:dmg
```

With package version `0.1.0`, default output is:

```text
build/macos/Drift-0.1.0-macOS-universal.dmg
build/macos/Drift-0.1.0-macOS-universal.dmg.sha256
```

Packaging verifies the source app, creates the compressed image, runs `hdiutil verify`, mounts the exact DMG read-only, reruns the signed-app gauntlet against the mounted copy, and writes a SHA-256 checksum.

CI deliberately does not upload the app or DMG. A public binary requires explicit release authority plus Developer ID signing, notarization, stapling, Gatekeeper testing through a quarantine-setting download, decoded output evidence from the packaged app, and physical Apple Silicon and Intel QA.

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

After the release checklist holds, submit the exact candidate with `notarytool`, staple the accepted ticket, run `spctl --assess`, and test a quarantined download on a clean Mac. The repository does not automate publication because access to signing credentials is not permission to release.

## Known boundaries

- The minimum is macOS 13.3 because system WebKit must expose the required media and WebGL surfaces.
- Presenter AAC availability varies by installed macOS/WebKit; the app does not bundle a fallback encoder.
- The current project store is single-editor. One app instance and one window are supported.
- A 512 MiB native artifact ceiling is deliberate until verification can stream rather than reconstruct one Blob.
- Cross-compiling Intel proves a slice exists, not that Intel GPU, WebKit, or codec behavior is good. Physical Intel evidence remains a release gate.
- The packaged WebView test proves loading and native polyfills, not visual quality or every decoded export format.
- Ad-hoc signing is for local builds only.

See `MACOS_PRODUCT_CONTRACT.md`, `MACOS_THREAT_MODEL.md`, `MACOS_QA.md`, `MACOS_USER_GUIDE.md`, and `MACOS_RELEASE_CHECKLIST.md` before making a stronger claim.
