# Background Atlas

Drift's backgrounds are not a stack of palette aliases. The atlas separates four decisions:

1. **Family** — solid, gradient, aura, paper, or void.
2. **Composition** — eight materially different spatial grammars inside each family.
3. **Palette** — twenty authored three-colour systems that can be applied independently.
4. **Variation** — one hundred deterministic recuts of the selected composition.

That produces 80,000 addressable opaque combinations before the user changes intensity, motion, grain, vignette, or any colour manually. Transparent output remains a first-class sixth option.

## Actual goal

Make pitch-deck slides feel placed inside a living cinematic field without turning the background into the subject. A good field should:

- establish genre and emotional pressure;
- survive vertical, square, and landscape stages;
- remain quiet enough for slide legibility;
- render identically at a given seed and time;
- close cleanly when seamless export is enabled;
- stop moving under reduced-motion output;
- avoid remote textures, runtime network calls, or a second render pass.

## Architecture

The renderer-facing uniform contract is unchanged:

```text
uResolution  uColorA  uColorB  uAccent  uMode
uIntensity   uMotion  uGrain   uVignette  uPhase  uSeed
```

The existing `background.seed` integer now carries an atlas address. Seeds below `10,000` stay in the legacy composition, preserving schema-v1 project readability and the original theme seeds. Atlas seeds use:

```text
10,000 + variation × 8 + composition
```

The shader decodes that address into one of eight recipes. Family still comes from the existing `background.style`; no settings migration or new dependency is required.

## Corpus

| Family | Compositions |
| --- | --- |
| Solid field | Pure field, Projector wash, Edge light, Duotone floor, Soft burn, Paper tooth, Low halo, Night exposure |
| Gradient weather | Legacy horizon, Horizon melt, Diagonal weather, Radial dusk, Prism bands, Twin suns, Split signal, Road mirage |
| Luminous aura | Orbiting bloom, Projector halo, Aurora veil, Stained light, Liquid caustic, Rose chamber, Ice bloom, Mandorla |
| Printed matter | Long fibres, Contact sheet, Risograph cloud, Linen drift, Newsprint, Silver emulsion, Halftone field, Dust archive |
| Darkroom void | Breathing slit, Eclipse, Ember smoke, Abyssal rays, Mineral fog, Rain negative, Chemical burn, Black tide |

Forty authored studies pair those structures with genre-specific palettes and treatment values. The studies are starting positions, not locked themes: composition, variation, palette, colours, intensity, breath, grain, and vignette remain independently editable.

## Motion and loop contract

Every animated coordinate is derived from `sin(uPhase × integer + offset)` or `cos(uPhase × integer + offset)`. When the exporter maps a master to whole phase loops, the background returns to the same state at the cut. No recipe performs unbounded linear panning.

Reduced-motion preview and export already set phase to zero in the engine. The atlas inherits that contract without separate code paths.

Grain is static in screen space and seeded. It does not sample `uPhase`, so a paused or reduced-motion field does not shimmer and a seamless cut does not expose a random-noise discontinuity.

## Performance boundaries

- One full-screen procedural pass.
- No texture samples.
- No framebuffer feedback or simulation state.
- Bounded four-octave noise loops.
- Uniform branches select one family and one composition per frame.
- Existing preview/export renderer and colour-space encoding remain unchanged.

The heaviest recipes use at most a small number of four-octave FBM evaluations. The browser gauntlet is responsible for catching shader compilation, console errors, viewport overflow, and runtime regressions.

## Research translated into product rules

- Shader Gallery's family/palette/evolution model suggested separating structural recipes from palette and seed.
- Siena Film Foundation's site reinforced controlled ambient motion and restraint around the work itself.
- `shader-web-background` reinforced uniform-driven, dependency-light backgrounds with robust fallback behaviour.
- Codrops' procedural studies reinforced aspect-correct coordinates and authored noise rather than downloaded video loops.

References:

- https://shader.gallery/
- https://www.commarts.com/webpicks/siena-film-foundation
- https://github.com/xemantic/shader-web-background
- https://tympanus.net/codrops/2023/04/27/building-a-webgl-carousel-with-react-three-fiber-and-gsap/
- https://tympanus.net/codrops/2024/09/23/creating-a-radial-procedural-noise-texture-with-webgl/

## Gauntlet receipt

Automated gates cover:

- catalogue uniqueness and complete family/composition coverage;
- all authored studies passing the persisted settings validator;
- seed codec round trips and legacy-seed behaviour;
- preservation of unrelated director settings;
- unchanged shader uniform API;
- all forty shader recipe markers;
- bounded noise loops and zero texture dependencies;
- static grain;
- no reversed-edge `smoothstep` calls;
- real-browser operation of studies, compositions, palettes, recuts, and transparency.

Manual visual review should still inspect at least one study from every family at 9:16, 1:1, and 16:9, plus the first and final frame of a seamless master.
