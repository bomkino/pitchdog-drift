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

## Frontier

- D00: Apple-Silicon-only package migration and x86_64 removal. Separate future ticket.
- D02 and D05 remain dependency-ready source-frontier candidates.
- D03 remains active but blocked on real browser visual/layout evidence; D10 remains blocked by D03 and owns the complete pinned-frame contract.
- D04 is source-ready but blocked on manual/host evidence; D08 remains blocked.
