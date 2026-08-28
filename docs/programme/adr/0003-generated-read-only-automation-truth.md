# ADR 0003: Generated metadata-only automation truth

Status: accepted for D04 source tracer

## Context

Drift needs one inspectable automation description for people and local development clients. Copying defaults into protocol handlers would drift from the Project factory, command registry, outcome recipes, presentation state, and probed runtime capabilities. Giving a development adapter generic filesystem, shell, network, raw media, or Project mutation authority would exceed D04.

## Decision

- Generate protocol, vocabulary, defaults, document, presentation, capability, and job manifests from canonical Drift sources.
- Bind document metadata to the live Project hash and document revision while omitting media names, paths, blobs, grants, and raw bytes.
- Expose immutable snapshots through one `ProductAutomationService`; the visible **Show what Codex can see** view and client resource reads consume that same service.
- Keep the development adapter disabled by default, in-process, metadata-only, product/protocol checked, size/rate bounded, session-scoped, and read-only.
- In the `v2-dev` identity only, an explicit user toggle exposes a frozen `connect`/`request`/`disconnect` client surface. Disabling or revoking destroys active sessions. No listener or release-build global is created.
- Keep Interface Scale and editor context in the presentation manifest with `portableProjectIntent: false`.
- Report missing package/capability evidence as unknown or unavailable; never infer installed-package support from source execution.

## Consequences

- Factory/reset/recipe resources remain mechanically tied to implementation sources, including contextual complete results and changed paths.
- Read-only calls cannot alter Project, revision, dirty state, undo, jobs, media, or export authority.
- D08 can add typed plan/apply/undo, consented bounded preview, and export-job reuse by extending the service; direct JSON patches and generic OS tools remain prohibited.
- The in-process development tracer proves product protocol behavior, not a packaged Mac/Garuda helper or standard external transport.

## Rejected

- A second handwritten defaults catalogue.
- Raw Project JSON as the document manifest.
- Media filenames, host paths, object URLs, grants, or bytes in default resources.
- A remote listener, API key, embedded model, shell command, or filesystem tool.
- Enabling automation in release builds or by default.
