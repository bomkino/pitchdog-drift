# D04 evidence receipt — MCP self-description and read-only tracer

Date: 27 August 2026

Repository: `bomkino/pitchdog-drift`

Start: `codex/d03-interface-scale-tracer@448bd5f0987b60ebc63e229e45151a30f23eab9d`

Task branch: `codex/d04-mcp-self-description`

Source commit: `13554073c408440d85f6cfce5f764c1521b38cef`

Source tree: `9ed43b8a9a8ec8dc5383a1e6b436d5e4ee574921`

## Ticket boundary

- Destination: canonical Drift self-description plus an opt-in, local, read-only development adapter.
- Demo: inspect **Show what Codex can see**, enable the `v2-dev` client surface, connect a fresh product/protocol-matched client, list/read resources, call `drift.get_manifest`, disconnect, and prove the document is unchanged.
- Public seams: `createDriftSelfDescription`, `ProductAutomationService`, `createDevelopmentMcpAdapter`, and `AutomationAccessView`.
- Write surface: generated manifests, read service, development adapter, visible access disclosure, App development wiring, focused tests, compact ADR/status/receipt.
- Out of scope preserved: no writes, direct patches, previews, export tools, raw media/path authority, listener, package helper, or D08 implementation.

## Environment

- OS: Linux `6.18.35`, x86_64.
- Node: `v24.19.0`; repository declares Node 22 and engine `>=22.12`.
- npm: `11.9.0`; lock declares `npm@11.19.0`.
- Worktree at start: clean at exact remote D03 evidence commit.

## Files changed

- `src/core/automation/selfDescription.ts` — stable product/protocol IDs, canonical serialization/hash, source-derived factory/reset/outcome manifests, redacted revision-bound document, presentation, capability, and bounded job summaries.
- `src/core/automation/productAutomationService.ts` — immutable resource catalogue/read seam and snapshot identity.
- `src/lib/developmentMcpAdapter.ts` — disabled-default product/protocol/session gate, request/rate bounds, read resources/tool, disconnect/revoke, live service replacement, and connection subscription.
- `src/components/AutomationAccessView.tsx` — exact service-backed disclosure, metadata scope, enable state, connection state, and disconnect/revoke.
- `src/App.tsx` — live canonical service and `v2-dev`-only opt-in frozen client surface; release builds expose no global.
- `src/styles.css` — bounded footer disclosure panel using current semantic tokens.
- `tests/automationSelfDescription.test.ts` — equality, canonical factory/reset/recipe, redaction, view, client transcript, mutation invariance, identity, hostile method, size, and revocation checks.
- `docs/programme/adr/0003-generated-read-only-automation-truth.md`, status ledger, and this receipt.

## Demonstrated

- Two independently generated fixture manifests compare equal and the document carries revision `7` plus a stable `fnv1a64:<16 hex>` Project identity.
- The private fixture filename `/Users/manali/Client Secret/launch.png` is absent. Its resource metadata is limited to ID, kind, MIME type, content hash, byte length, dimensions, and optional duration; no name, path, blob, grant, or bytes appear.
- Factory state equals `createInitialDriftProjectV4("automation-factory", fixedTime)` mechanically. Motion/sequence reset results and all four outcome recipes are generated from canonical functions with changed paths and complete contextual results.
- The visible disclosure iterates the same `ProductAutomationService.listResources/readResource` payloads used by the client and displays the same snapshot identity.
- Disabled connect fails. A fresh enabled client connects with exact product/protocol identity, lists seven resources, reads `drift://manifest/document`, calls `drift.get_manifest`, disconnects, and then receives an invalid-session failure.
- Wrong product, wrong protocol, mutating method, and oversized request fail closed. The serialized document before and after all read calls is equal.
- The App exposes only frozen `connect`, `request`, and `disconnect` functions after explicit opt-in in `v2-dev`; disable/revoke removes the surface and active sessions. No transport listener, path, shell, or network function exists.

Redacted document-resource shape exercised by the public seam:

```json
{
  "revision": 7,
  "projectHash": "fnv1a64:<redacted>",
  "media": [{
    "id": "private-slide",
    "kind": "image",
    "mimeType": "image/png",
    "contentHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "byteLength": 1234,
    "width": 1600,
    "height": 900
  }]
}
```

## Commands and results

- Red: `npm test -- --run tests/automationSelfDescription.test.ts` failed because `AutomationAccessView` did not exist.
- Focused final: `npm test -- --run tests/automationSelfDescription.test.ts` passed — 1 file, 5 tests.
- Final source gate: `npm run check` passed — typecheck, 72 test files / 509 tests, macOS source/import/hardening contracts, and production Vite build.
- GitHub exact tree equality: local source tree and remote source tree both `9ed43b8a9a8ec8dc5383a1e6b436d5e4ee574921`.

## Visual, motion, audio, and artifact evidence

- No screenshot or manual visible UI/resource comparison. The available cloud browser previously rejected the local development URL with `net::ERR_BLOCKED_BY_CLIENT`; no browser or app was installed.
- Static rendered-component evidence proves disclosure labels, snapshot identity, and private-name absence, not visual quality, focus order, clipping, or human acceptance.
- No renderer, motion evaluator, audio policy, Project schema, output dimensions, cadence, or export sink changed.
- Built artifact: production web bundle only. No Mac/Garuda package or distributable.

## Fixed-point review

### Spec

- Pass: one generated truth covers protocol/build, vocabulary, defaults/resets/recipes, document, presentation, capabilities, and jobs.
- Pass: Project hash/revision binding, redacted bounded media metadata, explicit presentation separation, truthful source-runtime capability state, exact visible/service resource reuse, disabled-default client, product/protocol/size/rate/session gates, disconnect/revoke, and mutation invariance.
- Pass: enabling is causal in `v2-dev`; release identity does not render the control or expose the client surface.
- Deferred: manual visible UI/resource comparison, real external standard MCP transport, packaged helper identity, and installed Mac/Garuda client proof. D08 remains blocked.
- Result: D04 is source-ready and production-web built, but not complete or accepted.

### Standards

- Pass: canonical sources are imported, not duplicated; contextual recipe/reset results are generated by real application functions.
- Pass: service snapshots are cloned before exposure; resource reads return clones; the only tool is a typed manifest read.
- Pass: no raw names/paths/blobs/grants/bytes, generic JSON patch, filesystem, shell, process, remote listener, API key, embedded model, dependency, or licence change.
- Pass: hostile tests exercise public adapter boundaries rather than source strings. UI/static checks do not claim visual taste.
- No source-blocking finding after the causal `v2-dev` enable/revoke wiring was added and rechecked.

## State and gaps

Highest state: **built** production web bundle.

Also tested: manifest/service/adapter/component/application contracts.

Not packaged, installed, released, merged, accepted, or complete.

Unrun:

- manual visible disclosure/resource equality and keyboard/focus inspection;
- standard external client transport beyond the bounded in-process tracer;
- exact packaged Apple-Silicon and pinned Garuda client journeys;
- human visual/accessibility acceptance.

Blocker: the current cloud browser cannot open the local app, and native/Garuda package work is outside D04. D02 and D05 remain independent dependency-ready source frontiers. D08 remains blocked until D04's manual/host evidence and future transport boundary are reconciled.
