# Drift for macOS — release checklist

This checklist governs a downloadable Mac binary. Building an `.app` locally or compiling it in CI is not the same as authorizing a public release.

## 1. Source freeze

- [ ] Choose one commit on `feat/native-macos-studio` or its reviewed successor.
- [ ] Confirm the branch is rebased or merged against the intended `main` commit without unrelated agent work.
- [ ] Record the commit SHA, tree SHA, `package-lock.json` SHA-256, and package version.
- [ ] Confirm all source, shader, documentation, and native changes remain under AGPL-3.0-or-later or their stated dependency licences.
- [ ] Confirm the native source contract passes from a clean checkout.
- [ ] Confirm no legacy monolithic `macos/DriftApp.swift` remains beside the split implementation.
- [ ] Review every new native command and prove a user-facing need for it.

## 2. Browser-engine regression gate

- [ ] `npm ci` succeeds without lockfile mutation.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run test:e2e` passes in the project’s verified Chromium runtime.
- [ ] Existing deterministic export, project integrity, recovery, shader, accessibility, and fallback tests remain green.
- [ ] The native branch has not changed visual-engine behavior accidentally through build-time string transforms or aliases.

## 3. Native build gate

- [ ] Build on a supported macOS host with the pinned source commit.
- [ ] Use a clean dependency installation.
- [ ] `npm run build:mac` succeeds.
- [ ] The executable contains both `arm64` and `x86_64` slices.
- [ ] The app minimum version is macOS 13.3 or the deliberately revised supported minimum.
- [ ] The app opens from Applications without Vite, Node.js, Terminal, or a local server.
- [ ] The packaged WebView loads relative assets and creates `main.app`.
- [ ] The bridge reports version 2 and exposes native file/directory pickers.
- [ ] The native broker self-test passes.
- [ ] The build-manifest readback passes.

## 4. Security gate

- [ ] Extract entitlements from the signed finished app, not the source plist.
- [ ] `com.apple.security.app-sandbox` is true.
- [ ] `com.apple.security.files.user-selected.read-write` is true.
- [ ] `com.apple.security.network.client` is absent.
- [ ] `com.apple.security.network.server` is absent.
- [ ] No broad Downloads, Documents, home-directory, or temporary-exception entitlement is present.
- [ ] Hardened runtime flag is present.
- [ ] No non-system dynamic library is linked.
- [ ] Main-frame-only bridge injection is preserved.
- [ ] Every bridge payload is bounded and validated.
- [ ] No path, shell, AppleScript, URLSession, socket, reflection, or recursive-delete command is exposed.
- [ ] Symlink and traversal tests pass.
- [ ] Quit, close, and content-process crash abort incomplete native writes.
- [ ] The bundled WebView cannot load HTTP, HTTPS, WS, WSS, or FTP resources.
- [ ] Explicit external links open in the default browser rather than Drift.

## 5. Codec and licensing gate

- [ ] Build uses `vite build --mode macos`.
- [ ] `@mediabunny/aac-encoder` resolves to `src/lib/macosAacEncoder.ts` for the app build.
- [ ] No `.wasm` file exists in `Drift.app`.
- [ ] No FFmpeg AAC or `libavcodec` marker exists in the bundled web runtime.
- [ ] The app uses system H.264 and AAC encoders only.
- [ ] On a Mac without system AAC, presenter audio fails visibly and can be resolved by muting or updating macOS.
- [ ] Presenter audio is never omitted silently.
- [ ] `THIRD_PARTY_NOTICES.md` distinguishes the browser source build from the standalone macOS bundle.
- [ ] The bundle contains LICENSE, NOTICE, asset licence, third-party notices, trademarks, threat model, QA plan, user guide, and product contract.

## 6. User-journey gate

- [ ] First launch presents an authored scene without network or login prompts.
- [ ] Add Slides works through the app button and File menu.
- [ ] Add Presenter works through the app button and File menu.
- [ ] `.pitched` opens through the app, File menu, Finder double-click, and Open With.
- [ ] Finder-open during launch queues until the importer is ready.
- [ ] Window size restores across launches.
- [ ] Closing the window and clicking the Dock icon restores the one studio window.
- [ ] Native menus disable impossible actions while Drift is busy.
- [ ] MP4, PNG still, PNG sequence, and portable-project destinations use native panels.
- [ ] Cancelling a native Blob save produces no file and no false success.
- [ ] Reveal Last Export selects the committed file in Finder.
- [ ] App full-frame mode, macOS full screen, and interface zoom all work independently.
- [ ] Copy Diagnostics produces useful, non-sensitive runtime information.

## 7. Project and recovery gate

- [ ] Autosaved project and media survive relaunch.
- [ ] Portable project survives a fresh app container.
- [ ] Corrupt archive rejection leaves the current project unchanged.
- [ ] Recovery-locked storage is not overwritten by fallback demos.
- [ ] Save failure remains visible.
- [ ] Quit/close warning appears during saving, failed save, recovery lock, project replacement, and export.
- [ ] “Keep Working” is the safe default.
- [ ] WebKit content-process termination rolls back staging and offers Reload/Quit.
- [ ] Multiple app instances are prohibited.

## 8. Media-output gate

- [ ] Generate opaque MP4, muted-presenter MP4, and—where supported—presenter-audio MP4 inside the packaged app.
- [ ] Generate transparent PNG still and directory PNG sequence inside the packaged app.
- [ ] Independently decode and inspect output container, codec, dimensions, frame count, timestamps, duration, colour, alpha, audio, and A/V sync.
- [ ] Extract and visually inspect first, middle, and final frames.
- [ ] Confirm the deck moves and the pinned presenter changes over time.
- [ ] Test 1, 2, 12, and 200 slides.
- [ ] Test every stage ratio and both axes.
- [ ] Test 24, 25, 30, 50, and 60 fps under their intended audio constraints.
- [ ] Test 3-, 8-, and 30-second output.
- [ ] Test a near-limit dimension and a deliberately unsupported dimension.

## 9. Destructive-failure gate

- [ ] Begin with a known existing destination and record its SHA-256.
- [ ] Cancel MP4 replacement during preparation, rendering, encoding, and finalization.
- [ ] Confirm the previous destination remains byte-identical after native staged abort.
- [ ] Cancel PNG still save.
- [ ] Cancel PNG sequence after several frames and confirm created frames are removed.
- [ ] Test a colliding sequence filename and confirm no overwrite.
- [ ] Disconnect a removable destination during write.
- [ ] Fill the destination volume.
- [ ] Revoke file permission after selection.
- [ ] Force WebGL context loss.
- [ ] Force WebKit content-process termination.
- [ ] Confirm every failure states whether prior work survived.

## 10. Accessibility and visual gate

- [ ] VoiceOver journey passes from import through export.
- [ ] Full Keyboard Access reaches every editor and native-menu control.
- [ ] Visible focus survives 200% interface magnification.
- [ ] Reduced-motion preference affects preview without silently altering saved export motion.
- [ ] Minimum window remains operable and footer remains reachable.
- [ ] Native titlebar traffic lights do not overlap interface controls.
- [ ] Light/dark system appearance does not make panels or alerts illegible.
- [ ] Error, progress, cancellation, and recovery overlays are readable over every theme.
- [ ] Human review confirms motion serves slide legibility rather than becoming the subject.

## 11. Physical hardware gate

- [ ] Current Apple Silicon Mac.
- [ ] Oldest supported macOS on Apple Silicon.
- [ ] Intel Mac or independently verified Intel hardware.
- [ ] Low-memory stress run.
- [ ] External/removable destination volume.
- [ ] Sleep/wake and full-screen transition.
- [ ] Long presenter video and 30-second export.

Cross-compiling the Intel slice is not an Intel runtime test.

## 12. Signing and notarization

- [ ] Sign every executable code object with the intended Developer ID Application identity.
- [ ] Preserve App Sandbox and hardened runtime entitlements in the final signature.
- [ ] `codesign --verify --deep --strict --verbose=2` passes.
- [ ] Submit the app or DMG to Apple notarization.
- [ ] Record the notarization submission ID and accepted status.
- [ ] Staple the ticket.
- [ ] `spctl --assess --type execute --verbose=4 Drift.app` passes on a clean Mac.
- [ ] Gatekeeper launch succeeds after downloading the exact candidate through a quarantine-setting channel.

## 13. DMG and publication gate

- [ ] `npm run package:mac:dmg` succeeds against the frozen app.
- [ ] DMG contains Drift.app, Applications alias, and Read Me First.
- [ ] `hdiutil verify` passes.
- [ ] DMG SHA-256 is recorded.
- [ ] Mount, drag, eject, launch, and update-over-old-copy journeys pass.
- [ ] Release notes state minimum macOS, system-codec policy, presenter-audio limitation, project compatibility, privacy model, and known issues.
- [ ] Complete corresponding source is available at the exact published revision.
- [ ] Publishing the binary is explicitly authorized.
- [ ] CI artifact upload or GitHub Release creation is performed only in that authorized release step.

## 14. Final receipt

- [ ] Commit and tree SHA
- [ ] App SHA-256
- [ ] DMG SHA-256
- [ ] Architecture output
- [ ] Extracted entitlements
- [ ] Signature identity
- [ ] Notarization ID
- [ ] Hardware/macOS matrix
- [ ] Automated logs
- [ ] Decoded media receipts and hashes
- [ ] Manual visual/accessibility reviewer
- [ ] Known limits
- [ ] Explicit release decision

Unchecked boxes are not shameful. Hiding them is.
