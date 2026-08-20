# Drift for macOS — threat model

This document describes the standalone application’s native trust boundary. It does not claim that WebKit, macOS, codecs, or user-supplied media are bug-free. It defines what Drift exposes, what it refuses to expose, and which evidence must hold before release.

## Assets worth protecting

- Confidential pitch-deck slides and presenter footage.
- The current autosaved project in WebKit’s app-container storage.
- Portable `.pitched` project archives.
- Existing files at user-selected export destinations.
- Integrity of MP4 and PNG output.
- The user’s broader filesystem, network identity, and other applications.
- The credibility of “local first,” “cancelled,” “saved,” and “verified” status messages.

## Trust boundaries

### Renderer

The React/Three.js studio and its media libraries execute inside the main `WKWebView` frame. Renderer code is treated as less privileged than AppKit. It may request narrow operations through the bridge but must not receive arbitrary native capabilities.

### Native bridge

`WKScriptMessageHandlerWithReply` accepts messages only from Drift’s main frame and only in the page content world. Every command has a fixed name and a validated payload. Replies use JSON-compatible envelopes. There is no method-name reflection, Objective-C selector dispatch, arbitrary path argument, shell, AppleScript, URLSession, socket, or process-launch command.

### File broker

AppKit panels or Finder document opening create opaque grants. A grant contains a URL only in native memory. JavaScript receives a random token, leaf filename, MIME type, byte size, modification time, and read/write behavior. It does not receive the absolute path.

The broker serializes file operations away from the interface thread. It caps native output at 1 GiB, write messages at 512 KiB, read messages at 1 MiB, full renderer readback at 512 MiB, import archives at 96 MiB, and slide batches at 80 MiB. Limits are defense-in-depth around the stricter project and export limits already enforced by the web application.

### Filesystem

The signed app uses App Sandbox and `com.apple.security.files.user-selected.read-write`. It has no blanket Downloads, Documents, home-directory, temporary-exception, or network entitlement.

Save destinations are staged in Foundation’s item-replacement directory for the selected destination volume. A completed stream is synchronized and moved over the destination with same-volume `rename`. Aborted and failed sessions remove staging bytes while leaving the prior destination untouched.

Directory sequence operations accept one validated leaf filename beneath the selected directory. Path separators, traversal segments, directories, and symbolic links are rejected. Recursive deletion is not exposed.

### Network

The app has no client or server network entitlement. WebKit content rules block HTTP, HTTPS, WS, WSS, and FTP loads. Navigation policy permits bundled file, Blob, data, and about URLs. A deliberate click on an HTTP or HTTPS help/source link is handed to the user’s default browser and cancelled inside Drift.

The native macOS build aliases the software AAC extension to a no-op registration module, and bundle verification rejects WebAssembly files and FFmpeg/libavcodec markers. This removes an unnecessary executable binary and its distribution obligations from the app’s runtime.

## Threats and countermeasures

### Renderer asks for an arbitrary path

**Threat:** compromised JavaScript reads or replaces `/Users/...` by sending a path.

**Countermeasure:** no bridge command accepts a path. File and directory operations require an unpredictable token created by a native panel or Finder-open event.

### Path traversal through PNG frame names

**Threat:** a frame prefix such as `../../Library/...` escapes the selected directory.

**Countermeasure:** filenames must remain unchanged after leaf sanitization, contain no slash, backslash, control character, `.` or `..`, and produce the selected directory as their standardized parent.

### Symlink substitution

**Threat:** a selected file or child entry redirects writes to a different location.

**Countermeasure:** selected import files, export destinations, directories, existing child entries, and destination parents are checked for symbolic-link status. Symlink inputs fail with `SecurityError`.

A malicious filesystem can still race metadata checks. App Sandbox and user-selected scope limit the reachable surface; atomic same-volume replacement reduces intermediate states. This is not a formal race-free capability filesystem.

### Partial output overwrites valid work

**Threat:** an encoder crashes or the user cancels after a destination has already been truncated.

**Countermeasure:** the destination is not opened for streaming. Drift writes to an item-replacement directory, synchronizes it, and atomically renames only on close. Abort tests begin with a committed destination, write partial replacement bytes, abort, and byte-check the old destination.

### Native success before user completes a save panel

**Threat:** the browser editor reports success when a user cancels the macOS panel.

**Countermeasure:** the bridge intercepts generated Blob downloads, marks native save pending, suppresses known premature browser success notices, and presents native completion/cancellation status only after the broker commits or the panel aborts.

### Bridge use from an iframe

**Threat:** injected or navigated subframe calls privileged native operations.

**Countermeasure:** the bridge script is injected with `forMainFrameOnly: true`; Swift also rejects any `WKScriptMessage` whose `frameInfo.isMainFrame` is false.

### Remote script or media load

**Threat:** a project or bundled page exfiltrates deck data.

**Countermeasure:** no app network entitlement, content-rule blocking, navigation cancellation, no remote fonts, and the existing web application’s no-fetch runtime contract. External links open outside the process only after user activation.

### Unbounded bridge memory

**Threat:** giant base64 messages or full-file reads exhaust the content or app process.

**Countermeasure:** fixed chunk caps, output cap, import caps, grant cap, 512 MiB full readback cap, and the web exporter’s own PNG ZIP memory estimates. MP4 verification may still require substantial memory for large user-selected outputs; 1 GiB is an upper boundary, not a recommended target.

### Multiple editors corrupt current project state

**Threat:** two app instances write the same IndexedDB project.

**Countermeasure:** `LSMultipleInstancesProhibited` and a single-window app lifecycle. Portable projects remain the explicit collaboration/backup boundary.

### Web content process termination

**Threat:** an incomplete native export remains plausible, or the app silently loses state.

**Countermeasure:** process termination aborts every native write session before presenting Reload/Quit. Reload uses persistent app-container storage. No staged file is labelled complete.

### Malicious `.pitched` archive

**Threat:** oversized, contradictory, duplicate, or hash-mismatched archive mutates the current project.

**Countermeasure:** native size/type gates apply before bytes reach JavaScript. The existing project importer then checks archive cap, schema, engine/theme versions, path uniqueness, asset count, sizes, references, and SHA-256 before project replacement. Native document registration does not bypass those checks.

### Codec binary supply chain

**Threat:** the packaged app unknowingly ships an opaque or noncompliant FFmpeg WebAssembly binary.

**Countermeasure:** dedicated `vite build --mode macos`, exact dependency alias to a system-codec stub, bundle rejection of `.wasm` files and codec markers, byte manifest, and third-party notice describing the distinct browser and Mac policies.

## Residual risks

- Complex image/video decoders and GPU drivers process hostile media. App Sandbox limits impact but does not eliminate decoder vulnerabilities.
- WebKit storage can be removed by the user or operating system. Portable `.pitched` backups remain necessary.
- Security-scoped grants and Finder-open URLs are held for the lifetime of their opaque token; grant count is capped, but long sessions can retain access longer than the immediate operation.
- A user can deliberately choose an unsafe shared or removable destination. Drift protects replacement semantics, not the reliability of the volume.
- System WebCodecs behavior varies by macOS release and hardware. Capability probing and output readback are required; model names and version assumptions are not proof.
- Ad-hoc signing proves bundle integrity after the local build, not publisher identity. Public release requires Developer ID, notarization, stapling, and independent verification.
- The WebView self-test proves packaged loading and bridge availability, not visual quality or every export codec.

## Evidence required for a release claim

- Extracted signed entitlements showing App Sandbox, user-selected file access, and no network entitlement.
- Universal architecture readback.
- Build-manifest checksum verification.
- Native broker self-test output.
- Packaged WebView self-test output.
- Clean bundle scan showing no `.wasm` or FFmpeg/libavcodec marker.
- Real import/save/export/cancel tests on a physical Apple Silicon Mac.
- Notarization and Gatekeeper evidence for any binary offered to other people.
- A completed QA receipt that distinguishes automated checks from human visual review.
