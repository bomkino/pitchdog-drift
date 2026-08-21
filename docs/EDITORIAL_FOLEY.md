# Editorial micro-Foley language

## Scope

Editorial is Drift's richer tactile direction for motion-graphics storytelling. It is inspired by a craft principle visible in premium visual explainers: an animation feels grounded when its important movement is accompanied by a materially plausible sound, precisely at the moment the visual meaning changes.

This is **not** an attempt to copy Vox's recordings, mixes, branding, music, templates, or proprietary production files. No Vox audio was sampled, extracted, transcribed, or bundled. The comparison is limited to a general editorial method:

- use literal physical sound instead of generic interface bleeps;
- attach sound to semantic changes, not every rendered frame;
- keep movement dry, close, and tactile;
- use small layers to imply material detail;
- leave deliberate silence around gestures;
- make narration remain primary.

The implementation is designed specifically for Drift's carousel, drag, release, settle, control, success, and failure events. It is not a general-purpose sound library for every kind of infographic animation.

## The grammar

Editorial recipes divide one audible gesture into no more than three perceptual roles.

### 1. Body

The body is the literal physical action: a card moving, cloth shifting, a page turning, a book being placed, or a dry contact. It carries most of the event's energy and begins exactly at the semantic cue time.

### 2. Fibre

Fibre is a quieter secondary texture from the same material family. It begins roughly 10–28 milliseconds after the body, changes take and stereo position deterministically, and remains low enough to be felt as surface detail rather than heard as a separate effect.

This offset is intentionally short. A longer delay would read as an echo or a second action; a zero delay would make the layers phase together like a synthetic preset.

### 3. Contact

Contact is a restrained punctuation: a small placement, settle, or mechanical detail. It is used only when the visual event benefits from a final point of emphasis.

Passages receive contact on one deterministic beat out of three. The two intervening passages retain body and fibre only. This prevents the system from putting a click or thump on every slide and preserves silence as part of the rhythm.

## Cue recipes

| Semantic event | Editorial recipe | Intent |
| --- | --- | --- |
| Passage | body + fibre; contact on one beat in three | A slide crosses visual focus with texture, not a stock whoosh |
| Grab | body + fibre | Hand meets material; no repeated friction loop |
| Release | body + contact | The held object leaves the hand and gains one small endpoint |
| Settle | body only | One quiet landing after motion genuinely rests |
| Control | body only | A dry existing-object response, never hover chatter |
| Success | body + contact | Completion receives a modest physical confirmation |
| Failure | body only | Failure remains legible without alarm-like synthesis |

Studio, Cinema, and Paper remain exactly one layer deep. Selecting Editorial changes material complexity; it does not silently rewrite the existing directions.

## Timing and determinism

The recipe input is entirely saved or derived project state:

- palette;
- semantic cue;
- project seed;
- absolute passage sequence;
- primary take decision;
- authored gain;
- playback rate;
- stereo position.

From that input, `buildSonicRecipe()` derives every layer's:

- cue family;
- source take;
- delay;
- gain;
- playback rate;
- pan;
- perceptual role.

The function is pure. The same input returns the same recipe in live Web Audio preview and offline export. No wall clock, random number generator, frame rate, network response order, or rendered pixel is allowed to change the sound.

Passage inclusion remains palette-independent. Changing Studio to Editorial changes texture, not the placement rhythm the editor already directed. Increasing Density remains monotonic: it adds passages without removing previously included ones.

## Acoustic limits

The system deliberately refuses unlimited layering.

- Maximum recipe depth: **three layers**.
- Global live voice ceiling: **eight voices**, including all layers.
- Editorial passage energy before source treatment is capped at approximately one authored unit across all layers.
- Layer delay is capped at 120 milliseconds, with actual passage detail substantially tighter.
- Pan is bounded to the existing tactile range.
- Playback rate remains within the existing natural-material bounds.
- The same dynamics-compressor contract is used in preview and offline rendering.
- The export bed is exact-length, 48 kHz, stereo PCM before AAC encoding.

These bounds keep the result organic without creating a louder, wider, or busier mix merely because Editorial has more detail.

## Source and licence boundary

Editorial currently uses the same 23 untouched recordings as the audited tactile system. They come from pinned Kenney CC0 packs and are committed locally as WAV files.

The repository preserves:

- the exact upstream revision and path;
- SHA-256 and Git-blob verification;
- original CC0 notices;
- byte length and material description;
- non-destructive trim and gain treatment metadata.

The original WAV bytes remain unchanged. Treatment is applied at playback and render time. Production emits each recording as a separately hashed same-origin asset; audio is not inlined into JavaScript and is not fetched from a third-party sound host at runtime.

No new sound is included merely because it sounds interesting. Pencil writing, camera shutters, tape, stamps, map folds, and typewriter details should be added only when Drift gains a visual event that semantically requires them, and only with equally strong provenance and acoustic treatment.

## Narration

Editorial Foley is subordinate to spoken explanation.

When presenter speech is included, Drift renders speech and Foley into one continuous stereo master before AAC encoding. Speech stays centred. Lateral material movement remains stereo. Foley survives genuine narration packet gaps, but the under-voice control can reduce it while speech is active.

Editorial does not add music or continuous ambience. Silence between gestures leaves room for the voice and prevents the texture from becoming a second narrator.

## Accessibility and privacy

- Existing silent projects remain silent after migration.
- Export Foley remains off by default.
- Preview begins only after trusted user input.
- Audition remains possible while ongoing preview is muted, without changing the saved mute state.
- All material choices and level controls are keyboard reachable and labelled.
- Sound is supplementary; visible state does not depend on hearing it.
- Runtime audio requests remain same-origin.
- A failed local decode remains retryable rather than poisoning the session.

## Verification contract

The Editorial experiment is not considered complete merely because a radio button renders.

Static and unit tests cover:

- schema validation and persistence;
- all four material directions;
- unchanged single-layer behavior for Studio, Cinema, and Paper;
- deterministic body/fibre/contact recipes;
- sparse contact spacing;
- finite gain, delay, pitch, pan, and voice bounds;
- complete cue dependency declaration;
- unchanged editorial rhythm when material changes;
- local treatment and provenance coverage.

Real-browser tests cover:

- a balanced two-by-two material selector;
- persistence after local project reload;
- absence of third-party runtime requests;
- exact 48 kHz stereo offline rendering;
- bit-stable repeated PCM rendering;
- finite and unclipped output;
- audible stereo side information;
- a real three-layer passage;
- MP4 encoding with one AAC sound-design track;
- AAC decode/readback around the layered passage;
- retained audibility and stereo information inside the finished container.

The experiment remains a draft and should not be merged solely on aesthetic expectation. The test receipt establishes technical integrity; final editorial judgment still requires listening against representative Drift projects with and without narration.
