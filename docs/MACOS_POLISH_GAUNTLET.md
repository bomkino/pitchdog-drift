# Drift for macOS — product-polish gauntlet

This document records the stacked `feat/native-macos-studio-polish` pass. It is deliberately narrower than the standalone-app product contract: the native architecture already exists in draft PR #13, so this pass attacks the places where a technically correct wrapper can still feel unfinished or make weak evidence claims.

## User promise

A person should not need Finder, TextEdit, Terminal, GitHub, or a build log to answer basic questions about the installed app. Drift should explain itself from inside Drift, expose its exact provenance, and fail with enough phase information that a maintainer can act without reproducing a generic `error 1`.

## Accepted gains

- The Help menu opens the bundled guide inside a searchable, selectable AppKit window.
- The guide is parsed from the exact Markdown copied into the signed bundle; it does not duplicate or fetch documentation.
- About Drift shows version, build, source revision, licence family, and system-codec policy.
- Copy Diagnostics includes only the bounded source revision, never a filesystem path or project text.
- The app-binary smoke test verifies that `Info.plist` provenance matches `BuildReceipt.txt`.
- The app-binary native self-test names the failing phase and preserves `BridgeFailure` name/message details.
- The native presentation resource is part of the canonical Swift graph and signed resource manifest.

## Counterchecks

1. Delete the bundled user guide: `--smoke-test` must fail.
2. Replace the guide with a tiny or unrelated file: the presentation self-test must fail.
3. Make `DriftSourceRevision` disagree with `BuildReceipt.txt`: the smoke test must fail.
4. Add a second stray Swift implementation under `macos/App`: the source contract must fail.
5. Reintroduce `NSWorkspace.shared.open` into the guide presenter: the source contract must fail.
6. Break one native subsystem: `--native-self-test` must name the subsystem rather than report an opaque error number.
7. Close and reopen the guide: one retained window should return with its saved frame and local search support.
8. Launch without network permission: guide and About must remain complete.

## Non-goals

- No first-run modal or marketing interruption.
- No remote help site, analytics, update daemon, or support upload.
- No second copy of the user guide in HTML.
- No rewrite of the deterministic renderer or project format.
- No merge, release, notarization, or binary publication.

## Evidence boundary

Hosted macOS compilation can prove AppKit API availability, bundle parsing, source-receipt agreement, and the executable self-tests. It cannot prove typography, VoiceOver order, window feel, or minimum-OS behavior on physical hardware. Those remain explicit manual QA items rather than inferred green checks.
