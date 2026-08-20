# Creator Journey Gauntlet

## Actual goal

Drift should behave like a directing instrument, not a spreadsheet of shader values.

A first-time creator should be able to:

1. Replace the study slides.
2. Choose a coherent film world.
3. Pick a reading pace in human terms.
4. Scrub the exact fixed-step master.
5. Compare the live direction against a stored reference.
6. See delivery problems before an expensive render.
7. Save the exact frame under the playhead.
8. Continue into deep controls only when the authored defaults stop being enough.

## Product changes

### Director’s Desk

A collapsible dock sits above the deep inspector. It exposes the decisions a creator makes in order:

- slides
- world
- pace
- exact-master review
- export readiness

The full inspector remains available. The dock does not hide capability; it establishes an intelligible first path through it.

### Human pacing

Four recipes describe reading breath rather than arbitrary speed:

- Linger
- Editorial
- Kinetic
- Trailer

Each recipe derives master duration from the actual number of moving slides, enables one authored deck pass, and aligns the live-preview speed with the export pace.

### Exact master timeline

The timeline calls the same fixed-time evaluator used by export. Chapter ticks represent actual slide arrivals, not generic percentages.

Scrubbing pauses wall-clock motion. “Return live” deliberately exits master-preview mode.

### Reversible direction

Settings history coalesces rapid slider changes into one undoable gesture. Keyboard undo and redo are available outside form fields.

“Set A” stores a deliberate comparison reference. Holding “Hold for A” temporarily renders that reference; releasing returns to the live direction without polluting history.

### True loop semantics

The virtual mesh strip can contain padded slots so the viewport never runs dry. That is a renderer concern.

A user-facing “one loop” now travels one actual uploaded deck pass, not one padded strip. Export distance and velocity accept authored slide count separately from render-pool slot count.

### Presenter coverage

Preflight compares the trimmed presenter duration against the part of the master it must cover. It also exposes the existing high-frame-rate audio guard before export.

### Delivery guides

Centre-safe and social-interface caution overlays are intentionally labelled as editing aids, not platform guarantees. They never render into the master.

### Frame capture

“Save this frame” captures the exact deterministic master time under the playhead at output resolution.

## Trust boundaries

- Preview and export still share one evaluator.
- The dock never invents a successful export.
- Alpha guidance remains explicit: H.264 does not preserve transparency.
- No media or settings leave the browser.
- Undo history is session-local and bounded.
- Guides do not alter pixels.
- Existing project data remains compatible.
- No new runtime dependency.

## Gauntlet gates

The automation that constructs this stacked branch refuses to push unless all of these pass:

- TypeScript project build
- unit and contract tests
- production Vite build
- Chromium Playwright suite
- new creator-journey browser tests
- true authored-pass loop tests
- presenter preflight tests
- console-error rejection
- `git diff --check`

## Research position

The technical starting point remains the deterministic Three.js/WebGL engine already in Drift.

The journey pass studies:

- Codrops’ WebGL carousel work for the relationship between input, geometry, and optical response.
- Siena Film Foundation for pacing, framing confidence, and editorial restraint.
- nonlinear editing software for timeline truth, A/B comparison, and preflight expectations.
- the pitch.dog component library for progressive disclosure and controls that stay legible under density.

No composition or interface is copied. The aim is to transfer principles: authored defaults, truthful time, reversible exploration, and visible consequences.
