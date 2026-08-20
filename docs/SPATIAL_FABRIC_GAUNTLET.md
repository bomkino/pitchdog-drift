# Spatial Fabric Gauntlet

This branch asks one narrow question:

> Can a pitch-deck carousel feel like matter travelling through authored space,
> without sacrificing slide legibility, local-first operation, deterministic
> export, transparent output, or the pinned presenter?

The answer is implemented as one coupled system. Paths decide where slides are.
Tangents decide how they face. Preview physics decides how the hand transfers
energy. Acceleration and travel decide how each material deforms. A rounded,
lit sidewall makes thickness readable when the path exposes it.

No global post-processing stack. No dependency-heavy rigid-body engine. No
stateful cloth solver entering export.

## User journey contract

A director should be able to:

1. Pick a film world and immediately see a coherent path, response, material,
   and edge depth.
2. Drag or wheel the stage and feel the selected physics character in the hand.
3. Pause and see the entire material freeze without a phase jump.
4. Set `Curve`, `Depth`, `Banking`, `Fabric flex`, or `3D thickness` to zero and
   receive a truthful zero state.
5. Keep the pinned presenter clean, flat, sharp, and independent.
6. Export the same timestamp twice and receive the same frame.
7. Enable seamless output and close the path, the fabric phase, and background
   phase together.
8. Work for hours without preview coordinates growing until floating-point
   precision visibly degrades.

Every item above has either a unit contract, a browser contract, or both.

## Ten spatial paths

The evaluator exposes ten authored paths:

- **Straight** — a disciplined strip with restrained depth.
- **Arc** — a one-sided cinematic bow.
- **Ribbon** — an S-curve with a soft depth falloff.
- **Cylinder** — a shallow wrap around a cylindrical wall.
- **Tunnel** — a focal centre with aggressive depth at the edges.
- **Helix** — corkscrew lateral motion and depth.
- **Orbit** — a close circular sweep around the focal plane.
- **Cascade** — layered waves with stepped depth.
- **Figure Eight** — a crossing lemniscate.
- **Switchback** — harder lateral reversals with continuous depth.

Each sample returns position, tangent, bend, orientation, focus scale, and
opacity. Banking follows the tangent; it is not a second unrelated rotation
preset. `Curve = 0` and `Depth = 0` collapse every path to the same honest flat
strip.

The path implementation uses the same principle as Three.js curves:
orientation follows a unit tangent, and bend is derived from neighbouring path
samples. The engine keeps this evaluator allocation-free because it runs for
every resident slide on every rendered frame.

## Physics that reaches the hand

The first implementation changed autoplay easing but left pointer and wheel
handlers on the old direct velocity mutations. That meant the `Physics`
selector did not govern the interaction users actually feel.

The corrected contract routes drag and wheel displacement through the same
bounded impulse model:

- **Direct** — immediate response, strong braking, almost no coast.
- **Weighted** — restrained mass and a short cinematic settle.
- **Spring** — faster recovery with visible but bounded overshoot.
- **Drift** — the longest coast and least resistance after release.

Preview integration is semi-implicit and split into fixed substeps no larger
than `1 / 120 s`. Frame gaps are capped. Velocity, acceleration, displacement,
and release impulses are bounded relative to slide stride. Invalid values are
sanitised before they can poison the render loop.

Pause and reduced-motion preview are hard stops. Manual positioning remains
available, but kinetic continuation does not sneak past the transport state.

Long-running preview position is rebased to the nearest equivalent track
coordinate. Because the carousel and fabric are track-periodic, this changes no
pixels and prevents large-number precision loss.

## Four materials, four deformation logics

The material selector does not alter one wobble amplitude. It selects four
different vertex-deformation branches:

### Card

Rigid stock. Acceleration creates a restrained bow and torsional edge. Constant
motion alone produces little deformation.

### Paper

Cylindrical curl, one broad buckle, and a small memory of path curvature. It
avoids high-frequency rubber motion.

### Silk

Broad travelling folds, diagonal bias, and quiet pinned edges. The fragment
shader adds a restrained grazing sheen derived from the deformed geometry.

### Gel

One coherent elastic mass. Acceleration shifts the bulge behind the hand, while
constant velocity contributes a smaller lag.

The deformation energy combines velocity, acceleration, and path bend. It has
a true zero state. Fabric travel is derived from carousel distance—not wall
clock—so pausing freezes it without snapping to another pose. Whole-track
movement advances an integer number of fabric turns, making seamless cuts
close exactly.

Slide grain is locked to slide UV space and a stable slide seed. It cannot
sparkle differently because another frame was rendered.

## Deformed-surface lighting

The original shader brightened pixels from a scalar warp value. That looked
plausible in one direction but was not lighting.

The current fragment shader reconstructs the deformed view-space normal from
screen-space derivatives:

```glsl
normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)))
```

Diffuse, rim, and specular terms remain deliberately narrow. The deck is the
subject; surface lighting exists to reveal folds, not to recolour the artwork.

## Continuous-corner 3D shell

A rectangular `BoxGeometry` behind a continuously rounded slide creates a
visible lie at every banked corner. It also gave the pinned presenter an
accidental shell and allocated one geometry per resident item.

The corrected shell:

- Samples the same radius and superellipse-smoothing family as the front mask.
- Builds only a sidewall and rear plate; the image shader remains the front.
- Uses one shared indexed `BufferGeometry` across the bounded resident pool.
- Regenerates only when width, height, radius, or smoothing changes.
- Computes normals and bounds once per regeneration.
- Uses `MeshStandardMaterial` with restrained surface-specific roughness.
- Receives a hemisphere fill and directional key.
- Is explicitly absent from the pinned presenter.
- Disposes the shared geometry once and each per-item material once.

`MeshPhysicalMaterial` was considered for silk sheen. It was rejected for the
shell because its additional per-pixel cost is unnecessary here. The slide
shader already supplies material-specific front-face response; the sidewall
only needs legible depth.

## Deterministic export boundary

Preview state never enters export.

Export position and velocity remain analytic functions of settings and
timestamp. Export acceleration is zero because the authored master travels at
constant analytic velocity. Material airflow still responds to that velocity.
Surface phase derives from analytic distance and track length.

Therefore:

- Pointer history cannot alter an export.
- Display refresh rate cannot alter an export.
- A dropped preview frame cannot alter an export.
- Pausing preview cannot alter an export.
- Seamless start and end share the same path and surface pose.
- Reduced-motion output returns static distance, velocity, acceleration, and
  fabric phase.

## Performance budget

The branch deliberately avoids:

- A rigid-body dependency.
- A CPU cloth constraint mesh per slide.
- A floating-point simulation texture.
- A full-frame post-processing target.
- Per-asset scene growth.
- Per-frame geometry creation.
- `MeshPhysicalMaterial` for every edge.
- Time-driven random grain.

The bounded pool remains the dominant invariant. Imported asset count changes
texture residency and logical slots, not scene-object count.

## Gauntlet coverage

### Unit

- Ten paths across horizontal and vertical axes.
- Maximum controls and long positive/negative travel.
- Unit tangents, bounded bend, finite transforms.
- Distinct path signatures.
- Honest curve/depth zero state.
- Banking changes orientation but not path position.
- Complete asset cycles at the wrap seam.
- 60 / 120 / 240 Hz physics comparison.
- Invalid state, ten-second frame gaps, and extreme impulses.
- Distinct drag response for all four physics characters.
- Long-session coordinate rebasing.
- Track-locked fabric phase closure.
- Four distinct material profiles.
- Continuous-corner shell bounds, normals, radius, smoothing, and vertex budget.
- UI/validation thickness-limit parity.
- Legacy extension hydration and malformed extension rejection.
- Shader uniforms, deformed normals, stable grain, and no wall-clock surface time.
- No `BoxGeometry`, `MeshBasicMaterial`, presenter shell, or per-item shell geometry.

### Browser

- Helix + spring + silk + thickness renders without console errors.
- Paused material output is pixel-stable after background motion and grain are
  explicitly disabled.
- Card, paper, silk, and gel produce four distinct rendered frames.
- Flat and thick edges produce distinct rendered frames.
- Drag changes the rendered composition and exposes correct dragging state.
- Dynamic help copy explains what path, physics, and material choices do.

### Repository

```text
npm run typecheck
npm test -- --run
npm run build
npm run test:e2e
git diff --check
```

## Research translated into decisions

- Three.js `Curve#getTangent()` and Frenet-frame concepts support tangent-led
  orientation, but this engine keeps its path sampler allocation-free.
- Three.js `BufferGeometry` supports indexed positions, normals, computed
  bounds, and explicit disposal: the right primitive for a shared shell.
- `MeshBasicMaterial` ignores lights, so it cannot reveal authored edge depth.
- `MeshStandardMaterial` supplies per-fragment PBR response at a reasonable
  cost for the bounded shell pool.
- `MeshPhysicalMaterial` offers fabric sheen, but the Three.js documentation
  explicitly notes its higher per-pixel cost. That cost belongs only where it
  materially changes the result.
- The Codrops WebGL carousel reference is strongest when geometry, camera,
  scrolling, and shader response behave as one motion language. Drift follows
  that principle while retaining deterministic local export.

References:

- https://threejs.org/docs/pages/Curve.html
- https://threejs.org/docs/pages/BufferGeometry.html
- https://threejs.org/docs/pages/MeshStandardMaterial.html
- https://threejs.org/docs/pages/MeshPhysicalMaterial.html
- https://threejs.org/docs/pages/MeshBasicMaterial.html
- https://tympanus.net/codrops/2023/04/27/building-a-webgl-carousel-with-react-three-fiber-and-gsap/
