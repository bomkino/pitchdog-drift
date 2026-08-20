# Drift for macOS — product contract

Frozen for the `feat/native-macos-studio` branch.

## Outcome

A person should be able to install Drift like a normal Mac application, open a deck, direct its motion, save their project, and export finished media without knowing that the visual editor began life as a browser application.

The app must preserve the web engine’s strongest promise: preview and export are evaluations of the same saved scene at explicit time. The native shell may own windows, menus, file permissions, packaging, and recovery. It must not create a second renderer, a second project format, or a less truthful export path.

## User journey

1. Drag `Drift.app` into Applications and open it.
2. See the authored study immediately; no server, login, cloud prompt, or terminal.
3. Add a real slide deck through the interface, Finder drag-and-drop, or File menu.
4. Reorder, pin, tune, pause, and preview without fighting macOS window chrome.
5. Add one presenter video when needed. Learn before export whether this Mac can encode its audio.
6. Save a portable `.pitched` project and reopen it from Drift or Finder.
7. Export an MP4, still PNG, or numbered PNG sequence through native save panels.
8. Cancel an export without damaging an older file at the same destination.
9. Reveal the completed artifact in Finder.
10. Quit or close without accidentally abandoning an active export or failed local save.

## Native responsibilities

- One restored, resizable AppKit window with normal full-screen and Dock reopen behavior.
- Native File, Edit, Playback, View, Window, and Help menus.
- Finder ownership of `.pitched` documents.
- App Sandbox with only user-selected read/write access.
- No network client or server entitlement.
- Main-frame-only, reply-based WebKit bridge.
- Opaque grants rather than renderer-visible file paths.
- Same-volume staged writes followed by atomic replacement.
- Chunk limits, output limits, symlink rejection, traversal rejection, and grant cleanup.
- Persistent WebKit storage for the current local project.
- Crash recovery that rolls back incomplete native output before reloading.
- Universal `arm64` and `x86_64` compilation.
- Hardened-runtime signing, bundle byte manifest, native self-tests, and packaged WebView probe.
- A drag-to-Applications DMG for local testing.

## Codec policy

The web build may use the separately licensed Mediabunny software AAC extension. The standalone macOS build does not. Its Vite mode aliases that module to an empty registration shim and relies only on encoders exposed by system WebKit.

Consequences are deliberate:

- The app bundle contains no FFmpeg or other codec WebAssembly binary.
- H.264 and AAC availability follow the installed macOS/WebKit runtime.
- Presenter audio can be unavailable on an otherwise usable Mac.
- When AAC is unavailable, Drift asks the user to mute the presenter, update macOS, or use PNG output.
- Drift never strips audio silently and never labels an unverified result complete.

## Protected boundaries

- No analytics, update daemon, remote font, cloud upload, URLSession, socket, shell, AppleScript, or arbitrary native command execution.
- HTTP, HTTPS, WebSocket, and FTP loads are blocked inside the WebView. Explicit source/help links open in the user’s default browser.
- JavaScript never receives an absolute filesystem path.
- Native grants are scoped to files and directories selected by the user or handed to the app by Finder.
- Recursive deletion is not exposed.
- Existing directory-sequence files are never overwritten.
- Closing or quitting during protected work requires an explicit destructive choice.
- Multiple app instances are prohibited because the underlying current-project store is intentionally single-editor.
- CI may compile and inspect the app, but it may not publish a downloadable binary by accident.

## Costliest false wins

1. **An `.app` directory that cannot import media.** Countercheck: real native open panels for every hidden file input and Finder-opened `.pitched` files.
2. **A native save panel followed by browser-style fake success.** Countercheck: suppress premature notices and report completion only after the staged file commits.
3. **“Atomic” writes in a forbidden sibling path.** Countercheck: use `itemReplacementDirectory`, abort, then byte-compare the pre-existing destination.
4. **A sandbox badge with broad network or filesystem entitlement.** Countercheck: extract signed entitlements from the finished bundle and reject any network entitlement.
5. **A universal claim with one architecture.** Countercheck: inspect `lipo -archs` and run the native slice on Apple-hosted CI.
6. **A distributable DMG that quietly contains FFmpeg WASM.** Countercheck: dedicated macOS Vite alias plus bundle scan for WASM and codec markers.
7. **A web wrapper with no Mac behavior.** Countercheck: menus, document opening, Finder reveal, restored window, full-screen, external-link handoff, crash reload, and quit interlocks.
8. **A smoke test that only checks filenames.** Countercheck: broker self-test, manifest readback, signature/entitlement inspection, and a real packaged WKWebView load.

## Frozen bar

The branch holds only when all of the following are direct evidence, not aspiration:

- `npm run check` passes from a clean checkout.
- `npm run build:mac` produces a signed universal app on macOS.
- `npm run verify:mac` passes manifest, architecture, entitlement, smoke, broker, and WebView checks.
- `npm run package:mac:dmg` creates a verifiable disk image without uploading it.
- Native import works for images, presenter video, and `.pitched` documents.
- MP4 and PNG destination writes survive cancellation and readback.
- The prior destination remains byte-identical after an aborted replacement.
- App Sandbox is present; network client/server entitlements are absent.
- The bundled web runtime contains no `.wasm`, `libavcodec`, or FFmpeg AAC marker.
- Window close, quit, process crash, and Finder-open flows fail visibly and preserve saved work.
- Physical Apple Silicon testing passes before a human calls the app release-ready.

## Stop conditions

Stop only after the frozen bar is checked, two consecutive adversarial passes find no material accepted gain, or a hardware/signing boundary makes a stronger claim impossible. Document the boundary. Never lower the bar or convert “not tested” into “works.”
