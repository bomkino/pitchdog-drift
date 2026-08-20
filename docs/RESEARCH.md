# Research notes

References are inputs to judgment, not templates to copy. Drift borrows mechanisms and standards while keeping its composition, shaders, demo art, and motion language original.

## Siena Film Foundation

[Siena Film Foundation](https://www.siena.film/) treats a body of film work as a spatial, directed experience. Its useful lessons for Drift were restraint, strong editorial typography, project metadata that remains legible, and navigation that feels like moving through cinema rather than browsing cards.

The WebGL filmstrip is especially instructive because movement changes the image optically: directional blur, saturation pressure, and atmosphere answer speed. Drift keeps that relationship but rejects permanent spectacle. The focal slide must remain useful as a pitch-deck slide, not dissolve into a showreel effect.

Drift does not reproduce Siena’s interface or assets. It carries forward the more durable principle: atmosphere should intensify the work, not bury it.

## WebGL carousel studies

- [Building a WebGL Carousel with React Three Fiber and GSAP](https://tympanus.net/codrops/2023/04/27/building-a-webgl-carousel-with-react-three-fiber-and-gsap/) — textured planes, cover UVs, drag/scroll, velocity-linked effects, and depth-led focus.
- [Create an Abstract Image Slideshow with OGL, GLSL, and GSAP](https://tympanus.net/codrops/2021/08/16/abstract-image-carousel-ogl-glsl-gsap/) — concentrating transition state into one shader-driven value.
- [Building a Scroll-Reactive 3D Gallery with Three.js, Velocity, and Mood-Based Backgrounds](https://tympanus.net/codrops/2026/03/09/building-a-scroll-reactive-3d-gallery-with-three-js-velocity-and-mood-based-backgrounds/) — depth, palette, and velocity as separate but coordinated signals.
- [Creating a Smooth Horizontal Parallax Gallery: From DOM to WebGL](https://tympanus.net/codrops/?p=108925) — preserving semantic DOM as layout/fallback truth while WebGL enhances the experience.

The crucial divergence is output. Those studies optimise interactive experience. Drift also needs reproducible video masters, so GSAP/rAF never defines export time; `n / fps` does.

## Optical implementation choice

Three.js supports render targets and post-processing passes, and its current TSL layer includes chromatic aberration, blur, and depth-of-field nodes. Drift deliberately does not route the whole frame through an additional render target in this version.

Reasons:

1. Transparent PNG output should preserve alpha without a second compositing contract.
2. Export can reach 8192 × 8192. A full-resolution colour target adds material GPU memory pressure before encoding begins.
3. The pinned presenter should stay clean while the moving track carries velocity.
4. Per-slide effects can branch to one texture sample at rest and spend extra samples only where optical energy exists.

The result is not “no post-processing.” It is object-local post-processing: image sampling, defocus, motion blur, and RGB separation happen in the slide fragment shader where the engine already supplies velocity, distortion, plane size, and focus opacity.

## Background corpus

A background preset is not a colourway. Each opaque shader engine now owns four silhouettes:

- **Solid:** ink matte, low practical light, pale diffusion, submerged oil.
- **Gradient:** sodium horizon, polar dawn, rain field, road mirage.
- **Aura:** projector beam, chamber light, water refraction, mineral fog.
- **Paper:** silver emulsion, warm stock, archive damage, chemical burn.
- **Void:** eclipse, ember smoke, abyssal slit, liquid chrome.

The scene seed modulo four selects the silhouette. Higher seed bits re-cut deterministic noise placement. This gives authored variation without a schema migration or `Math.random()` in render.

## Continuous corners

[Figma’s corner smoothing documentation](https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing) identifies 60% as its iOS-style default. Drift exposes the full 0–100% range and defaults to 60%, approximated in the fragment shader with a bounded superellipse exponent.

## Existing pitch.dog tools

Local Framer Components v3 and Galileo Gallery code were inspected for settings, portability, and failure lessons. Galileo is a DOM/CSS 3D renderer, not a Three.js/WebGL foundation. Drift therefore starts fresh instead of disguising inherited DOM motion as a cinematic renderer.

The durable v3 lessons are applied directly: presets must be coherent parameter bundles, controls are grouped by task, static/export states are authored, motion has one clock, and visual finish cannot weaken lifecycle or deterministic output.

The useful negative lessons were equally important: never expose unused background controls, never collapse independent padding/geometry choices behind one value, never treat an automatic theme as permanently dark, and never confuse a timed hold with a truly independent pinned frame.
