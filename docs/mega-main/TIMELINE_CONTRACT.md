# Canonical timeline and semantic event spine

## One authored clock

Project V3 now resolves master runway, motion character, editorial cadence, held-pose sampling, source-deck loop distance and semantic events in pure core modules. These modules import neither React, Three.js, DOM APIs, Web Audio nor AppKit.

```text
project + exact time
        ↓
master runway / seamless phase
        ↓
Direct · Weighted · Spring · Drift performance
        ↓
raw source-slide travel
        ↓
Read · Anticipate · Carry · Impact · Settle · Land cadence
        ↓
visible distance + velocity + acceleration + focus
        ↓
semantic events
```

## Master runway

Non-looping masters may contain opening and closing handles plus monotonic integrated acceleration and deceleration. Start and end velocity are exactly zero while total authored travel remains exact. Seamless masters ignore runway because an eased loop seam would create a visible pulse.

## Source-deck truth

One seamless loop means one pass over source-slide order. Renderer padding copies never count as content. Two slides remain a two-slide passage even when the bounded visual pool needs more meshes to fill the frame.

## Editorial cadence

Each slide stride is divided into six explicit phases:

- Read
- Anticipate
- Carry
- Impact
- Settle
- Land

Visible travel is monotonic. Read, anticipation, impact, settle and land contain true positional rests; optical, material, light and sound systems receive separate phase envelopes rather than forcing the track to reverse. The map remains invertible so direct manipulation can move in visible space and resume authored motion without a jump.

## Held pose cadence

Continuous, 24 fps, 18 fps and 12 fps scene cadence remain independent from the delivery master frame rate. Sampling is deterministic and preserves the exact duration endpoint. When previous frame time is supplied, a held pose reports zero velocity; a newly exposed pose reports deterministic finite-difference velocity.

## Semantic events

The core plans stable events from the same monotonic raw travel:

- master start and finish;
- slide approach and departure;
- focus handoff and impact;
- settle;
- source-deck loop boundary.

Sound, diagnostics and future presenter choreography consume these events. They may not reconstruct slide crossings from private settings or rendered pixels.
