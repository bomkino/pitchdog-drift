# D01 evidence receipt — Platform-port tracer

Date: 26 August 2026

Repository: `bomkino/pitchdog-drift`

Start: `main@e87ee2bc0dcf202be88731b9a12ca60a4c709714`

Task branch: `codex/d01-platform-port-tracer`

Implementation commit: `25c5d70e174ee1a8542419dde417e893fbdce68a`

## Ticket in five lines

- Destination: earn smallest `DesktopPlatform` seam around existing portable-project document journey.
- Demo: choose → validate/open → save → choose/reopen exact Project V4.
- Public seam: `DesktopPlatform.documents` plus existing Project bundle/evaluator interfaces.
- Scope: browser adapter, native-Mac delegation, one App caller journey, tests, compact docs.
- Blocker: exact packaged Apple-Silicon Mac journey unavailable on current Linux host.

## Environment

- OS: Linux `6.18.35`, x86_64.
- Node: `v24.19.0`; repository declares Node 22 and engine `>=22.12`.
- npm: `11.9.0`; lock declares `npm@11.19.0`.
- Baseline drift: none. Live `main` exactly matched build-kit audit pin.
- Worktree before D01: clean.

## Public path

```text
App portable-project journey
  → DesktopPlatform.documents
  → browser document adapter | existing nativeMac.ts adapter
  → existing WebKit bridge
  → existing AppKit document session/file broker
```

No Swift, native JavaScript bridge, project schema, evaluator, renderer, exporter, Electron, or architecture-slice source changed.

## Files changed

- `src/lib/desktopPlatform.ts` — typed document port plus browser and native-Mac adapters.
- `src/App.tsx` — migrated visible portable-project choose/open/save/reopen/Revert journey.
- `tests/desktopPlatform.test.ts` — browser round trip, existing pinned-frame transport regression, Mac delegation, cancellation, failure mapping.
- `scripts/check-macos-source.mjs` — source contract now requires port delegation and forbids direct App document calls.
- `scripts/check-macos-hardening.mjs` — hardening contract follows same earned seam.
- `docs/programme/PRODUCT_SPEC.md` — compact durable product direction.
- `docs/programme/IMPLEMENTATION_STATUS.md` — D01 state and frontier.
- `docs/programme/adr/0001-desktop-platform-document-direction.md` — seam decision.
- `docs/programme/D00-apple-silicon-only-package.md` — separate future x86_64-removal/package-proof ticket.
- `docs/programme/receipts/D01-platform-port-tracer.md` — this evidence receipt.

## Demonstrated

- Browser adapter chose canonical `.pitched` fixture, imported it through real Project bundle parser, published exact archive, chose saved bytes again, and reopened equal Project V4 state.
- Existing pinned-frame asset selection, position, size/aspect, fit/crop/focal intent, border/matte/shadow, lens treatment, timing/audio, and all other Project V4 fields round-tripped equal.
- Existing preview and fixed-step export evaluation matched at same explicit time; pinned-only asset stayed outside moving-track authority. This is a D01 transport regression, not D10 controls or full pinned-frame acceptance.
- Native adapter contract test delegated choose, verified Open, transactional Save/readback, revision completion, and reopen to existing `nativeMac.ts` seam.
- Browser cancellation returned `{ status: "cancelled" }`.
- Failed browser publication returned `permission_denied` and did not advance document revision state.
- Mismatched native Open receipt returned `verification_failed`.

## Commands and results

- Baseline: targeted native/project/App tests — 30 passed; typecheck passed.
- Red: `tests/desktopPlatform.test.ts` failed because `src/lib/desktopPlatform.ts` did not exist.
- Focused green: DesktopPlatform + native Mac tests — 23 passed.
- Final `npm run check` — passed: typecheck; 70 test files, 499 tests; macOS source/import/hardening contracts; production Vite build.
- Focused Playwright portable-project journey — not run. Installed browser absent: `Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome`. Browser installation was outside authority.

## Fixed-point review

### Spec

- Pass: one complete document slice crosses earned interface in App and both adapters.
- Pass: native adapter reuses existing Mac seam; no parallel abstraction or Swift rewrite.
- Pass: cancellation/failure typed; Project mutation/rollback stays in existing transactional App path.
- Pass: existing pinned-frame intent survives the migrated document transport unchanged.
- Deferred to D10: complete controls, safe-area/layer semantics, and preview/scrub/export parity acceptance.
- Pass: D00 recorded separately; no x86_64 edits.
- Deferred: exact packaged Mac Open → Save → quit/reopen remains unproved and D01 is not integrated.

### Standards

- Pass: no raw paths, new OS branches in creative components, duplicated project parser, dependency, or cross-product source.
- Pass: browser publication says download started and `readbackVerified: false`; Mac receipt retains exact verified semantics.
- Finding fixed: native receipt `SecurityError`/`DataError` initially mapped too broadly. Adapter now reports `verification_failed`; focused regression added.
- Pass: source/hardening scripts now enforce port delegation and forbid direct document calls from App.

## State and gaps

Highest state: **built** production web bundle from D01 source.

Also tested: portable source/contract suite.
Not packaged, installed, released, merged, or accepted.

Unrun:

- exact-SHA Apple-Silicon native build and package;
- packaged Mac Open → Save → quit/reopen using canonical fixture;
- signing, notarization, installation, publication, release;
- Playwright UI journey requiring missing Chrome;
- human visual acceptance.

Residual risk: browser selection/download behaviour has unit/contract and build evidence but no real-browser run in this environment. Native integration remains source-only until exact packaged Mac receipt.

Next source-frontier candidates: D02, D03, D04, D05. Separate D00 remains future Apple-Silicon package migration.
