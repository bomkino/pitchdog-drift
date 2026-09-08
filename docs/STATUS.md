# Drift — current state

8 September 2026 · `galileo-drift` · `bomkino/pitchdog-drift`

**Stable baseline:** [v0.4.0](https://github.com/bomkino/pitchdog-drift/releases/tag/v0.4.0), native Apple-silicon Drift. The release's `MacReleaseReceipt.json` records its exact main source, build, tested bundle and asset hashes. Historical PR49 checkpoints do not describe the current checkout.

**Current change:** [PR51](https://github.com/bomkino/pitchdog-drift/pull/51) adds shared native controls across the existing panels and sheets. Version 0.5.0 uses the canonical [PitchdogStudioUI](https://github.com/bomkino/pitchdog-studio-ui/tree/8f296630180ea4dbc77fe65a9c86e88a5b9bb9c0) package at immutable revision `8f296630180ea4dbc77fe65a9c86e88a5b9bb9c0`. The application owns fonts, media, audio, rendering and document state. [Implementation](STUDIO_UI_IMPLEMENTATION.md) describes the package and guarded local override.

**Proof:** the previous local-override candidate `bf9c704b6ce290a9007db3561e2934f9e1988c16` passed [native pilot 34180243663](https://github.com/bomkino/pitchdog-drift/actions/runs/34180243663) and [CI 34180246781](https://github.com/bomkino/pitchdog-drift/actions/runs/34180246781), including native integration and actual app journeys. Those receipts remain evidence for that exact source. The canonical-package transition requires fresh PR and exact-main CI; release assets must come from the latter without rebuilding. Consult the PR checks and published receipt for the resulting source and build.

**Release channel:** 0.5.0 is a prerelease. [Releases](https://github.com/bomkino/pitchdog-drift/releases) and their immutable receipts prove publication; this document does not substitute for them. v0.4.0 stays the latest stable release. Candidate installation requires an explicit release directory; see the [changelog](../CHANGELOG.md). The user's installed app is a separate surface and is not replaced by publication.

**Open acceptance:** human visual approval, VoiceOver, macOS 13.3, M1 Pro, battery, sleep/wake and external-display checks. The default app is ad-hoc signed and unnotarized. Developer ID/notarization stays a separate protected lane. Legacy hybrid projects are not migrated; source-video audio remains silent by contract.

Original handovers, dated reports and prior tags are preserved. Use this page, the [user guide](MACOS_USER_GUIDE.md), [architecture](ARCHITECTURE.md) and [release procedure](MACOS_RELEASE.md) as working entry points; older browser/hybrid documents are historical context.
