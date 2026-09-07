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

## Acknowledgement and triage

For a report with enough information to identify the affected surface, the maintainers aim to:

- acknowledge receipt within 5 business days;
- provide an initial triage or a concrete request for missing evidence within 10 business days;
- send an update at least every 14 days while a confirmed report remains active;
- agree on disclosure timing after impact, affected revisions, and a safe fix path are understood.

These are response targets, not guarantees or automatic disclosure deadlines. If no acknowledgement arrives after 5 business days, send one follow-up with the original subject and timestamp. Drift currently has no bug-bounty programme; do not incur costs expecting payment without a prior written agreement.

## Supported surfaces

Security fixes target the current `main` branch and explicitly active construction or release branches. This source tree identifies as native `v0.4.0`; treat that version as public only when the matching GitHub tag and release exist. Public source can move faster than a notarized binary, so always identify the exact commit or app build.

No public compiled Mac release is promised merely because CI can build `Drift.app`. The DMG attached to the historical `v0.1.0` release is ad-hoc signed and unnotarized and is not a supported security-maintained binary. A binary is supported only when the repository explicitly publishes it with a version, source revision, checksum, signing/notarization receipt, and release notes.

## High-priority classes

- Archive traversal, symlink substitution, unsafe file kinds or malformed native media.
- Cross-document or stale-operation races that expose or overwrite newer work.
- Cancelled/failed Save, export or installation replacing accepted content.
- Cleanup deleting user projects, originals or unrelated output.
- Unbounded archive/decode/export memory or output verification accepting corrupt, silent, mistimed or falsely transparent media.
- Runtime network requests, undeclared codec binaries, compromised source-to-artifact identity or sensitive diagnostic disclosure.

## Native security invariants

Native Drift uses typed projects, strict new-format archive validation, original-file hashes, bounded work, document tickets, immutable saves/exports and staged publication. A failed operation preserves the previously accepted destination. The signed runtime contains no WebKit, JavaScript, WebAssembly, analytics, updater, cloud client or runtime downloads. Native codec libraries must match their pinned source and legal notices.

The application has normal user-process permissions; it is **not sandbox-contained**. Historical bridge-token and WKWebView sandbox rules describe the retired hybrid app. They are not native security claims. Native parser flaws or a compromised user process remain risks. See `docs/MACOS_THREAT_MODEL.md`.

Installation verifies the released bytes before normal Quit, respects Cancel and retains the previous bundle for rollback. Publishing is an explicit exact-main operation with immutable tags/assets. Ad-hoc signing must never be presented as Developer ID or notarization.

## Privacy expectations

Projects and originals stay in user-selected files and private native workspaces. Native controls use system fonts; retained sound recordings are bundled. The app needs no account or network service. Diagnostic evidence uses synthetic media and excludes private paths, project contents, secrets and identifying media hashes unless deliberately supplied through the private reporting process.

## Coordinated disclosure

Please allow reasonable time to reproduce, patch, test, and distribute a fix before public disclosure. The project will not demand silence indefinitely or use coordination as a pretext to bury a valid report. When a report is confirmed, the preferred outcome is a clear advisory describing affected revisions, impact, fix, and any recovery steps without publishing confidential user data.

Good-faith research that avoids privacy harm, persistence, destructive testing against other people, and public release before coordination is welcome.
