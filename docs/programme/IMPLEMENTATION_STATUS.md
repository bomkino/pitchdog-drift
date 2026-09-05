> Historical planning/snapshot material. The current Mac-only product and validation boundary is [docs/STATUS.md](../STATUS.md). Do not use older completion tables as proof for 0.3.0.

# Drift implementation status

Updated: 30 August 2026

## `v0.2.1` interface fit-and-motion release slice

- Release scope: source-only `v0.2.1`; its tag and GitHub Release become public only after explicit publication. No new Mac binary is included.
- Alignment: labels, Phosphor icons, carets, button contents, control heights, panel interiors, and nested containers share scale-aware optical alignment and spacing.
- Motion: measured disclosures use direction-aware 180–250 ms opening and 140–180 ms closing windows, remain interruptible, restore focus before hiding active content, and settle immediately for keyboard activation or reduced-motion preferences.
- Reflow: low-scale layouts retain the 1120 px compact-layout floor; nested panels, menus, footer disclosures, and background controls keep bounded overflow and stable geometry.
- Evidence gate: the eventual release commit must pass `npm run check`, the focused disclosure and interface-scale tests, the real-browser disclosure, Studio, V2 UI, interface-scale, and layout-polish journeys, plus the exact-main standalone macOS and packaged-WKWebView workflows before release state is claimed.

## `v0.2.0` source-release integration

- Release state: public source-only `v0.2.0`; its annotated tag and GitHub Release resolve to commit `f4640416661dda008232ec9ae941d93e89cb64c3`. No new Mac binary was included.
- Typography: seven locally bundled CC0 FontBlind v13 WOFF2 binaries from `pitchdog-type-system` release `v13.0.0`, exact commit `786b4a2b671182319320f922b8de8f927ea3a002`, with a checksum source gate.
- Iconography: Phosphor Icons for React is pinned at `2.1.10` and replaces the editor's hand-authored utility paths and glyphs.
- Layout: Media, Stage, Timeline, Director, notices, menus, disclosures, controls, and 75%–200% interface reflow share audited spacing, padding, gap, and target-size rules.
- Runtime boundary: browser and packaged-WebKit builds use the same local fonts and icons with no runtime asset download. The maintained Mac package remains Apple-Silicon-only `arm64` on macOS 13.3 or newer.
- Publication boundary: the historical `v0.1.0` arm64 DMG is ad-hoc signed and unnotarized. It is test material, not a supported binary and not a substitute for the Developer ID/notarization lane.
- Evidence: the exact release commit passed `npm run check`, including `check:fonts`, and the named source, browser, macOS, and packaged-WebKit GitHub lanes. The released layout screenshots are bound to that exact main commit.

## 28 August integrated runtime candidate (historical receipt)

- Branch: `codex/drift-runtime-candidate`.
- Runtime source commit: `8837aa99ea153f8baa975c1b797b575ff9fe55c9`
  (tree `0d94fe5a9e45a54b516b1ea9dae594ccce2d6bb3`).
- Integration: the required D02 Linux host/hardening commits are integrated on
  the D10 evidence line. D00, D01, D03, D05, D08, and D10 still use their
  existing public authorities; no parallel schema, evaluator, renderer,
  exporter, audio engine, job controller, document platform, or automation
  service was introduced.
- Source gate: 83 test files / 553 tests, both web profiles, macOS/Linux source
  contracts, and `git diff --check` pass.
- Browser gate: installed-Chrome D03/D05/D08/D10 journeys pass. Physical
  presenter H.264/AAC output passes at 256 x 256 and 1080 x 1920; bounded full
  long-export/cancellation evidence passes.
- Mac gate: production and V2 development AppKit/WKWebView apps build, verify,
  and launch as arm64-only with the macOS 13.3 floor. The local ad-hoc signed
  production app and mounted DMG pass the packaged WKWebView document,
  persistence, recovery, and outbound-network matrix. No production app was
  installed or replaced.
- Linux gate: exact-SHA Ubuntu 24.04 x86_64 CI, sandboxed Electron, hostile IPC,
  browser, and supported software-encoder evidence is recorded in the current
  D02 receipt. `chrome-sandbox` is verified as root:root `04755`; the app runs
  as the ordinary runner without `--no-sandbox`.
- Garuda gate: the exact official x86_64 ISO booted through systemd to
  SDDM/Plasma Login Manager in a light external-SSD UTM machine. UTM exposed a
  black graphical handoff under three emulated display adapters, so Drift was
  not launched inside Garuda and exact KDE/portal/GPU/audio evidence remains
  open.
- Product design: default dark UI now uses a violet editorial identity, wider
  panel gutters, clearer hierarchy, larger icons, and 52-56 px primary editing
  targets. Screenshots and automation are machine evidence, not human taste or
  accessibility acceptance.

Current receipt:
[`receipts/RUNTIME-CANDIDATE-2026-08-28.md`](receipts/RUNTIME-CANDIDATE-2026-08-28.md)

Linux receipt:
[`receipts/D02-linux-runtime-candidate.md`](receipts/D02-linux-runtime-candidate.md)

The ticket sections below retain their dated source-line facts. Where an old
section says a runtime was unavailable, the 28 August integrated receipt above
records the later evidence for that candidate. The `v0.2.0` section records its
published source-release boundary without rewriting history.

## D01 — Platform-port tracer

- Starting branch: `main`
- Starting SHA: `e87ee2bc0dcf202be88731b9a12ca60a4c709714`
- Task branch: `codex/d01-platform-port-tracer`
- Source state: tested and production-web built at implementation commit `25c5d70e174ee1a8542419dde417e893fbdce68a`; review fix/receipt follows on same task branch.
- Integration state: not integrated. Exact-SHA packaged Apple-Silicon Mac Open → Save → reopen proof not run.
- Mega-kit reconciliation: remote commit `a24badfa79a7d607b13a3cbc4e8dfc2b2e83995b` assigns full pinned-frame acceptance to D10 and preserves the macOS 13.3 floor in D00.
- Public seam: `DesktopPlatform.documents`.
- Browser adapter: typed choose/open/save results; exact Project V4 archive round trip covered at public seam.
- macOS adapter: delegates to existing `nativeMac.ts` document picker, verified Open binding, save transaction/readback, revision completion, abandon, and Revert functions.
- App migration: visible portable-project choose/open/save/reopen/Revert journey uses platform port. Other native commands remain on established bridge until future slices.
- Pinned-frame transport regression: existing Project V4 selection, position, size, crop/fit/focal intent, treatment, and timing survive this document round trip. D10 owns controls, safe-area/layer semantics, and preview/scrub/export parity acceptance.
- Cancellation/failure: typed cancellation; stable failure code; no document revision completion on failed browser publication.

## Deferred proof

- Exact packaged Mac Open → Save → quit/reopen journey against D01 commit.
- Native build/package/install checks; unavailable on current Linux host and not claimed.
- Human visual acceptance; D01 changes no renderer or visual controls.

Receipt: [`receipts/D01-platform-port-tracer.md`](receipts/D01-platform-port-tracer.md)

## D00 — Apple-Silicon-only package migration

- Starting SHA: `f94596c5480d7cb5e8ae94f419342f9ee468d2f0`.
- Task branch: `codex/d00-apple-silicon-only-source`.
- Source commit: `707b4d3f6dbb955a9d7f9fdf668dd55fa9923f1a` (tree `6630a1d12ea1a145d9fa737e89e6b1d4c04f1268`).
- State: source-ready and source-green; no native app was built, packaged, installed, launched, released, or accepted on this Linux host.
- Canonical Mac build, CI, runtime identity, verifier, release manifest, and local-DMG defaults now require exactly `arm64`. Intel/universal overrides fail closed.
- GitHub macOS jobs remain on the documented `macos-15` Apple-Silicon label and additionally require runtime `uname -m = arm64` before build or secret use.
- App runtime identity returns `arm64` on the supported compiler target and `unsupported` otherwise.
- The DMG default is `Drift-<version>-macOS-arm64.dmg`; release receipts require the exact one-element architecture array `["arm64"]`.
- The macOS 13.3 deployment floor remains unchanged and is still enforced by packaged verification.
- Current README, build, product-contract, QA, threat-model, release, and release-checklist documentation state Apple-Silicon-only support. Dated universal-build receipts remain preserved as history.
- New `check:mac-arm64` source contract is part of `check:mac-source`; it is explicitly not Mach-O, package, launch, or hardware acceptance.
- Unrun gate: build the exact source commit on Apple Silicon, inspect every shipped Mach-O as arm64-only, then run D01 Open → Save → quit/reopen plus cancellation/recovery against the exact package.

Receipt: [`receipts/D00-apple-silicon-only-source.md`](receipts/D00-apple-silicon-only-source.md)

## D03 — Interface Scale tracer

- Starting SHA: `a24badfa79a7d607b13a3cbc4e8dfc2b2e83995b`.
- Task branch: `codex/d03-interface-scale-tracer`.
- Source commit: `a864e28cf8331e4cf48426ec33cf8177f500ce48` (tree `a59bd3cb8a297e3857e3c9987e5c5bcdddaf6da5`).
- State: tested and production-web built; not complete or accepted.
- Public seam: `DesktopPlatform.presentation.interfaceScale`.
- Browser-development route: header control, command search, and Ctrl/Command shortcuts share one persisted local preference store.
- Model: 75%–200%, five-point steps, default/reset 100%, malformed persisted input clamped or defaulted.
- Reflow: 75%–125% retains three-panel shell; 150%–200% uses stable panel tabs without remounting Project/editor state.
- Invariants: focused test keeps serialized Project, document revision, canonical evaluator result, and export plan equal after a scale-only command.
- Blocker: required real browser scale/window capture and focus/scroll/playhead/stage-anchor inspection could not run. Cloud browser rejected the local development URL with `net::ERR_BLOCKED_BY_CLIENT`; no browser or app was installed.
- Native routes: macOS View menu/Preferences/package and Linux host adaptation remain unrun. Browser evidence cannot complete native acceptance.

Receipt: [`receipts/D03-interface-scale-tracer.md`](receipts/D03-interface-scale-tracer.md)

## D04 — MCP self-description and read-only tracer

- Starting SHA: `448bd5f0987b60ebc63e229e45151a30f23eab9d`.
- Task branch: `codex/d04-mcp-self-description`.
- Source commit: `13554073c408440d85f6cfce5f764c1521b38cef` (tree `9ed43b8a9a8ec8dc5383a1e6b436d5e4ee574921`).
- State: tested and production-web built; source-ready, not complete or accepted.
- Public seams: generated `createDriftSelfDescription`, immutable `ProductAutomationService`, disabled-default `createDevelopmentMcpAdapter`, and service-backed `AutomationAccessView`.
- Truth: protocol/build, command vocabulary, canonical new-project/reset/outcome defaults, revision/hash-bound redacted document, presentation, capability, and job manifests share one source.
- Development route: explicit `v2-dev` opt-in exposes only frozen connect/request/disconnect functions; disable/revoke destroys sessions. Release identity exposes no client surface.
- Security: metadata only; no raw names, paths, blobs, media bytes, grants, Project mutation, direct patch, filesystem, shell, listener, network, preview, or export tool.
- Causal checks: deterministic equality, factory/reset/recipe derivation, private-name redaction, visible/service identity, fresh client transcript, mutation invariance, wrong identity, read-only rejection, size bound, and revocation.
- Blocker: manual visible UI/resource comparison and real focus/layout inspection could not run because the cloud browser rejects the local URL. External standard transport and packaged Mac/Garuda client proof remain future gates; D08 is not unblocked.

Receipt: [`receipts/D04-mcp-self-description.md`](receipts/D04-mcp-self-description.md)

## D05 — Guided Export foundation

- Starting SHA: `4a051e0ca19ede8aaf56e5161f254566ef4fa89e`.
- Task branch: `codex/d05-guided-export-foundation`.
- Current source commit: `980c559bf8852bd947dca966302a8bccc0e81c1b` (tree `fb4b850caaa146398fb112b509aa136c49fba427`).
- State: source-ready, tested, and production/v2-development web built; D05 is not complete or accepted because its runtime and human evidence gates remain unavailable.
- Public seams added: immutable platform-neutral `ExportIntent`, stable format capability/reason table, pure six-step guided-draft/preflight reducer, revision-bound `GuidedExportSnapshot`, plan/snapshot mismatch guard, truthful phase-aware progress projection, and one bounded `ExportJobController` for status/cancel/receipt reuse.
- Application slice: three ad-hoc output buttons are replaced by a stable six-step Guided Export surface for current H.264 MP4 and PNG Frames sinks. ProRes 4444 and HEVC-with-alpha remain visibly unavailable behind the already-settled D06 gate.
- Consequence gates: transparent H.264 fails before rendering; requested audio cannot enter PNG Frames without explicit no-embedded-audio acknowledgement; current H.264 audio/FPS/duration constraints are runtime-derived stable failures.
- Job truth: destination authority is requested before job reservation; one immutable creative/timing snapshot binds document revision, project/settings/media fingerprints, exact `round(duration × fps)` frame count, and requested audio. Later project drift fails before rendering. The controller adopts the real export `AbortController`, allows one active job, freezes monotonic status, redacts terminal failure, retains at most 20 terminal jobs, and issues a receipt only when output identity and encoded timing match the locked snapshot after the existing verifier/commit path returns.
- Progress: preparation, render, encode/audio, finalize, verify, commit, and complete are distinct; overall progress is monotonic while per-phase counts and warmed ETA remain visible.
- Existing sink truth preserved: transactional MP4 verification/commit and PNG sequence names/alpha/readback/cleanup remain the only render/verification implementations. Buffer/ZIP delivery reports `download-requested`, not committed publication.
- Directory truth: directory output remains `directory-written`, not an atomic-file `committed` claim; success follows per-frame readback and complete cleanup-on-failure logic in the existing sink. Buffer/ZIP output remains `download-requested`.
- Open D05 evidence: actual interactive Back/Edit/unsupported/cancel/success capture; exact runtime opaque and PNG artifact receipts; named long-export smoke; browser focus/layout/accessibility inspection; and packaged target journeys.
- Unrun gates: real browser visual/focus/layout review, packaged Apple-Silicon/Garuda journeys, human visual/accessibility acceptance, release, and publication.

Receipt: [`receipts/D05-guided-export-foundation.md`](receipts/D05-guided-export-foundation.md)

## D08 — Revisioned automation writes, preview, and export

- Starting SHA: `2d5ab4bb27bbd8cc557281b35632cf04aabf0b9d`.
- Task branch: `codex/d08-automation-writes-foundation`.
- Current source commit: `f983417309ea471853bd64229097c3d8896fc36d` (tree `5215e8ec3a0ce69ae2b7bc695f9e6d74e12de10b`).
- State: source-ready, tested, and production/`v2-dev` web-built; runtime, installed-client, artifact, accessibility, and human acceptance remain open.
- Typed foundation: one `apply-outcome-recipe` intent plans and applies through the existing outcome recipe, `applyProjectV4Command`, document revision, application history, persistence, and `undoProjectV4Command` seams. Manual Outcome selection uses the same command path.
- Plan truth: product/protocol/build/manifests/capabilities/client session/document/Project hash/revision/target/scope/expiry/idempotency are bound. Complete changed paths and redacted before/after identities are returned; private media/path/grant data is absent.
- Safety: metadata-only remains default; `project-write` is separately visible and revocable. Stale human edits, replay, expiry, capability drift, idempotency collision, later edit, disconnect/reconnect, and scope revocation fail before mutation. Retention is bounded.
- Receipt truth: one visible apply receipt records exact before/after Project identity and revision; eligible Undo restores exact prior Project through canonical undo and then becomes ineligible.
- Preview truth: separately consented, revision/hash/time/dimension-bound still capture reuses the existing preview authority and renderer. Dimension/pixel/byte/duration/concurrency/retention/expiry/cancel/revoke bounds fail closed and late output is discarded without Project mutation.
- Export truth: separately consented preflight/start/status/reconnect/cancel/receipt wraps the existing App destination path and one D05 controller. Pending cancellation prevents late reservation; running cancellation uses the real D05 abort controller; verified receipts come only from the existing sink/verifier completion. Opaque reconnect tokens survive local-session disconnect; no destination path or grant is accepted.
- Unrun evidence: real browser Settings/receipt/focus inspection, actual preview pixels, actual export artifact/receipt, external client transport, installed Mac/Garuda client, accessibility, and human review.

Receipt: [`receipts/D08-automation-writes-foundation.md`](receipts/D08-automation-writes-foundation.md)

## D10 — Complete optional pinned-frame contract

- Starting SHA: `646699d95f18704086ae341784c64da655ebaba7`.
- Task branch: `codex/d10-pinned-frame-foundation`.
- Current source commit: `84f9388cbe238eebdeb05faf24ac9d01a01f5392` (tree `69c3bfe582c513c5fa6d8cc3eedc2cca8f26256a`).
- State: source-ready, tested, and production/`v2-dev` web-built; runtime artifact, package, accessibility, and human acceptance remain open.
- Existing authority preserved: Project V4 remains the one optional/default-off pin contract for source selection, moving-track membership, position, size/aspect, safe anchoring, contain/cover, focal crop, matte, corners, border, shadow, lens treatment, audio intent, and portable save/reopen.
- Added truth: above/below-slide layer and exclusive story end complete the authored composition/range contract. Existing `startAt` and `trimStart` now drive one preview/scrub/still/MP4/PNG source clock.
- Evaluation/render truth: the canonical Project frame adapter returns pin visibility/layer/source time. Protected below-slide pins retain independent lens treatment through split optical passes. Preview and fixed-step export use the same result.
- Video/audio truth: only in-range presenter frames are decoded; trimmed presenter audio is scheduled into the same story range with silence outside. Existing sinks/verifiers remain the only output path.
- Causal evidence: complete portable bundle round trip; exact preview/export evaluation equality; default-off, range rejection, layer/lens independence, and export source-time mapping. Full gate: 80 files / 541 tests; both 242-module web builds passed.
- Unrun evidence: real browser controls/focus/scale, exact preview/export pixel comparison, real presenter audio/alpha artifacts, packaged Apple-Silicon/Garuda journeys, accessibility, and human review.

Receipt: [`receipts/D10-pinned-frame-foundation.md`](receipts/D10-pinned-frame-foundation.md)

## Frontier

- D00/D01: exact arm64 package identity, launch, native import persistence,
  saved Project state, recovery, and mounted-DMG evidence now pass. Developer ID
  signing, notarization, installation/replacement, and release remain owner
  gates.
- D02: exact Ubuntu x86_64 sandboxed Electron and supported browser/encoder
  evidence now pass at the admitted CI commit. Exact Garuda/KDE remains blocked
  only at the emulated graphical handoff and physical-host gates described in
  the current receipt.
- D03/D05/D08/D10: current installed-Chrome public-seam journeys and retained
  media/long-export evidence pass. No new source authority is open. Human
  visual/audio/accessibility acceptance and an external standard automation
  client remain separate gates.
- D04: generated self-description and the development adapter are exercised by
  the current runtime suite. A standard external transport/client has not been
  installed or claimed.
- D06/D07/D09: no dependency-ready implementation seam is named by current
  repository truth. Their remaining work is target, signing, installation, or
  acceptance evidence; no parallel codec, renderer, host, or release path is
  authorized.
- R01: exact Garuda/KDE physical or remote x86_64 evidence remains open.
  R02's local Apple-Silicon runtime/package evidence passes, while
  distribution and owner acceptance remain open.
- The `v0.2.0` typography, iconography, and layout source slice is integrated at
  its exact release commit. The `v0.2.1` fit-and-motion slice is integrated only
  when its exact release commit passes the named gate. Beyond that, the
  frontier consists of external hardware, identity, installation/publication,
  external client, and human-judgment gates.
