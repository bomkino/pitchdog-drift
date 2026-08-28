# D08 evidence receipt — revisioned automation writes, preview, and export

Date: 27 August 2026

Repository: `bomkino/pitchdog-drift`

Start: `codex/d00-apple-silicon-only-source@2d5ab4bb27bbd8cc557281b35632cf04aabf0b9d`

Task branch: `codex/d08-automation-writes-foundation`

Source commits:

- plan/apply/undo: `3957109beca045a55e25bf7daf3301bf4fa6d99c`
- bounded preview: `0d21fe154c59077714469dd2b9861b530eda19a6`
- D05 export-job reuse: `f983417309ea471853bd64229097c3d8896fc36d`

Final source tree: `5215e8ec3a0ce69ae2b7bc695f9e6d74e12de10b`

## Ticket boundary

- Destination: one generated Product automation service with independently
  consented metadata, typed Project write, bounded preview, and Guided Export
  job scopes.
- Public seams: `ProductAutomationService.mutation`, `.preview`, and `.exports`,
  the disabled-default development adapter, and the existing App command,
  preview-authority, Guided Export, D05 controller, sink, and verifier paths.
- Preserved exclusions: no generic patch, Project schema change, second reducer,
  evaluator, renderer, exporter, job controller, sink, verifier, raw media/path/
  grant access, filesystem/shell/process/network escape hatch, installed helper,
  native target, D10 pinned-frame control, release, or publication.

## Demonstrated

### Plan, apply, and undo

- The only write intent is typed `apply-outcome-recipe`. Plans bind product,
  protocol, build, manifest/capability hashes, originating session, document,
  Project hash/revision, target, scope, expiry, and idempotency.
- Plans disclose complete canonical changed paths and redacted before/after
  identities. Apply is one-use and enters the same
  `applyOutcomeRecipeCommand` → `applyProjectV4Command` path as the visible
  Outcome control. Receipt Undo uses `undoProjectV4Command` and is eligible only
  while the exact applied revision and Project remain current.
- Human edits, capability drift, expiry, replay, idempotency collision,
  disconnect/reconnect, and scope revocation fail before mutation. Plan and
  receipt retention is bounded.

### Bounded preview

- `bounded-preview` is separately consented. It binds the current document
  revision, Project hash, requested dimensions, and story time before capture.
- Requests are limited to 64–1024 pixels per axis, 1,048,576 pixels, 2,000,000
  PNG bytes, 60 seconds, 16 retained records, and one active preview.
- Status/result/cancel/revoke/expiry are client-session bound. Cancellation and
  revocation discard late renderer output. Disconnect revokes preview bytes.
- App capture temporarily installs the existing preview authority and calls the
  existing `CinematicCarousel.captureStill`; authority is restored in `finally`.
  Preview does not mutate the Project and no alternate evaluator or renderer
  was added.

### Guided Export job reuse

- `export-jobs` is separately consented. Preflight delegates to current Guided
  Export intent/capability truth before destination selection or reservation.
- Start returns an asynchronous request ID and opaque reconnect token. The
  existing App destination picker remains the only destination authority.
- After reservation, status/progress/cancel/receipt delegate to the one D05
  `ExportJobController`. Completion receipts exist only after the existing sink
  and verifier path returns a verified `GuidedExportCompletion`.
- Cancel while destination selection is pending prevents late reservation;
  cancel after reservation reaches the real D05 abort controller. Disconnect
  does not cancel an export, so a new local session may reconnect with the
  opaque request/token pair. Request history is bounded to 20.
- Only current H.264 MP4 and PNG Frames choices are accepted. Strict shapes
  reject unexpected fields, including path-shaped input. No destination path,
  media bytes, grant, or host failure enters the protocol.

## Commands and results

- Focused final: `npm test -- --run tests/automationExportService.test.ts tests/automationPreviewService.test.ts tests/automationMutationService.test.ts tests/exportJobController.test.ts tests/guidedExport.test.ts tests/automationSelfDescription.test.ts` — 6 files / 29 tests passed.
- Full source gate: `npm run check` — typecheck passed; 79 files / 535 tests
  passed; macOS source/import/hardening/arm64 contracts passed; production Vite
  build passed with 241 modules.
- Development build: `npm run build:v2-dev` — passed with 241 modules.
- `git diff --check` — passed.

Both Vite builds emitted the existing large-chunk advisory. No dependency,
native binary, package, or distributable was added.

## Fixed-point review

### Spec

- Pass: all four scopes are generated from current app truth and remain
  independently visible and consented. Metadata-only is the default.
- Pass: writes use canonical Project command/revision/history/persistence truth;
  preview uses the existing evaluator/renderer authority; export uses existing
  Guided Export and D05 job/sink/verifier truth.
- Pass: snapshot, cancellation, progress, receipt, reconnect, expiry,
  revocation, and no-mutation behavior are covered at their public seams.
- Deferred: a real development client transcript against the running app,
  actual preview pixels, actual export artifact/receipt, and installed standard
  transport belong to runtime/host evidence, not source simulation.

### Standards

- Pass: strict typed input, machine IDs, opaque tokens, request/byte/pixel/time/
  history bounds, stale-state rejection, revocation, redaction, and exact
  canonical delegation fail closed.
- Fixed during review: the adapter now enforces `additionalProperties: false`
  instead of merely advertising it; UI wording no longer implies that
  disconnecting a local session cancels a reconnectable export job.
- No source-blocking D08 finding remains in the final source tree.

## State and gaps

Highest state: **built** production and `v2-dev` web bundles. D08 is
**source-ready**, not runtime-complete or accepted.

No browser interaction, PNG preview image, H.264/PNG export artifact, long
export, installed client/helper, packaged Apple-Silicon/Garuda target, visual,
motion, audio, accessibility, or human acceptance was exercised or claimed.
No merge, push, release, publication, signing, notarization, installation, or
credential use occurred.

D00 Apple-Silicon package/runtime proof and D10 pinned-frame ownership remain
unchanged.

## Exact resume

Resume `bomkino/pitchdog-drift` on local branch
`codex/d08-automation-writes-foundation` from the D08 evidence commit following
source `f983417309ea471853bd64229097c3d8896fc36d`. Inspect the clean worktree,
implementation ledger, D08 receipt, and D10 ticket first. D08 is source-ready;
do not add another evaluator, renderer, exporter, job controller, sink,
verifier, or generic patch tool. Continue the next dependency-ready non-Mac
source frontier while preserving D00/D05/D10 boundaries. Claim no browser,
package, preview/export artifact, accessibility, or human acceptance without
exact evidence.
