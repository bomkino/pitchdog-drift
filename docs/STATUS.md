# Drift — current state

23 September 2026 · `bomkino/pitchdog-drift`

## Portrait train hotfix: 0.5.1

The current source retains the 0.5.0 native studio interface and fixes the custom-frame transaction crash, independent output/slide sizing and per-slide motion geometry. New documents use 1080 × 1920 output, 2576 × 1080 slide frames and close vertical motion. Existing projects keep saved choices; the output-size dialog offers an explicit undoable Instagram train conversion.

The [latest stable release](https://github.com/bomkino/pitchdog-drift/releases/latest), its exact-source `MacReleaseReceipt.json` and the associated successful main CI run are the publication authority. A source commit or this page is not evidence of a published installer. Version 0.5.1 publication is authorized only after its complete exact-main source, native integration, archived-app UI and mounted-installer checks succeed. No rebuild occurs between testing and release.

Native controls still use PitchdogStudioUI at immutable revision `8f296630180ea4dbc77fe65a9c86e88a5b9bb9c0`. The app owns fonts, media, audio, rendering and document state. No web runtime is shipped. See the [user guide](MACOS_USER_GUIDE.md), [architecture](ARCHITECTURE.md), [release procedure](MACOS_RELEASE.md) and [changelog](../CHANGELOG.md).

Hosted checks do not certify minimum macOS 13.3, physical M1 Pro/M2, VoiceOver, battery, sleep/wake or external-display acceptance. The app remains ad-hoc signed and unnotarized; Developer ID/notarization is a separate protected lane. Legacy hybrid projects are not migrated and source-video audio remains silent. Publication does not replace an app already installed on a user's Mac.

Historical tags, handovers and release receipts are retained for rollback and provenance.
