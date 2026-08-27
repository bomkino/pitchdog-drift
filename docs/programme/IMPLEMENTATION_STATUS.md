# Drift implementation status

Updated: 27 August 2026

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
- Current README, build, product-contract, QA, threat-model, release, and release-checklist documentation state Apple-Silicon-only support. Dated universal-build receipts and changelog facts remain preserved as history.
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

## Frontier

- D00 is source-ready; exact Apple-Silicon build/package/launch and D01 document-journey acceptance remain hardware-gated.
- D05 is source-ready but blocked on unavailable runtime/human evidence. D02 is independently source-ready on `codex/d02-linux-electron-shell-tracer` but its hardened runtime proof requires a compatible non-root Linux host.
- D03 remains active but blocked on real browser visual/layout evidence; D10 remains blocked by D03 and owns the complete pinned-frame contract.
- D04 is source-ready but blocked on manual/host evidence; D08 remains blocked.
- R01 requires an exact Garuda/KDE target; R02 requires Apple-Silicon macOS. No additional Drift implementation ticket is dependency-ready on the current evidence frontier.
