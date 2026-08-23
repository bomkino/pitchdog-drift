# Drift for macOS — threat model

This document describes the standalone application’s native trust boundary. It does not claim that WebKit, macOS, GPU drivers, codecs, or user-supplied media are bug-free. It defines what Drift exposes, what it refuses to expose, and which evidence must hold before release.

## Assets worth protecting

- Confidential pitch-deck slides and presenter footage.
- The current autosaved project in WebKit’s app-container storage.
- Portable `.pitched` project archives.
- Existing files at user-selected export destinations.
- Integrity and timing of MP4, AAC, and PNG output.
- The user’s broader filesystem, network identity, and other applications.
- The credibility of “local first,” “cancelled,” “saved,” “audio preserved,” and “verified” status messages.

## Trust boundaries

### Renderer

The React/Three.js studio and Mediabunny execute inside the main `WKWebView` frame. Renderer code is treated as less privileged than AppKit. It may request narrow operations through the bridge but must not receive arbitrary native capability.

The renderer owns project validation, scene evaluation, frame planning, video muxing, PNG verification, and final output readback. Native code must not invent a second timeline or bypass these checks.

### Native bridge

`WKScriptMessageHandlerWithReply` accepts messages only from Drift’s main frame and page content world. Every command has a fixed name and validated payload. Replies use bounded JSON-compatible envelopes.

There is no:

- method-name reflection;
- Objective-C selector dispatch;
- arbitrary path argument;
- shell or process launcher;
- AppleScript;
- URLSession or socket command;
- recursive delete;
- generic “invoke native” escape hatch.

The bridge version is frozen across Swift, JavaScript, TypeScript, and `Info.plist` and verified as one contract.

### File broker

AppKit panels or Finder document opening create opaque grants. A grant contains a URL only in native memory. JavaScript receives a random token, leaf filename, MIME type, byte size, modification time, and supported operations. It does not receive an absolute path.

The broker serializes file operations away from the interface thread. Current defense-in-depth ceilings include:

- 512 MiB native output and full renderer readback;
- 512 KiB write messages;
- 1 MiB read messages;
- bounded concurrent grants and write sessions;
- 96 MiB portable archive input;
- 80 MiB total portable media;
- 64 MiB per portable asset;
- 200 moving slides.

The web application imposes stricter limits where appropriate. The native ceiling is not a recommended target.

### Filesystem

The signed app uses App Sandbox, `com.apple.security.files.user-selected.read-write`, and `com.apple.security.network.client`. It has no network-server, blanket Downloads, Documents, home-directory, or temporary-exception entitlement. The network-client entitlement is app-wide; macOS does not restrict it to the WebKit helper topology.

Save destinations are staged in Foundation’s item-replacement directory for the selected destination volume. A completed stream is synchronized and committed with same-volume rename. Aborted and failed sessions remove staging bytes while leaving the previous destination untouched.

Directory-sequence operations accept one validated leaf filename beneath the selected directory. Path separators, traversal segments, directories, symbolic links, and collisions are rejected. Recursive deletion is not exposed.

### Native AAC

The Mac build does not ship the browser software-AAC/FFmpeg WebAssembly path. Instead, the web-side `CustomAudioEncoder` sends bounded PCM chunks to `NativeAacEncoder.swift`, which uses Apple’s software AAC-LC component through AudioToolbox.

The native encoder is a privileged media boundary, not a generic codec service. It accepts only:

- AAC-LC;
- 48 kHz;
- stereo;
- the frozen target bitrate;
- bounded duration, PCM size, packet count, and message size.

Its receipt includes packet bytes, packet frame counts, AudioSpecificConfig, magic-cookie data, leading priming, trailing padding, and total represented frames. JavaScript rejects receipts that do not satisfy the exact frame equation or requested configuration.

### Network

The signed sandboxed app has the app-wide network-client entitlement required by its packaged WKWebView topology and no network-server entitlement. A document-start page-world script removes `RTCPeerConnection` and `webkitRTCPeerConnection`; versioned WebKit content rules block HTTP, HTTPS, WS, WSS, and FTP; and the shared navigation policy cancels remote responses and every WebKit download request before native destination authority. Bundled file, Blob, data, and required about URLs remain available. A deliberate click on an HTTP or HTTPS help/source link is handed to the user’s default browser and cancelled inside Drift.

The app contains no native `URLSession`, Network.framework, or socket client; updater daemon; analytics service; cloud uploader; remote font; local server; or background network task. Adding native network code would immediately gain outbound capability and is therefore a protected-boundary change, not an ordinary feature.

## Threats and countermeasures

### Renderer asks for an arbitrary path

**Threat:** compromised JavaScript reads or replaces `/Users/...` by sending a path.

**Countermeasure:** no bridge command accepts a path. File and directory operations require an unpredictable token created by a native panel or Finder-open event. Native replies omit absolute URLs.

### Path traversal through PNG frame names

**Threat:** a frame prefix such as `../../Library/...` escapes the selected directory.

**Countermeasure:** filenames must remain unchanged after leaf sanitization, contain no slash, backslash, control character, `.` or `..`, and produce the selected directory as their standardized parent.

### Symlink substitution

**Threat:** a selected file, destination, parent, or child entry redirects operations elsewhere.

**Countermeasure:** selected imports, save destinations, directories, existing child entries, and destination parents are checked for symbolic-link status. Symlink inputs fail with `SecurityError`.

A malicious filesystem can still race metadata checks. App Sandbox and user-selected scope limit the reachable surface; staged same-volume replacement reduces intermediate states. This is not a formally race-free capability filesystem.

### Partial output overwrites valid work

**Threat:** the encoder crashes or the user cancels after a destination has been truncated.

**Countermeasure:** the destination is not opened for streaming. Drift writes to an item-replacement directory, synchronizes staging, reopens the completed bytes for renderer verification, and commits only on close. Abort tests begin with a known destination, write partial replacement bytes, abort, and byte-compare the old destination.

### Native success before the save panel resolves

**Threat:** the editor reports success when the user cancels the macOS panel.

**Countermeasure:** generated Blob saves are awaited through the native path. The bridge marks the save pending, suppresses known premature browser success notices, and reports completion, cancellation, or failure only after the broker settles.

### Bridge use from an iframe

**Threat:** an injected or navigated subframe calls privileged operations.

**Countermeasure:** the bridge script is injected with `forMainFrameOnly: true`; Swift independently rejects any message whose `frameInfo.isMainFrame` is false.

### Remote script or media exfiltrates a deck

**Threat:** a bundled page, imported project, or compromised renderer sends private media away.

**Countermeasure:** document-start WebRTC-constructor removal, versioned content-rule blocking, remote response/download cancellation before destination authority, no remote fonts, no shipped native network client, and the existing application’s no-fetch runtime contract. External links open outside Drift only after explicit user activation. Packaged evidence must pair signed-entitlement readback with exact TCP/UDP loopback listeners that observe zero token-bearing hits.

### Unbounded bridge memory

**Threat:** giant base64 messages, full-file reads, PCM batches, or output buffers exhaust the WebContent or app process.

**Countermeasure:** fixed chunk caps, output/readback cap, asset/archive caps, grant/session caps, AAC PCM and duration caps, packet caps, and the exporter’s PNG ZIP memory estimates. Large valid outputs can still pressure memory; failure must remain explicit and non-destructive.

### Malicious or corrupt AAC receipt

**Threat:** native code returns inconsistent priming, padding, packet, codec, or magic-cookie metadata and the renderer muxes misleading audio.

**Countermeasure:** the TypeScript adapter validates codec, sample rate, channels, bitrate, provider, packet counts, byte lengths, frame counts, AudioSpecificConfig, magic cookie, priming/padding bounds, and the exact represented-frame equation before constructing encoded packets. Packet timestamps include negative priming time. Final MP4 readback verifies actual A/V timing.

### Codec-session confusion or reuse

**Threat:** one renderer operation appends PCM to another session or uses a closed token.

**Countermeasure:** AAC sessions use opaque random identifiers, strict lifecycle states, bounded session count, configuration immutability, explicit finish, and idempotent close/cleanup. Unknown, closed, or mismatched sessions fail.

### Multiple editors corrupt current project state

**Threat:** two app instances write the same IndexedDB project.

**Countermeasure:** `LSMultipleInstancesProhibited` and a single-window lifecycle. Portable projects remain the explicit backup/collaboration boundary.

### Web content process termination

**Threat:** an incomplete native export remains plausible or the app silently loses state.

**Countermeasure:** process termination aborts every native write and AAC session before presenting Reload/Quit. Reload uses persistent app-container storage. No staged file is labelled complete. Automated recovery is exercised once; a second termination fails rather than looping green by retry.

Native callback failures write only a stable error class such as `SecurityError` to unified logging. User-controlled filenames and localized error prose stay out of background diagnostics; the foreground alert remains the deliberate place for actionable detail.

### Malicious `.pitched` archive

**Threat:** oversized, contradictory, duplicate, traversal, or hash-mismatched archive mutates the current project.

**Countermeasure:** native size/type gates apply before bytes reach JavaScript. The project importer then checks archive cap, schema, engine/theme versions, paths, entry uniqueness, asset count, sizes, references, and SHA-256 before replacement. Import failure leaves the current project intact.

### Codec binary supply chain

**Threat:** the packaged app unknowingly ships an opaque or noncompliant FFmpeg WebAssembly binary.

**Countermeasure:** dedicated `vite build --mode macos`, exact dependency alias to the native AudioToolbox adapter, bundle rejection of `.wasm`, source maps, browser AAC extension, FFmpeg, and libavcodec markers, byte manifest, legal bundle, SBOM, and third-party notice distinguishing browser and Mac builds.

### Test harness claims exporter failure when JavaScript never booted

**Threat:** a local-file bootstrap or asset-path failure waits for a timeout and is misdiagnosed as an encoder hang.

**Countermeasure:** the deterministic probe records boot and progress events, reports navigation/bootstrap diagnostics, verifies every bundle file against a SHA-256 receipt, and uses one classic IIFE with code splitting disabled. The packaged app is also a receipt-verified single-entry classic IIFE; its self-test exercises that exact production graph.

### Diagnostics leak private data

**Threat:** copied diagnostics include deck contents or absolute paths.

**Countermeasure:** diagnostic design is limited to versions, capability states, workflow phases, counts, error names, and non-sensitive status. File URLs remain native. Human release review must inspect copied diagnostics with confidential media loaded.

## Residual risks

- Image/video decoders, AudioToolbox, WebKit, and GPU drivers process hostile media. App Sandbox reduces impact but does not eliminate decoder vulnerabilities.
- The network-client entitlement is app-wide. The application-level WebKit lockdown and absence of shipped native networking reduce the ordinary exfiltration surface, but an arbitrary WebKit or macOS compromise may still obtain outbound capability.
- Future native `URLSession`, Network.framework, or socket code would be network-capable without an entitlement change. Source review and the native-client invariant must remain release gates.
- WebKit storage can be removed by the user or operating system. Portable `.pitched` backups remain necessary.
- User-selected grants are held for the lifetime of their opaque token; count is capped, but long sessions can retain access longer than one immediate operation.
- A user can deliberately choose an unreliable network, shared, removable, or nearly full destination volume. Drift protects replacement semantics, not the volume itself.
- H.264 behavior varies by macOS release, WebKit, hardware, dimensions, and memory. Capability probing and output readback are required; model names and OS versions are not proof.
- AudioToolbox is a system framework with implementation-specific priming and packet behavior. Drift records and validates observed metadata but cannot make the framework bug-free.
- Ad-hoc signing proves local bundle integrity, not publisher identity. Public release requires Developer ID, notarization, stapling, Gatekeeper, and independent verification.
- Universal compilation proves both slices build. It does not exercise Intel WebKit, GPU, or codecs.
- Automated runtime probes prove small representative output. They do not prove 30-second 1080 × 1920 behavior, visual quality, VoiceOver, removable-volume cleanup, sleep/wake, or every presenter codec.

## Evidence required for a release claim

- Extracted signed entitlements showing App Sandbox, user-selected file access, network-client access, and absence of network-server/broad-directory exceptions.
- Exact packaged TCP and UDP loopback probes with unpredictable tokens and zero accepted hits, tied to the tested app/WebContent processes and production rule identifier.
- Source and behavioural evidence that remote responses/downloads cannot acquire destination authority and no native `URLSession`, Network.framework, or socket client is shipped.
- Universal architecture readback and a separate Intel runtime receipt.
- Build-manifest checksum verification.
- Native broker self-test output.
- Packaged WebView/React/typed-command/recovery self-test output.
- Clean bundle scan showing no source maps, `.wasm`, browser AAC extension, FFmpeg, or libavcodec marker.
- Native AudioToolbox AAC packet/frame receipt.
- Deterministic WKWebView MP4/PNG receipt with decoded output evidence.
- Real import/save/export/cancel tests on physical Apple Silicon and Intel Macs.
- Accessibility and diagnostics privacy review.
- Notarization, stapling, Gatekeeper, and checksum evidence for any binary offered to other people.
- A completed QA receipt that distinguishes automation, hosted hardware, physical hardware, human review, and untested boundaries.
