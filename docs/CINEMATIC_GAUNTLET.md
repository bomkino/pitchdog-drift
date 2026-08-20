# Cinematic gauntlet

Research and implementation pass: **20 August 2026**.

## Actual goal

Drift is not trying to imitate a film website inside an editor. It needs to turn pitch-deck slides into authored moving-image compositions while preserving the thing that matters: the slide remains readable, export remains deterministic, and the tool remains usable by someone directing feeling rather than programming shaders.

The upgrade therefore targets four material qualities:

1. **Motion has optical consequence.** Speed must alter the image, not merely move the plane.
2. **Atmosphere has structure.** A background must feel composed, not like a random gradient preset.
3. **Worlds differ in behaviour.** Genre presets must change path, pace, depth, surface, optics, and atmosphere together.
4. **Restraint survives the controls.** Even aggressive settings stay bounded and settle cleanly.

## Reference study

- [Siena Film Foundation](https://siena.film/) — art-direction reference for a filmstrip rhythm where directional blur and saturation changes respond to speed. The useful lesson is restraint: every effect reinforces the cinematic identity rather than competing with the content.
- [Building a WebGL Carousel with React Three Fiber and GSAP](https://tympanus.net/codrops/2023/04/27/building-a-webgl-carousel-with-react-three-fiber-and-gsap/) — technical reference for plane-based media, correct cover UVs, scroll-linked deformation, and reusable control surfaces.
- [Creating Wavy Infinite Carousels in React Three Fiber with GLSL Shaders](https://tympanus.net/codrops/2025/11/26/creating-wavy-infinite-carousels-in-react-three-fiber-with-glsl-shaders/) — reference for modulo wrapping and velocity-driven vertex displacement.
- [Building a 3D Infinite Carousel with Reactive Background Gradients](https://tympanus.net/codrops/2025/11/11/building-a-3d-infinite-carousel-with-reactive-background-gradients/) — reference for inertial motion, focus-by-distance, and a foreground/background system that behaves as one composition.
- [Three.js color management](https://threejs.org/manual/en/color-management.html) — custom `ShaderMaterial` output must perform its own display colour-space conversion. Every custom fragment shader keeps `colorspace_fragment` after its final colour write.

Drift borrows principles, not compositions, source code, assets, or branding.

## Lens response

The previous shader bent geometry and sampled the slide once. That produced movement, but not lens behaviour.

The new shader uses the existing bounded `distortion` setting as a coherent **Lens response** master. This avoids a panel full of mutually destructive effect sliders while still giving the director a clean zero-to-one range.

### Dynamic stack

At each fragment:

1. Normalize carousel velocity to `[-1, 1]`.
2. Apply a small velocity-linked UV bend and slide-locked registration offset.
3. Accumulate seven trailing samples along the motion axis for directional smear.
4. Sample red and blue at opposed offsets for a restrained chromatic split.
5. Mix four cross-axis samples for soft focus.
6. Spread warm colour only from highlights for halation.
7. Ease saturation down slightly as speed rises.
8. Pin fine microtexture to slide space so it travels with the frame instead of flickering over it.
9. Draw the border after optical processing so the frame remains geometrically clean.

### Bounds

- Motion blur radius: at most `12 × speed × lensResponse` pixels before weighted trailing taps.
- Chromatic offset: sub-pixel at quiet settings; a few pixels only in fast, aggressive worlds.
- Soft focus: persists at a sub-pixel level in high-response worlds but does not animate at rest.
- Registration offset: multiplied by velocity and fixed to the slide, so paused and reduced-motion frames do not swim.
- Presenter media: remains optically clean because its velocity and distortion uniforms stay at zero.
- All output remains in the shader’s linear working space until the final sRGB conversion.

A global post-processing blur was rejected for this pass. It would blur the pinned presenter, complicate transparent export, allocate an additional full-resolution render target, and make alpha/color-space correctness harder. Per-plane optics preserve the current deterministic export architecture.

## Motion corpus

Five paths became eight:

| Path | Behaviour | Best use |
| --- | --- | --- |
| Straight | Flat procession with shallow depth | Documentary, drama, contact sheets |
| Arc | Bowed path and edge rotation | Travel, western, broad cinematic movement |
| Ribbon | Sine-wave cross movement | Editorial, romance, coastal memory |
| Cylinder | Ring-like depth and yaw | Music, crime, sculptural decks |
| Tunnel | Edge recession and stronger perspective | Horror, thriller, science fiction |
| Helix | Twisting cross/depth cycle | Music, comedy, signal-driven work |
| Cascade | Diagonal fall with progressive depth | Holiday, projector, experimental horror |
| Orbit | Near/far elliptical movement | Romance, fantasy, intimate spectacle |

Every path uses the same deterministic evaluator for preview and export. Tests sweep every path in both axes at maximum tilt/depth and reject non-finite output.

## Background corpus

The six public background choices remain simple: transparent, solid, gradient, aura, paper, and void. The opaque shader families are now deeper internally.

Each opaque family contains four deterministic compositions selected by `seed mod 4`, then further varied by seeded noise:

- **Gradient:** projector bloom, horizon burn, prism wash, liquid field.
- **Aura:** four different blob arrangements with domain-warped veils.
- **Paper:** fold, stain, archival bars, fogged emulsion.
- **Void:** projector cone, breathing slit, eclipse corona, night-road streaks.

Every family also receives sparse dust, restrained static grain, and aspect-correct vignette. `World variation` exposes the seed directly. The same settings and timestamp always produce the same frame. In seamless mode, every animated background term is a closed periodic orbit, so the state at the loop boundary returns exactly.

The shader uses compact value-noise FBM only where structure needs it. Solid avoids procedural field structure while retaining the global grain, dust, and vignette controls. Transparent bypasses the background scene entirely.

## Authored film worlds

The corpus now contains eighteen worlds. A world is a coherent settings bundle, not a colour swap.

| World | Primary language |
| --- | --- |
| Editorial Drift | Warm paper, vertical ribbon, long breath |
| Road Memory | Sun-struck lateral arc and horizon haze |
| Dread | Slow upward tunnel and crimson void |
| Noir Contact | Hard monochrome contact sheet |
| Tender Light | Rose-lit soft orbit |
| Chrome Dream | Ultraviolet electric helix |
| Projector Bloom | Milky classic-cinema flare |
| Midnight Run | Wet-asphalt thriller tunnel |
| Salt Air | Coastal ribbon and sea-glass field |
| Winter Celluloid | Frost-blue holiday cascade |
| Folklore Ember | Smoke, moss, and firelit orbit |
| Acid Matinee | Candy-colour comic helix |
| Archival Blue | Cyanotype evidence field |
| Desert Heat | Western horizon arc and mirage optics |
| Lunar Signal | Quiet science-fiction telemetry helix |
| Velvet Crime | Oxblood cylinder and bruised luxury |
| Body Static | Damaged-signal experimental horror |
| Daylight Intimacy | Nearly invisible human-drama movement |

Regression tests require unique IDs and seeds, both axes and directions, all eight paths, at least four background families, and a meaningful spread of speed and lens response.

## Control-surface pass

The Director panel now exposes previously hidden engine settings:

- Edge falloff.
- Drag weight.
- Background seed as World variation.
- Eight motion paths.
- Dynamic theme count instead of a stale hard-coded number.

`Optical bend` became `Lens response` because the shader now does considerably more than deform geometry. The hint names the actual consequences instead of selling an effect.

## Failure-mode review

| Failure | Guard |
| --- | --- |
| Typography becomes unreadable | Bounded sample radii; clean border drawn after optics; chroma mix capped |
| Paused frame still swims | Dynamic registration/blur depend on velocity; microtexture is slide-locked |
| Reduced-motion export retains effects | Export velocity becomes zero; only deliberate static softness and slide-locked texture may remain |
| Pinned talking head becomes blurry | Presenter material keeps distortion and velocity at zero |
| Seed makes exports nondeterministic | No runtime randomness; seed and analytic phase are uniforms |
| Background becomes noise soup | Sparse dust, low grain ceiling, static grain, family-specific composition before texture |
| New paths produce NaN/Infinity | Full axis/path sweep in deterministic evaluator tests |
| Theme registry drifts from validation | Theme and flow unions derive from exported constant registries |
| Custom shaders double-convert colour | One `colorspace_fragment` include after final output per fragment shader |
| Large theme corpus becomes palette spam | Tests require path, direction, axis, speed, optics, seed, and background diversity |
| Seamless master jumps at the cut | Background drift uses closed sine/cosine orbits and integer phase harmonics; slide texture has no time dependency |

## Gauntlet gates

A change is not complete until:

1. TypeScript and production build pass.
2. Deterministic unit tests pass.
3. Shader contract tests pass.
4. Every theme validates against the settings trust boundary.
5. Every motion path stays finite in both axes.
6. Chromium WebGL preview starts without shader compile errors.
7. Real-browser export, fallback, media, and portable-project tests pass.
8. The PR CI receipt is green.

## Deliberate non-goals

- Moving-track video remains out of scope for v1. One pinned video keeps decoder and A/V-sync behaviour legible.
- Effects do not imitate lens brands, film stocks, or copyrighted title sequences.
- No remote image-generation service or stock background corpus is introduced. The wider background language is procedural, local, deterministic, and palette-controlled.
- WebGPU is not introduced opportunistically. The current WebGL2 path already has mature export and fallback gates; a renderer migration deserves its own measured branch.
