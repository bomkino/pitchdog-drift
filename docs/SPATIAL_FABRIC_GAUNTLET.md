# Spatial Fabric Dynamics — Gauntlet Record

Branch focus: **3Dness, paths, fabrics, physics. Nothing ornamental.**

## Actual goal

Make a slide carousel feel like matter moving through space—not flat cards receiving decorative wobble. The system must remain director-controllable, deterministic at export, safe at hostile settings, and light enough to preserve the existing bounded renderer.

## What changed

### 1. Coherent spatial paths

The evaluator now treats every flow as a parametric path with a numerical tangent. Slide banking comes from that tangent rather than a disconnected rotation preset. Depth, cross-axis displacement, scale, opacity, and orientation therefore describe one movement.

Ten flows ship: Straight, Arc, Ribbon, Cylinder, Tunnel, Helix, Orbit, Cascade, Figure Eight, and Switchback. `bank` controls how strongly tangent direction becomes slide orientation. All formulas are bounded and finite at minimum and maximum authored values.

### 2. Material characters, not generic wobble

The slide vertex shader contains four deliberately different deformation models:

- **Card:** restrained bow plus torsional edge.
- **Paper:** cylindrical curl and low-frequency buckle.
- **Silk:** broad travelling folds with quiet, pinned edges.
- **Gel:** coherent radial bulge with elastic lag.

Velocity drives deformation energy. `Fabric flex` remains the single amplitude control, preventing a cockpit of meaningless sliders. The fragment shader adds restrained grazing light and frame-stable, slide-space grain. It does not use time-varying slide grain, so exports do not shimmer.

### 3. Real thickness

Each slide has a bounded box shell behind the shader-deformed front plane. `3D thickness` is measured in scene pixels. It produces side faces under path banking, rather than faking every depth cue with a drop shadow. The shell shares the existing bounded pool; it adds no unbounded scene allocation.

### 4. Physics with a hard boundary

Preview motion uses a fixed-substep, semi-implicit second-order integrator. Four characters alter response, damping, coast, and impulse transfer: Direct, Weighted, Spring, and Drift.

Velocity and acceleration are clamped relative to slide stride. Delta time is capped and subdivided. Pointer/wheel impulses are bounded before entering state.

**Export does not integrate preview state.** Export distance and velocity remain analytic functions of settings and timestamp. This prevents frame-rate history, pointer history, and preview jank from changing rendered output.

### 5. Loop and reduced-motion contracts

Fabric phase uses an integer number of turns in seamless export, so the closing frame returns to the opening phase. Reduced-motion output and reduced-motion preview freeze fabric phase and inertial motion while preserving static spatial composition.

## Guardrails

- No cloth solver dependency. A full constraint mesh would multiply state, tuning, failure modes, and export risk for little editorial gain at Instagram scale.
- No GPU-compute dependency. The bounded vertex model gives the material read without requiring WebGPU or floating-point simulation textures.
- No new draw-call growth with asset count. Pool size remains bounded; the shell is one additional pooled mesh per resident slide.
- No background or lens-system expansion. Parallel branches own those concerns.
- Existing settings files remain schema-v1 compatible: missing branch-extension fields hydrate to defaults; malformed supplied fields still fail validation.

## Gauntlet gates

1. Every flow finite across both axes, all indices, large positive/negative travel, and control maxima.
2. Tangents remain normalized and banking remains bounded.
3. Physics remains finite after invalid state, pathological impulses, and 10-second frame gaps.
4. 60 Hz and 120 Hz integration stay materially close.
5. Every surface maps to a distinct shader branch.
6. Fabric phase closes over seamless duration and freezes for reduced motion.
7. Typecheck, unit tests, production build, and end-to-end suite pass before merge.

## Research translated into decisions

The useful pattern from high-end WebGL carousels is not “add Three.js.” It is the coupling of scroll velocity, curved geometry, and shader deformation. Three.js curve/tangent primitives reinforce the same architectural point: orientation should follow the path derivative. GPU computation helpers were reviewed, then rejected for this branch because deterministic bounded deformation solves the actual product need with less runtime and export complexity.

References:

- Codrops, *Building a WebGL Carousel with React Three Fiber and GSAP*: https://tympanus.net/codrops/2023/04/27/building-a-webgl-carousel-with-react-three-fiber-and-gsap/
- Three.js `Curve` and tangent APIs: https://threejs.org/docs/#api/en/extras/core/Curve
- Three.js `TubeGeometry`: https://threejs.org/docs/#api/en/geometries/TubeGeometry
- Three.js `GPUComputationRenderer`: https://threejs.org/docs/#examples/en/misc/GPUComputationRenderer
