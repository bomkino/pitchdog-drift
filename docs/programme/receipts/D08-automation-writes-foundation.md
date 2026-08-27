# D08 evidence receipt — revisioned automation writes foundation

Date: 27 August 2026

Repository: `bomkino/pitchdog-drift`

Start: `codex/d00-apple-silicon-only-source@2d5ab4bb27bbd8cc557281b35632cf04aabf0b9d`

Task branch: `codex/d08-automation-writes-foundation`

Source commit: `3957109beca045a55e25bf7daf3301bf4fa6d99c`

Source tree: `a0ec754fbb108a979c90f6ae289672fa8bd86a19`

## Ticket boundary

- Destination for this tranche: one revision/hash-bound typed plan → apply →
  undo path through the existing D04 automation service and canonical Project
  command/undo authority.
- Demo exercised at public seams: opt in to `project-write`, connect a
  development session, plan Casino Reveal, inspect its complete redacted
  impact, apply once, observe the exact canonical command result, undo by
  receipt, then prove stale/replayed/expired/reconnected requests do not mutate.
- Public seams: `ProductAutomationService.mutation`,
  `createProductAutomationMutationService`, scoped
  `createDevelopmentMcpAdapter`, and service-backed receipt controls in
  `AutomationAccessView`.
- Preserved exclusions: no preview tool, export tool, evaluator, exporter,
  Project schema, raw media/path/grant authority, native target, package,
  D10 pinned-frame control, release, or publication.

## Files changed

- `src/core/automation/productAutomationMutation.ts`
- `src/core/automation/productAutomationService.ts`
- `src/core/automation/selfDescription.ts`
- `src/lib/developmentMcpAdapter.ts`
- `src/components/AutomationAccessView.tsx`
- `src/components/ControlPanel.tsx`
- `src/App.tsx`
- `src/styles.css`
- `tests/automationMutationService.test.ts`

## Demonstrated

- The only mutation intent in this tranche is typed Drift vocabulary:
  `apply-outcome-recipe` with one canonical outcome-recipe ID. Generic JSON
  patches and arbitrary paths are not accepted.
- Plan identity binds product/protocol, build, manifest and capability hashes,
  originating client session, document ID, Project hash, document revision,
  target ID, required scope, expiry, and idempotency key.
- Complete impact lists every canonical changed path plus redacted before/after
  value identities and the exact result Project hash. A fixture path
  `/Users/manali/Secret/launch.png` is absent from the serialized plan.
- The visible Outcome picker and automation use the same
  `applyOutcomeRecipeCommand` → `applyProjectV4Command` path. The App commits
  one history group, the reducer-produced revision, projected settings, dirty
  persistence scheduling, visible receipt, and announcement.
- Plan and apply produce exact Project/revision equality with a direct canonical
  command invocation. Apply is one-use; replay fails.
- Receipt Undo delegates to `undoProjectV4Command`, restores the exact prior
  serialized Project, advances revision once, and becomes ineligible.
- Concurrent human Project/revision change, expiry, missing/revoked scope,
  capability drift, idempotency collision, and later human edit all fail before
  commit.
- Plans are bound to the originating session. Disconnect/reconnect cannot apply
  an older session's plan. Disabling write scope disconnects write sessions.
- Metadata-only remains the default; protocol resources truthfully expose the
  current enabled scopes. Drift's UI distinguishes local app permission from
  the configured client/model provider's separate privacy terms.
- Retention is bounded to 64 plans and 32 undo-eligible apply receipts; expired
  or consumed plans and undone receipts are eligible for eviction.

## Commands and results

- Focused final: `npm test -- --run tests/automationMutationService.test.ts tests/automationSelfDescription.test.ts tests/projectCommands.test.ts tests/outcomeRecipes.test.ts` — 4 files / 31 tests passed.
- Full source gate: `npm run check` — typecheck passed; 77 files / 526 tests passed; macOS source, import, hardening, and arm64 contracts passed; production Vite build passed with 239 modules.
- Development build: `npm run build:v2-dev` — passed with 239 modules.
- `git diff --check` — passed.

Both Vite builds emitted the existing large-chunk advisory. No new dependency,
native binary, package, or distributable was added.

## Fixed-point review

### Spec

- Pass for this tranche: plan/apply/undo is typed, revision/hash-bound,
  scope-gated, expiring, idempotent at plan creation, one-use at apply, visibly
  receipted, and exact-state undoable while eligible.
- Pass: human edits, capability/manifests changes, session replacement, replay,
  and revocation win without mutation.
- Pass: the existing Product automation service, recipe command, Project
  reducer/undo, application history/persistence, and D04 development adapter are
  deepened; no parallel reducer or automation service was created.
- Deferred within D08: bounded preview consent/lifecycle and D05 export-job
  reuse. Installed transport/client acceptance remains D09.

### Standards

- Pass: public plans/receipts contain hashes, stable IDs, bounded paths, and
  outcome summaries, never Project snapshots, media names, raw bytes, paths,
  grants, host failures, shell/process/network authority, or generic patches.
- Pass: strict intent shape, request/session limits, write-scope revocation,
  session binding, idempotency collision rejection, expiry, bounded retention,
  stale-state checks, and exact-result verification fail closed.
- Fixed during review: manual Outcome application was moved onto the same
  command/revision path; live scope truth entered the protocol manifest; plan
  retention was bounded; idempotency collisions were rejected; disconnected
  sessions could no longer reuse plans.
- No source-blocking finding remains in `3957109` for this bounded tranche.

## State and gaps

Highest state: **built** production and `v2-dev` web bundles.

Also tested: typed intent validation, plan equality/redaction/bindings,
idempotency, one-use apply, exact undo, concurrent edit, expiry, capability
drift, scope denial/revocation, disconnect/reconnect, visible receipt markup,
and current repository contracts.

Not browser-exercised, packaged, installed, released, merged, or accepted. No
visual, motion, audio, export-artifact, accessibility, or human acceptance is
claimed. The cloud browser's earlier local-URL blocker was not retested because
this tranche required no experiential claim.

D00 Apple-Silicon package/runtime proof and D10 pinned-frame ownership remain
unchanged.

## Exact resume

Resume `bomkino/pitchdog-drift` on local branch
`codex/d08-automation-writes-foundation` from source commit
`3957109beca045a55e25bf7daf3301bf4fa6d99c` and this receipt. Verify the clean
worktree, source tree `a0ec754fbb108a979c90f6ae289672fa8bd86a19`,
implementation ledger, D04/D05 receipts, and D08 ticket first. Continue D08
only: add the smallest separately consented bounded preview lifecycle around
the existing evaluator, with dimension/duration/byte/expiry/cancel/revoke and
no-mutation tests. Do not create another evaluator, renderer, exporter, raw
media/path bridge, listener, or generic patch tool. Run focused causal tests,
the full source gate, and one fresh Spec/Standards review. Claim no browser,
package, artifact, accessibility, or human acceptance without exact evidence.
