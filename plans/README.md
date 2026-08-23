# Drift implementation plans

Generated on 2026-08-23 against commit `627931d`.

This directory is the execution source of truth for the finishing sprint. Kay
authorized execution on 23 August 2026. The
older handover remains the source of truth for the full donor feature inventory,
but its pause-time branch state and execution order are historical.

## Execution order and status

| Plan | Title | Priority | Effort | Depends on | Status |
|---|---|---:|---:|---|---|
| [001](001-drift-v2-finishing-sprint.md) | Finish Drift V2 without a second architecture loop | P1 | L | — | IN PROGRESS — package/install/owner gates remain |

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`, or `REJECTED`.

## Authority

- Read the complete plan before touching source.
- Do not start implementation until Kay explicitly says to build from Plan 001.
- Do not push, merge, publish, register `.pitched`, replace `/Applications/Drift.app`,
  or spend money without the separate gate named in the plan.
- Keep `/Applications/Drift.app` and the V1 source commit protected.

## Dependency notes

Plan 001 deliberately contains one ordered sprint instead of thirteen loosely
coordinated mini-projects. The timing model and workspace journey establish the
shared vocabulary needed by receipts, guides, preflight, native documents, and
documentation. Splitting those foundations across independent plans would create
duplicate authorities and integration churn.

## Explicitly deferred or rejected

- **Owner visual approval**: deferred to Kay after the candidate exists; tests do
  not approve taste.
- **Paid Apple distribution**: excluded. Apple Developer Program enrollment,
  Developer ID, and notarization stop at a documented gate.
- **Project V5**: rejected for this sprint. Timing intent fits Project V4's
  namespaced extensions; native document work comes later.
- **A second renderer, sequencer, or timeline engine**: rejected. The existing
  analytical lifecycle and travel evaluators remain canonical.
- **Per-feature packaging and installation**: rejected. Package the isolated Mac
  candidate once after the source candidate settles.
- **A separate reduced-motion creative product**: rejected. Accessibility work is
  limited to app chrome, controls, preview pause, keyboard, and VoiceOver; authored
  exports remain authored.
