# Cinematic lighting and analytical shadows

## Actual goal

Make flattened pitch-deck slides feel present in a photographed space without making the deck harder to read, colouring a presenter’s face, lying about transparent export, or creating a second render path that drifts away from the master.

Lighting is not a vignette slider. One authored rig now governs three linked consequences:

1. **Surface response** on the moving, vertex-deformed cards.
2. **Cast and contact shadow** that explains distance, source direction, and weight.
3. **Environmental spill** that lets opaque backgrounds feel lit by the same source.

Preview, MP4, PNG stills, and PNG sequences all resolve the same rig from the same time value.

## Research translated into product rules

### Do not bolt built-in shadow maps onto a custom-deformed card

Three.js can render PCF, VSM, PCSS-style, and contact-shadow systems. But the moving slides are custom `ShaderMaterial` planes whose vertex shader changes their shape. A built-in depth pass would require a matching custom depth material to deform the shadow caster identically. It would also add at least one render target and create more alpha, sorting, memory, and export failure surfaces.

Drift instead uses the actual deformed view-space position in the slide fragment shader. Screen derivatives recover its normal after deformation. The analytical shadow uses the same rounded-superellipse language as the card and stays inside the existing bounded mesh pool.

This is a deliberate product trade, not a claim that an analytical drop shadow is physically equivalent to global illumination.

### Contact first, bloom second

A single uniformly blurred rectangle looks detached and synthetic. Each shadow therefore has two coupled lobes:

- a broad, directional cast whose softness and reach describe the source;
- a tight contact lobe near the card that anchors it before the penumbra blooms away.

The two alpha layers combine multiplicatively rather than simply adding, preventing the overlap from blowing past the requested density.

### Light the world, not the presenter’s face

The pinned presenter keeps neutral surface colour. The rig integrates it through a matching directional environmental shadow only. This avoids accidentally grading skin or making a talking-head insert look cosmetically inconsistent with its source video.

### Motion must close or freeze

`Light breath` is deliberately small. In ordinary preview it produces a restrained source sway. In seamless export it uses integer phase harmonics and returns to the same complete state at the master boundary. Reduced-motion preview/output sets the phase to zero. Slide and background grain are spatial, not wall-clock driven.

## Authored rigs

| Rig | Source logic | Shadow logic | Environmental shape | Best starting point |
| --- | --- | --- | --- | --- |
| Studio Soft | Broad warm key, cool readable fill | Short, soft, contact-rich | Softbox pool | Editorial, product, general use |
| Window Rake | Low warm side key | Long afternoon cast | Window panes | Travel, memory, documentary warmth |
| Projector Haze | Restrained frontal pool | Soft compact falloff | Projector aperture | Archive, evidence, screenings |
| Noir Slice | Low hard source, negative fill | Dense long cast | Narrow slit | Horror, thriller, dread |
| Golden Hour | Low amber key, violet air | Generous warm penumbra | Horizon rake | Romance, tenderness, nostalgia |
| Electric Rim | Cyan edge, ultraviolet fill | Controlled glossy depth | Edge wash | Music, speculative, nocturnal work |

Every manual edit converts the selected recipe to `Custom rig`. Recipes change direction, elevation, fill ratio, roughness, shadow reach, contact, spill, motion, and gobo structure—not merely colour.

## Director controls

### Lighting

- **Cinematic lighting** — one master bypass for card light, cast shadow, spill, and lighting-only surface texture. Off means source pixels pass through unchanged.
- **Light character** — authored coherent rig.
- **Key / fill colour** — restrained source tints.
- **Key angle / elevation** — direction and apparent source height.
- **Key intensity / fill / rim** — readable contrast architecture.
- **Sheen / surface roughness** — highlight size and response.
- **Light breath** — bounded source motion with seamless and reduced-motion rules.

### Shadow and spill

- **Shadow colour / density** — chromatic and alpha character.
- **Shadow reach** — requested cast distance, shortened analytically as elevation rises.
- **Shadow softness** — broad penumbra size.
- **Contact anchor** — strength of the tight near-card lobe.
- **Light shape** — softbox, window, projector, slit, sunset, or edge field.
- **Background spill / focus** — environmental strength and footprint.

## Rendering contract

- No new runtime dependency.
- No full-frame post-processing buffer.
- No dynamic shadow-map allocation.
- No additional draw call per light.
- Existing bounded pool remains 24 moving slide groups plus the optional presenter.
- Lighting uniforms update inside the existing render loop.
- H.264 remains opaque.
- Transparent PNG output omits the full-screen background and its spill but preserves compositable card and presenter shadows.
- All custom materials still encode once through Three.js’ output colour-space chunk.

## Portable-project compatibility

The portable settings schema remains version 1 because the extension is additive. A project written before lighting existed has no `lighting` object. The validator hydrates the neutral Studio Soft rig and copies the project’s legacy slide shadow opacity and softness into it.

This bridge applies only when the complete lighting object is absent. If a project supplies a malformed or partial lighting object, validation fails visibly instead of inventing values.

Legacy `slide.shadowOpacity` and `slide.shadowSoftness` remain in the schema for round-trip compatibility. New rendering and controls use the first-class lighting section.

## Gauntlet gates

The branch must pass all existing checks plus dedicated falsification for:

- six unique, fully valid rigs and six structural gobo fields;
- finite normalized light vectors at every control extreme;
- shorter shadows at higher source elevation;
- exact complete-state closure at seamless boundaries;
- time-invariant reduced-motion output;
- strict lighting bounds, colours, enums, and hostile unknown keys;
- schema-v1 legacy hydration without silent repair of malformed new data;
- derivative-based normals from the deformed surface;
- spatial rather than wall-clock grain;
- separate cast and contact shadow lobes;
- ascending `smoothstep` vignette edges;
- real Chromium/WebGL pixel change across rigs and pixel-stable rest frames;
- the repository’s complete TypeScript, unit, production-build, media, export, context-loss, accessibility, and portability suites.

## Human review matrix

Automated checks cannot judge taste. Review the finished branch with:

- white editorial slides, dark photographic slides, dense charts, and edge-to-edge portraits;
- both axes and every motion path;
- low and high tilt/depth;
- all six rigs at 9:16, 4:5, 1:1, and 16:9;
- opaque and transparent stills;
- pinned presenter enabled and disabled;
- maximum shadow reach and softness near frame edges;
- reduced-motion master and a seamless multi-loop master;
- 1080p and the largest surface accepted by the target GPU.

Reject a rig if the lighting becomes more memorable than the slide, if text contrast collapses, if the shadow reads as a sticker effect, or if a presenter’s source image is visibly recoloured.

## Primary references

- Three.js `ShaderMaterial`, `WebGLRenderer`, and `Object3D.customDepthMaterial` documentation.
- Three.js PCSS and contact-shadow examples.
- NVIDIA’s Percentage-Closer Soft Shadows sample for the contact-hardening perceptual cue.
- pmndrs/drei `ContactShadows` source for the explicit render-target and blur-pass cost model.
- Siena Film Foundation for restraint and ambient cinematic framing.
- Codrops’ WebGL carousel work for authored motion and shader-native presentation.
