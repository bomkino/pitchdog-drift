# Drift implementation status

Updated: 26 August 2026

## D01 — Platform-port tracer

- Starting branch: `main`
- Starting SHA: `e87ee2bc0dcf202be88731b9a12ca60a4c709714`
- Task branch: `codex/d01-platform-port-tracer`
- Source state: implementation in progress; final commit identity pending.
- Integration state: not integrated. Exact-SHA packaged Apple-Silicon Mac Open → Save → reopen proof not run.
- Public seam: `DesktopPlatform.documents`.
- Browser adapter: typed choose/open/save results; exact Project V4 archive round trip covered at public seam.
- macOS adapter: delegates to existing `nativeMac.ts` document picker, verified Open binding, save transaction/readback, revision completion, abandon, and Revert functions.
- App migration: visible portable-project choose/open/save/reopen/Revert journey uses platform port. Other native commands remain on established bridge until future slices.
- Pinned-frame contract: selection, position, size, crop/fit/focal intent, treatment, timing, save/reopen, preview, and export parity covered by one canonical round-trip test.
- Cancellation/failure: typed cancellation; stable failure code; no document revision completion on failed browser publication.

## Deferred proof

- Exact packaged Mac Open → Save → quit/reopen journey against D01 commit.
- Native build/package/install checks; unavailable on current Linux host and not claimed.
- Human visual acceptance; D01 changes no renderer or visual controls.

## Frontier

- D00: Apple-Silicon-only package migration and x86_64 removal. Separate future ticket.
- D02, D03, D04, D05 become source-frontier candidates only after D01 source receipt is reconciled.
