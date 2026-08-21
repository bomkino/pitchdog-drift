# Mega Main current status

Updated: 2026-08-21  
Branch: `integration/mega-main-native`  
Checkpoint before this status commit: `a4c54c1669f326f85a2c576e0230a96f363f1937`

## Verdict

**Drift 1.0 is not finished.**

The branch has reached a clean, green native-first foundation. It is a construction checkpoint, not a release candidate and not permission to merge into `main`.

## Verified green checkpoint

The exact checkpoint above passed:

- CI;
- 130 unit and contract tests across 21 files;
- 18 real-browser Playwright tests;
- macOS WKWebView runtime probes;
- universal standalone-app build and packaged-lifecycle verification;
- native source, file-broker, sandbox, signing-structure and local DMG gauntlets.

## Implemented foundation

### Native chassis

- Sandboxed AppKit/WKWebView host.
- One classic boot-critical Mac web bundle.
- Signed-resource topology checks.
- Native document-session authority and stale-generation rejection.
- Opaque native file grants and staged output writes.
- Native AAC boundary and codec probes.
- Packaged-app lifecycle and recovery evidence.
- Finder, sequence rollback and truthful output infrastructure inherited from the native donor.

### Project and core chassis

- Strict Project V3 schema, defaults and validation.
- Legacy-project migration into Project V3.
- Portable-project integrity and media-receipt checks.
- Project commands, revisions and change receipts.
- Explicit frame-evaluation contract.
- Semantic event contract.
- Cadence, performance, master-time and track mathematics.
- Ten spatial path definitions and tests.
- Motion, material and lighting recipe registries.
- Built-in study identity survives local persistence and remains replaceable by the first real deck.

### Existing product parity retained

- Slide import and ordering.
- Presenter import and pinning.
- Existing live Three.js renderer.
- Existing themes and controls.
- Deterministic still, PNG-sequence and H.264 export paths.
- Portable `.pitched` import/export.
- Browser fallback and accessibility regression coverage.

## Important architectural truth

The new core is **not yet the complete live product engine**.

Project V3 currently projects through a compatibility bridge into the old `StudioSettings` and legacy renderer. The repository still contains the large transitional files:

- `src/App.tsx`;
- `src/engine/CinematicCarousel.ts`;
- `src/engine/shaders.ts`;
- `src/themes.ts`;
- `src/lib/exportStudio.ts`.

Unsupported future Project V3 paths and atmospheres deliberately fall back in the legacy renderer rather than pretending to be implemented. This protects project data, but it also means schema presence is not feature completion.

## Major unfinished systems

### 1. Real Mac document behaviour

The native authority and file infrastructure exist, but the user-facing app still needs the final document model:

- associated Finder document;
- native dirty/clean state;
- true `⌘S` rather than portable-project export semantics;
- Save As;
- Revert to Saved;
- external-change conflict handling;
- revision-aware save races;
- recovery clearly separated from Save;
- streaming project I/O and content-addressed local media storage.

### 2. Renderer and exporter reconstruction

The monoliths must be decomposed so the new core becomes authoritative:

- render graph;
- slide pool;
- texture cache;
- interaction controller;
- presenter renderer;
- material, lighting, atmosphere and lens passes;
- export preflight, render, audio, encode, write, verify and receipt stages.

### 3. Temporal direction in the live app

The mathematics and recipes need full preview/export/UI integration:

- four editorial cuts;
- six performance signatures;
- continuous, 24, 18 and 12 fps pose cadence;
- direct, weighted, spring and drift character;
- direct manipulation through holds;
- pause truth;
- reduced-motion separation;
- complete audiovisual seam closure.

### 4. Space and matter parity

The core definitions need live renderer parity:

- all ten paths;
- tangent banking;
- Card, Paper, Silk and Gel;
- flex and physical thickness;
- shared shell geometry;
- derivative normals;
- local print/finish characters;
- per-slide crop and focal direction.

### 5. Lighting

The twelve authored rigs exist as core recipes but still need the complete rendering product:

- warped-surface response;
- analytical cast/contact shadows;
- spill and gobos;
- artwork and presenter protection;
- animation and loop closure;
- A/B, Custom truth, advisories and human review.

### 6. Atmosphere

Not yet reconstructed into Mega Main:

- five-family atlas;
- forty structural compositions;
- palettes, treatments, recuts and presence levels;
- cinematic donor atmospheres;
- search, feeling lanes, A/B and truthful previews;
- explicit state replacing overloaded seeds.

### 7. Global camera lens

Not yet reconstructed into Mega Main:

- one optional linear scene target;
- six camera characters;
- focus, smear, chromatic separation, bloom, halation, flare, curvature, grain, gate weave and vignette;
- Protected versus Through-Lens presenter;
- premultiplied-alpha and single-colour-transform contract;
- true clean bypass.

### 8. Unified sound

Not yet reconstructed into Mega Main:

- recorded corpus and provenance;
- Dry, Editorial and Organic grammars;
- procedural source provider;
- one semantic-event planner;
- shared preview/offline graph;
- dialogue-aware mix;
- streaming PCM and native AAC;
- exact one-track master and WAV stem;
- listening and fatigue gauntlets.

### 9. Worlds and final directing experience

The current six legacy themes are not the final world system. Remaining work includes:

- inventorying every distinct donor world;
- compiling worlds from final domains;
- authored Restrained, Directed and Fever variants;
- domain locks;
- recut, A/B, undo and change receipts;
- Slides → World → Direct → Master interface;
- final Mac-native visual and interaction language.

### 10. Release convergence

Still required:

- complete donor-parity ledger;
- cross-feature combination matrix;
- 90-slide and modest-hardware stress;
- alpha, colour, seam and audio readback;
- chaos and cancellation tests;
- physical Apple Silicon testing;
- physical Intel testing before an Intel-support claim;
- VoiceOver and keyboard review;
- human beauty and sound review;
- Developer ID signing, notarisation, stapling and quarantine/Gatekeeper verification;
- two consecutive adversarial passes with no accepted material improvement.

## Next dependency order

1. Finish the native document model and make Project V3 the actual saved document.
2. Decompose renderer/exporter and route the existing product through the new contracts.
3. Make the new temporal core authoritative in preview and export.
4. Integrate space and matter.
5. Integrate lighting.
6. Integrate atmosphere.
7. Integrate global lens.
8. Integrate unified sound.
9. Compile worlds and rebuild the Director experience.
10. Run donor parity, convergence, performance, accessibility, physical-hardware and human-review gauntlets.
11. Produce one exact signed and notarised Drift 1.0 candidate.

## Completion rule

Green CI means the current checkpoint is internally coherent. It does **not** mean Drift 1.0 is complete.

Drift 1.0 is complete only when every major unfinished system above is implemented in the packaged Mac app, reaches preview/export parity, passes the final gauntlets, and the exact verified candidate receives explicit approval to merge into `main`.
