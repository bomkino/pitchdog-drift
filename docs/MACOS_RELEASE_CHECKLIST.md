# Drift for macOS — release checklist

This checklist governs a downloadable Mac binary. Building an `.app` locally or compiling it in CI is not the same as authorizing a public release.

## 1. Source freeze

- [ ] Choose one exact commit on `feat/native-macos-studio` or its reviewed successor.
- [ ] Confirm the branch is based on the intended `main` commit without unrelated agent work.
- [ ] Record commit SHA, tree SHA, `package-lock.json` SHA-256, package version, and bridge version.
- [ ] Confirm all source, shader, documentation, and native changes remain under AGPL-3.0-or-later or their stated dependency licences.
- [ ] Confirm `npm run check:mac-source` passes from a clean checkout.
- [ ] Confirm canonical Swift source lives only in `macos/App/` and probes in `macos/Probes/`.
- [ ] Review every native command and prove a user-facing need for it.
- [ ] Confirm the PR remains draft/unmerged until the review and publication decisions are separate and explicit.

## 2. Browser-engine regression gate

- [ ] `npm ci` succeeds without lockfile mutation.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run test:e2e` passes in the verified Chromium runtime.
- [ ] Existing deterministic export, project integrity, recovery, shader, accessibility, and fallback tests remain green.
- [ ] The native branch has not changed scene evaluation or browser project format accidentally.
- [ ] The macOS AAC alias is active only in the macOS build mode.

## 3. Native build gate

- [ ] Build on a supported macOS host from the frozen commit.
- [ ] Use a clean dependency installation.
- [ ] `npm run build:mac` succeeds.
- [ ] The executable contains both `arm64` and `x86_64` slices.
- [ ] The deployment target is macOS 13.3 or a deliberately reviewed replacement.
- [ ] The app opens from Applications without Vite, Node.js, Terminal, or a local server.
- [ ] The packaged WebView loads `Resources/Web/index.html`, its child assets, React’s `main.app`, and bridge version 2.
- [ ] Native open/save/directory polyfills are installed.
- [ ] The typed native command round-trip reaches React.
- [ ] WebKit content-process reload recovery passes once and fails on repeated termination.
- [ ] The native broker self-test passes.
- [ ] The build-manifest readback passes.

## 4. Security gate

- [ ] Extract entitlements from the signed finished app, not the source plist.
- [ ] `com.apple.security.app-sandbox` is true.
- [ ] `com.apple.security.files.user-selected.read-write` is true.
- [ ] `com.apple.security.network.client` is present in the signed sandboxed app and reported truthfully at runtime.
- [ ] `com.apple.security.network.server` is absent.
- [ ] Broad Downloads, Documents, home-directory, and temporary-exception entitlements are absent.
- [ ] Hardened runtime flag is present.
- [ ] No non-system dynamic library is linked.
- [ ] Main-frame-only bridge injection and Swift frame rejection are preserved.
- [ ] Every bridge payload is bounded and validated.
- [ ] No path, shell, AppleScript, URLSession, socket, selector reflection, or recursive-delete command is exposed.
- [ ] Symlink, traversal, unsafe-leaf, grant-cap, session-cap, and output-cap tests pass.
- [ ] Quit, close, and content-process crash abort incomplete native writes.
- [ ] The bundled WebView cannot load HTTP, HTTPS, WS, WSS, or FTP resources.
- [ ] Document-start page-world lockdown removes `RTCPeerConnection` and `webkitRTCPeerConnection` before application code runs.
- [ ] Production navigation policy cancels remote responses and every download request before WebKit or AppKit can grant a destination.
- [ ] Exact packaged TCP and UDP loopback probes, protected by unpredictable per-run tokens, record zero accepted hits from the tested app/WebContent lifecycle.
- [ ] No native `URLSession`, Network.framework, socket, updater, analytics, or cloud-upload client is shipped; adding one is reviewed as an app-wide capability change.
- [ ] Explicit external links open in the default browser rather than Drift.

## 5. Codec and licensing gate

- [ ] `npm run build:mac:web` produces the receipt-verified single-entry classic IIFE used by the packaged app.
- [ ] `@mediabunny/aac-encoder` resolves to `src/lib/macosAacEncoder.ts` only for the Mac build.
- [ ] `src/lib/macosAacEncoder.ts` registers the bounded native Mediabunny custom encoder.
- [ ] `macos/App/NativeAacEncoder.swift` explicitly requests Apple’s software AAC-LC component through AudioToolbox.
- [ ] Native AAC accepts only 48 kHz stereo and the frozen bitrate/session limits.
- [ ] AAC receipt includes AudioSpecificConfig, magic cookie, packet bounds, priming, padding, and exact frame equation.
- [ ] Packet timestamps represent priming truthfully.
- [ ] No `.wasm` file exists in `Drift.app`.
- [ ] No browser AAC extension, FFmpeg, or `libavcodec` marker exists in packaged Web resources.
- [ ] H.264 capability and actual encode are probed inside WKWebView.
- [ ] Presenter audio is never omitted silently.
- [ ] 50/60 fps presenter-audio requests fail with the documented guard; muted output remains available when H.264 holds.
- [ ] `THIRD_PARTY_NOTICES.md` distinguishes browser and standalone Mac AAC paths.
- [ ] The app contains project licence, notices, asset licence, third-party notices, trademarks, threat model, QA plan, user guide, product contract, release guide, and SBOM.

## 6. Deterministic runtime gate

- [ ] The WKWebView runtime workflow runs on a visible Apple Silicon window lifecycle.
- [ ] WebGL2 creation and pixel readback pass.
- [ ] Alpha-capable PNG encoding passes.
- [ ] A real H.264 access unit is produced.
- [ ] Native AudioToolbox AAC produces at least one verified access unit.
- [ ] The deterministic exporter renders exactly 90 frames at 320 × 568, 30 fps, 3 seconds.
- [ ] MP4 readback verifies container, AVC, dimensions, frame count, `n / fps` timestamps, duration, colour, opacity, and three decoded probe frames.
- [ ] PNG readback verifies dimensions, visible content, alpha-capable channel, and transparent pixels.
- [ ] The exporter probe emits native progress events and no content-process termination.
- [ ] `ProbeBundleReceipt.json` byte-counts and SHA-256-verifies every probe file before launch.
- [ ] The exporter probe and packaged app are separately receipt-verified single-entry classic IIFEs; each self-test exercises the graph it actually ships or claims.

## 7. User-journey gate

- [ ] First launch presents an authored scene without network or login prompts.
- [ ] Add Slides works through the app button, File menu, and drag-and-drop.
- [ ] Add Presenter works through the app button and File menu.
- [ ] `.pitched` opens through the app, File menu, Finder double-click, app-icon drop, and Open With.
- [ ] Finder-open during launch queues until the importer is ready.
- [ ] Window size restores across launches.
- [ ] Closing the window and clicking the Dock icon restores the single studio window.
- [ ] Native menus disable impossible actions while Drift is busy.
- [ ] MP4, PNG still, PNG sequence, and portable-project destinations use native panels.
- [ ] Cancelling a native Blob save produces no file and no false success.
- [ ] Reveal Last Export selects only a committed file in Finder.
- [ ] App focus mode, macOS full screen, and interface zoom work independently.
- [ ] Copy Diagnostics produces useful, non-sensitive runtime information without deck contents or absolute paths.

## 8. Project and recovery gate

- [ ] Autosaved project and original media survive relaunch.
- [ ] Portable project survives a fresh app container.
- [ ] Corrupt archive rejection leaves the current project unchanged.
- [ ] Recovery-locked storage is not overwritten by fallback demos.
- [ ] Recovery export re-verifies preserved manifest/media and does not claim byte identity it cannot prove.
- [ ] Save failure remains visible.
- [ ] Quit/close warning appears during saving, failed save, recovery lock, project replacement, and export.
- [ ] “Keep Working” is the safe default.
- [ ] WebKit content-process termination aborts staging before offering Reload/Quit.
- [ ] Multiple app instances are prohibited.

## 9. Media-output gate

- [ ] Generate opaque MP4, muted-presenter MP4, and presenter-audio MP4 inside the packaged app.
- [ ] Generate transparent PNG still and directory PNG sequence inside the packaged app.
- [ ] Independently decode and inspect output container, codec, dimensions, frame count, timestamps, duration, colour, alpha, audio, and A/V sync.
- [ ] Extract and visually inspect first, middle, and final frames.
- [ ] Confirm the deck moves and pinned presenter changes over time.
- [ ] Test 1, 2, 12, and 200 slides.
- [ ] Test every stage ratio and both axes.
- [ ] Test 24, 25, and 30 fps with presenter audio.
- [ ] Test 50 and 60 fps muted and confirm audio-enabled refusal.
- [ ] Test 3-, 8-, and 30-second output.
- [ ] Test a near-limit dimension and a deliberately unsupported dimension.
- [ ] Confirm all H.264 dimensions are even or fail before destination mutation.

## 10. Destructive-failure gate

- [ ] Begin with a known existing destination and record its SHA-256.
- [ ] Cancel MP4 replacement during preparation, rendering, native writing, and finalization.
- [ ] Confirm the previous destination remains byte-identical after staged abort.
- [ ] Cancel PNG still save.
- [ ] Cancel PNG sequence after several frames and confirm created frames are removed.
- [ ] Test a colliding sequence filename and confirm no overwrite.
- [ ] Disconnect a removable destination during write.
- [ ] Fill the destination volume.
- [ ] Revoke file permission after selection.
- [ ] Force WebGL context loss.
- [ ] Force WebKit content-process termination.
- [ ] Corrupt an AAC receipt in a test seam and confirm muxing stops.
- [ ] Confirm every failure states whether prior work survived.

## 11. Accessibility and visual gate

- [ ] VoiceOver journey passes from import through export.
- [ ] Full Keyboard Access reaches every editor and native-menu control.
- [ ] Visible focus survives 200% interface magnification.
- [ ] Reduced-motion preference affects preview without silently altering saved export motion.
- [ ] Minimum window remains operable and footer remains reachable.
- [ ] Native titlebar traffic lights do not overlap interface controls.
- [ ] Light/dark system appearance does not make panels or alerts illegible.
- [ ] Error, progress, cancellation, and recovery overlays are readable over every theme.
- [ ] Save/open panels have truthful prompts, filters, and safe default buttons.
- [ ] Human review confirms motion serves slide legibility rather than becoming the subject.

## 12. Physical hardware gate

- [ ] Current Apple Silicon Mac.
- [ ] Oldest supported macOS on Apple Silicon.
- [ ] Current Intel Mac.
- [ ] Oldest supported macOS on Intel.
- [ ] Low-memory stress run.
- [ ] External/removable destination volume.
- [ ] Sleep/wake and full-screen transition.
- [ ] Long presenter video and 30-second export.
- [ ] Clean-machine Gatekeeper launch from a quarantine-setting download path.

Cross-compiling the Intel slice is not an Intel runtime test.

## 13. Signing and notarization

- [ ] Sign every executable code object with the intended Developer ID Application identity.
- [ ] Preserve App Sandbox and hardened runtime entitlements in the final signature.
- [ ] `codesign --verify --deep --strict --verbose=2` passes.
- [ ] Release verification rejects ad-hoc, Apple Development, and ambiguous identities.
- [ ] Submit app and DMG to Apple notarization.
- [ ] Record notarization submission IDs and accepted status.
- [ ] Staple both tickets.
- [ ] `spctl --assess --type execute --verbose=4 Drift.app` passes on a clean Mac.
- [ ] Gatekeeper launch succeeds without an override.

## 14. DMG and publication gate

- [ ] `npm run package:mac:dmg` succeeds against the frozen app.
- [ ] DMG contains Drift.app, Applications alias, and Read Me First.
- [ ] `hdiutil verify` passes.
- [ ] Mounted app bytes and identity match the frozen source app.
- [ ] App and DMG SHA-256 values are recorded.
- [ ] Mount, drag, eject, launch, and update-over-old-copy journeys pass.
- [ ] Release notes state minimum macOS, H.264 and native AAC policy, 30 fps audio ceiling, project compatibility, privacy model, and known issues.
- [ ] Complete corresponding source is available at the exact published revision.
- [ ] Publishing the binary is explicitly authorized.
- [ ] CI artifact upload or GitHub Release creation occurs only in that authorized step.
- [ ] No rebuild occurs between final testing and publication.

## Final receipt

- [ ] Commit and tree SHA
- [ ] Package-lock SHA-256
- [ ] App SHA-256
- [ ] DMG SHA-256
- [ ] Architecture output
- [ ] Extracted entitlements
- [ ] Packaged TCP/UDP zero-hit receipt, WebKit rule identifier, and remote response/download-policy receipt
- [ ] Dynamic-library inventory
- [ ] Signature identity
- [ ] Notarization IDs
- [ ] Gatekeeper output
- [ ] Hardware/macOS matrix
- [ ] Automated logs and workflow run IDs
- [ ] Deterministic MP4/PNG receipt and hashes
- [ ] Native AAC packet/frame receipt
- [ ] Manual visual/accessibility reviewer
- [ ] Known limits and untested surfaces
- [ ] Explicit release decision and publication authority

Unchecked boxes are not shameful. Hiding them is.
