# Drift V2 current status

Updated: 22 August 2026

Branch: `codex/v2-directors-cut`

Frozen V1 base: `5fd145207235884790ba071c5d84bc3876ff4989`

## Now

The development-app identity boundary remains verified for source `8756aa872adae820faafd7d3f3ae29650648cd13`. `Drift V2 Dev.app` was built, passed its `3/3` packaged WKWebView matrix, installed in `/Applications`, and run normally beside the unchanged V1 process.

The normal installed run created the distinct V2 sandbox container, named WebKit store, and physical `pitchdog-drift-v2-dev` IndexedDB while V1 retained its default store and `pitchdog-drift` database. V2 declares no `.pitched` document type and refused a disposable Finder-open fixture. The exact evidence is frozen in [`qa/phase-00-identity.md`](qa/phase-00-identity.md).

Project V4 hardening is committed at `843ee934f025f2b6c298e9d8872924d70fdd064a`. New projects, local persistence, and portable saves use V4; accepted V3 and frozen Studio V1 payloads migrate in memory; unsupported portable candidates are fully validated and decoded before the open project is saved or replaced; and dormant path, atmosphere, and World direction survives unrelated visible edits. The complete source check passed (`25` test files, `166` tests, typecheck, Mac source contracts, and production build), followed by the focused seven-test browser project gauntlet in `3.6` minutes. That gauntlet invoked both native import commands while recovery was locked, instrumented IndexedDB `put` and `clear`, and observed zero writes.

The installed V2 app still contains the earlier identity source, not Project V4. Canonical V2 render authority, authored V2 Worlds, installed-V4 Mac verification, and V2 visual approval remain open gates. Exact Project V4 rules and limits are recorded in [`V2_PROJECT_MIGRATION.md`](V2_PROJECT_MIGRATION.md).

## Honest state table

| Gate | State |
| --- | --- |
| Exact V1 source frozen and public on `main` | verified |
| Installed V1 unchanged and running beside V2 | verified; PID `75493` |
| V2 browser identity and isolated database | verified locally |
| Identity source checks, unit tests, typecheck, and Web build | passing locally |
| Installed V2 build source | `8756aa872adae820faafd7d3f3ae29650648cd13` |
| V2 packaged Mac app | verified; packaged matrix `3/3` passed |
| V1/V2 simultaneous Mac run | verified; V1 PID `75493`, V2 PID `84575` |
| V2 installed in `/Applications` | verified at `/Applications/Drift V2 Dev.app` |
| Physical V1/V2 container, WebKit-store, and IndexedDB separation | verified |
| V2 `.pitched` declarations | absent |
| Disposable `.pitched` Finder-open rejection | verified in normal installed V2 run |
| Project V4 source | hardening committed at `843ee934f025f2b6c298e9d8872924d70fdd064a`; local source and focused browser gauntlets passed |
| Project V4 in installed Mac app | no; installed V2 remains the Phase 00 identity build |
| Rejected future portable candidate leaves open storage untouched | verified in browser; zero observed IndexedDB writes |
| Canonical V2 render authority | not implemented; explicit export frame identity currently governs grain only |
| First authored V2 World | not implemented |
| V2 visual approval | not granted |
| V2 pushed | no |
| V2 merged to `main` | no |
| V2 released, Developer ID signed, notarised, stapled, or published | no; installed build is ad-hoc signed |

The installed V2 build is a local development artifact, not a distributable release candidate. Its exact source SHA is embedded in `BuildReceipt.txt`; future Project V4 and renderer work must produce new receipts rather than inheriting Phase 00 approval.
