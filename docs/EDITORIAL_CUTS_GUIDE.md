# Directing editorial motion in Drift

Editorial motion is not a decorative preset. It is a way to decide **when the viewer should read, when the argument should advance, and how much physical character the transition can carry without stealing attention from the slide**.

This guide is for the person making the video. The engineering contract and falsification gates live in [EDITORIAL_CADENCE_GAUNTLET.md](EDITORIAL_CADENCE_GAUNTLET.md).

## The thirty-second workflow

1. Import the final slide images in story order.
2. Choose the stage ratio you will publish.
3. Open **Motion** and choose the cut closest to the material.
4. Watch at least one complete source-deck pass.
5. Read the **Rhythm map** and **Master delivery** receipt.
6. Use **Close at cut tempo** when Drift reports Partial, Open, Retimed, or Rushed.
7. Change one control at a time only after the cut already works.
8. Pause on the densest slide and check whether it is genuinely readable.
9. Export a short proof before committing to the final duration.

The fastest path to a strong result is not more settings. It is a better first editorial decision. The rhythm map shows the actual read, carry, and land proportions at the current preview/master pace; use it to protect reading time before reaching for more depth or distortion.

## Choose by material, not genre

### Explainer Cut

**Use when:** each slide advances a claim.

Good material:

- thesis → evidence;
- before → after;
- comparison slides;
- one idea per frame;
- a concise Instagram explanation;
- deck excerpts timed under narration.

Behavior:

- horizontal progression;
- decisive but bounded carries;
- enough hold to read a headline and one supporting thought;
- a tactile focal landing;
- restrained optical bend at speed.

Start here when you are unsure. It gives the argument a clear pulse without making the transition the subject.

### Paper Argument

**Use when:** the viewer should feel a sequence of handled pages.

Good material:

- presenter-led video;
- film-treatment notes;
- mood pages;
- quotes;
- reflective visual essays;
- decks with a pinned talking-head frame.

Behavior:

- vertical reading rhythm;
- longer holds;
- stronger paper hinge;
- deeper separation between focal and peripheral frames;
- softer optical deformation.

This is the most tactile cut. It should still come completely to rest.

### Clean Data

**Use when:** the slide contains more information than motion.

Good material:

- charts;
- timelines;
- tables;
- diagrams;
- small typography;
- evidence-heavy comparisons;
- detailed production or budget pages.

Behavior:

- restrained depth;
- almost-flat paper response;
- shorter gap;
- faster but cleaner cadence;
- low distortion and low focal scale.

Do not “improve” this cut by adding a large hinge. Its restraint is the feature.

### Documentary Glide

**Use when:** looking is more important than explaining.

Good material:

- portraits;
- archive photography;
- locations;
- cinematography references;
- image-led chapters;
- quieter visual essays.

Behavior:

- patient lateral travel;
- generous looking time;
- subtle focal lift;
- soft depth;
- minimal stepped character.

If the images already carry emotion, this cut stays out of their way.

## Read the Master delivery receipt

The cut controls **authored pace**. The output controls **available time**. Those two can disagree.

Drift makes that disagreement visible before export.

### Add slides

There is no source deck to evaluate yet.

### Still composition

Tempo is zero. The master will hold one authored frame.

### Partial deck

The selected duration ends before one complete source-deck pass.

This can be intentional for a chapter, but it should not be accidental.

### Complete, but open

At least one source-deck pass fits, but the endpoint is not locked. The last exported frame may be mid-transition or between source slides.

### Closed at cut tempo

The source deck closes on an exact pass and the master pace matches the cut you approved in preview.

This is the safest delivery state.

### Closed, but retimed

The master closes mathematically, but output duration forces a pace different from the cut.

Example:

- eight slides;
- Explainer Cut at `0.50 slides/s`;
- one loop;
- eight-second master.

One source pass needs sixteen seconds at the authored pace. Forcing it into eight seconds doubles delivery to `1.00 slides/s`. The export closes, but it is not the edit you watched.

### Closed, but rushed

The forced delivery exceeds Drift's exposed `1.50 slides/s` director ceiling.

Do not fix this by increasing distortion or cut intensity. Lengthen the master, reduce loops, or split the deck into chapters.

## What “Close at cut tempo” changes

The repair button may change:

- Seamless export lock;
- loops per master;
- duration.

It does **not** change:

- the authored cut;
- atmosphere;
- slide styling;
- stage dimensions;
- frame rate;
- presenter choice;
- reduced-motion output preference.

For a tiny deck, Drift may add several short loops so the master reaches the three-second minimum without stretching one slide into dead air.

For a long deck, Drift may reduce a requested loop count so one readable pass can fit under the thirty-second editor limit.

When even one readable pass cannot fit, Drift recommends chapters instead of silently producing destructive speed.

## Understand the controls in editorial language

### Tempo

How quickly the argument advances, measured in source slides per second.

This is not frame rate. A 30 fps master remains 30 fps.

### Beat hold

How strongly time is weighted toward each landing.

Higher values create more reading time near the slide. Beat hold should not move the spatial layout by itself.

### Cut intensity

How much the tactile pose accent reads as stepped rather than continuously interpolated.

This changes authored poses, not encoded frame rate.

### Punch depth

How far peripheral evidence falls behind the focal slide.

Use less for small text. Use more when each frame contains one dominant image or thought.

### Paper hinge

How strongly the slide behaves like a handled card during arrival.

It also controls the amount of stable registration character and transient shadow lag. Everything returns to its authored resting state during the hold.

### Focal emphasis

How much the current slide grows relative to peripheral slides.

Large values can make typography feel soft or breathe unnecessarily. Increase only when the hierarchy needs it.

### Optical bend

Velocity-driven shader deformation.

It peaks during travel and returns to zero when the slide rests. It should never be used to hide weak pacing.

### Drag weight

How far direct manipulation moves the authored strip.

Drag operates in visible editorial space, so a real hold does not trap the pointer and release it in a sudden jump.

## Pause is a review tool

Pause freezes the composition, not merely autoplay.

It freezes:

- carousel position;
- residual velocity;
- optical bend;
- tactile shadow lag;
- background phase;
- presenter playback.

Use Pause on:

- the densest chart;
- the longest paragraph;
- the smallest type;
- the most important portrait;
- the frame where the presenter and deck compete for attention.

If the slide is not readable while genuinely still, motion will not save it.

## Reduced motion

OS reduced-motion preview removes automatic carousel travel and animated atmosphere while retaining deliberate Previous / Next navigation. It does not erase hierarchy or make the tool unusable.

**Reduced-motion master** is a separate output choice. It freezes timeline-derived output regardless of the previewing device's operating-system preference.

## Directing with a pinned presenter

A pinned presenter is a separate scene object. It receives no strip velocity, optical bend, or paper grain.

Use these checks:

1. Keep the presenter away from the deck's primary travel corridor.
2. Pause on the widest and tallest source slides.
3. Check that the focal deck slide remains larger in visual importance unless the presenter is intentionally the subject.
4. Use Paper Argument for conversational pacing; use Clean Data when the presenter is explaining dense evidence.
5. Mute presenter audio only when you have a separate audio plan.

## Common failure modes

### “It looks expensive, but I cannot read it.”

Reduce Punch depth, Paper hinge, Optical bend, or Focal emphasis. Try Clean Data before adjusting everything manually.

### “It still feels like an endless website carousel.”

Increase Beat hold, then Cut intensity. Do not start by adding more depth.

### “It feels low-frame-rate.”

Reduce Cut intensity. The master frame rate is unchanged; you are seeing the pose cadence too strongly.

### “The export is much faster than preview.”

Read the delivery receipt. Use Close at cut tempo or lengthen the output.

### “The deck repeats too many times.”

Reduce Loops per master. One editorial loop always means one pass through the source deck, not one pass through renderer padding.

### “Dragging freezes and then jumps.”

That was a failure of raw-timeline manipulation. Current editorial direct manipulation inverts the cadence map so the visible card follows the hand through holds.

### “Pause still looks alive.”

The current contract is complete stillness. Any changing card, shadow, grain, atmosphere, or presenter frame while paused is a regression.

## Final export checklist

- [ ] The first frame is intentional.
- [ ] The final frame is intentional.
- [ ] The delivery receipt is understood.
- [ ] Preview pace matches the intended master pace.
- [ ] Every source slide intended for the chapter appears.
- [ ] Dense slides remain readable during their hold.
- [ ] Optical bend returns to zero at rest.
- [ ] Grain belongs to the slide and does not shimmer in place.
- [ ] Repeated source slides look materially identical.
- [ ] Pinned presenter media remains still in space.
- [ ] Reduced-motion behavior has been checked.
- [ ] A short proof export has been watched outside the editor.

The strongest result is usually the one where viewers remember the evidence, not the transition.
