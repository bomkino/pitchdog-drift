# Drift V2 requirement and phase matrix

Updated: 22 August 2026

Branch: `codex/v2-directors-cut`

Pre-package source base: `c5e3bc6d34983c886df9d9bcdaa726ec862f5941` plus the candidate V2 renderer patch described here

## Purpose and authority

This is a scope and evidence map, not a completion receipt. It separates the current authored renderer slice from the complete V2 promised by the curated donor plan.

Public authority, in order:

1. This requirement and phase matrix, which curates the launch contract without exposing maintainer-local construction handovers
2. [`docs/mega-main/SOURCE_MANIFEST.yaml`](../mega-main/SOURCE_MANIFEST.yaml) and linked Mega Main contracts
3. [`docs/v2/DONOR_LEDGER.yaml`](DONOR_LEDGER.yaml)
4. Phase receipts and exact-artifact evidence

The two dated construction handovers used to prepare this matrix remain maintainer-local by policy. They are inputs to curation, not public links or runtime dependencies. Any requirement intended for contributors must be restated in a tracked public contract before it can become an open-source acceptance gate.

`implemented`, `tested`, `committed`, `pushed`, `packaged`, `installed`, `merged`, `released`, and `approved` are separate states. Schema entries, registries, recipe metadata, tests, or an older installed build do not prove live V2 product behavior.

## Current first-slice boundary

The candidate patch contains one authored **Editorial Drift renderer slice**:

- Project V4 recognises both `drift-v1-compat/1` and `drift-v2/1`.
- V1/V3 migration remains on the compatibility contract until an explicit V2 World application.
- Applying the Editorial Drift foundation is the explicit upgrade boundary.
- One pure explicit-time V2 evaluator now joins lifecycle, cadence, semantic events, spatial placement, and ordered media identity.
- Preview and export enter the same `renderVisibleItems` draw path; sequence export owns time through `frameIndex / fps`.
- A pinned-only image is excluded from the moving source order while retaining its full project-media identity.
- Per-slide fit and focal directives reach the shared slide shader.
- Editorial Drift has authored ratio recipes for `9:16`, `4:5`, `1:1`, and `16:9`; proportional output sizes resolve to those authored ratios, while arbitrary sizes become Custom.
- Automatic ratio recut fails closed: only a V2 project with truthful surviving Editorial recipe references and fingerprints may be recomposed. Compatibility, future, mixed, or creatively edited projects are preserved.
- Unchanged Project V4 hydration and media-only reconciliation preserve dormant authored values that the current Studio projection does not expose.
- Presenter preview uses one authored master clock with decoder-driven delivery and settled correction for real drift, wraps, and frozen states. Its focused real-video browser journey passes 3/3 repeat runs; full parity remains open.

This does **not** satisfy the curated V2 renderer gate yet:

- `StudioSettings` projection still feeds the compatibility draw graph.
- Full Project V4 command/receipt/lock/undo authority is not live.
- Motion characters are not fully integrated into one analytical export contract.
- Card/Paper/Silk/Gel, analytical lighting, the forty-background atlas, global optics, tactile sound, and the final output transform are not live V2 domains.
- Seven portrait/optical proofs, sixteen portrait scenes, six handcrafted presets, eight live Worlds, and Slides → World → Direct → Master are not complete.
- At the pre-package audit recorded by this matrix, the candidate renderer work was not yet packaged or installed. The then-installed `/Applications/Drift V2 Dev.app` was an older checkpoint and could not evidence the candidate; `/Applications/Drift.app` remained protected V1. Later receipts must name their exact source and artifact SHA rather than silently changing this historical statement.

### Grain rationale and limit

The current grain should be described as a **restrained real-time finishing plate**, not physical film simulation.

- The Codrops carousel study makes active z-order explicit and connects material response to carousel speed. The transferable rule is causality: visible physical or optical energy should follow canonical motion and focus, not free-running spectacle. Drift keeps that rule for deformation and future optical motion; grain remains its own documented finishing cadence. ([Codrops](https://tympanus.net/codrops/2023/04/27/building-a-webgl-carousel-with-react-three-fiber-and-gsap/))
- IPOL's physically based film-grain model uses stochastic geometry and Monte Carlo rendering, makes local grain density depend on image intensity, and can render at arbitrary resolution. Drift's bounded WebGL plate does not implement that physical process and must not claim equivalence. ([IPOL paper](https://www.ipol.im/pub/art/2017/192/))
- `glsl-film-grain` demonstrates monochrome 3D noise addressed by pixel resolution and frame, then recommends luminance-aware blending. Drift adopts only compatible real-time principles: monochrome multi-scale noise, drawing-buffer-aware scale, luminance weighting, and explicit frame identity. ([mattdesl/glsl-film-grain](https://github.com/mattdesl/glsl-film-grain))

Current shader truth: grain is a two-scale monochrome background plate; a luminance toe protects true black; amplitude is bounded and luminance-weighted; saved atmosphere seed and exact export-frame identity make it deterministic; output holds plates at an authored 12 fps cadence; Pause and reduced motion freeze it. It does not add grain to slide or protected-presenter pixels. Atmosphere grain, material microtexture, and future camera grain remain separate named owners.

## Full release scope

| Domain | Required V2 launch scope |
| --- | --- |
| Editorial | 4 cuts; 6 performances; 4 motion characters; continuous/24/18/12 fps pose cadence; 6 materially distinct handcrafted presets |
| Space and matter | 10 paths; Card, Paper, Silk, Gel; shared continuous-corner shell; crop/focal direction; bounded interaction and analytical export |
| Atmosphere | 5 families; 40 structural compositions; up to 20 approved palettes; 12 hero studies; deterministic recut; transparent bypass |
| Lighting | 6 primary public rigs; up to 6 individually approved specialist rigs; one analytical light/shadow system |
| Lens and optical craft | 4 primary global lens characters; clean bypass; shutter-aware blur; diffusion/soft focus; radial/motion-linked chromatic aberration; sparse coherent film wear |
| Portrait | At least 16 true vertical-travel 9:16 scenes: 2 per launch World, with both travel directions represented |
| Sound | Local provenance-verified CC0 corpus; Dry/Editorial/Organic grammars; deterministic event plan; one presenter-plus-Foley master; native AAC |
| Worlds and journey | 8 Worlds; Restrained/Directed/Fever; locks; deterministic non-compounding recut; A/B; undo/redo; receipts; Slides → World → Direct → Master |
| Mac and release | V1 document preservation; native file authority; accessibility; signed/notarised/stapled exact artifact; quarantined Gatekeeper and installed-app proof |

## Phase matrix

No phase graduates because its types, registry, or unit tests exist. Each exit gate needs artifact-level evidence.

| Phase | Required outcome | Decisive exit evidence | Current state |
| --- | --- | --- | --- |
| 0 — Re-establish truth | Freeze exact V1 source/artifact/install baselines and donor identities | Reproducible V1 visual/export/native baselines; no unknown P0/P1; exact donor evidence | **Partial.** Authority documents read; every ledger SHA resolves locally; selected donor source study recorded. Full current V1 foundation receipt is not re-proven here. |
| 0R — Portrait/optical research | Define transferable 9:16, optical, film-wear, tactile, and handcrafted-cadence rules | 30–50-source research ledger; 7 isolated 1080 × 1920 proofs; 16 scene charters; explicit creative approval | **Not at gate.** No compliant research ledger, complete seven-proof set, or approval receipt. |
| 1 — Project V4 | Add explicit V2 contract while preserving V1 pixels | Golden V1 fixtures; hostile/future failure isolation; deterministic V4 round-trip; explicit undoable upgrade | **Partial implementation.** Compatibility and V2 contract boundaries exist. Focused locks preserve hidden direction through unchanged hydration and media-only reconciliation, and ratio recut fails closed after custom direction. Complete command/receipt/lock/undo and the golden-pixel gate remain open. |
| 2 — Renderer/exporter | Make Project V4 and one frame evaluator sole live authority | No live legacy creative reads; preview/still/sequence/MP4 parity; presenter/alpha/cancel/resource proof in browser and packaged app | **First slice in progress.** V2 evaluator feeds one shared draw path. The canonical presenter preview clock has unit coverage and a 3/3 real-video browser repeat gate, but compatibility projection, dormant render domains, full export parity, and packaged-app evidence remain open. |
| 3 — Temporal direction | Live complete editorial and handcrafted motion language | All 4 cuts, 6 performances, 4 characters, 4 cadences, 6 presets; interaction convergence; seam and dense-read approval | **Partial foundation.** Lifecycle, tempo, repeats, cadence foundations, and one Editorial Drift slice exist; full launch collection does not. |
| 4 — Space and matter | Live ten paths and four material systems | Both axes/ratios/extremes finite; distinct material pixels; honest zeros; bounded pool; no leak | **Not at gate.** Spatial core exists, but ten-path live parity, materials, shell integration, and packaged evidence do not. |
| 5 — Analytical lighting | One light/shadow model with approved rigs and protection | Six primary rigs pass ratios/fixtures; bypass, presenter, alpha, attachment, seam, and performance proof | **Not at gate.** Donor source studied; no V2 lighting port or parity claimed. |
| 6 — Atmosphere Atlas | One procedural pass serving the full curated library | All 40 compile/render in packaged WebGL2; structural distinction; hero-12 taste review; alpha/reduced/seam proof | **Not at gate.** Registry/metadata foundations are not a live atlas. Donor source studied; no port or parity claimed. |
| 7 — Global lens | One optional scene-wide optical pipeline | Clean bypass equivalence; one output transform; alpha-correct edges; presenter protection; four approved profiles | **Not at gate.** Donor concept source studied; its numeric profiles are not proof of adequate optical behavior. |
| 7A — Portrait and optical craft | Integrate approved portrait scenes and researched optical motion | 16 distinct true vertical scenes; sharp resting hero; deterministic blur; credible focus/aberration/wear; motion atlas; packaged budgets | **Not at gate.** Editorial Drift ratio recipes are only composition foundations, not the required scene library or optical proof. |
| 8 — Unified sound | Deterministic recorded micro-Foley under narration | Provenance/hashes; preview/export decision parity; exact mixed track; cancellation; listening approval | **Not at gate.** Sound donors remain unstudied in this review and frozen-not-ported. |
| 9 — Worlds and journey | Hide system complexity behind eight authored starting points | Structural World distinction; lock/non-compounding/A-B/undo truth; four-ratio coverage; first-use export without Advanced | **Registry plus one recipe only.** Seven Worlds remain metadata-only; full journey is absent. |
| 10 — Convergence/RC | Prove whole product and exact distributable artifact | Combination/stress/chaos/accessibility/human review; exact-head and merge lanes; signing/notarisation/Gatekeeper/install receipts | **Not started for V2 RC.** No merge, production release, or V2 approval claim. |

## Cross-cutting requirements that never de-scope

- One Project V4 truth, one explicit authored clock, one render graph, one semantic event spine, and one output colour transform.
- V1 pixels remain unchanged until explicit V2 upgrade.
- Preview/export determinism; no wall-clock or previous-frame export authority.
- Honest zero/bypass for every effect.
- Correct linear colour ownership, premultiplied alpha, and transparent output.
- Protected presenter branch; no accidental material, light, or lens contamination.
- Local-first media and existing AppKit document/file authority.
- Cancellation cleanup, bounded resources, accessibility, reduced motion, and exact artifact readback.
- No WebGPU/TSL, React Three Fiber, GSAP, general physics engine, second renderer, second project model, or wholesale donor merge in V2.

## Mandatory gauntlet for every phase

1. State the exact claim and exclusions.
2. Define falsifiers before implementation.
3. Build the smallest coherent vertical slice across every affected boundary.
4. Run focused contract checks.
5. Run product checks: browser, packaged WKWebView, preview/export, migration, cancellation, and cleanup as applicable.
6. Inspect real pixels, audio, documents, exports, and installed behavior.
7. Attack extremes, hostile input, reduced motion, transparency, presenter, seam, context loss, stale callbacks, low memory, and repetition.
8. Run an independent taste/readability review.
9. Repair root causes without weakening assertions.
10. Rerun the exact artifact and record SHA, build identity, machine, OS, commands, and evidence paths.
11. Write a phase receipt with unknowns and exclusions.
12. Graduate only after two consecutive adversarial passes produce no accepted material improvement.

## Donor source-study receipt

All donor SHAs in `DONOR_LEDGER.yaml` resolve to local commits. This does not prove remote availability. Exact `git show <sha>:<path>` review was completed only for the selected files now listed in the ledger:

- PR 9: editorial cadence evaluator and its direct tests.
- PR 12: spatial evaluator, preview dynamics, analytical export motion, and continuous-corner shell.
- PR 14: lighting recipes/frame resolver and direct tests.
- PR 8: atlas records, directing model, and full-stage shader composition.
- PR 17: lens profiles, directing levels, command surface, and direct tests.
- PR 3: settings-history module only; its other optics/world/recovery material remains unreviewed.

Every donor remains `frozen-not-ported`. Source study proves only that exact files were inspected. It does not prove code quality, V2 integration, visual/listening parity, licensing completeness, tests ported, or public graduation.

## Honest planning range

After a stable V1 foundation and with disciplined parallel work:

- feature-complete internal beta: **roughly 4–6 focused weeks**;
- signed, documented, installed, human-approved release candidate: **roughly 6–9 weeks**.

These are planning ranges from the governing V2 plan, not promises. A failed visual, listening, migration, alpha, native, accessibility, or release gate extends the work. Current Editorial Drift progress is a meaningful renderer slice, not an almost-finished full V2.
