# Native Mac release

Only an accepted native installer from exact current `main` may become the current download. Source tags, PR tests, hosted artifacts, publication and local installation are separate states. Do not install over a user's app without their instruction.

## Required sequence

1. Preserve unrelated work; fix and test the candidate on its task branch. `verify` requires authored source tests, full native integration, external XCUITest against the archived app, decoded media/output proof, Light/Dark window captures, safe installer/publisher boundary tests and DMG mount verification.
2. Open a normal PR. Preserve main protections and required `verify`. Resolve failures before merge. No force push, tag moves, weakened checks or bypasses.
3. After merge, let CI build the exact new main SHA. The build number is the CI run number. The clean committed source, embedded identity and test receipt must agree. PR artifacts cannot be relabelled as main.
4. `package-native-app.sh` archives and round-trips the signed app. The UI driver tests that exact restored bundle and records its code-directory hash and build. `package-macos-dmg.sh` copies that bundle without rebuilding or re-signing, creates and mounts the DMG, compares every bundle file, verifies signing and freezes source/tree/version/build/host/asset digests in `MacReleaseReceipt.json`.
5. Inspect synthetic outputs, appearance captures and actual local launch/open. Record physical checks separately from hosted proof. Known document, output or installation failures block publication; unavailable hardware observations remain explicit limits.
6. Dispatch `source-release.yml` from main with the exact source SHA and its successful push-to-main CI run ID. It verifies authority and downloads `drift-native-installer-SHA`. The publisher verifies files, main, tree and tag, resolves drafts by release ID, resumes matching partial uploads, and refuses differing or incomplete public assets. It never replaces published bytes or moves a tag.
7. Read the public release back, independently redownload all four assets, verify the receipt/checksum and mount the public DMG. Confirm `latest`, tag SHA and build identity. A release is complete only after destination proof.

## Signing

Default native CI uses ad-hoc signing. These builds are **unnotarized**, and macOS may block a quarantined first launch. For a trusted verified download, use Privacy & Security → Open Anyway. Do not remove quarantine or disable Gatekeeper.

The optional `macos-release.yml` lane retains the protected signing environment and requires current-main source plus real Developer ID and notarization credentials. It runs `release-macos-app.sh --notarize`: native build, notarized/stapled app, external UI proof, signed/notarized DMG, frozen receipt. It publishes no GitHub binary and retains only text receipts. Missing credentials fail closed. Ad-hoc success never substitutes for this lane.

## Safe installation

`Install-Drift.command` uses stock macOS tools. It verifies a supported native release receipt, immutable tag, mandatory DMG checksum/length, embedded source/version/build and code signature before requesting normal Quit. It confirms the selected installed app has exited and respects Save/Cancel. Copying and renames stay on the destination volume. The previous app is retained for rollback; failed publication restores it when possible and preserves diagnostic/recovery markers. Concurrent or ambiguous interrupted installations stop without deleting either app. Projects, originals and private recovery are not installation targets.

Test replacement in disposable directories first. Never force-kill the user's app, delete `/Applications/Drift.app`, install with sudo, bypass security, or silently replace a published version. A fresh version is required if accepted public bytes must change.

## Evidence limits

The release receipt records its actual OS and host, not the deployment floor as a tested OS. Hosted arm64 success does not claim physical M2/M1 Pro, minimum macOS 13.3, battery, long-session thermals, sleep/wake, external displays or assistive-technology acceptance. Preserve failed evidence and report skipped checks plainly. Public artifacts contain synthetic media only; never include client projects, credentials, private filenames or machine serial numbers.
