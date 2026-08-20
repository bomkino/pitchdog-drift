# Editorial cadence gauntlet

## Actual goal

Make flattened pitch-deck slides feel **edited, argued, and physically handled** rather than endlessly scrolled.

The test is not “does this resemble a particular publisher's skin?” The test is:

- does the viewer know what to look at;
- does each frame receive enough time to be understood;
- does movement explain a change in thought;
- does the composition return to real stillness;
- does the exported master preserve the pace approved in preview;
- does tactility support the material instead of advertising the renderer?

This branch studies a broad visual-explainer motion grammar. It does not copy a proprietary identity, typeface, palette, graphic package, or trademark.

## Research translated into product rules

### Visual evidence outranks decoration

Estelle Caswell's discussion of editorial motion emphasizes visual evidence, writing to what appears on screen, and restraint: a still image held for several seconds can be more powerful than a transition that contains no information.

Product consequence:

- cuts begin with reading rhythm;
- transitions are bounded;
- the densest cut is also the least theatrical;
- delivery warnings describe pace, not “energy.”

### Motion needs both position and velocity

WebGL carousel studies show the value of separating position from velocity so shader response can peak during travel and return to zero at rest.

Product consequence:

- spatial pose comes from deterministic distance;
- optical deformation comes from bounded normalized velocity;
- pause zeros velocity;
- direct manipulation changes visible editorial position rather than bypassing cadence.

### Depth, mood, and motion are coordinated signals—not one magic value

Contemporary WebGL gallery work treats depth, palette, and velocity as separate systems.

Product consequence:

- editorial cuts modify motion only;
- atmosphere, slide styling, presenter media, output, and accessibility remain the director's choices;
- the branch does not smuggle in another background or lighting system.

### Reduced motion removes non-essential movement without removing meaning

Platform guidance treats `prefers-reduced-motion` as a request to remove or replace non-essential motion, not a request to make the interface unusable.

Product consequence:

- automatic travel and animated atmosphere stop;
- Previous / Next remains available;
- hierarchy remains visible;
- reduced-motion export remains an explicit project setting independent of the previewing machine.

## The authored cadence

`src/engine/editorialCadence.ts` remaps continuous raw distance inside each slide stride.

The mapping is:

- monotonic;
- periodic by one exact stride;
- exact at positive and negative stride boundaries;
- finite at every accepted setting boundary;
- deterministic for a given distance and settings;
- independent of `requestAnimationFrame` frequency;
- invertible to the closest authored pose for direct manipulation.

### Phases

1. **Land / hold** — the source slide receives reading time.
2. **Carry** — smootherstep advances the argument.
3. **Focal punch** — depth and scale reinforce the incoming evidence.
4. **Settle** — a bounded hinge and shadow lag resolve.
5. **Rest** — geometry, optics, shadow, grain, background, and presenter state can become truly still.

### Pose cadence, not low-frame-rate output

Cut intensity blends continuous motion toward a stepped pose vocabulary. At the common `0.50 slides/s` Explainer Cut, 24 poses per stride produce approximately twelve visible pose changes per second.

The encoded master remains 24, 25, 30, 50, or 60 fps. Translation, focal pulse, hinge, and settle share the same authored pose state so the card does not slide smoothly while its material response stutters independently.

### Inverse mapping

Real hold regions make the raw timing map locally flat. Applying a pointer delta directly to raw time can therefore leave the card stationary before releasing it in a jump.

Editorial drag, wheel, and keyboard stepping now:

1. map raw position to the visible authored pose;
2. apply the user's distance in visible space;
3. invert the monotonic cadence map;
4. resume deterministic evaluation from the corresponding raw position.

The inverse uses bounded binary search and deterministic plateau centering. The local interaction benchmark resolves a target in roughly a fraction of a millisecond; accuracy and monotonicity are covered by unit tests rather than inferred from feel.

## Source deck versus virtual strip

The renderer may repeat assets to fill a large viewport. Those repeated meshes are implementation padding, not editorial content.

For Editorial cadence:

```text
one seamless loop = one source-deck pass
```

Consequences:

- two source slides remain a two-stride loop even when ten meshes fill the stage;
- source slide identity owns registration and grain;
- repeated virtual copies of the same source slide are materially identical;
- delivery analysis counts source slides;
- Close at cut tempo fits the source deck, not the mesh pool.

Legacy paths retain their existing virtual-track behavior.

## Preview and export share delivery pace

A mathematically closed export can still betray the preview.

Example:

- eight source slides;
- authored cut `0.50 slides/s`;
- one seamless loop;
- eight-second output.

The source deck requires sixteen seconds at the authored pace. An eight-second closure forces `1.00 slides/s`.

Editorial seamless preview now uses the same effective delivery speed as export. The Master delivery receipt still warns that the cut has been retimed, so parity does not become silent approval.

## User-facing cuts

Cuts are derived recipes. They are not persisted as a second source of truth and they are not theme cards.

### Explainer Cut

- `0.50 slides/s`
- horizontal
- 72% Beat hold
- 62% Cut intensity
- 18% Punch depth
- 4° Paper hinge
- 18% Optical bend

For thesis → proof and concise explanatory sequences.

### Paper Argument

- `0.34 slides/s`
- vertical
- 84% Beat hold
- 48% Cut intensity
- 26% Punch depth
- 6° Paper hinge
- 10% Optical bend

For presenter-led essays, notes, mood pages, and reflective treatments.

### Clean Data

- `0.62 slides/s`
- horizontal
- 54% Beat hold
- 34% Cut intensity
- 8% Punch depth
- 1.5° Paper hinge
- 4% Optical bend

For charts, timelines, diagrams, and small typography.

### Documentary Glide

- `0.28 slides/s`
- horizontal
- 78% Beat hold
- 22% Cut intensity
- 16% Punch depth
- 2.5° Paper hinge
- 8% Optical bend

For portraits, archive photography, locations, and image-led chapters.

Applying a cut preserves:

- stage and output dimensions;
- duration and frame rate;
- seamless and loop choices;
- autoplay and reduced-motion output;
- atmosphere;
- slide styling;
- pinned media and audio choices.

Axis, spacing, depth, and cadence may change. The engine reanchors the nearest source slide so the subject does not disappear when a cut is selected.

Manual motion edits produce **Custom cut** rather than leaving a misleading active preset.

## Delivery states

`src/editorialCuts.ts` analyzes the authored speed against source count and output duration.

- **Empty** — no source slides.
- **Still** — zero tempo.
- **Partial** — output ends before one complete source pass.
- **Complete, but open** — at least one pass fits; endpoint is not locked.
- **Closed** — complete source loops and pace match the authored cut.
- **Retimed** — closure forces a materially different pace.
- **Rushed** — effective delivery exceeds the `1.50 slides/s` director ceiling.

### Close at cut tempo

The repair searches one through six loops inside the supported three-to-thirty-second range.

Priority order:

1. preserve authored speed;
2. preserve requested loops when feasible;
3. add loops for tiny decks rather than creating dead air;
4. reduce impossible requested loop counts before changing pace;
5. recommend chapters when one readable pass cannot fit.

Duration is rounded to one decimal for a usable director control. The resulting pace must remain within the delivery tolerance or the receipt continues to report Retimed.

## Material behavior

### Stable source-owned grain

Slide grain derives from local UV, source-slide identity, and size. It does not use wall-clock time.

A held or repeated source slide therefore keeps the same surface.

### Bounded paper registration

Registration is deterministic per source slide. Paper hinge controls its amplitude so Beat hold has no spatial side effect.

### Tactile shadow lag

During an editorial carry, the shadow receives a small axis-aware lag and transient tightening. The response is bounded by Paper hinge and returns exactly to the authored resting shadow during holds.

Clean Data remains restrained because its hinge is small.

### Presenter isolation

Pinned images and video receive:

- zero strip velocity;
- zero distortion;
- zero paper grain;
- independent geometry and shadow;
- export-frame precedence over live preview media.

## Pause contract

Pause is a composition state, not a suggestion to autoplay.

It zeros residual velocity and freezes:

- carousel position;
- optical deformation;
- tactile shadow response;
- elapsed atmosphere phase;
- presenter playback.

The animation loop may continue drawing for renderer health and resize response, but repeated frames must remain perceptually identical within GPU readback tolerance.

## Director controls

| Control | Editorial meaning |
| --- | --- |
| Tempo | Source slides delivered per second |
| Beat hold | Time weighting near each landing |
| Cut intensity | Continuous-to-stepped pose blend |
| Punch depth | Focal versus peripheral separation |
| Paper hinge | Card rotation, stable registration, and shadow character |
| Focal emphasis | Scale lift for current evidence |
| Optical bend | Velocity-linked material deformation |
| Drag weight | Direct-manipulation distance |
| Seamless export lock | Complete source-deck loops |
| Loops per master | Number of source passes |
| Reduced-motion master | Explicit frozen output timeline |

## Compatibility

No persisted field was added.

- schema remains version 1;
- existing `ribbon` projects remain `ribbon`;
- `editorial` is accepted by settings validation;
- unknown flow values remain rejected;
- cuts are detected from current values rather than saved as competing state.

## Gauntlet gates

### Mathematical

- zero-state identity;
- monotonic travel over positive and negative distance;
- exact stride endpoints;
- exact complete-source-loop closure;
- finite output at every control boundary;
- bounded pulse, settle, opacity, rotation, scale, and shadow response;
- cadence inverse round-trip;
- plateau escape under direct manipulation;
- stable source-owned registration.

### Delivery

- source deck, not virtual padding, defines Editorial loops;
- seamless preview and export share effective speed;
- Partial/Open/Closed/Retimed/Rushed classification;
- tiny-deck loop increase;
- impossible-loop reduction;
- chapter recommendation above maximum readable duration;
- no repair mutation outside motion delivery and duration.

### Renderer

- pause zeros velocity;
- paused elapsed time does not advance;
- background phase freezes;
- presenter playback freezes;
- repeated source copies share material identity;
- pinned presenter remains free of track grain and distortion;
- shader colour-space encode remains last;
- no reversed-edge `smoothstep`.

### User journey

- cut cards are keyboard-operable native buttons;
- active cut uses `aria-pressed`;
- full descriptions remain available through `aria-describedby`;
- manual editing reports Custom cut;
- delivery status is announced politely;
- repair consequence is named in the button;
- duration supports tenths of a second;
- reduced-motion preview preserves deliberate stepping.

### Browser

The branch's Chromium authority must verify:

1. choose Explainer Cut;
2. see Partial delivery for the eight-slide starter at eight seconds;
3. repair to one loop / sixteen seconds;
4. receive Closed at cut tempo;
5. customize Paper hinge and leave the preset state;
6. Pause and observe stable sampled pixels over time;
7. enable OS reduced motion and observe no automatic carousel or background drift;
8. use Next slide and still receive deliberate hierarchy;
9. record no page or console errors.

GPU screenshots are compared through downsampled luma tolerance rather than fragile encoded-file hashes. The tolerance catches material drift while allowing harmless subpixel readback variance.

### Human review

Automation cannot decide whether an edit is good.

Review at minimum:

1. sparse title slides;
2. dense charts and tables;
3. portrait photography;
4. archival images with varied aspect ratios;
5. vertical and horizontal masters;
6. pinned presenter on and off;
7. transparent and opaque backgrounds;
8. 24, 30, and 60 fps output;
9. one-slide, two-slide, eight-slide, and long decks;
10. seamless endpoints at 400% zoom;
11. Pause on the densest frame;
12. OS and explicit output reduced motion.

Reject a recipe when the transition is more memorable than the evidence.

## Deliberate boundaries

- Flattened slides do not expose internal text or chart layers. Drift choreographs frames; it does not pretend to animate baked-in typography.
- No sound asset or sound engine is added. Future sound should derive cues from the same cadence evaluator.
- No new background family, lighting system, physics engine, or post-processing stack is added.
- No external runtime dependency is added.
- No brand clone or affiliation is claimed.

## Verification commands

```bash
npm run check
npm run test:e2e
```

A clean pull request must also contain no temporary payload fragments, workspace-snapshot workflow, build output, Playwright traces, or local benchmark artifacts.
