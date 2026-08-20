# Research notes

References are inputs to judgment, not templates to copy. Drift borrows mechanisms and standards while keeping its composition, shaders, demo art, and motion language original.

## Siena Film Foundation

[Siena Film Foundation](https://www.siena.film/) treats a body of film work as a spatial, directed experience. The useful lessons were restraint, editorial typography, project metadata that remains legible, and navigation that feels like moving through cinema rather than browsing cards.

The project’s published case study is more specific about the motion language: the filmstrip combines WebGL, parallax layering, directional blur, saturation shifts, and motion blur that respond to interaction speed, while effects are deliberately stripped back when they obstruct use. Drift carries that deeper principle forward. Velocity should become an optical signal, but the image remains the subject.

Drift does not reproduce Siena’s interface, assets, or composition.

## WebGL carousel studies

- [Building a WebGL Carousel with React Three Fiber and GSAP](https://tympanus.net/codrops/2023/04/27/building-a-webgl-carousel-with-react-three-fiber-and-gsap/) — textured planes, cover UVs, drag/scroll, velocity-linked wave deformation, and edge stretching through post-processing.
- [Create an Abstract Image Slideshow with OGL, GLSL, and GSAP](https://tympanus.net/codrops/2021/08/16/abstract-image-carousel-ogl-glsl-gsap/) — concentrating transition state into one shader-driven value.
- [Building a Scroll-Reactive 3D Gallery with Three.js, Velocity, and Mood-Based Backgrounds](https://tympanus.net/codrops/2026/03/09/building-a-scroll-reactive-3d-gallery-with-three-js-velocity-and-mood-based-backgrounds/) — depth, palette, and velocity as separate but coordinated signals.
- [Creating a Smooth Horizontal Parallax Gallery: From DOM to WebGL](https://tympanus.net/codrops/?p=108925) — preserving semantic DOM as layout/fallback truth while WebGL enhances the experience.
- [SDF Lens Blur](https://tympanus.net/codrops/2024/07/01/sdf-lens-blur/) — treating defocus as authored lens behavior rather than applying an indiscriminate DOM blur.

The crucial divergence is output. Those studies optimise interactive experience. Drift also needs reproducible video masters, so GSAP/rAF never defines export time; `n / fps` does. Every scene-wide optical signal is therefore a function of saved settings, evaluated time, evaluated velocity, axis, and pixel position.

## Optical pipeline

Three.js’ official [ShaderPass documentation](https://threejs.org/docs/#examples/en/postprocessing/ShaderPass) confirms the standard full-frame pattern: render a scene to a texture, then sample that texture through a screen-space material. Drift implements the same architectural separation without importing the general post-processing stack, keeping target ownership, alpha behavior, and deterministic timing explicit.

The official [colour management guide](https://threejs.org/manual/en/color-management.html) shaped the colour boundary. Source textures are sRGB, scene calculations stay linear, the intermediate scene target carries no output colour space, and the final optical shader performs the one output transform when it writes to the browser canvas. This avoids encoding the scene, decoding it ambiguously in a custom sampler, and encoding it again.

Three.js’ WebGPU/TSL [ChromaticAberrationNode](https://threejs.org/docs/pages/ChromaticAberrationNode.html) was useful as confirmation that aberration belongs in screen space. Drift remains WebGL2-first because the current export pipeline, canvas capture, browser coverage, and existing failure receipts are stronger there. The settings/evaluator boundary remains renderer-independent enough for a later WebGPU backend.

The optical direction uses several constraints rather than one “cinematic” slider:

- soft focus is centre-weighted and can fall off toward the edges;
- motion smear follows the carousel axis and actual evaluated velocity;
- chromatic separation is radial plus directional, weak at the centre and stronger around moving edges;
- neutral bloom and warm halation are separate controls;
- flare is horizontal and highlight-gated rather than painted over every frame;
- gate weave, breathing, and grain are deterministic at a saved timestamp;
- transparent pixels stay alpha-safe through the intermediate target;
- the presenter can render after the pass, preserving a crisp talking head against an optically treated world.

## Atmosphere corpus

A larger background corpus can easily become a pile of shader tricks. Drift instead treats every atmosphere as an authored family driven by the same compact contract: three colours, intensity, motion, grain, vignette, scale, softness, complexity, parallax, phase, and seed.

The fourteen rendered families cover distinct material ideas: solid, gradient, aura, paper, void, horizon, fog, prism, velvet, emulsion, night drive, tidal light, ember smoke, and projector gate. They share deterministic noise helpers and bounded controls, but each has a different spatial sentence. The result is wider without becoming random or impossible to art-direct.

## Prior pitch.dog systems

Framer Components v3 was studied for its control contract rather than its surface style: complete defaults, safe ranges, one motion owner, reduced-motion stills, responsive geometry, explicit media lifecycle, no React state per frame, and no hidden work while off-screen.

Galileo Gallery was studied for authored style profiles. Its durable lesson is that a useful preset is a coherent parameter world, not a palette swap. Drift’s twelve film worlds therefore coordinate path, pace, spacing, depth, surface, atmosphere, and lens recipe. Manual optical edits deliberately mark the lens state as `custom`.

## Continuous corners

[Figma’s corner smoothing documentation](https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing) identifies 60% as its iOS-style default. Drift exposes the full 0–100% range and defaults to 60%, approximated in the fragment shader with a bounded superellipse exponent rather than a visual-only CSS border radius.
