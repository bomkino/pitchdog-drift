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

## Existing pitch.dog tools

Local Framer Components v3 and Galileo Gallery code were inspected for settings, portability, and failure lessons. Galileo is a DOM/CSS 3D renderer, not a Three.js/WebGL foundation. Drift therefore starts fresh instead of disguising inherited DOM motion as a cinematic renderer.

The useful negative lessons were equally important: never expose unused background controls, never collapse independent padding/geometry choices behind one value, never treat an automatic theme as permanently dark, and never confuse a timed hold with a truly independent pinned frame.

## Editorial explainer motion

The most useful lesson from Estelle Caswell's discussion of Vox Earworm is not a surface style. It is priority: visual evidence should prove the story, writing and visuals should be conceived together, a still image can deserve a long hold, and a transition that carries no information should not consume time merely to display technical skill.

- [Vox Earworm Storytelling: A Chat with Estelle Caswell](https://schoolofmotion.com/blog/estelle-caswell-vox-podcast) — visual evidence, restraint, writing to images, and transitions used rarely for pacing rather than spectacle.
- [Vox Earworm Emmy nominations](https://www.voxmedia.com/about-vox-media/2018/7/26/17619222/vox-news-documentary-emmy-award-nominations/) — primary-source context for the editorial design reference.

Drift translates those lessons into holds, material-led cuts, a delivery receipt, and a hard preference for readable evidence over transition complexity. It does not reproduce Vox graphics, fonts, palettes, or identity.

## Motion accessibility

[MDN's `prefers-reduced-motion` guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion) frames the preference as removal or replacement of non-essential motion. Drift therefore stops automatic travel and atmosphere while preserving deliberate Previous / Next navigation and information hierarchy. The explicit reduced-motion master remains a separate output decision.

## Open-source motion systems studied

The implementation was also checked against systems that solve adjacent parts of the problem:

- [Motion Canvas](https://github.com/motion-canvas/motion-canvas) treats informative animation as a programmed sequence with a real-time editor and explicit voice-over synchronization. The useful lesson for Drift is that editorial timing must be inspectable and addressable, not hidden inside frame-to-frame physics.
- [Theatre.js](https://www.theatrejs.com/) separates a sequence playhead from the renderer and lets artists refine keyframes and curves visually. Drift does not add Theatre as a dependency in this branch, but its cut-first / controls-second interface follows the same principle: a strong authored sequence should exist before low-level tweaking.
- [Anymotion](https://anymotion.art/) makes deterministic `seek(t)` and multi-frame visual inspection explicit parts of its rendering contract. Drift already has the same architectural invariant through `renderAtAsync(time)`; the gauntlet now tests repeated poses, source-deck closure, paused frames, and browser screenshots rather than accepting valid code as proof of valid motion.
- [Codrops' velocity-reactive Three.js galleries](https://tympanus.net/codrops/2026/03/09/building-a-scroll-reactive-3d-gallery-with-three-js-velocity-and-mood-based-backgrounds/) reinforce a useful separation: spatial layout, mood, and velocity are independent signals. Drift follows that split so velocity can add transient optical weight without becoming the source of carousel position or export timing.

A future narration timeline could add per-slide timing and cue markers. It should extend the deterministic evaluator rather than introduce an unrelated playback clock. This branch deliberately solves the stronger global-cut workflow first and documents the boundary instead of pretending one cadence fits every possible voice-over.
