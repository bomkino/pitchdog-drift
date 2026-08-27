# D08 — Revisioned automation writes, preview, and export

Status: active; plan/apply/undo foundation source-green at `3957109`

## Current tranche

One typed `apply-outcome-recipe` intent now plans, applies, and undoes through
the existing `ProductAutomationService`, outcome-recipe command, Project V4
reducer, document-revision authority, application history, and persistence
path. Metadata-only access remains the default. `project-write` is a separate,
visible, revocable development-session scope.

Plans bind product, protocol, build, manifests, capabilities, client session,
document, Project hash, revision, target, scope, expiry, and idempotency. Apply
is one-use. Receipt Undo is eligible only while the exact applied Project and
revision remain current. Human edits win.

## Still inside D08

- separately consented bounded preview with dimension, duration, byte, expiry,
  cancellation, revocation, and no-mutation proof;
- asynchronous export preflight/start/status/reconnect/cancel/receipt by reuse
  of D05 `ExportJobController` and opaque destination authority;
- broader typed Drift intents only where they enter existing command truth;
- real visible Settings/receipt/focus inspection and a fresh development-client
  end-to-end transcript when a browser can reach the app;
- installed helper/client acceptance, deferred to D09.

## Boundaries

No JSON patch, raw media/path/grant access, second reducer, evaluator, exporter,
filesystem, shell, process, listener, network service, native package work,
D10 pinned-frame work, merge, release, installation, or publication.

Receipt: [`receipts/D08-automation-writes-foundation.md`](receipts/D08-automation-writes-foundation.md)
