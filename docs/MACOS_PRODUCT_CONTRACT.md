# Drift for macOS — product contract

Maintained for the current `main` source line and the `v0.2.x` source-release series.

## Outcome

A person should be able to install Drift like a normal Mac application, open a deck, direct its motion, save the project, and export finished media without knowing that the visual editor began life as a browser application.

The app must preserve the web engine’s strongest promise: preview and export are evaluations of the same saved scene at explicit time. The native shell may own windows, menus, scoped file permissions, packaging, native AAC, staged writes, and recovery. It must not create a second renderer, a second project format, or a less truthful export path.

## Audience effect

The user should feel that Drift belongs on the Mac:

- one authored studio window rather than a browser tab;
- Finder-native open, save, reveal, and document ownership;
- menu commands and shortcuts that reflect whether the app can act safely;
- exports that land exactly where chosen;
- no login, cloud prompt, local server, extension, or terminal after installation;
- failure messages that state what happened, whether older work survived, and what action remains.

The native layer must disappear when things are going well and become unusually explicit when data is at risk.

## User journey

1. Drag `Drift.app` into Applications and open it.
2. See the authored study immediately; no server, login, cloud prompt, or terminal.
3. Add a real slide deck through the interface, Finder drag-and-drop, or File menu.
4. Reorder, pin, tune, pause, step, focus, and preview without fighting macOS chrome.
5. Add one presenter video when needed.
6. Learn before export whether this Mac can encode the requested H.264 and AAC paths.
7. Save a portable `.pitched` project and reopen it from Drift, Finder, or “Open With.”
8. Export an MP4, still PNG, or numbered PNG sequence through native panels.
9. Cancel an export without damaging an older file at the same destination.
10. Reveal the completed artifact in Finder.
11. Quit, close, crash, sleep, or lose a destination without accidentally promoting incomplete output.

## Native responsibilities

- One restored, resizable AppKit window with normal full-screen and Dock reopen behavior.
- Native File, Edit, Playback, View, Window, and Help menus.
- Finder ownership of `.pitched` documents.
- App Sandbox with user-selected read/write access and the network-client entitlement required by the packaged WKWebView topology.
- No network-server, broad-directory, or temporary-exception entitlement.
- Main-frame-only, reply-based, typed WebKit bridge.
- Opaque grants rather than renderer-visible file paths.
- Same-volume staged writes followed by commit-time replacement.
- Chunk, output, session, and grant limits.
- Symlink, traversal, unsafe-leaf, and recursive-delete rejection.
- Persistent WebKit storage for the current local project.
- Crash recovery that rolls back incomplete native output before reload.
- Apple-Silicon-only `arm64` compilation; Intel Mac and Windows are unsupported.
- Hardened-runtime signing, bundle byte manifest, native self-tests, and packaged WebView probe.
- A drag-to-Applications DMG for local testing.
- Native AudioToolbox AAC sessions with explicit packet and timeline receipts.
- Locally bundled FontBlind v13 binaries, Phosphor Icons for React `2.1.10`, and one responsive spacing system shared with the browser build.

## Codec policy

The browser build may use the separately licensed Mediabunny software AAC extension. The standalone macOS build does not distribute that extension or its FFmpeg-derived WebAssembly runtime.

For the Mac build, `@mediabunny/aac-encoder` resolves to `src/lib/macosAacEncoder.ts`. That adapter registers a Mediabunny custom encoder and sends bounded PCM chunks through the typed native bridge to Apple’s software AAC-LC encoder in AudioToolbox.

The contract is specific:

- H.264 video remains capability-gated through WKWebView.
- Presenter audio uses native AAC-LC, 48 kHz stereo, 192 kbit/s.
- Native AAC accepts at most 35.00 seconds of PCM in one bounded session. Audio-bearing masters above that limit fail preflight before rendering. Muted, video-only masters may use Drift’s wider duration range.
- The receipt must include packet bytes, AudioSpecificConfig, magic-cookie data, leading priming frames, trailing padding frames, and frame counts.
- `representedFrames` must equal `leadingFrames + inputFrames + trailingFrames`.
- Packet timestamps must represent priming truthfully rather than pretending audio begins at zero.
- Presenter-audio masters remain limited to 24, 25, or 30 fps. Muted presenter video may use 50/60 fps.
- Any codec or metadata failure is visible. Drift never silently strips audio and never labels unverified output complete.
- Presenter video must decode one real frame before the private output starts. Every later decoder advance has an abort-aware inactivity deadline; timeout cancels staging and preserves the existing destination.
- The finished app bundle must contain no `.wasm`, FFmpeg runtime, or libavcodec marker.

## Protected boundaries

- No analytics, update daemon, runtime font download, cloud upload, shipped native `URLSession`/Network.framework/socket client, shell, AppleScript, or arbitrary native command execution.
- A document-start page-world lockdown removes WebRTC constructors. Versioned content rules block HTTP, HTTPS, WS, WSS, and FTP; navigation/download policy cancels remote responses and download authority before any native destination. Explicit source/help links open in the user’s default browser.
- `com.apple.security.network.client` is an app-wide entitlement, not a WebKit-only capability. Adding native networking is a protected-boundary change; a WebKit or macOS compromise remains a residual risk.
- JavaScript never receives an absolute filesystem path.
- Native grants are scoped to files and directories selected by the user or handed to the app by Finder.
- Recursive deletion is not exposed.
- Existing PNG-sequence files are never overwritten.
- Existing file destinations are not truncated before export verification.
- Closing or quitting during protected work requires an explicit destructive choice; “Keep Working” is the safe default.
- Multiple app instances are prohibited because the current-project store is intentionally single-editor.
- CI may compile and inspect the app, but it may not publish a downloadable binary by accident.
- The native shell may route media and filesystem operations; it may not mutate the scene evaluation or lower output verification.

## Costliest false wins

1. **An `.app` directory that cannot import media.** Countercheck: real native open panels for every hidden file input, Finder-opened `.pitched` files, and launch-time import queuing.
2. **A native save panel followed by browser-style fake success.** Countercheck: suppress premature notices and report completion only after staged commit.
3. **“Atomic” writes in a forbidden sibling path.** Countercheck: use `itemReplacementDirectory`, abort, then byte-compare the pre-existing destination.
4. **A sandbox badge paired with a false “no network entitlement” claim.** Countercheck: extract entitlements from the signed finished bundle, require the app-wide network-client entitlement and absence of network-server/broad-directory entitlements, then independently prove the packaged WebKit policy produces zero TCP and UDP loopback hits.
5. **An Apple-Silicon claim with a hidden second slice.** Countercheck: require `lipo -archs` to return exactly `arm64` and bind that value into the build and release receipts.
6. **A distributable DMG that quietly contains codec WASM.** Countercheck: dedicated macOS Vite alias plus bundle scan for `.wasm`, FFmpeg, and libavcodec markers.
7. **A “native AAC” bridge that ignores priming.** Countercheck: require exact leading/input/trailing frame accounting and negative priming timestamps before muxing.
8. **A web wrapper with no Mac behavior.** Countercheck: menus, document opening, Finder reveal, restored window, full-screen, external-link handoff, crash reload, and quit interlocks.
9. **A smoke test that only checks filenames.** Countercheck: broker self-test, manifest readback, signature/entitlement inspection, packaged WKWebView load, real AVC/AAC probes, and deterministic MP4/PNG output.
10. **Green CI that tests a different topology from the app.** Countercheck: both the shipped app and deterministic exporter probe use receipt-verified single-entry classic IIFEs; the packaged self-test owns the exact application graph while the exporter probe owns the real export source path.

## Frozen bar

The branch holds only when all of the following are direct evidence, not aspiration:

### Source and browser engine

- `npm run check` passes from a clean checkout.
- TypeScript, Vitest, production Vite build, source contract, and real Chromium E2E are green.
- The native branch does not accidentally alter browser-engine behavior outside the deliberate macOS AAC alias and native integration seams.

### Native build

- `npm run build:mac` produces a signed arm64-only app on macOS.
- `npm run verify:mac` passes manifest, architecture, entitlement, smoke, broker, and packaged-WebView checks.
- `npm run package:mac:dmg` creates a verifiable disk image without uploading it.
- App Sandbox, user-selected read/write, and network-client entitlements are present in the signed app; network-server and broad-directory entitlements are absent.
- Exact packaged probes read back those signed entitlements and observe zero token-bearing TCP and UDP loopback requests under the production content, page-world, and navigation/download policies.
- The source contract proves no native `URLSession`, Network.framework, or socket client is shipped and rejects weakening of the remote response/download gate.
- The bundled web runtime contains no `.wasm`, source map, FFmpeg, or libavcodec marker.
- The bundled FontBlind files match the recorded `pitchdog-type-system` v13 checksums, and the packaged licence inventory includes FontBlind and Phosphor.

### User journey

- Native import works for images, presenter video, and `.pitched` documents.
- Finder-open during launch waits for a ready importer.
- The current project and original media survive relaunch.
- MP4, PNG still, PNG sequence, and portable-project destinations use native panels.
- Native menus disable unsafe actions from authoritative renderer state.
- Window close, quit, process crash, and Finder-open flows fail visibly and preserve saved work.

### Output and cancellation

- The actual exporter renders exactly `round(duration × fps)` fixed-step frames.
- MP4 output reopens and verifies container, AVC, dimensions, count, timestamps, duration, colour, opacity, and decoded probes.
- PNG output verifies dimensions, alpha-capable channel, visible content, and transparent pixels when requested.
- Native AudioToolbox AAC produces coherent packet, priming, padding, and magic-cookie evidence.
- MP4 and PNG destination writes survive cancellation and readback.
- The prior destination remains byte-identical after an aborted staged replacement.
- Existing sequence frames are never overwritten.

### Release honesty

- Physical Apple Silicon testing passes before a human calls the app release-ready.
- VoiceOver, removable-volume, sleep/wake, long-export, and minimum-OS evidence are explicitly recorded as passed, failed, or untested. Intel Macs and Windows are explicitly unsupported.
- No downloadable binary is published without Developer ID, notarization, Gatekeeper, detached verification, and explicit authority.

## Stop conditions

Stop only after the frozen bar is checked, two consecutive adversarial passes find no material accepted gain, or a hardware/signing boundary makes a stronger claim impossible. Document the boundary. Never lower the bar or convert “not tested” into “works.”
