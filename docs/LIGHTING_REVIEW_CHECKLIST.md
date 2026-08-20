# Cinematic lighting acceptance checklist

This checklist reviews the actual product promise: pitch-deck slides should feel photographed and spatial without losing their authored hierarchy, colour, legibility, export safety, or usefulness.

Do not approve a rig because it looks impressive on the demo slides. Approve it only when it survives hostile real-world decks.

## Review corpus

Use at least one example from every class below:

- a nearly white editorial slide with small dark typography;
- a nearly black slide with low-contrast photography;
- a dense chart, table, timeline, or financial slide;
- an edge-to-edge portrait with skin tones;
- saturated brand colours that should not drift;
- fine linework, hairlines, and one-pixel borders;
- a collage with several competing local contrast zones;
- a slide containing its own intentional shadow or glow;
- transparent PNG artwork;
- the optional pinned presenter, both image and video.

Repeat the review at 9:16, 4:5, 1:1, and 16:9. Test both carousel axes and at least one straight, curved, cylindrical, and tunnel-like path.

## Fast-path journey

A first-time director should be able to produce a coherent result without understanding shader terminology.

- [ ] Choosing a Film world yields a complete motion, surface, atmosphere, and lighting starting point.
- [ ] Light character names communicate source logic rather than vague mood alone.
- [ ] Each character shows a short description and an honest best-use suggestion.
- [ ] Switching characters changes direction, contrast, shadow structure, movement, and field shape—not merely colour.
- [ ] The focal slide remains the subject at default settings.
- [ ] A user can protect the source artwork before touching deeper lighting controls.
- [ ] Manual edits clearly move the rig into a Custom state.
- [ ] Resetting to an authored character restores a coherent complete rig.

## Twelve authored rigs

Review every character at its default settings:

- [ ] Studio Soft — broad, quiet, editorial; no cosmetic gloss.
- [ ] Window Rake — lateral daylight and window structure; no fake venetian-blind cliché.
- [ ] Projector Haze — concentrated frontal pool; archival rather than nightclub.
- [ ] Noir Slice — hard directional tension; black levels remain intentional.
- [ ] Golden Hour — warm low source; skin and brand colours remain credible.
- [ ] Electric Rim — edge-led cyan/ultraviolet response; typography stays readable.
- [ ] Overcast Window — broad cool daylight; soft does not become flat grey wash.
- [ ] Moon Pool — cold circular source with restrained halo; no fantasy-game bloom.
- [ ] Sodium Vapor — amber urban shaft; no blanket orange grade.
- [ ] Lantern Flicker — intimate asymmetric warm source; movement remains subtle and loopable.
- [ ] Fluorescent Flat — institutional overhead strip; deliberately severe but still useful.
- [ ] Headlight Sweep — paired low beams; urgency without destroying the slide.

Reject palette-only differentiation. Two rigs with different colours but the same source geometry, shadow language, and motion are not two rigs.

## Artwork and hierarchy protection

- [ ] Protect artwork at 100% returns card pixels to their authored colour and contrast.
- [ ] Cast shadows and environmental spill remain available when artwork protection is high.
- [ ] Protect hero affects the focal card more strongly than neighboring cards.
- [ ] Hero protection changes smoothly as cards cross the playhead; no visible protection boundary.
- [ ] Dense text remains readable at every authored default.
- [ ] White slides do not clip into featureless rectangles.
- [ ] Dark slides retain intentional black separation.
- [ ] Skin tones are not globally recoloured by the rig.
- [ ] The pinned presenter keeps neutral source colour.

## Light attachment

### Stage attachment

- [ ] The source remains fixed in screen/stage space while cards roll beneath it.
- [ ] A card’s local roll does not rotate the apparent stage-fixed cast.
- [ ] Direction remains coherent across neighboring cards.
- [ ] The result reads as a photographed installation or set.

### Card attachment

- [ ] Key direction rotates with each card.
- [ ] Cast direction remains local to the card.
- [ ] The result reads as designed illuminated objects rather than a shared room light.
- [ ] Extreme card tilt does not produce NaN, inversion, or an exploding highlight.

## Surface response

- [ ] Lighting follows the actually deformed card surface.
- [ ] Roughness broadens or tightens the highlight instead of acting as a generic opacity control.
- [ ] Sheen remains subordinate to the slide.
- [ ] Rim light explains edge orientation without drawing a glowing outline around every card.
- [ ] Key and fill intensities remain bounded at their maximum controls.
- [ ] Turning Cinematic lighting off returns the source surface and removes lighting-owned shadow/spill.
- [ ] Front- and back-facing cards remain numerically stable.

## Cast and contact shadows

- [ ] A tight contact lobe anchors each card before the broad cast blooms away.
- [ ] Shadow reach shortens as source elevation rises.
- [ ] Softness changes the penumbra, not the shape or card size.
- [ ] Shadow density never exceeds the requested bound when lobes overlap.
- [ ] Rounded corners and continuous-corner smoothing remain coherent in the shadow silhouette.
- [ ] Coloured shadows stay restrained and useful.
- [ ] Maximum reach and softness do not clip prematurely near frame edges.
- [ ] Transparent output preserves compositable card and presenter shadows without a full-frame haze.

## Environmental light fields

Verify all twelve structural fields:

- [ ] Softbox pool.
- [ ] Window panes.
- [ ] Projector aperture.
- [ ] Noir slit.
- [ ] Sunset rake.
- [ ] Edge wash.
- [ ] Overcast sky.
- [ ] Moon pool.
- [ ] Sodium shaft.
- [ ] Lantern pool.
- [ ] Ceiling strip.
- [ ] Twin headlights.

For each field:

- [ ] Light shape presence blends from a broad source into the selected structure.
- [ ] Background spill changes the environment without repainting the cards.
- [ ] Spill focus changes footprint rather than overall exposure alone.
- [ ] Transparent background removes the full-screen field cleanly.
- [ ] The field remains aspect-correct at portrait, square, and landscape output ratios.

## Motion, pause, and seamless output

Review Static, Breathe, Sweep, Flicker, and Orbit.

- [ ] Motion is restrained enough that the deck remains readable.
- [ ] Pace changes are materially visible but remain bounded.
- [ ] Flicker feels like source variation, not random frame noise.
- [ ] Every motion mode is deterministic from export time.
- [ ] Seamless start and end states close exactly for whole-loop masters.
- [ ] Reduced-motion output freezes carousel, light, environment, and grain state.
- [ ] Pause stops inertia, lighting time, environmental movement, presenter playback, and live frame sampling immediately.
- [ ] A paused frame remains pixel-stable after late texture loading has completed.
- [ ] Static and paused compositions stop continuous rendering and redraw only after invalidation.

## Preview and export parity

- [ ] Preview, PNG still, PNG sequence, and MP4 use the same lighting resolver.
- [ ] No wall-clock or unseeded random value enters an export frame.
- [ ] H.264 remains correctly opaque.
- [ ] Transparent PNG output contains no hidden background colour or spill.
- [ ] Output colour-space encoding happens once.
- [ ] A still captured at a chosen time matches the corresponding fixed-step video frame within the renderer’s expected encoding path.
- [ ] The pinned presenter’s decoded export frame never falls back to a wall-clock VideoTexture.

## Compatibility and trust boundary

- [ ] A schema-v1 project with no lighting object hydrates a neutral authored rig.
- [ ] Legacy slide shadow opacity and softness migrate into the lighting rig.
- [ ] A partial or malformed new lighting object fails visibly instead of receiving silent defaults.
- [ ] Unknown keys do not cross the validation boundary.
- [ ] Every numeric field rejects non-finite and out-of-range values.
- [ ] Existing project bundles round-trip without losing unrelated settings or media references.

## Performance and failure handling

- [ ] No new runtime dependency is required.
- [ ] No full-frame post-processing target is allocated.
- [ ] No dynamic shadow map or extra scene render is introduced per light.
- [ ] The existing bounded slide pool remains intact.
- [ ] Idle GPU work falls when the preview is paused or genuinely static.
- [ ] Context loss preserves project state and resumes with valid lighting resources after restoration.
- [ ] Largest supported output surfaces fail early and clearly when they exceed the GPU’s safe limits.
- [ ] Browser console, page errors, and `gl.getError()` remain clean through the complete rig sweep.

## Machine gates

Before the PR leaves draft state, require clean-checkout receipts for:

- [ ] TypeScript strict typecheck.
- [ ] Complete unit and shader-contract suite.
- [ ] Production build.
- [ ] Complete Chromium/Playwright studio suite.
- [ ] Dedicated cinematic-lighting gauntlet.
- [ ] Dedicated lighting-integrity gauntlet.
- [ ] `git diff --check`.
- [ ] No temporary payload, patch-runner, generated evidence, or local-only file remains in the branch.

## Rejection rule

Reject the branch when the lighting becomes more memorable than the slide, text contrast collapses, the shadow reads as a sticker effect, stage-fixed light rotates with the card, card-fixed light floats in screen space, transparent export receives a hidden full-frame effect, pause is not a true freeze, or an authored control is present in the interface but does not materially cross the complete UI → settings → renderer → shader path.
