# Research notes

References are inputs to judgment, not templates to copy. Drift borrows mechanisms and standards while keeping its composition, shaders, demo art, and motion language original.

## Siena Film Foundation

[Siena Film Foundation](https://www.siena.film/) treats a body of film work as a spatial, directed experience. Its useful lessons for Drift were restraint, strong editorial typography, project metadata that remains legible, and navigation that feels like moving through cinema rather than browsing cards.

Drift does not reproduce Siena’s interface or assets. It carries forward the more durable principle: atmosphere should intensify the work, not bury it.

## WebGL carousel studies

- [Building a WebGL Carousel with React Three Fiber and GSAP](https://tympanus.net/codrops/2023/04/27/building-a-webgl-carousel-with-react-three-fiber-and-gsap/) — textured planes, cover UVs, drag/scroll, velocity-linked effects.
- [Create an Abstract Image Slideshow with OGL, GLSL, and GSAP](https://tympanus.net/codrops/2021/08/16/abstract-image-carousel-ogl-glsl-gsap/) — concentrating transition state into one shader-driven value.
- [Building a Scroll-Reactive 3D Gallery with Three.js, Velocity, and Mood-Based Backgrounds](https://tympanus.net/codrops/2026/03/09/building-a-scroll-reactive-3d-gallery-with-three-js-velocity-and-mood-based-backgrounds/) — depth, palette, and velocity as separate but coordinated signals.
- [Creating a Smooth Horizontal Parallax Gallery: From DOM to WebGL](https://tympanus.net/codrops/?p=108925) — preserving semantic DOM as layout/fallback truth while WebGL enhances the experience.

The crucial divergence is output. Those studies optimise interactive experience. Drift also needs reproducible video masters, so GSAP/rAF never defines export time; `n / fps` does.

## Continuous corners

[Figma’s corner smoothing documentation](https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing) identifies 60% as its iOS-style default. Drift exposes the full 0–100% range and defaults to 60%, approximated in the fragment shader with a bounded superellipse exponent.

## Film grain

Animated grain is treated as a finishing process, not decorative static.

- Unity’s open-source post-processing stack uses a filtered grain plate, luminance response, per-frame offsets, and final-image application rather than independently crawling RGB pixels: [controller](https://github.com/Unity-Technologies/PostProcessing/blob/v2/PostProcessing/Runtime/Effects/Grain.cs), [grain baker](https://github.com/Unity-Technologies/PostProcessing/blob/v2/PostProcessing/Shaders/Builtins/GrainBaker.shader), and [application](https://github.com/Unity-Technologies/PostProcessing/blob/v2/PostProcessing/Shaders/Builtins/Uber.shader#L177-L186).
- The [AV1 film-grain model](https://github.com/AOMediaCodec/av1-spec/blob/master/07.bitstream.semantics.md#film-grain-params-semantics) reinforces three useful principles: frame-derived seeds, luminance-aware scaling, and spatial correlation.
- NVIDIA’s [spatiotemporal blue-noise research](https://research.nvidia.com/publication/2021-12_scalar-spatiotemporal-blue-noise-masks) shows why independently animated spatial noise can shimmer. Drift does not ship an STBN asset, but it adopts the stricter temporal question: does the sequence feel stable, not merely look plausible as one still?

Drift’s resulting judgment is specific rather than universal: monochrome world-only grain; a correlated fine/clump plate; one deterministic plate per export frame; preview cadence capped at 30 Hz; no procedural grain on slide or presenter pixels; exact stillness under Pause and Reduce Motion; and a bounded display-space finish so dark palettes survive 8-bit quantisation without turning into digital snow. Final approval includes a second-generation H.264 transcode because social delivery can turn beautiful high-frequency texture into codec mosquitoes.

## Generative painting and living pigment

[Surya Mattu's account of prompting Qwen to paint with code](https://surya.website/rling-qwen-to-paint-with-code) was a visual provocation for a more classical background family: translucent colour bodies, exposed construction lines, marginal notation, paper as an active material, and accidents that feel composed rather than sprayed on. The linked public p5.js sketches were treated as view-only references because an accessible editor page is not itself a reuse licence; Drift includes none of their source.

[p5.brush](https://github.com/acamposuribe/p5.brush) is an MIT-licensed open-source library for watercolour, bleeding, hatching, flow fields, and plotter-like marks. It proved that this territory has a healthy reusable commons. Drift does not add the dependency: its renderer already needs deterministic raw GLSL, fixed-step export, and one WebGL draw path. Atelier therefore translates the general media principles—not the library's implementation—into eight original, aspect-correct shader compositions.

The resulting rules are narrow: transparent glazes before linework; pooled edges without simulated-fluid theatre; static paper tooth separated from animated film grain; a few closed integer harmonics for motion; stable negative space for slides; and distinct material structure before palette. The reference image is not bundled, traced, sampled, or reconstructed.

## Borders and shadows

[Evan Wallace’s rounded-rectangle shadow derivation](https://madebyevan.com/shaders/fast-rounded-rectangle-shadows/) treats a shadow as Gaussian falloff from the original shape and bounds useful support around the blur. That distinction repaired Drift’s earlier failure: the expanded shadow plane is support for the falloff, never the shadow caster itself.

The aesthetic conclusion is Drift’s own. Borderless cards are the default; Noir Contact alone earns an opaque 1 px documentary keyline. Semi-transparent default borders created a second indecisive silhouette and were removed.

## Existing pitch.dog tools

Local Framer Components v3 and Galileo Gallery code were inspected for settings, portability, and failure lessons. Galileo is a DOM/CSS 3D renderer, not a Three.js/WebGL foundation. Drift therefore starts fresh instead of disguising inherited DOM motion as a cinematic renderer.

The useful negative lessons were equally important: never expose unused background controls, never collapse independent padding/geometry choices behind one value, never treat an automatic theme as permanently dark, and never confuse a timed hold with a truly independent pinned frame.
