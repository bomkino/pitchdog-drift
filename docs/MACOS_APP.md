# Drift for macOS

Drift can be built as a standalone, sandboxed macOS application without replacing its deterministic WebGL renderer or project model.

The native shell is intentionally narrow. AppKit owns the things macOS should own: the application lifecycle, menus, windows, Finder documents, save/open panels, scoped file permissions, staged writes, crash recovery, code signing, packaging, and native AAC encoding. The React/Three.js studio still owns the composition, settings, project archive, scene evaluation, and frame-by-frame export.

## Build

Requirements:

- macOS 13.3 or newer;
- Node.js 22.12 or newer;
- Xcode command-line tools.

```bash
npm ci
npm run build:mac
open build/macos/Drift.app
```

The default build creates a universal application:

```text
build/macos/Drift.app
└── Contents
    ├── MacOS/Drift
    ├── Resources
    │   ├── Web/
    │   ├── NativeBridge.js
    │   ├── Drift.icns
    │   ├── Legal/
    │   │   ├── LICENSE
    │   │   ├── NOTICE
    │   │   ├── ASSET-LICENSE.md
    │   │   ├── THIRD_PARTY_NOTICES.md
    │   │   ├── TRADEMARKS.md
    │   │   └── ThirdPartyLicenses/
    │   │       ├── MANIFEST.json
    │   │       ├── RUNTIME_COMPONENTS.md
    │   │       └── exact dependency licence texts
    │   ├── BuildReceipt.txt
    │   └── BuildManifest.txt
    ├── _CodeSignature/
    └── Info.plist
```

A fast Apple-Silicon-only iteration build is available:

```bash
DRIFT_MACOS_ARCHS=arm64 npm run build:mac
```

A local disk image can be created only after the app verifies:

```bash
npm run package:mac:dmg
```

The default signature is ad hoc and intended for local testing. Public distribution requires Developer ID signing, notarization, stapling, Gatekeeper assessment, detached verification, and physical-hardware review. See [MACOS_RELEASE.md](MACOS_RELEASE.md).

## Source map

Canonical native source lives in `macos/App/`:

| File | Responsibility |
| --- | --- |
| `DriftMain.swift` | executable entry and self-test dispatch |
| `DriftAppDelegate.swift` | application lifecycle, window, menus, navigation policy, Finder integration, recovery |
| `NativeBridgeHost.swift` | typed main-frame-only React ↔ AppKit command surface |
| `NativeFileBroker.swift` | opaque grants, open/save panels, staged output, readback, cleanup |
| `NativeAacEncoder.swift` | bounded Apple software AAC-LC sessions through AudioToolbox |
| `NativeModels.swift` | bridge envelopes, limits, validation, shared native types |
| `NativeGauntlet.swift` | direct file-broker and security self-tests |
| `WebViewSelfTest.swift` | packaged runtime, bridge, React, command, and recovery probe |

Other native resources:

| File | Responsibility |
| --- | --- |
| `macos/NativeBridge.js` | page-world file-system polyfills and typed app/AAC commands |
| `macos/Info.plist` | app identity, minimum OS, `.pitched` document type, single-instance policy |
| `macos/Drift.entitlements` | App Sandbox, user-selected read/write, and the network-client entitlement required by the packaged WKWebView topology |
| `macos/Probes/CodecProbe.swift` | WKWebView WebGL2, PNG, AVC, and WebCodecs capability probe |
| `macos/Probes/ExportProbe.swift` | visible deterministic exporter harness and diagnostics |

The web-side adapter is `src/lib/nativeMac.ts`. The native AAC adapter is `src/lib/macosAacEncoder.ts`.

## One renderer, one timeline

The native application does not record a real-time preview. It uses the existing deterministic export path:

```text
saved settings + ordered media + explicit time
                    │
                    ▼
               evaluate(t)
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
interactive preview        fixed-step export
requestAnimationFrame       frame n → n / fps
       │                         │
       └────────────┬────────────┘
                    ▼
          one Three.js renderer
```

AppKit can choose where bytes go. It cannot change what frame `n` means.

## Native user journey

The branch treats these as one connected journey rather than unrelated features:

1. Launch one normal resizable Mac window.
2. See the authored study without a login, server, cloud prompt, or terminal.
3. Add slides through the app, File menu, drag-and-drop, or native open panel.
4. Add one presenter video.
5. Direct, pause, step, focus, and preview through the same controls and native menu equivalents.
6. Autosave locally inside the app container.
7. Save or open a portable `.pitched` project through Finder-owned workflows.
8. Choose an MP4, still, or sequence destination through native panels.
9. Render and verify before native commit.
10. Reveal the completed output in Finder.
11. Cancel, close, crash, or quit without promoting incomplete work to “finished.”

## Typed native bridge

The bridge is versioned and command-based. It does not discover methods by name and does not scrape the DOM to simulate clicks.

Native commands include:

- runtime and authoritative client-state reporting;
- open/save/directory panels;
- bounded read, write, seek, truncate, close, abort, and release operations;
- directory child-file creation and removal;
- File-menu import, project, playback, focus, and export actions;
- AAC session create, append, finish, and close.

Security properties:

- `WKScriptMessageHandlerWithReply`;
- main frame only;
- page content world only;
- fixed command names;
- JSON-compatible validated payloads;
- no JavaScript-visible absolute filesystem path;
- no selector reflection, shell, AppleScript, URLSession, socket, or arbitrary process launch;
- explicit size, chunk, session, and grant ceilings.

## Native file model

### Opaque grants

An AppKit panel or Finder-open event creates a native grant. JavaScript receives a random token and limited metadata: leaf name, type, size, modification time, and supported operations. The URL remains in native memory.

### Staged replacement

Existing output is not truncated when export begins.

1. The user chooses a destination.
2. Foundation supplies an item-replacement directory on the destination volume.
3. Drift streams bounded chunks into a staging file.
4. The file is synchronized.
5. The renderer reopens the staged bytes through its opaque grant and verifies the artifact.
6. Only `write-close` commits the staged file to the selected destination with same-volume rename.
7. Abort or failure removes staging and leaves the previous destination untouched.

The native self-test starts from a known destination, performs both successful replacement and aborted replacement, and compares bytes.

### PNG sequence directories

The selected directory is one grant. Each generated filename must be a single safe leaf. Traversal, separators, symlinks, directories, collisions, and recursive deletion are rejected. A failed sequence removes only files created by that attempt and reports any cleanup failure.

## Native AAC without FFmpeg

The browser application uses `@mediabunny/aac-encoder`, whose software encoder includes an FFmpeg-derived WebAssembly binary. The standalone Mac build must not distribute that runtime.

For `vite build --mode macos`, the package is aliased to `src/lib/macosAacEncoder.ts`. The adapter registers a Mediabunny `CustomAudioEncoder` that:

1. accepts only AAC-LC, 48 kHz, stereo, 192 kbit/s sessions;
2. converts incoming planar PCM into bounded interleaved float chunks;
3. sends those chunks through the typed bridge;
4. lets `NativeAacEncoder.swift` encode with Apple’s software AAC component via `AudioConverterNewSpecific`;
5. returns packet bytes plus AudioSpecificConfig, magic-cookie, priming, padding, and frame-accounting receipts;
6. reconstructs packet timestamps, including negative priming time, for the muxer;
7. rejects any receipt whose frame equation, metadata, packet bounds, or requested settings do not hold.

The app bundle contains no codec WebAssembly and no FFmpeg runtime. H.264 remains capability-gated through WKWebView. AAC is provided by the native AudioToolbox bridge. Either path fails visibly rather than silently deleting audio.

## Sandbox and network boundary

The signed app requests:

```text
com.apple.security.app-sandbox = true
com.apple.security.files.user-selected.read-write = true
com.apple.security.network.client = true
```

It omits the network-server, Downloads, Documents, home-directory, and temporary-exception entitlements. The network-client entitlement is app-wide. macOS does not confine it to WebKit, so future native `URLSession`, Network.framework, or socket code would inherit outbound capability and must be treated as a security-boundary change. Drift ships no such native network client today.

Inside WKWebView:

- a document-start page-world lockdown removes WebRTC constructors before application code runs;
- versioned WebKit content rules block HTTP, HTTPS, WS, WSS, and FTP requests;
- the production navigation policy cancels remote responses and every WebKit download request before a native destination can be granted;
- bundled `file:`, generated `blob:`, `data:`, and required `about:` URLs remain available;
- deliberate source/help links open in the default browser and are cancelled inside Drift.

No updater, analytics client, cloud upload, native `URLSession`/Network.framework client, local server, or background daemon is bundled. These controls establish the packaged application’s tested local-only policy; they are not a claim that an arbitrary WebKit or macOS compromise cannot use the app-wide entitlement.

## App lifecycle

- One app instance; the project store remains intentionally single-editor.
- One restored studio window.
- Closing the window and clicking the Dock icon reopens it.
- File, Edit, Playback, View, Window, and Help menus.
- `.pitched` ownership and Finder “Open With” support.
- Finder-open events arriving during launch queue until the React importer is installed.
- Menu commands are disabled while authoritative renderer state says they are unsafe.
- Closing or quitting during export, import, save, failed save, or recovery lock presents an explicit warning with “Keep Working” as the safe action.
- Web-content process termination aborts native write sessions before offering reload or quit.

The release and V2 development variants share the same Help command but not the same bundled guide. `Drift.app` carries the production project guide. `Drift V2 Dev.app` carries a verified development guide that explicitly denies `.pitched` ownership and directs real projects back to `Drift.app`. **View Complete Source** validates the recorded `DriftSourceRevision` and opens that exact GitHub tree; a missing or malformed revision falls back to the repository root.

## Verification layers

### Source contract

```bash
npm run check:mac-source
```

Checks the current bridge, packaging, sandbox, codec, release, and workflow invariants. It intentionally avoids historical string archaeology: removed implementation details are not product contracts.

### Native app verification

```bash
npm run verify:mac
```

Checks:

- both architecture slices;
- `Info.plist` and resources;
- hardened runtime and extracted entitlements;
- no non-system dynamic library;
- no `.wasm`, source map, FFmpeg, or libavcodec marker;
- complete build manifest;
- executable smoke test;
- native broker gauntlet;
- packaged WKWebView, React, typed bridge, native command, and reload-recovery probe;
- signed-entitlement readback plus an exact packaged TCP/UDP loopback probe that must observe zero outbound hits;
- LaunchServices opening.

### Runtime export verification

The dedicated macOS runtime workflow proves, on a visible hosted Apple Silicon WKWebView lifecycle:

- WebGL2 creation and readback;
- alpha PNG encoding;
- real AVC encode;
- native AudioToolbox AAC packet generation and frame accounting;
- 90 deterministic H.264 frames at 30 fps;
- MP4 container, dimensions, timestamps, duration, Rec.709/sRGB colour, opacity, and first/middle/final decode;
- transparent PNG with both visible and non-opaque pixels;
- native progress events and no content-process termination.

The shipped packaged app and deterministic exporter probe each use a receipt-verified, single-entry classic IIFE. The app self-test owns the exact production packaged graph; the exporter probe independently owns the export source path. Every probe file is byte-counted and SHA-256-verified against `ProbeBundleReceipt.json` before WebKit runs it.

## Release boundary

Local and CI builds may be ad-hoc signed. They are not public release candidates.

A public binary additionally requires:

- Developer ID Application identity;
- notarization and stapling of app and DMG;
- Gatekeeper assessment;
- detached release-manifest verification;
- legal bundle and SBOM;
- physical Apple Silicon and Intel journey testing;
- explicit publication authority.

The manual release workflow creates text-only Actions evidence suitable for a public repository. It never merges, tags, deploys, or publishes automatically.

## Known limits

- Minimum supported macOS: 13.3.
- Universal compilation is not the same as an Intel runtime test.
- Presenter-audio masters are limited to 24, 25, or 30 fps; mute audio for 50/60 fps.
- Moving-track video remains outside v1; one pinned presenter video is supported.
- App-container autosave is local state, not a substitute for `.pitched` backups.
- Hosted runtime evidence does not replace physical-machine accessibility, long-export, removable-volume, sleep/wake, and visual review.
