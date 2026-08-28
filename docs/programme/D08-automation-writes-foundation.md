# D08 — Revisioned automation writes, preview, and export

Status: source-ready at `f983417`; runtime and installed acceptance remain open

## Delivered source tranche

One typed `apply-outcome-recipe` intent now plans, applies, and undoes through
the existing `ProductAutomationService`, outcome-recipe command, Project V4
reducer, document-revision authority, application history, and persistence
path. Metadata-only access remains the default. `project-write` is a separate,
visible, revocable development-session scope.

Plans bind product, protocol, build, manifests, capabilities, client session,
document, Project hash, revision, target, scope, expiry, and idempotency. Apply
is one-use. Receipt Undo is eligible only while the exact applied Project and
revision remain current. Human edits win.

`bounded-preview` adds a separately consented, revision/hash/time/dimension
snapshot around the existing preview authority and still renderer. Pixel,
dimension, byte, duration, concurrency, retention, expiry, cancel, revoke, and
requester bounds fail closed without Project mutation.

`export-jobs` adds asynchronous preflight/start/status/reconnect/cancel/receipt
around the existing App destination authority, Guided Export request, and one
D05 `ExportJobController`. It creates no evaluator, exporter, sink, verifier,
or second controller. Reconnect uses an opaque bounded token; no path or grant
is accepted.

## Still open for D08 acceptance

- real visible Settings/receipt/focus inspection and a fresh development-client
  end-to-end transcript when a browser can reach the app;
- actual bounded PNG preview pixels and actual H.264/PNG export job receipts;
- installed helper/client acceptance, deferred to D09.

## Boundaries

No JSON patch, raw media/path/grant access, second reducer, evaluator, exporter,
filesystem, shell, process, listener, network service, native package work,
D10 pinned-frame work, merge, release, installation, or publication.

Receipt: [`receipts/D08-automation-writes-foundation.md`](receipts/D08-automation-writes-foundation.md)
