# Drift for macOS — release checklist

This checklist governs a downloadable Mac binary. Building an `.app` locally or compiling it in CI is not the same as authorizing a public release.

The `v0.2.1` source-release tree does not include a downloadable Mac binary. The historical `v0.1.0` DMG is ad-hoc signed and unnotarized and therefore does not pass this checklist.

Sections 1–12 are pre-merge candidate gates and must pass on one exact reviewed commit. Merge only that green commit and preserve it as reachable from `main`. Section 13 is the post-merge Developer ID/notarization evidence lane. Section 14 is a separate, explicitly authorized publication decision.

## 1. Pre-merge source freeze

- [ ] Choose one exact candidate commit after the review scope is frozen.
- [ ] Confirm the candidate is based on the intended `main` commit without unrelated work.
- [ ] Record commit SHA, tree SHA, `package-lock.json` SHA-256, package version, and bridge version.
- [ ] Confirm all source, shader, documentation, and native changes remain under AGPL-3.0-or-later or their stated dependency licences.
- [ ] Confirm `npm run check:mac-source` passes from a clean checkout.
- [ ] Confirm canonical Swift source lives only in `macos/App/` and probes in `macos/Probes/`.
- [ ] Review every native command and prove a user-facing need for it.
- [ ] Confirm every pre-merge gate in sections 1–12 is green on this exact commit.
- [ ] Merge only after review and green evidence; preserve the exact reviewed commit as reachable from `main` without source changes.
- [ ] Record that merge authorizes source integration only—not signing, notarization, tagging, release, or publication.

## 2. Browser-engine regression gate

- [ ] `npm ci` succeeds without lockfile mutation.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run test:e2e` passes in the verified Chromium runtime.
- [ ] Existing deterministic export, project integrity, recovery, shader, accessibility, and fallback tests remain green.
- [ ] `npm run check:fonts` verifies every bundled FontBlind v13 binary against the recorded `pitchdog-type-system` checksum.
- [ ] The packaged interface uses Phosphor Icons for React `2.1.10` and includes its MIT notice.
- [ ] The native branch has not changed scene evaluation or browser project format accidentally.
- [ ] The macOS AAC alias is active only in the macOS build mode.

## 3. Native build gate

- [ ] Build on a supported macOS host from the frozen commit.
- [ ] Use a clean dependency installation.
- [ ] `npm run build:mac` succeeds.
- [ ] `lipo -archs` reports exactly `arm64`; no Intel slice is present.
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
- [ ] `Legal/ThirdPartyLicenses/` contains the exact audited MIT/MPL texts and hash-bound runtime manifest.
- [ ] The app contains project licence, notices, asset licence, third-party notices, trademarks, threat model, QA plan, user guide, product contract, release guide, and SBOM.

## 6. Deterministic runtime gate

- [ ] `npm run verify:mac` exercises the normal AppKit delegate path through LaunchServices and proves that a visible main window survives one run-loop turn; the check times out rather than hanging on a windowless Finder or Dock launch.
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
- [ ] Current 960, 1024, and 1440 px captures keep the stage dominant while Media and Director remain readable and operable.
- [ ] All six film worlds remain materially distinct in pace, path, density, light, and texture—not palette swaps.
- [ ] Default slide and presenter borders are absent; Noir Contact’s intentional keyline is opaque and exactly 1 px.
- [ ] Shadows follow the rounded card mask without a translucent rectangular mat around the slide or presenter.
- [ ] Grain affects the world only. Imported slide and presenter pixels remain unchanged by the grain frame.
- [ ] Pause and Reduce Motion produce pixel-identical WebGL content after excluding the independent FPS overlay.
- [ ] A world-only 256 px sequence keeps default adjacent-frame grain restrained (judgment band: RMS 1.1–1.7/255, p99 3–5/255, signed mean drift below 0.1/255) and the 60% control remains bounded (RMS at most 3.8/255, p99 at most 10/255, clipped channels below 0.1%).
- [ ] Inspect both a lossless frame and a second-generation delivery H.264 transcode at normal viewing size; reject crawling grids, bright sparks, banding, and codec mosquitoes.
- [ ] Reduce Transparency, Increase Contrast, forced colours, coarse pointer targets, and fine-pointer hover behavior retain legible state boundaries.
- [ ] Human review confirms motion serves slide legibility rather than becoming the subject.

## 12. Physical hardware gate

- [ ] Current Apple Silicon Mac.
- [ ] Oldest supported macOS on Apple Silicon.
- [ ] Intel Mac and Windows are stated as unsupported in current support documentation.
- [ ] Low-memory stress run.
- [ ] External/removable destination volume.
- [ ] Sleep/wake and full-screen transition.
- [ ] Long presenter video and 30-second export.

Dated universal-build receipts do not broaden the current arm64-only support boundary.

## 13. Post-merge signing and notarization

- [ ] Confirm the exact reviewed commit from sections 1–12 is reachable from `origin/main` and has not changed.
- [ ] Dispatch `.github/workflows/macos-release.yml` with that exact 40-character commit.
- [ ] Confirm the workflow rejected non-`main` ancestry before signing/notarization secrets were used.
- [ ] Sign every executable code object with the intended Developer ID Application identity.
- [ ] Preserve App Sandbox and hardened runtime entitlements in the final signature.
- [ ] `codesign --verify --deep --strict --verbose=2` passes.
- [ ] Release verification rejects ad-hoc, Apple Development, and ambiguous identities.
- [ ] Submit app and DMG to Apple notarization.
- [ ] Record notarization submission IDs and accepted status.
- [ ] Staple both tickets.
- [ ] `spctl --assess --type execute --verbose=4 Drift.app` passes on a clean Mac.
- [ ] Gatekeeper launch succeeds without an override.
- [ ] Repeat any security, physical-hardware, accessibility, or destructive-failure journey whose result could change under final signing and notarization.
- [ ] Confirm the evidence workflow retained text receipts only and did not publish a binary, tag, or GitHub Release.

## 14. Separately authorized DMG publication gate

Completing section 13 does not authorize this section.

- [ ] Use the exact signed, notarized, stapled app and DMG that passed section 13; do not package them again.
- [ ] If the evidence lane deleted its compiled outputs, produce a new post-merge signed/notarized candidate and repeat every artifact-dependent gate before considering publication.
- [ ] DMG contains Drift.app, Applications alias, and Read Me First.
- [ ] `hdiutil verify` passes.
- [ ] Mounted app bytes and identity match the frozen source app.
- [ ] App and DMG SHA-256 values are recorded.
- [ ] Mount, drag, eject, launch, and update-over-old-copy journeys pass.
- [ ] Release notes state minimum macOS, H.264 and native AAC policy, 30 fps audio ceiling, project compatibility, privacy model, and known issues.
- [ ] Complete corresponding source is available at the exact published revision.
- [ ] Publication authority names the exact source commit plus the tested app and DMG hashes.
- [ ] Binary upload, tag creation, GitHub Release creation, and announcement occur only in that authorized step.
- [ ] No rebuild occurs between final testing and publication; any rebuild returns to the affected candidate gates.

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
- [ ] Pre-merge exact-head and merge-compatibility receipts
- [ ] Deterministic MP4/PNG receipt and hashes
- [ ] Native AAC packet/frame receipt
- [ ] Manual visual/accessibility reviewer
- [ ] Known limits and untested surfaces
- [ ] Explicit release decision and publication authority

Unchecked boxes are not shameful. Hiding them is.
