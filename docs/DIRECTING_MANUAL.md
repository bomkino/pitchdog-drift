# Directing a deck in Drift

Drift works best when treated like a tiny edit suite, not an effect generator. The goal is not to make every frame move. The goal is to decide what the movement should make the audience feel while the deck remains readable.

## The shortest useful path

1. Replace the study slides with the deck.
2. Put them in the order the audience should encounter them.
3. Open **DIRECT**.
4. Choose one audience effect.
5. Choose one rhythm.
6. Choose one master shape.
7. Check the actual master pace.
8. Export a still before committing to a long render.
9. Export the final master.

Three choices should produce a coherent first result. The complete inspector remains available for the last ten percent.

## 1. Prepare the deck

### Use finished slide images

Drift directs pixels. It does not reflow deck typography. Export slides from the design tool at a consistent aspect ratio and enough resolution for the intended master.

For a 1080-pixel-wide social master, a 1920 × 1080 slide is normally sufficient. Larger source images can help when the slide is cropped or pushed close to camera, but oversized images increase decode and GPU pressure without creating detail the output cannot hold.

### Order is editorial

The carousel is continuous, but the sequence still carries meaning. A practical order often moves through:

- orientation;
- escalation;
- a strong central reveal;
- emotional or evidentiary development;
- a closing image that can meet the opening image again.

A seamless loop is not merely a technical seam. The final-to-first relationship is part of the edit.

### Keep text honest

Motion cannot rescue an overcrowded slide. If a viewer needs four seconds to read the slide, a one-slide-per-second master is not cinematic; it is hostile.

## 2. Choose the audience effect

The intent moves are starting sentences, not immutable templates.

### Quiet Reveal

Use when the work should appear more confident than the interface. Low optical energy, generous scale, and a long vertical breath.

### Human Warmth

Use for relationships, family, romance, and character intimacy. Frames stay close; the lens softens without making faces vague.

### Clean Evidence

Use for documentaries, proof, case studies, archival claims, and work where decoration would weaken trust.

### Road Story

Use for travel, movement, geography, youth, and memory connected to place.

### Slow Dread

Use when the audience should feel pressure before they understand its source. Check typography carefully: horror is not permission to make the deck illegible.

### Archive Pulse

Use for history, biography, found images, and cultural memory. It introduces material instability without applying a generic sepia costume.

### Electric Push

Use for music, fashion, nightlife, and performance. This is deliberately energetic; the master check should remain open while tuning it.

### Open Water

Use for contemplation, grief, nature, distance, and interior scale.

### Daylight Wit

Use for comedy, optimistic work, and sequences where clarity must arrive quickly enough to land a joke.

### Presenter Runway

Use when a stable speaker needs a clean lane beside the moving deck. It prepares the composition but does not enable or invent presenter media.

## 3. Shape rhythm

The four rhythm moves alter the high-leverage pace controls together.

- **Hold:** almost still. Best for sparse sequences and large, decisive images.
- **Breathe:** unhurried editorial movement.
- **Glide:** the general-purpose confident pace.
- **Surge:** energetic but still below the editor's extreme range.

Maximum speed remains available in the advanced inspector. It is not presented as the default definition of excitement.

## 4. Understand seamless pace

This is the easiest place to lie to yourself.

Without seamless lock, the speed control determines preview and export pace.

With seamless lock, the master must travel an exact number of complete asset cycles. Its effective pace is:

```text
moving frames × loops ÷ duration
```

Eight slides, one loop, and an eight-second master means **1.00 slide per second**, regardless of a 0.22 preview-speed value.

The master presets therefore fit duration to the current deck and match preview speed to the resulting master. If an advanced edit later creates a mismatch, the master check reports both values.

A very slow preview may be impossible to close within Drift's 30-second duration ceiling. In that case, choose what matters more:

- preserve the slow pace and unlock the loop; or
- preserve the closed loop and accept a faster master.

Do not hide that trade-off behind a preset name.

## 5. Save a house look

Once a direction feels authored rather than generic, save it under **My looks**.

A reusable look stores:

- film world;
- path and axis choices;
- pace and spatial treatment;
- lens character and optical values;
- slide surface treatment;
- atmosphere and colour direction.

It deliberately does **not** store:

- deck media;
- presenter selection or geometry;
- stage/output dimensions;
- duration or frame rate;
- seamless-loop policy;
- reduced-motion output choice.

Those belong to the destination project. A house look should give another deck the same visual grammar without forcing it into the previous video's technical decisions.

Saving the same name updates that local look instead of creating duplicates. Looks remain in the current browser and can be deleted independently from projects.

## 6. Use composition guides

Guides are editor overlays. They never enter the WebGL canvas and therefore cannot appear in a PNG or MP4.

- **Rule of thirds:** checks visual tension and eyeline.
- **Title safe:** protects essential copy from fragile edges.
- **Caption reserve:** keeps lower space available for subtitles or social captions.
- **Interface reserve:** a conservative working area for changing platform chrome.

The interface guide is not a promise about a permanent Instagram layout. Platform interfaces change. Check the destination platform again when precision matters.

## 7. Read the master check

The master check reports concrete risks rather than assigning a fake quality score.

### Renderer ready

Confirms the WebGL path exists. It does not certify the GPU's performance at every possible output size.

### Moving frames

One or two frames are valid, but repetition becomes conspicuous. A larger set usually produces a richer spatial passage.

### Master pace

Reports the effective exported pace. Judge it against the densest slide, not the simplest one.

### Lens energy

High optical values can turn typography and faces into raw material for the effect. Pull back until the deck is still the subject.

### Slide scale

Small slides can leave room for a presenter, but text-heavy slides quickly become thumbnails.

### Alpha

Transparent output requires PNG stills or PNG sequences. H.264 remains opaque.

### Loop closure

A lock means the deterministic track and procedural atmosphere close on exact cycles. It does not guarantee the final and opening images make editorial sense together.

## 8. Check before the final render

Use this sequence:

1. Pause on a representative frame.
2. Save a PNG still.
3. Inspect type, borders, corners, and focal crops at 100%.
4. Preview the densest slide at the effective master pace.
5. Check the final-to-first transition.
6. Test presenter audio at the final frame rate when present.
7. Export the master.
8. Watch the exported file, not only the live preview.

## 9. Failure is part of the interface

Drift blocks rather than fakes several states:

- WebGL unavailable;
- output larger than the GPU can safely render;
- unsupported presenter media;
- audio-bearing presenter output above the verified frame-rate boundary;
- transparent H.264 expectations;
- unsafe in-memory frame archives;
- malformed portable projects;
- a directed move whose required inspector contract is missing.

A blocked action should leave the current project intact.

## 10. The taste pass

No automated check can decide whether the result has soul.

Before calling it finished, ask:

- Does the movement clarify the deck's emotional sentence?
- Can the audience read the slide that matters most?
- Does the atmosphere support the images rather than tint everything into sameness?
- Does the presenter feel anchored rather than pasted above the composition?
- Does the loop create a meaningful return?
- Would the sequence still feel deliberate with the optical energy reduced by twenty percent?

If reducing the effect makes the work stronger, reduce it.
