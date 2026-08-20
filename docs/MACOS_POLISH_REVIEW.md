# Review map — native macOS polish

## Read first

- `docs/MACOS_POLISH_GAUNTLET.md`
- `macos/App/NativePresentation.swift`
- `macos/App/DriftMain.swift`
- the About/Help wiring in `macos/App/DriftAppDelegate.swift`
- the new presentation markers in `scripts/check-macos-source.mjs`

## Review questions

- Does Help remain fully local and useful without opening another application?
- Does About expose enough provenance without exposing a user path or project content?
- Does the guide window behave as an auxiliary Mac window rather than a modal interruption?
- Can every new promise be falsified by a source, smoke, bundle, or manual check?
- Are the remaining hardware and signing boundaries stated without pretending CI covered them?

## Merge posture

This is a stacked draft on top of the standalone-app branch. It must remain unmerged until the parent branch is stable, hosted macOS CI is green on this exact head, and manual AppKit review has been recorded. No binary should be uploaded from this branch.
