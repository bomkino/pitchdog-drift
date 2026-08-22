# Project V4 migration contract

Implementation status: **integrated in the V2 vertical-slice source; not release-live**

Updated: 22 August 2026

This document defines the Project V4 compatibility slice. The current App, payload parser, serializer, and V1 projection paths use V4: new in-memory projects start as V4; accepted V3 and frozen legacy payloads migrate to V4 in memory; and the next real save serializes V4 only. The V4 core, exact-candidate preservation, recovery-lock hardening, protected pin state, and performance lifecycle persistence are committed. V4 is not yet a shipped, merged, production-installed, or release-approved contract.

The original Project V4 hardening evidence remains pinned to exact commit `843ee934f025f2b6c298e9d8872924d70fdd064a`: its complete source check passed, then `e2e/studio-projects.e2e.ts` passed `7/7` in 3.6 minutes. The recovery case invokes both native slide and presenter import commands while recovery-locked, instruments `IDBObjectStore.put` and `IDBObjectStore.clear`, and observes zero writes. The wider V2 vertical slice is committed at `fb1773c`; its source suite later passed `245/245`, typecheck, Mac source contracts, and the V2 Web build. Exact current browser, packaged-WKWebView, installed-app, and release evidence remains separately gated in [CURRENT_STATUS.md](CURRENT_STATUS.md).

Project V4 does not turn on V2 rendering. Its job is narrower: identify the render contract explicitly, migrate accepted older projects without changing their current V1 appearance, and create a strict place for future namespaced data. The V2 lifecycle and pin features still execute through the compatibility renderer; no `drift-v2` render contract is claimed.

## Non-negotiable result

- The outer `.pitched` ZIP envelope remains version 1.
- Valid Project V3 and frozen legacy Studio V1 payloads become Project V4 with render contract `drift-v1-compat/1`.
- Migration does not activate dormant V3 fields or apply a V2 World.
- An invalid or unsupported candidate never replaces the open project.
- No migration source fingerprint is invented.
- The original `.pitched` file is not overwritten by opening it. Writing a V4 file still requires the ordinary explicit Save or Save As authority.

## Two version boundaries

The portable container and the creative project are separate contracts.

| Boundary | Schema | Version in this slice | Rule |
| --- | --- | --- | --- |
| Outer ZIP manifest | `pitch.dog/pitched-project` | `1` | Remains unchanged. It owns project identity, timestamps, engine/theme receipt strings, ordered asset metadata, sizes, and SHA-256 hashes. |
| Inner creative project | `dog.pitch.drift/project` | `4` | Adds render-contract identity, migration receipt, and namespaced extensions around the existing validated V3 creative values. |

The MIME type remains `application/vnd.pitchdog.pitched+zip`. The archive still contains `manifest.json` plus the exact declared asset paths. Project V4 is a payload change, not a new container format.

## Exact Project V4 envelope

Every Project V4 object contains all Project V3 creative fields, unchanged in name and meaning, plus these exact fields:

```ts
interface DriftProjectV4 extends Omit<DriftProjectV3, "formatVersion"> {
  formatVersion: 4;
  renderContract: "drift-v1-compat/1";
  migration: {
    sourceFormat: "legacy-studio-v1" | "project-v3";
    migrator: "drift-project-v4/1";
  } | null;
  extensions: Record<string, DriftJsonValue>;
}
```

Rules:

- A project created natively as V4 has `migration: null`. Native V4 creation must not manufacture migration history.
- A migrated V3 project records `sourceFormat: "project-v3"`.
- A frozen legacy Studio V1 payload records `sourceFormat: "legacy-studio-v1"`.
- Every non-null receipt uses `migrator: "drift-project-v4/1"` exactly.
- `renderContract` accepts only `drift-v1-compat/1` in this slice. `drift-v2`, a future contract string, or any other value is rejected.
- All existing Project V3 creative domains remain strict core fields. They do not move into `extensions`.

## Accepted input routes

### Existing Project V4

1. Validate the V4 object strictly.
2. Match its project identity and timestamps to the verified outer manifest.
3. Match every media descriptor to the verified outer asset receipt.
4. Preserve its existing `migration` receipt and canonicalized `extensions`.

No migration runs.

### Project V3

1. Validate the complete V3 object.
2. Match project identity, timestamps, media IDs, names, MIME types, byte lengths, and hashes to the verified outer manifest.
3. Clone the accepted V3 data without mutating the input.
4. Replace only `formatVersion` and add:

```json
{
  "formatVersion": 4,
  "renderContract": "drift-v1-compat/1",
  "migration": {
    "sourceFormat": "project-v3",
    "migrator": "drift-project-v4/1"
  },
  "extensions": {}
}
```

5. Validate the complete V4 candidate again.

Removing the V4-only fields and restoring `formatVersion: 3` must reproduce the accepted V3 object exactly. Timestamps, project seed, project identity, media, slide directives, dormant creative values, provenance, and locked domains must not drift.

### Frozen legacy Studio V1

“Legacy” is not a permissive fallback for a recognized Project V3/V4 envelope. The accepted route is the frozen schema-less Studio V1 payload whose outer manifest reports both:

```text
engineVersion: 1.0.0
themeVersion: 1.0.0
```

The legacy readers require and type/range-check every known field used by the migration. Unlike the strict V3/V4 validators, however, they currently accept and strip unknown sibling keys in the legacy payload, settings objects, and descriptors. This is a bounded compatibility parser, not strict-object admission.

The route is:

```text
verified outer manifest and assets
  -> bounded legacy known-field and descriptor validation
  -> existing legacy-to-V3 compatibility mapping
  -> strict V3 validation
  -> V3-to-V4 migration
  -> strict V4 validation
```

The resulting receipt is:

```json
{
  "sourceFormat": "legacy-studio-v1",
  "migrator": "drift-project-v4/1"
}
```

Changing either frozen outer receipt string rejects the legacy payload. Project V3 and V4 do not depend on equality with those old engine/theme strings; their inner format and render-contract fields carry their compatibility identity.

## Candidate before replacement

Migration is pure candidate construction. It is not permission to mutate the current document.

Before the open project, renderer state, autosave state, or local database may be replaced, the complete candidate must pass all of these steps:

1. Decode the ZIP inside existing archive and expansion limits.
2. Validate outer manifest schema/version, paths, counts, sizes, and hashes.
3. Parse exactly one supported inner payload route.
4. Validate project identity and media receipts against the outer manifest.
5. Migrate, when required, into a new V4 object without changing the input.
6. Validate the complete V4 candidate.
7. Project `drift-v1-compat/1` through the current V1 renderer adapter.
8. Decode and verify every candidate slide and presenter asset, including type and dimensions.

Only the fully prepared candidate may be installed. The current portable-open path prepares the candidate before persisting or replacing current work, installs it, and persists that exact validated V4 rather than a V1-reconciled derivative. It restores the prior verified project if candidate persistence fails. Any failure before installation must dispose candidate media and leave the current project untouched. The same-commit project E2E covers future-format rejection without persistence, dormant-direction preservation through open/reload/save, and zero writes from both native media-import commands while recovery-locked.

Opening an older `.pitched` file may migrate the verified copy held by Drift. It does not rewrite the source file. In a browser, Save currently initiates a download but cannot read the browser-selected destination back. In the native app, Save resolves after the staged commit and committed file identity/size checks, but it does not re-import and compare the complete archive bytes. Exact post-save archive readback therefore remains a release-live gate; it is not current evidence.

## V1 pixel contract

`drift-v1-compat/1` means current V1 behavior, including current compatibility fallbacks—not a reinterpretation of V3 through unfinished V2 systems.

- The pure V3-to-V4 migrator preserves every accepted V3 creative value exactly before the App projects or reconciles it.
- The current Studio V1 projection remains the only renderer adapter for this contract.
- Domains that the current reconciliation path does not rewrite remain stored but dormant. This is not a blanket preservation claim for every projected field.
- An unsupported path ID renders as `straight`, but the original ID remains stored until the user explicitly selects a different visible flow.
- An unsupported enabled atmosphere family renders as `aura`, but the original family remains stored until the user explicitly selects a different visible background. A disabled atmosphere follows the existing transparent fallback.
- An unknown or absent World projects through `editorial-drift`, but its original receipt remains stored until the user explicitly selects a different visible theme.
- Per-slide directives remain stored; the V1 renderer continues to use its current first-visible-slide global crop projection.
- Lens, sound, and other richer fields that reconciliation does not rewrite do not become visually or audibly active merely because the format number changed. Fields represented by current Studio settings may be normalized to the current visible compatibility value as documented below.
- `extensions` are inert under `drift-v1-compat/1`. They cannot override core data, renderer behavior, feature flags, or migration rules.

Migration must therefore reproduce the pixels and export behavior of the current accepted V1/V3 compatibility path. Structural equality is necessary but not sufficient; golden preview and export comparisons remain a live gate.

## Preserved legacy normalization and loss

The existing Studio V1-to-V3 mapping already makes several lossy compatibility decisions. Project V4 deliberately routes legacy data through that mapper instead of silently “fixing” old projects and changing their reopened behavior.

| Legacy value | V3/V4 compatibility result | Reason this slice preserves it |
| --- | --- | --- |
| `motion.autoplay` | Not persisted; V1 projection supplies `true`. | It is current preview/session behavior, not canonical export-time motion truth. |
| `motion.dragSensitivity` | Not persisted; V1 projection supplies `1`. | It is current interaction behavior, not saved analytical export motion. |
| `presenter.shadowOpacity` | Collapses to the shared legacy lighting/slide shadow value. | V3 has no separate presenter-shadow field. Adding one during migration would change current reopened pixels. |
| `settings.presenter.assetId` when it disagrees with admitted media | The verified outer `presenterAssetId` and its matching video receipt win. | A stale settings reference cannot overrule verified media identity. |
| Descriptor `demo` boolean | Not carried into the V3/V4 media descriptor. | It is not render truth; current built-in-study identity uses stable admitted identity rather than an untrusted payload flag. |
| Legacy settings `schemaVersion`, `engineVersion`, and `shaderVersion` | Not promoted into V4 creative authority. | The frozen legacy route is gated by the exact outer contract; V4 has its own format and render-contract identity. |
| Unknown sibling keys in the legacy payload, nested settings objects, or media descriptors | Accepted by the frozen known-field readers, then stripped before V3 construction. | This is existing legacy compatibility behavior. Strict unknown-field rejection starts at the validated V3 boundary. |

These are documented losses, not invitations to add hidden recovery fields. Any future repair requires a new explicit migration contract, fixtures proving the intended behavior, and visual approval.

### Current V1 projection/reconciliation normalization

Portable open persists the exact validated V4 candidate. Later ordinary Studio saves project current settings back into V4. Unsupported path, atmosphere, and World identities survive those saves while their visible fallback remains unchanged; selecting a different visible flow, background, or theme replaces the corresponding stored value. The following remaining normalizations preserve current visible behavior but can replace valid V3/V4 values:

| Project value before projection | Reconciled V4 value |
| --- | --- |
| `composition.alphaMode` and `atmosphere.enabled` combination | The current transparent compatibility path wins if composition is transparent or atmosphere is disabled; reconciliation aligns both fields to that visible result |
| `card.defaultFit` that differs from the first visible slide directive | The first visible directive's fit |
| `material.finish.localSmear` that differs from `material.flex` | The projected distortion value from `material.flex` |
| `lighting.shadowOpacity` while lighting is disabled | `0` |
| `master.audio.enabled` | Recomputed solely from the currently supported enabled, unmuted presenter-audio path; dormant sound export state does not keep it enabled |

These are compatibility normalizations after migration, not changes performed by `migrateDriftProjectV3ToV4`. They need fixture and pixel coverage before release-live status; future V2 work must not misdescribe them as preserved dormant values.

The existing recipe value `legacy-theme:<themeId>` may appear in `provenance.world.fingerprint`. V4 preserves that string as existing recipe provenance. It is a compatibility label, not a cryptographic fingerprint of the source payload.

## No invented fingerprint

Project V4 migration has no `sourceFingerprint` field.

- Asset SHA-256 values prove individual admitted media bytes; they are not a fingerprint of the complete creative payload.
- ZIP bytes are not a stable source fingerprint for semantic migration because container metadata and canonicalization can differ.
- Existing recipe fingerprints remain recipe provenance only.
- `migration.sourceFormat` plus the exact migrator ID records what is known. Unknown provenance remains unknown.

A future whole-project fingerprint may be added only after its canonical byte representation, algorithm, version, and verification semantics are specified and tested. Until then, no hash-shaped placeholder or weak derived label is allowed.

## Extensions boundary

`extensions` preserves namespaced JSON data without weakening strict core validation.

- Namespace keys must be lower-case reverse-DNS names, 3–128 characters overall, with valid DNS-style labels.
- At most 64 namespaces are accepted.
- The canonical JSON encoding may be at most 262,144 UTF-8 bytes.
- Extension data may contain at most 10,000 JSON values and 32 nested levels.
- Values are limited to null, booleans, finite numbers, strings, dense arrays, and plain objects.
- Object keys are canonicalized in sorted order; array order is preserved; negative zero becomes zero.
- Cycles, sparse arrays, custom array fields, accessors, symbol keys, non-plain objects, and the keys `__proto__`, `constructor`, and `prototype` are rejected.

Valid unknown extension namespaces are preserved but inert. Within Project V3/V4, unknown data anywhere else is rejected. The frozen legacy exception is explicit: its known-field readers strip unknown siblings before strict V3 validation. An extension cannot claim a V2 World, alter the render contract, smuggle executable behavior, or become saved creative truth behind an unversioned feature flag.

## Fail-closed rejection

Reject without replacing active work when any of these conditions holds:

- unknown outer manifest schema or version;
- recognized project schema with an unsupported or malformed `formatVersion`;
- any V4 render contract other than `drift-v1-compat/1`;
- unknown or missing V4 core fields;
- non-null migration data with an unknown field, source format, or migrator ID;
- inherited, accessor-backed, cyclic, excessively deep, or otherwise non-data V4 core trees;
- invalid, oversized, dangerous, or non-JSON extension data;
- outer/project identity disagreement;
- missing, extra, duplicated, unreferenced, wrong-kind, wrong-size, or hash-mismatched media;
- frozen legacy payload with non-`1.0.0` outer engine/theme receipts;
- any candidate asset that cannot be decoded and dimension-checked.

A recognized future project must never fall through and be misread as schema-less legacy data.

## Known release-live blockers

- Browser portable Save proves download initiation, not destination readback. Native Save proves staged commit and committed identity/size, not a semantic or byte-for-byte re-import of the saved archive.
- The full browser E2E suite beyond `e2e/studio-projects.e2e.ts`, packaged WKWebView gauntlet, installed-app checks, representative saved-project archive readback, and golden visual/export pixel comparison remain pending for the exact V4 revision.

## V2 Worlds require a later explicit upgrade

Project V4 in this slice does not authorize V2 Worlds. Applying one requires a later, separately reviewed upgrade transaction that:

1. is initiated by an explicit user action such as **Apply V2 World** or duplicate-and-upgrade;
2. constructs and validates a candidate under a future supported render contract;
3. starts from the World baseline, respects locked domains, and records exact changed and preserved paths;
4. never changes media, slide order, presenter placement, master settings, or the source file silently;
5. is undoable and non-compounding;
6. preserves the original project until the upgraded candidate is accepted and explicitly saved;
7. passes renderer, export, migration, visual, and native gauntlets before public exposure.

Writing V2-looking values into dormant V3 fields or `extensions` while retaining `drift-v1-compat/1` is forbidden.

## Live gate

Change this document’s status from **not yet release-live** only when one committed source SHA proves all of the following:

- new projects, local autosave, hydration, portable open, and portable save use validated Project V4;
- V3 and frozen legacy inputs migrate through the exact receipts above;
- malformed, hostile, and future inputs leave active and recovery-locked work untouched;
- V3-to-V4 migration is deterministic, input-pure, and creative-value exact before documented V1 projection/reconciliation normalization;
- extensions round-trip canonically and hold every size, depth, shape, and pollution boundary;
- golden V1 projects preserve preview, still, PNG-sequence, and MP4 pixels under `drift-v1-compat/1`;
- unsupported path, atmosphere, and World identities remain dormant until a corresponding explicit different selection, and every remaining documented normalization is fixture-pinned;
- browser, type, unit, packaged WKWebView, native project, recovery, and cancellation checks pass for the same SHA;
- the exact packaged app opens and saves representative V1, V3, and V4 fixtures without changing the source files;
- documentation, source receipt, installed state, merge state, and release state are reported separately.

Until those gates hold, Project V4 is implementation work—not a live compatibility promise.
