# Drift for macOS — QA gauntlet

This is a falsification plan, not a ceremonial checklist. Automated checks establish source, bundle, and representative runtime properties. They do not substitute for using the finished application with real decks on real Macs.

## Evidence classes

1. **Source contract** — bridge parity, fixed commands, packaging, sandbox, codec, release, and workflow invariants.
2. **Compilation** — Swift `arm64`/`x86_64`; JavaScript, TypeScript, Python, and shell syntax.
3. **Bundle** — plist, resources, icon, legal files, signature, hardened runtime, entitlements, architecture, codec exclusions, and byte manifest.
4. **Native behavior** — file broker, staged replacement, menus, Finder, app lifecycle, and packaged WebView self-tests.
5. **Browser editor behavior** — Vitest and real-Chromium E2E.
6. **Hosted macOS media evidence** — WKWebView WebGL/AVC/PNG, native AudioToolbox AAC, deterministic MP4/PNG output.
7. **Physical-hardware evidence** — full user journeys on supported Apple Silicon and Intel Macs.
8. **Human review** — visual pacing, legibility, native fit, accessibility, diagnostics privacy, and failure clarity.

Every receipt must say which class produced a claim.

## Automated clean-checkout gate

```bash
npm ci
npm run check
npm run build:mac
npm run verify:mac
npm run package:mac:dmg
```

Expected facts:

- TypeScript and all focused Vitest checks pass.
- Production browser build passes.
- Real Chromium E2E passes.
- Native source contract passes on non-macOS CI.
- macOS Vite mode resolves AAC to the native adapter.
- No source map, `.wasm`, browser AAC extension, FFmpeg, or libavcodec marker exists in packaged Web resources.
- Swift compiles both architecture slices against the minimum deployment target.
- App bundle is ad-hoc or Developer-ID signed with hardened runtime.
- Entitlements extracted from the signed finished app contain App Sandbox, user-selected read/write, and network-client access.
- Extracted entitlements contain no network-server, broad-directory, or temporary-exception entitlement.
- The exact packaged app produces zero token-bearing TCP and UDP hits against isolated loopback listeners while the production WebKit policy is installed.
- Build manifest byte-checks every executable/resource except itself.
- Native smoke, broker, AAC, packaged-WebView, typed-command, and recovery self-tests pass.
- DMG verifies and its SHA-256 receipt matches.
- Normal pull-request CI does not upload a public app or DMG.

## Source-contract gauntlet

`npm run check:mac-source` must validate current executable invariants rather than historical implementation trivia.

It should prove:

- one canonical Swift implementation;
- bridge version parity across Swift, JavaScript, TypeScript, and plist;
- fixed file, app, and AAC command parity;
- direct awaited native saves;
- no DOM scraping or queued synthetic button clicks;
- staged replacement and output ceilings;
- native AudioToolbox AAC markers and receipt validation;
- macOS build, verifier, DMG, release, and workflow wiring;
- exact sandbox entitlement truth, page-world/content-rule lockdown, remote navigation/download denial, and absence of a shipped native network client;
- deterministic exporter receipt and progress instrumentation.

Deleting an obsolete escape hatch must not break CI merely because a string assertion remembers it.

## Native file-broker gauntlet

The executable `--native-self-test` must directly prove:

- staged replacement changes the destination only at close;
- aborted replacement preserves previously committed destination bytes;
- staging bytes disappear after abort;
- seek, write, truncate, synchronize, close, and readback remain consistent;
- a file created through a selected directory can be written, read, and removed;
- `../` traversal and unsafe leaves are rejected;
- symbolic-link imports and destinations are rejected;
- output-cap violations fail visibly;
- repeated abort/release is harmless;
- session and grant ceilings hold.

Add a regression test whenever the broker is fixed. Do not replace byte evidence with comments.

## Packaged WebView gauntlet

The executable `--webview-self-test` loads copied `Resources/Web/index.html`, never the development server. It must observe:

- `file:` runtime;
- React’s `main.app` root and canvas;
- bridge version 2 marker;
- native open/save/directory polyfills;
- direct native Blob save function;
- installed typed app contract;
- authoritative client state settled to idle/saved;
- native `toggle-focus` command reaching React and restoring state;
- relative bundle assets;
- the production document-start WebRTC lockdown and versioned HTTP(S)/WS(S)/FTP content rules;
- remote response/download cancellation before any native destination authority;
- signed-entitlement readback and zero token-bearing TCP/UDP loopback hits for the exact launched app and WebContent processes;
- one content-process termination followed by successful reload recovery;
- a second termination treated as failure, not an infinite retry.

Use an isolated throwaway persistent website data store so Blob/File-backed IndexedDB follows the production storage path without touching a user project. Name it uniquely, verify reload persistence, and delete the test database after the run.

## Network-boundary gauntlet

The sandbox network-client entitlement is app-wide; calling it “WebKit-only” is a false security claim. Before the local-only boundary can pass, one exact packaged run must prove all of these independently:

- `codesign` entitlement extraction from the tested `.app` reports App Sandbox, user-selected read/write, and `com.apple.security.network.client = true`;
- the same extraction reports no network-server, broad-directory, or temporary-exception entitlement;
- production document-start code removes `RTCPeerConnection` and `webkitRTCPeerConnection` before application code runs;
- the versioned content-rule list blocks HTTP, HTTPS, WS, WSS, and FTP;
- the shared production navigation policy rejects remote responses and every remote `shouldPerformDownload` case before WebKit can create a download or request destination authority;
- isolated TCP and UDP loopback listeners, each protected by an unpredictable per-run token, observe exactly zero accepted token-bearing requests from the exact packaged app/WebContent lifecycle;
- source inspection rejects a shipped native `URLSession`, Network.framework, socket, updater, analytics, or cloud-upload client.

Record the signed entitlement readback, rule identifier/version, exact app and WebContent process identities, listener addresses, token-hit counts, and cleanup result. Source markers alone do not prove runtime denial; zero loopback hits alone do not prove the signature or forbid future native networking. An arbitrary WebKit or macOS compromise remains outside this boundary.

## WKWebView capability gauntlet

`probe-macos-codecs.sh` must create a visible WKWebView lifecycle and directly test:

- WebGL2 context creation;
- maximum texture size and pixel readback;
- PNG Blob encode and signature;
- `VideoEncoder.isConfigSupported` for the requested AVC configuration;
- one real H.264 access unit with decoder metadata;
- the presence or absence of WebKit audio APIs without treating absence as failure when native AAC is healthy.

A capability object is insufficient. At least one encoded chunk is required for an “AVC works” claim.

## Native AudioToolbox AAC gauntlet

`probe-macos-aac.sh` and `NativeAacEncoderBroker.runSelfTest()` must prove:

- Apple software AAC-LC provider selected through AudioToolbox;
- AAC-LC / `mp4a.40.2`;
- 48 kHz stereo at the frozen target bitrate;
- nonempty access units;
- bounded packet sizes and count;
- AudioSpecificConfig;
- nonempty magic-cookie metadata;
- leading priming frames;
- trailing padding frames;
- `representedFrames == leadingFrames + inputFrames + trailingFrames`;
- exact configuration echoed in the receipt;
- invalid session, oversized PCM, mismatched format, corrupted receipt, and use-after-close rejection;
- cleanup of every native AAC session on completion, failure, quit, or content-process termination.

WebKit `AudioEncoder` may be absent. The standalone app’s audio promise belongs to the native AudioToolbox bridge, not to WebKit audio APIs.

## Deterministic exporter gauntlet

`run-macos-export-probe.sh` must use the actual `src/lib/exportStudio.ts` path inside a visible WKWebView and produce both MP4 and PNG.

The build contract:

- one classic IIFE;
- one input entry;
- code splitting disabled so dynamic registration is inlined;
- no HTML module bootstrap dependency;
- no source map or WebAssembly;
- a root `index.html` with one local classic script;
- every file covered by `ProbeBundleReceipt.json` with exact bytes and SHA-256;
- bundle root and HTML path canonicalized before WebKit receives them.

The harness contract:

- document-start error/unhandled-rejection diagnostics;
- navigation started/committed/finished state;
- visible window and compositor-ready event;
- native progress events with latest phase;
- fast JavaScript-bootstrap failure rather than a silent multi-minute timeout;
- content-process termination count;
- overall timeout as a final, not first, diagnostic.

The output contract:

- 320 × 568;
- 30 fps;
- 3 seconds;
- exactly 90 frames;
- H.264/AVC;
- MP4 `ftyp` signature;
- exact `n / fps` timestamps and one-frame packet durations;
- Rec.709/sRGB-compatible colour metadata;
- opaque video;
- first/middle/final decode;
- no audio in the muted representative probe;
- alpha-capable PNG;
- visible PNG pixels;
- non-opaque PNG pixels;
- PNG signature and requested dimensions.

The representative probe is intentionally small. Passing it proves the code path and runtime contract, not 30-second full-resolution performance.

The shipped application also uses one receipt-verified, single-entry classic IIFE. Do not describe its packaged topology as an ES-module graph.

## First-launch journey

On a fresh app container:

1. Install in Applications and launch without Xcode, Vite, or Terminal.
2. Confirm one window appears with sensible size and unobstructed traffic lights.
3. Confirm the study scene appears without a server or network prompt.
4. Confirm capability state resolves rather than remaining “checking.”
5. Confirm local project state resolves to saved, failed, or recovery—not perpetual loading.
6. Close the window, click the Dock icon, and confirm the same studio returns.
7. Quit and reopen. Confirm local settings and original media survive.
8. Confirm About Drift reports version, build, and source revision.

Repeat at 1440 × 900, 1024 × 768, and the minimum 960 × 620 window.

## Import journey

Test image batches of 0, 1, 2, 12, 200, and 201 items. Include mixed 16:9, 4:3, 1:1, 4:5, and 9:16 images; spaces, emoji, long Unicode, duplicate display names, corrupt files, symlinks, 64 MiB boundary, and 80 MiB aggregate boundary.

Verify:

- File → Add Slides, the in-app button, and stage drop reach the same importer semantics;
- native filters are truthful;
- cancellation changes nothing;
- first real deck replaces studies rather than mixing;
- partial decode failures report counts and reject only invalid media;
- source files in Finder are never modified or deleted;
- overlapping import batches respect the 200-slide ceiling;
- reordering and pinning persist after relaunch.

Test presenter MP4, MOV, WebM, audio-only media, unsupported codec, corrupt metadata, short duration, no audio, mono audio, and long audio. Only one presenter may be active. Replacing it must dispose old object URLs and media elements.

## Portable project journey

- Save a `.pitched` project through File → Save Portable Project.
- Cancel the native panel and verify no destination and no false success.
- Open through app control, File menu, Finder double-click, app-icon drop, and Open With.
- Open while the application is launching; import must queue until ready.
- Clear a test app container, then reopen the portable project.
- Corrupt manifest JSON, asset bytes, digest, path, size, engine version, theme version, descriptors, and references one at a time.
- Verify every invalid archive leaves the current project unchanged.
- Trigger delayed import A followed by B; B must win.
- Confirm recovery-locked storage is not overwritten by fallback demos.
- Export recovery and verify preserved manifest/media before opening replacement.

## MP4 export journey

Use 1080 × 1920, 1080 × 1350, 1080 × 1080, 1920 × 1080, a small test size, and a near-GPU-limit size. Test 24, 25, 30, 50, and 60 fps; 3, 8, and 30 seconds; every path/background; 1, 2, 12, and 200 slides; pinned image; muted presenter; and presenter audio at 24/25/30 fps.

For every completed master, independently inspect:

- nonzero file size;
- MP4 container;
- H.264 video;
- requested even dimensions;
- exact fixed-step frame count;
- `n / fps` timestamps;
- requested duration;
- first/middle/final frame decode;
- Rec.709/sRGB-compatible colour metadata;
- no alpha claim;
- expected audio-track presence or absence;
- AAC-LC, 48 kHz stereo when present;
- start/end A/V offset within one frame;
- visual motion across extracted frames;
- pinned presenter changes over time rather than freezing.

At 50/60 fps with presenter audio enabled, export must fail with the explicit 30 fps ceiling before a convincing silent master is returned. Muting must permit video-only output when H.264 remains supported.

## Cancellation and replacement journey

For MP4 and still output:

1. Place a known file at the chosen destination and record SHA-256.
2. Begin a replacement export.
3. Cancel during preparation, frame rendering, encoding, native writing, and finalization.
4. Confirm the old destination retains the exact SHA-256.
5. Confirm no item-replacement debris remains after abort.
6. Confirm the status states that previous work survived.

For PNG sequences:

- choose a directory containing a colliding expected frame and confirm preflight refusal;
- cancel after several frames and confirm created frames are removed;
- deny removal permission and confirm cleanup failure lists exact filenames;
- verify unrelated files remain untouched;
- disconnect a removable destination and record what survived.

## App lifecycle and failure journey

- Attempt Close and Quit during export, project import, local save, failed save, and recovery lock.
- Confirm “Keep Working” is the safe first/default action.
- Choose destructive close and confirm native file/AAC sessions abort.
- Force WebKit content-process termination and confirm rollback plus Reload/Quit alert.
- Trigger a second termination and confirm hard failure rather than endless retry.
- Sleep and wake during preview and a paused export test.
- Disconnect a removable export volume during write and confirm visible failure.
- Fill the destination volume and confirm a clear quota/write failure.
- Revoke a security-scoped destination between selection and write.
- Trigger WebGL context loss/restore inside the app.
- Deny WebGL2 and confirm DOM fallback preserves projects but blocks cinematic output.
- Corrupt a native AAC receipt through a test seam and confirm muxing stops.

## Native fit, accessibility, and copy review

- VoiceOver reads Media, Stage, Director, transport, export progress, native warnings, and status messages in coherent order.
- Full Keyboard Access reaches every control and menu command.
- Focus is visible at normal and 200% interface magnification.
- Reduced motion pauses vestibular preview effects without silently changing saved export behavior.
- Titlebar inset works in light/dark appearance and at minimum width.
- macOS full screen, app focus mode, and WebKit magnification remain distinct and reversible.
- Save/open panels have clear prompts, truthful types, and safe default buttons.
- Error copy states what happened, whether older work survived, and the next concrete action.
- No status says “saved” before native commit.
- No audio error suggests “update macOS” as the only remedy when mute/retry/report is more accurate.
- Copy Diagnostics contains no deck text, media bytes, grant token, or absolute path.

## Hardware matrix

Before public binary release, run at minimum:

- Apple Silicon Mac on the oldest supported macOS;
- Apple Silicon Mac on the current macOS;
- Intel Mac on a supported macOS;
- one low-memory machine under a 30-second 1080 × 1920 export;
- one external/removable destination;
- sleep/wake and full-screen transitions;
- a clean quarantine-setting download and Gatekeeper launch.

CI cross-compilation of `x86_64` is evidence that the slice builds. It is not evidence that Intel WebKit, GPU, VideoEncoder, AudioToolbox, Finder, or sandbox behavior ran.

## Release receipt

Record:

- source commit and tree;
- package-lock digest;
- app and DMG SHA-256;
- architecture list;
- extracted entitlements and dynamic libraries;
- exact packaged TCP/UDP loopback zero-hit receipt, content-rule identifier, and remote response/download-policy receipt;
- code-sign identity and notarization IDs;
- workflow run IDs and artifact hashes;
- hosted macOS codec, AAC, and deterministic export receipts;
- physical hardware/OS for each manual run;
- decoded media metadata and hashes;
- screenshots/video of first launch, import, export, cancellation, recovery, Finder-open, and accessibility journey;
- known limits and untested surfaces;
- explicit reviewer and release decision.

A clean receipt may still conclude “not release-ready.” That is useful. A vague receipt must never conclude “done.”
