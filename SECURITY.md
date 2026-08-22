# Security policy

Drift processes private pitch-deck images, presenter video, portable project archives, and rendered output. Security reports deserve a channel that does not expose the reporter’s files or a working exploit to a public issue tracker.

## Reporting a vulnerability

Do not attach confidential deck material, access tokens, security-scoped paths, crash dumps containing user filenames, or a weaponized `.pitched` archive to a public issue.

Send a minimal report to `hello@pitch.dog` with **DRIFT SECURITY** in the subject. Include:

- affected commit or version;
- browser or macOS version and hardware architecture;
- the smallest reproducible steps;
- expected and observed behavior;
- whether private media, arbitrary filesystem access, output integrity, sandbox escape, or network access is involved;
- a synthetic fixture where possible;
- your preferred disclosure name or request for anonymity.

The maintainers may ask for a private proof-of-concept after establishing a secure channel. Never send real client decks merely because they reproduce the bug.

## Supported surfaces

Security fixes target the current `main` branch and explicitly active construction or release branches. Public source can move faster than a notarized binary; always identify the exact commit or app build.

No public compiled Mac release is promised merely because CI can build `Drift.app`. A binary is supported only when the repository explicitly publishes it with a version, source revision, checksum, signing/notarization receipt, and release notes.

## High-priority classes

- App Sandbox escape or entitlement expansion.
- Native bridge commands callable from a subframe or remote page.
- Arbitrary path read, write, deletion, shell, AppleScript, process launch, socket, or URLSession access.
- Path traversal, symlink substitution, grant confusion, or token reuse across files.
- Cancelled or failed export replacing a previously valid destination.
- Directory-sequence cleanup deleting unrelated files.
- Remote network request or exfiltration from the supposedly local runtime.
- `.pitched` archive mutation before schema, digest, path, size, and reference verification.
- Cross-project or stale-operation races that expose or overwrite newer work.
- Unbounded decode, archive, bridge, or export memory that bypasses documented caps.
- Output verification accepting corrupt, silent, mistimed, wrong-size, wrong-codec, or falsely transparent media.
- Packaged Mac bundle including an undeclared codec binary or losing its intended entitlements after signing.
- Sensitive path, filename, project, or media disclosure through diagnostics or logs.

## Native security invariants

The Mac application is expected to preserve all of the following:

- main-frame-only `WKScriptMessageHandlerWithReply` bridge;
- fixed command allowlist and bounded payloads;
- opaque file/directory tokens; no renderer-visible absolute paths;
- App Sandbox with user-selected read/write and the app-wide network-client entitlement required by the packaged WKWebView topology;
- no network-server, broad-directory, or temporary-exception entitlement;
- no shipped native `URLSession`, Network.framework, socket, updater, analytics, or cloud-upload client;
- no broad home, Documents, Downloads, temporary-exception, shell, process, AppleScript, or recursive-delete capability;
- symlink and traversal rejection;
- item-replacement staging and atomic commit;
- abort preserving the prior committed destination;
- document-start removal of page-visible WebRTC constructors, plus HTTP, HTTPS, WebSocket, and FTP blocking inside the WebView;
- remote response/download cancellation before WebKit or AppKit can grant destination authority;
- system-codec-only Mac bundle with no FFmpeg WebAssembly;
- executable broker and packaged-WebView self-tests;
- CI compilation without accidental binary publication.

A change that breaks one of these is security-relevant even when the interface still appears to work.

See `docs/MACOS_THREAT_MODEL.md` for trust boundaries and residual risks.

## Privacy expectations

Production runtime source contains no analytics, remote font, cloud upload, hidden API, or automatic update service. Imported media and projects remain in browser storage, the Mac app container, or user-selected files unless the user deliberately moves or shares them.

External links in the Mac app should open in the default browser only after user activation. The network-client entitlement is app-wide, not WebKit-only: adding any native networking is a security-boundary change, and arbitrary WebKit/macOS compromise remains a residual risk.

Diagnostics must remain useful without including absolute paths, project contents, asset hashes that identify private material, or raw media metadata beyond what a reporter deliberately supplies.

## Coordinated disclosure

Please allow reasonable time to reproduce, patch, test, and distribute a fix before public disclosure. The project will not demand silence indefinitely or use coordination as a pretext to bury a valid report. When a report is confirmed, the preferred outcome is a clear advisory describing affected revisions, impact, fix, and any recovery steps without publishing confidential user data.

Good-faith research that avoids privacy harm, persistence, destructive testing against other people, and public release before coordination is welcome.
