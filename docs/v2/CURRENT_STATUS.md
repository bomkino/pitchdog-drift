# Drift V2 current status

Updated: 22 August 2026

Branch: `codex/v2-directors-cut`

Committed working base: `c5e3bc6d34983c886df9d9bcdaa726ec862f5941`

Frozen public V1 base: `5fd145207235884790ba071c5d84bc3876ff4989`

Latest exact package, installation, and GitHub evidence: [23 August installed checkpoint receipt](INSTALLED_CHECKPOINT_2026-08-23.md), implementation source `dac20dd900c6d630340de727dba341a4d2351797`.

## Outcome in the pre-package candidate

The candidate source contains the first live **Editorial Drift `drift-v2/1` renderer slice**. It is deliberately enabled by default only under the isolated V2 development identity. Release/V1 startup remains on `drift-v1-compat/1`, and an imported compatibility project stays there until Editorial Drift is explicitly applied in V2 Dev.

For the V2 slice, validated Project V4 data enters one pure explicit-time evaluator, then one Project V4 adapter, then the existing Three.js/WebGL2 draw graph. Preview, requested PNG stills, and PNG sequence frames use that same evaluation and draw path. A sequence frame owns time as `frameIndex / fps`; preview and still callers supply an explicit time without inventing a frame identity.

This is meaningful renderer work, not the complete curated-donor V2. `StudioSettings` projection is still a compatibility bridge into parts of the draw graph. One World is authored; the other theme cards remain V1 studies. Materials, lighting, atmosphere atlas, global optics, sound, complete command/receipt/lock/undo authority, and the full Direct journey are not live V2 systems.

The [vertical-slice contract](VERTICAL_SLICE.md) defines the narrow promise. The [requirement and phase matrix](V2_REQUIREMENT_PHASE_MATRIX.md) maps it against the full launch scope. The [donor ledger](DONOR_LEDGER.yaml) records source study only; no donor capability is claimed ported or at parity.

## What the current source implements

- Project V4 accepts both `drift-v1-compat/1` and `drift-v2/1`; V1/V3 migration remains compatibility-first.
- Fresh V2 Dev projects begin with the authored Editorial Drift 9:16 recipe. Applying Editorial Drift is the explicit upgrade transaction for an existing compatibility project in V2 Dev.
- One V2 evaluator owns lifecycle, body tempo, repeats, pose cadence, semantic events, spatial placement, reduced motion, ordered media identity, and deterministic frame diagnostics.
- The pinned-only image remains in Project V4 media identity but is removed from the moving track.
- Preview, still, and sequence rendering converge on `CinematicCarousel.renderVisibleItems`; stills preserve requested time, while sequences reject a time that conflicts with their frame index.
- Editorial Drift has authored recuts for 9:16, 4:5, 1:1, and 16:9. Supported ratio changes recompose the World recipe rather than stretching or cropping the previous one.
- Ratio recognition is proportional rather than tied to one pixel size: scaled forms such as 2160 × 3840 remain authored 9:16, while an arbitrary ratio becomes Custom. Automatic recut fails closed unless the surviving Editorial recipe references and fingerprints still prove that the project is safe to recompose.
- Hydrating or re-saving an unchanged Project V4 tuple is lossless even when current controls cannot expose all authored values. Media-only reconciliation can add or remove assets without flattening dormant card, atmosphere, lighting, presenter, or per-slide direction.
- Presenter preview uses the authored master clock as authority while allowing ordinary video delivery to remain decoder-driven. It corrects real drift and master wraps, lands frozen states only after the seek has settled, and holds an under-length source on its last decodable frame rather than inventing a loop.
- The stage preview fits both dimensions together, preserving the authored canvas ratio instead of letting independent CSS clamps distort wide compositions.
- V2 pin avoidance is local to the collision neighborhood in both transport axes. Far-away cards retain their authored scale; approaching cards move into the clear cross-axis lane.
- Small edge fragments are hidden, then eased into visibility as enough of a card enters the physical stage.
- `composition.alphaMode: opaque` now clears to an opaque black matte through entry and exit fades; transparent output still clears to alpha zero outside content. This change is V2-only.
- Slide border defaults remain off. Grain remains a restrained, deterministic, background-only finishing plate held at an authored 12 fps cadence, not a claim of physical film simulation.

## Evidence available before packaging

At the pre-package evidence freeze, the combined candidate passed `npm run check`: TypeScript, 280/280 unit and contract tests across 37 files, the native/source guards, and the V1 production Web build. The final uninterrupted real-browser suite passed 31/31 journeys after repairing a stale stage-layout observer race and making reusable controls uniquely addressable; that suite covered Project V4, renderer/export behavior, native-import races, recovery, WebGL fallback, alpha, accessibility, reduced motion, cancellation, and resource cleanup. The repaired stage path also held for five consecutive focused browser repetitions, while the corrected native admission, export lifecycle, and reduced-motion checks held for three consecutive repetitions each.

Focused evaluator, stage-geometry, pin-composition, shader/alpha, projection, World transaction, scaled-ratio, interaction-loop, and presenter-clock locks remain green. A real Chromium/WebGL2 pixel probe held opaque alpha at 255 at entry start, mid-entry, and entry end, while the equivalent transparent empty composition remained alpha zero. The real-video presenter journey passed three consecutive focused repetitions, covering running alignment, master wrap, pause, reduced motion, export freeze, resume, and independent slide-pin ownership. Full positive and negative deck-loop gestures returned byte-identical canvas hashes, proving that accumulated interaction wraps without emptying or flattening the finite card pool.

Manual browser inspection covered authored 9:16, 16:9, protected-pin, and scaled 2160 × 3840 compositions at 1600 × 1000 viewport size. Those views showed intact ratios, restrained background-only grain, border-free slide defaults, and intentional pin routing. This is meaningful visual evidence, but not creative approval or a substitute for the packaged and installed-app matrix.

## V2 CI and artifact boundary

The candidate adds a dedicated V2 development job to the existing macOS workflow. The two V1 jobs and every V1 release lane remain intact. The new job builds the V2 browser application, builds and verifies the isolated universal `Drift V2 Dev.app`, runs the packaged WKWebView matrix through the existing fail-closed scripts, and uploads a zipped development app with checkout, bundle-source, matrix, and SHA-256 evidence. Defining the job is not a CI pass or an uploaded artifact; neither exists until the workflow runs green on committed remote source.

Pull-request and manual evidence have deliberately different scope. A pull-request run checks GitHub's synthetic `refs/pull/<n>/merge` commit; its app names that tested merge SHA, while its receipt separately records the feature-branch head. It proves proposed integration, not exact feature-head CI. Because the macOS workflow already exists on the default branch, it can be manually dispatched against a selected feature branch. That job accepts only a branch ref and asserts that the checkout equals the immutable event SHA, so a green `workflow_dispatch` run proves that exact selected branch head only. Neither lane proves merge to `main`, installation, Developer ID signing, notarisation, release, publication, or creative approval.

## Pre-package gate snapshot

This table records the state immediately before the candidate implementation commit. It is intentionally historical; later packaging, installation, push, or CI receipts must name their exact source SHA rather than rewriting this snapshot by implication.

| Gate | Current state |
| --- | --- |
| Exact V1 source public on `main` | Verified at frozen base; not changed by the candidate |
| Installed `/Applications/Drift.app` | Preserved and outside V2 mutation scope |
| Live `drift-v2/1` evaluator | Implemented in the V2-first-slice candidate |
| V2 Dev authored default | Implemented for fresh V2 development startup only |
| Compatibility-project upgrade | Explicit Editorial Drift application in V2 Dev; no silent V1 migration |
| Preview/still/sequence convergence | One evaluator and draw path; full automated source and browser suites pass |
| Lossless Project V4 hydration | No-op, media-only, and hostile round-trip locks pass in the full source suite |
| Canonical presenter preview clock | Unit locks, focused real-video journey 3/3, and full browser suite pass; packaged-app parity pending |
| Authored ratio recognition and recut | Scaled 9:16, 4:5, 1:1, and 16:9 resolve correctly; recut fails closed after custom direction |
| Horizontal and vertical composition | Implemented for the first slice; full hostile visual matrix pending |
| Protected pin, stage ratio, edge reveal, opaque alpha | Source and browser locks pass; key manual browser views inspected; packaged-app visual/export review pending |
| Eight live authored Worlds | Not implemented; one V2 World plus five compatibility studies |
| Forty live backgrounds | Not implemented; metadata foundation only |
| Complete V2 renderer domains and Direct journey | Not implemented |
| Full candidate test suite | Green at the evidence freeze: `npm run check`, 280/280 source tests, and 31/31 real-browser journeys |
| Clean source commit | Not yet created at this pre-package snapshot |
| Exact-SHA V2 Dev package from this source | Not built |
| V2 CI/package job | Defined in the candidate; not yet run or evidenced remotely at this snapshot |
| `/Applications/Drift V2 Dev.app` matching this source | Not installed; the existing app is an older checkpoint |
| Feature branch pushed | Candidate not yet pushed at this snapshot |
| Exact-SHA CI | Not run for this source |
| Merged to `main` | No |
| Developer ID signed, notarised, stapled, released, or published | No |

## Installed-checkpoint history

The [23 August installed checkpoint receipt](INSTALLED_CHECKPOINT_2026-08-23.md) proves exact source `dac20dd900c6d630340de727dba341a4d2351797` through source, browser, package, `/Applications` installation, and branch-selected GitHub CI gates. It separately records the locked-screen limit and the product breadth still outside this slice.

The [installed checkpoint receipt](INSTALLED_CHECKPOINT_2026-08-22.md) remains valid only for source `b7bb5a520a23755306bf2f07656f604fd90b7b65`. At this pre-package snapshot, `/Applications/Drift V2 Dev.app` represented that older isolated checkpoint. Its package and installed matrices cannot evidence the candidate renderer, pin, stage, edge, or alpha changes described above.

## Safe user boundary

Keep using `/Applications/Drift.app` for real projects. It remains the production document app and has not been replaced or modified by this V2 work. Treat `/Applications/Drift V2 Dev.app` as an older disposable visual/export beta until a clean exact-SHA candidate is rebuilt, verified, and installed.

Do not merge or advertise this checkpoint as “V2 complete.” Commit, package, install, push, exact-SHA CI, merge, signing, notarisation, release, publication, and human approval remain separate gates.
