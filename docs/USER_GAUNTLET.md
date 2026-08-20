# User gauntlet

Drift is not finished when the controls work. It is finished when a creator can make a credible cut, understand it, revise it, and trust the master.

Run these loops from a clean browser profile with the bundled study slides, then repeat the visual loops with a non-confidential real deck. Do not tune only against Drift's own demo material.

## 1. First cut

**Setup:** open Drift without reading the README.

**Pass:**

- The next useful action is visible without opening every panel.
- A creator can move through **Slides → World → Direct → Master**.
- One authored world already looks intentional before expert tuning.
- Undo returns one human decision, not one pointer event.
- Search accepts outcome language such as “variation”, “before after”, “social safe”, “output”, and “undo”.

**Reject:** the creator must understand shader names, renderer layers, storage internals, or export codecs before making a cut.

## 2. Authored-world audition

Audition every world at portrait and landscape output ratios.

**Pass:**

- The world changes motion, depth, framing, surface, atmosphere, and glass as one direction.
- The focal slide remains the work; effects do not become the subject.
- Worlds remain recognisably different after replacing the demo slides.
- Paused reduced-motion output is pixel-stable.
- No world collapses into clipped black, clipped white, regular procedural tiling, or generic gradient fog.

**Reject:** two worlds differ mainly by colour, or one only works because its demo slide matches its palette.

Automated companions:

- `tests/worldAuthorship.test.ts`
- `e2e/worldVisualContract.e2e.ts`
- `e2e/worldExposureContract.e2e.ts`
- `e2e/staticOpticsDeterminism.e2e.ts`

## 3. Readability pressure

Use a slide with small type, a dense table, a face near the crop edge, and a full-bleed photograph.

**Pass:**

- The centre of attention stays sharper than the periphery.
- Directional smear follows movement rather than coating the frame.
- Chromatic split remains bounded and centre-protected.
- Clean-lens comparison reveals the optical contribution and restores the exact directed frame.
- Warnings describe risk without pretending to understand slide semantics.

**Reject:** bloom softens the entire deck, grain shimmers when paused, or Clean lens destroys the current direction.

## 4. Presenter truth

Test a pinned image, a silent video, and a video with audio.

**Pass:**

- Presenter mode is off by default.
- Protected mode stays legible while the moving world receives optical treatment.
- Treated mode deliberately joins the same glass.
- Trimming, start offset, gain, mute state, and frame placement survive project save/load.
- Unsupported high-frame-rate audio combinations fail before export work begins.

**Reject:** preview silently falls back to a wall-clock video frame during deterministic export.

## 5. Output truth

Test portrait MP4, landscape MP4, transparent still, transparent sequence, seamless loop, and cancellation followed immediately by another export.

**Pass:**

- Transparent H.264 fails before a file picker opens.
- Preview and export evaluate the same scene.
- Poster stills use the chosen poster moment.
- Seamless motion closes on an exact cycle.
- Cancelled work is aborted or neutralised.
- A completed export reads **Verified** only after container and decoded-frame checks pass.
- A stale timer from an earlier export cannot erase the next export's progress.

**Reject:** the UI says complete because bytes were written.

## 6. Source and recovery

Import mixed ratios, low-resolution slides, a corrupt image, duplicate names, a large project, and a project bundle with a bad hash.

**Pass:**

- Mixed ratios and insufficient source resolution are named.
- Drift suggests a repair without silently rewriting the deck.
- Corrupt or unsupported files fail locally and visibly.
- Autosave, portable project export, and hash verification preserve source truth.
- WebGL context loss pauses rendering without risking project data.
- DOM fallback keeps media and project management usable while refusing fake cinematic export.

**Reject:** a friendly local tool becomes a memory bomb or hides a missing asset behind a placeholder master.

## 7. Access, restraint, and privacy

Run keyboard-only, screen-reader, reduced-motion, narrow-window, and touch checks.

**Pass:**

- Every essential action has an accessible name and visible focus.
- Dialog focus is contained and restored.
- Motion preference removes temporal instability.
- Guides remain preview-only.
- No analytics, media upload, remote font, hidden API, or diagnostic payload contains slide pixels, filenames, hashes, or project text.

**Reject:** accessibility exists only in markup while the real destination remains unreachable.

## Release gate

Before review-ready status:

1. `npm run check` passes from a clean checkout.
2. `npm run test:e2e` passes with no retries, skips, page errors, or console errors.
3. All authored worlds pass the visual atlas on real deck material.
4. README, registry counts, PR copy, and QA receipt agree.
5. Temporary delivery workflows and generated evidence are absent from the review tree unless they are part of the maintained product.
6. The branch is compact enough to review as a product change, not an archaeological dig.
