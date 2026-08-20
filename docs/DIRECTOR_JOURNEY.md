# Intent-first directing journey

Drift already had unusually deep controls. Depth alone was not the remaining product problem.

A first-time user arrived at an inspector full of stage ratios, paths, distortion, focus lift, seed values, grain, and export settings. Every control was legitimate, but the product still asked them to translate a creative intention into implementation parameters before they had seen the intention succeed.

The intent director reverses that order.

## The user journey

### 1. Begin with audience effect

The first question is not “How much distortion?” It is “What should this passage do to the viewer?”

Ten authored moves now provide useful starting sentences:

- Quiet Reveal
- Human Warmth
- Clean Evidence
- Road Story
- Slow Dread
- Archive Pulse
- Electric Push
- Open Water
- Daylight Wit
- Presenter Runway

These are not a second preset library. Each move applies an existing coherent film world, then adjusts only the high-leverage controls: pace, spacing, lens energy, peripheral softness, focal lift, slide scale, axis, and—where relevant—the pinned-frame layout.

Every action writes the real React-controlled project settings. Autosave, portable projects, preview, and deterministic export continue to use one source of truth.

### 2. Shape rhythm without rebuilding the scene

Four restrained rhythm moves let the user alter the sentence without abandoning the world:

- **Hold:** near-still and legibility-first.
- **Breathe:** a long editorial sentence.
- **Glide:** confident movement without hurry.
- **Surge:** fast and optical, but deliberately below the editor's extreme range.

The fastest authored rhythm stops at 0.68 slides per second. Maximum velocity remains available in the advanced inspector, but the product no longer presents excess as taste.

### 3. Choose a master as a complete promise

Reel, Feed, Square, and Screen master buttons set dimensions, frame rate, duration, and loop closure together. This removes a common false win: changing the canvas ratio while leaving output timing or seamless state behind.

The presets are ordinary saved settings, not hidden export overrides.

### 4. Compose against editor-only guides

The stage can display:

- rule of thirds;
- title-safe bounds;
- a caption reserve;
- a conservative interface reserve.

Guides are DOM overlays above the editor canvas. They never enter WebGL and can never appear in a captured still, PNG sequence, or MP4.

The interface reserve is intentionally described as a working area, not a permanent Instagram specification. Platform chrome changes. The guide exists to keep critical material away from fragile edges, not to manufacture certainty.

### 5. Run a truthful master check

The master check does not assign a meaningless quality score. It reports concrete failure modes:

- missing or very low slide counts;
- unavailable WebGL;
- motion too fast for most text-heavy slides;
- optics energetic enough to overpower typography or faces;
- slides reduced to thumbnail scale;
- transparent output requiring PNG for alpha;
- an unlocked loop seam;
- whether a stable pinned frame is actually selected.

Where a bounded mechanical fix exists, the check can apply it. Taste still belongs to the user.

## Autoplay now means what it says

The original evaluator treated `motion.autoplay` as preview-only state. Turning it off stopped the editor, but deterministic export still moved because `distanceAtTime()` ignored the saved value.

That violated the user's mental model and the project's own one-state promise.

The evaluator now returns zero distance and zero velocity whenever saved autoplay is disabled. Temporary preview pausing remains separate. A still project exports still; a paused preview does not rewrite the project.

## Progressive disclosure, not simplification theatre

The intent director does not remove controls or invent a beginner mode with reduced output quality.

- Intent moves establish a coherent first result.
- Rhythm and master moves handle common revisions.
- Guides and preflight protect composition and export.
- The complete inspector remains available for detailed authorship.

The user can enter through language and leave through parameters. Both paths edit the same artifact.

## Accessibility and local-first boundaries

- `Shift+D` toggles the intent director.
- `Escape` closes it.
- Buttons, summaries, checks, and guide controls remain keyboard-operable.
- Reduced-motion users receive no added animated interface layer.
- Guide preferences use local storage only.
- No media, settings, telemetry, or intent labels leave the browser.
- The panel introduces no runtime dependency and no settings-schema migration.
