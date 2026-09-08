# Native studio UI

Normal Drift application builds use [PitchdogStudioUI](https://github.com/bomkino/pitchdog-studio-ui), pinned to `8f296630180ea4dbc77fe65a9c86e88a5b9bb9c0` in `macos/NativeCore/Package.swift` and `Package.resolved`. Core-only graphs do not resolve the UI package.

The shared components style the existing panels, Look/Motion/Slide controls, native menu triggers, compact fields and export sheets. Drift retains rendering, media/audio, bindings, document history, field ownership and export state. Galileo's document/schema behavior is not imported.

The package contains no resources. Drift owns three native variable TTFs and their upstream receipts in `macos/Resources/StudioFonts/SOURCE.json`. The existing type-system v13.0.0 pin remains `786b4a2b671182319320f922b8de8f927ea3a002`. Fonts resolve from those exact files; no installed font-name collision is accepted.

`BuildIdentity.json` records canonical repository and revision; third-party notices retain the package license, README and source SHA. The distribution guard requires the application's exact canonical pin. Normal CI compiles and exercises the shared controls in the archived app before freezing the DMG.

For component development, set `PITCHDOG_STUDIO_UI_PATH` to a clean package checkout and `DRIFT_ALLOW_STUDIO_UI_PILOT=1`. The build requires ad-hoc signing, records `mode: pilot`, and remains ineligible for ZIP/DMG distribution. The separate pilot workflow tests this refusal and the real native journey.

The 0.5.0 channel is prerelease. Human visual approval, VoiceOver, minimum macOS and broader physical hardware acceptance remain open. Compilation and hosted UI proof do not close those gates. See [current state](STATUS.md) and the [release procedure](MACOS_RELEASE.md).
