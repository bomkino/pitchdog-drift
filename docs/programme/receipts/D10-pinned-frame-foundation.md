# D10 evidence receipt — complete optional pinned-frame source contract

Date: 27 August 2026

Repository: `bomkino/pitchdog-drift`

Start: `codex/d10-pinned-frame-foundation@646699d95f18704086ae341784c64da655ebaba7`

Source commits:

- story range, layer, evaluation, renderer, and persistence: `00ce5902e04f24f9b304a9008ce7842658e00168`
- presenter-video decode/audio export timing: `84f9388cbe238eebdeb05faf24ac9d01a01f5392`

Final source tree: `69c3bfe582c513c5fa6d8cc3eedc2cca8f26256a`

## Ticket boundary

- Destination: complete the existing optional Project V4 pinned-frame source
  contract by adding only missing story-range and compositing-layer truth.
- Public seams: `PresenterSettingsV4`, Studio projection/validation,
  `resolvePinnedFramePresentation`, `evaluateProjectFrame`, existing
  `CinematicCarousel`, existing `exportStudio`, delivery receipt, and portable
  `ProjectStore` bytes.
- Demo at causal seams: author one pinned still/video range and layer, evaluate
  the same story time as preview and explicit export frame, verify exact source
  clock and visibility, then save/export/import/validate the complete Project.
- Exclusions: no new pin model, evaluator, renderer, exporter, sink, verifier,
  platform bridge, native target, package, release, or publication.

## Demonstrated

- Default Project V4 remains pin-off with no selected media, above-slide layer,
  story start zero, and null end meaning through the master.
- Old Project V4 presenter objects without the two additions normalize to those
  defaults; V3/legacy migration remains explicit and deterministic.
- Existing selection, pinned-only/moving-and-pinned membership, normalized
  position, width/aspect, source/custom ratio, safe inset, contain/cover,
  focal point, matte, radius/smoothing, border, shadow, lens treatment, mute,
  gain, trim, and start values remain the same Project domain.
- `endAt` is exclusive and must follow `startAt`. Null follows current master
  duration. Evaluation returns exact visible state, layer, bounded story range,
  and source time `trimStart + storyTime - startAt`.
- Preview and explicit frame-index export calls return equal pinned-frame truth
  for the same time. The engine uses that result rather than a wall-clock pin
  decision; preview video seeking and playback use the same source clock.
- Safe pins may be above or below moving slides. Protected versus through-lens
  remains independent. A protected below-slide pin uses separate background and
  transparent slide optical passes so lens treatment does not flatten or
  override layer intent.
- MP4, PNG still, and PNG sequence paths pass the locked presenter timing into
  the existing export implementation. Only visible story frames request decoded
  video samples. Presenter-only or mixed audio is rendered onto the full master
  at the authored story start, from the trimmed source, for the authored range;
  outside it remains silence.
- Delivery and export-plan facts expose layer and resolved story range. Portable
  bundle export/import preserves the complete pinned presenter and independent
  lens treatment exactly.

## Commands and results

- Broad pinned-frame focused run: 12 files / 109 tests passed.
- Final export/pin focused run: `npm test -- --run tests/pinnedFramePresentation.test.ts tests/exportStudio.test.ts tests/appPresentation.test.ts` — 3 files / 44 tests passed.
- Full source gate: `npm run check` — typecheck passed; 80 files / 541 tests
  passed; macOS source/import/hardening/arm64 contracts passed; production Vite
  build passed with 242 modules.
- Development build: `npm run build:v2-dev` — passed with 242 modules.
- `git diff --check` — passed.

Both Vite builds emitted the existing large-chunk advisory. No dependency,
native binary, package, or distributable was added.

## Fixed-point review

### Spec

- Pass: source selection, position, size/aspect, safe anchoring, fit/crop/focal,
  corner/matte/edge/shadow, layer, story range, lens treatment, audio intent,
  portable save/reopen, and deterministic preview/scrub/export evaluation now
  remain one Project V4 contract.
- Pass: story range is frame-stable and end-exclusive; explicit frame identity
  still owns export time. Pin-off remains the default.
- Pass: existing evaluator/renderer/export/audio/project-store paths were
  deepened. No parallel implementation was introduced.
- Deferred: rendered pixel, motion, encoded alpha/audio, focus/layout, package,
  and human taste claims require real runtime evidence.

### Standards

- Pass: finite/range validation, old-V4 normalization, explicit V3 migration,
  source coverage checks, decoder watchdogs, audio coverage failure, exact
  output-frame mapping, and portable archive validation fail closed.
- Fixed during review: the former `Layer` label for safe/in-scene anchoring was
  corrected; real layer controls appear only for safe anchoring. Presenter
  preview and every export sink were moved onto the same trimmed story clock.
- No source-blocking D10 finding remains in the final source tree.

## State and gaps

Highest state: **built** production and `v2-dev` web bundles. D10 is
**source-ready**, not runtime-complete or accepted.

No browser was controlled. No preview image, MP4, PNG sequence, audio file, or
other output artifact was generated or inspected. No packaged Apple-Silicon or
Garuda target was built, installed, or launched. No visual, motion, audio,
accessibility, or human acceptance is claimed. No merge, push, release,
publication, signing, notarization, installation, or credential use occurred.

D03 real-browser Interface Scale evidence and D00/D01 exact Apple-Silicon
package/document evidence remain separate acceptance gates.

## Exact resume

Resume `bomkino/pitchdog-drift` on local branch
`codex/d10-pinned-frame-foundation` from the D10 evidence commit following
source `84f9388cbe238eebdeb05faf24ac9d01a01f5392`. Inspect the clean worktree,
implementation ledger, D10 receipt, D03 receipt, and D05 receipt first. D10 is
source-ready. Continue only a dependency-ready non-Mac runtime/documentation
frontier; do not duplicate the pin model, evaluator, renderer, exporter, audio
engine, or Project schema. Claim no browser, artifact, packaged-target,
accessibility, or human acceptance without exact evidence.
