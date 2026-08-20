# Cinematic lighting and analytical shadows

## Actual goal

Make flattened pitch-deck slides feel present in a photographed space without making the deck harder to read, colouring a presenter’s face, lying about transparent export, or creating a second render path that drifts away from the master.

Lighting is not a decorative filter. One authored rig governs four linked consequences:

1. **Surface response** on the moving, vertex-deformed cards.
2. **Cast and contact shadow** that explains distance, source direction, and weight.
3. **Environmental spill** shaped by an authored source or architectural mask.
4. **Hierarchy protection** that keeps the focal slide and its authored colour decisions legible.

Preview, MP4, PNG stills, and PNG sequences resolve the same rig from the same deterministic time value.

## Research translated into product rules

### Use analytical light where the composition is already analytical

Three.js shadow maps render the scene again from every shadow-casting light. Drift’s slides are custom-deformed `ShaderMaterial` planes, so a faithful map would also need a matching custom depth material, extra full-resolution resources, bias tuning, and more transparency/sorting failure surfaces.

Drift instead recovers the true deformed view-space normal with fragment derivatives. The cast shadow uses the same rounded-superellipse language as the card and stays inside the existing bounded mesh pool. This is a deliberate flat-media lighting model—not a claim of global illumination.

### Roughness must change the highlight, not become a gloss filter

The surface response follows the useful part of a microfacet model: roughness broadens and softens the specular lobe; a smooth surface tightens it. The implementation remains bounded for low-precision mobile GPUs and never lets a highlight bleach the slide into a generic glossy card.

### Protect the deck before showing off the light

`Protect artwork` blends the modelled response back toward the source slide. `Protect hero` adds another guard around the focal card while allowing neighboring cards to carry more modelling and depth. At 100% artwork protection, card pixels pass through unchanged; cast shadows and environmental spill remain available.

### Stage light and card light are different creative decisions

- **Stage attachment** keeps the source fixed in screen space. A card rolls beneath it, and the shadow counter-rotates locally so the cast remains screen-aligned.
- **Card attachment** binds the source to each card. Key direction and cast rotate with the card, producing a designed object-light relationship rather than a photographed stage.

### Contact first, bloom second

A uniformly blurred rectangle reads as a sticker. Each shadow has two coupled lobes:

- a broad directional cast whose softness and reach describe the source;
- a tight contact lobe near the card that anchors it before the penumbra blooms away.

The lobes combine multiplicatively, preventing overlap from exceeding the requested density.

### Light the world, not the presenter’s face

The pinned presenter keeps neutral surface colour. The rig integrates it through a matching directional environmental shadow only. This avoids accidentally grading skin or making a talking-head insert look cosmetically inconsistent with its source video.

### Pause means freeze

The transport now stops carousel inertia, lighting time, environmental motion, presenter playback, and live frame sampling immediately. Static and paused compositions become event-driven: they redraw only when a setting, media asset, interaction, or context recovery actually changes the frame. This makes visual inspection trustworthy and reduces idle GPU work.

### Motion must close or freeze

In ordinary playback, each authored movement resolves to a small bounded change in direction, intensity, and field centre. Seamless export uses integer phase harmonics and returns to the same complete state at the master boundary. Reduced motion and pause freeze the phase. Grain remains spatial rather than wall-clock driven.

## Authored rigs

| Rig | Source logic | Shadow / field logic | Best starting point |
| --- | --- | --- | --- |
| Studio Soft | Broad warm key, quiet cool fill | Short contact-rich softbox | Editorial, dialogue, dense typography |
| Window Rake | Low warm side key | Long cast through window panes | Travel, memory, domestic drama |
| Projector Haze | Restrained frontal pool | Compact projector aperture | Archive, evidence, screenings |
| Noir Slice | Hard low source, negative fill | Dense long slit | Horror, thriller, psychological tension |
| Golden Hour | Low amber key, violet air | Warm horizon rake | Romance, tenderness, nostalgia |
| Electric Rim | Cyan edge, ultraviolet fill | Edge-bound orbital wash | Music, speculative, nightlife |
| Overcast Window | Cloud-soft cool daylight | Broad nearly shadowless sky | Drama, documentary, architecture |
| Moon Pool | High cold source | Circular pool with halo | Fantasy, dream, solitude, night |
| Sodium Vapor | Narrow amber street source | Hard urban shaft | Crime, road films, industrial night |
| Lantern Flicker | Small warm card-bound source | Intimate asymmetric pulse | Folklore, ritual, historical horror |
| Fluorescent Flat | Cool overhead strip | Institutional ceiling field | Workplace, hospital, bureaucracy |
| Headlight Sweep | Twin low travelling sources | Long urgent paired beams | Thriller, chase, road night |

Every manual edit converts the recipe to `Custom rig`. Recipes vary attachment, movement, pace, direction, elevation, fill ratio, surface response, hierarchy protection, shadow structure, spill, and architectural light shape—not merely colour.

## Director journey

### Fast path

1. Choose a **Film world** for a coherent motion, surface, atmosphere, and lighting starting point.
2. Change **Light character** only when the story needs another source logic.
3. Read the character note and intended use before touching sliders.
4. Adjust **Protect artwork** before lowering fill or crushing the source image.
5. Export a still at the intended aspect ratio before committing to a moving master.

### Lighting controls

- **Cinematic lighting** — master bypass. Off returns source pixels and removes lighting-owned shadows/spill.
- **Light character** — twelve authored coherent rigs plus Custom.
- **Light attachment** — stage-fixed or card-fixed direction and cast language.
- **Light movement / pace / breath** — static, breathing, sweep, flicker, or orbit with deterministic closure.
- **Key / fill colour** — restrained source tints.
- **Key angle / elevation** — direction and source height.
- **Key intensity / fill / rim** — contrast architecture.
- **Sheen / roughness** — highlight size and response.
- **Protect artwork / hero** — explicit hierarchy and colour-preservation controls.

### Shadow and spill controls

- **Shadow colour / density** — chromatic and alpha character.
- **Shadow reach** — requested cast distance, shortened analytically as elevation rises.
- **Shadow softness** — broad penumbra size.
- **Contact anchor** — strength of the tight near-card lobe.
- **Light shape** — twelve structural fields matching the authored rigs.
- **Light shape presence** — blends a broad source into the selected architectural field.
- **Background spill / focus** — environmental strength and footprint.

## Rendering contract

- No new runtime dependency.
- No full-frame post-processing buffer.
- No dynamic shadow-map allocation.
- No extra scene render per light.
- Existing bounded pool remains 24 moving slide groups plus the optional presenter.
- Lighting uniforms update inside the existing render path.
- H.264 remains opaque.
- Transparent PNG output omits the full-screen background and spill but preserves compositable card and presenter shadows.
- All custom materials encode once through Three.js’ output colour-space chunk.
- Paused/static previews stop continuous rendering and redraw on invalidation.

## Portable-project compatibility

The portable settings schema remains version 1 because the extension is additive. A project written before lighting existed has no `lighting` object. The validator hydrates the neutral Studio Soft rig and copies the project’s legacy slide shadow opacity and softness into it.

This bridge applies only when the complete lighting object is absent. If a project supplies a malformed or partial lighting object, validation fails visibly instead of inventing values.

Legacy `slide.shadowOpacity` and `slide.shadowSoftness` remain in the schema for round-trip compatibility. New rendering and controls use the first-class lighting section.

## Gauntlet gates

The branch must pass all existing checks plus dedicated falsification for:

- twelve unique, fully valid rigs and twelve structural light fields;
- every declared director field crossing the UI → settings → engine → shader boundary;
- finite normalized light vectors at every control extreme;
- true stage-fixed and card-fixed direction/cast behaviour;
- focal hierarchy protection that is symmetric, bounded, and monotonic;
- shorter shadows at higher source elevation;
- exact complete-state closure at seamless boundaries;
- time-invariant pause, reduced-motion output, and static light;
- strict lighting bounds, colours, enums, and hostile unknown keys;
- schema-v1 legacy hydration without silent repair of malformed new data;
- derivative-based normals from the deformed surface;
- spatial rather than wall-clock grain;
- separate cast and contact shadow lobes;
- ascending `smoothstep` edges;
- real Chromium/WebGL pixel change across rigs and pixel-stable rest frames;
- stage-chrome exclusion from render-pixel assertions;
- the repository’s complete TypeScript, unit, production-build, media, export, context-loss, accessibility, and portability suites.

## Human review matrix

Automated checks cannot judge taste. Review with:

- white editorial slides, dark photography, dense charts, edge-to-edge portraits, and fine linework;
- both light attachments, every movement mode, and all twelve fields;
- both carousel axes and every motion path;
- low and high tilt/depth;
- all twelve rigs at 9:16, 4:5, 1:1, and 16:9;
- opaque and transparent stills;
- pinned presenter enabled and disabled;
- maximum shadow reach/softness near frame edges;
- paused preview, reduced-motion master, and a seamless multi-loop master;
- 1080p and the largest surface accepted by the target GPU.

Reject a rig if the lighting becomes more memorable than the slide, text contrast collapses, the shadow reads as a sticker effect, a stage-fixed cast rotates with the card, a card-fixed source floats in screen space, or a presenter’s source image is visibly recoloured.

## Primary references

- Three.js `ShaderMaterial` documentation for custom material integration and renderer-provided uniforms.
- Three.js shadow manual for the additional scene renders and trade-offs inherent in shadow maps.
- Google Filament’s material model for roughness, bounded microfacet response, and specular anti-aliasing principles.
- NVIDIA’s Percentage-Closer Soft Shadows sample for contact-hardening cues.
- Siena Film Foundation for restraint and ambient cinematic framing.
- Codrops’ WebGL carousel work for authored motion and shader-native presentation.
