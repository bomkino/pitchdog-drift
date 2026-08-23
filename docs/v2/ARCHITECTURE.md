# Drift V2 architecture

## One source of creative truth

`DriftProjectV4` is the saved creative model. UI controls issue bounded project transformations; they do not create a parallel settings document. Recipe references and fingerprints record where authored values came from. Domain locks decide what a World may change. Compatibility projects remain inert until the user explicitly applies a V2 World.

Undo and redo store validated Project V4 snapshots. Continuous gestures coalesce into one meaningful history step. A/B temporarily displays the previous accepted project without changing the current project, autosave, or export authority.

## One frame path

```text
Project V4 + ordered media + exact time
                  │
                  ▼
        explicit scene evaluator
       lifecycle · tempo · events
       space · matter · light · lens
                  │
                  ▼
       Three.js/WebGL2 draw graph
          │        │        │
       preview   PNG       MP4 frames
```

Sequence and MP4 frames own time as `frameIndex / fps`. Preview supplies an explicit master time. Export never depends on the wall clock, a previous rendered frame, free-running noise, or interaction inertia.

## Render ownership

- The background pass owns atmosphere and world grain.
- The moving-card pass owns slide texture, continuous corners, deformation, rear-shell depth, light response, and shadow.
- The protected presenter pass owns its own crop, matte, corners, border, shadow, and media clock; global material and grain cannot contaminate it.
- The lens pass owns optional scene-wide diffusion, aberration, wear, and the final colour transform.
- Transparent output bypasses opaque background composition while retaining correct premultiplied-alpha edges.

## Semantic sound

The visual evaluator emits deterministic body, air, contact, and landing events. The sound planner maps those events to local provenance-locked recordings using the selected palette, grammar, density, texture, and take. Preview decodes only the required lazy-loaded assets. Export renders an exact-duration 48 kHz stereo buffer, then optionally mixes the presenter beneath or above it according to the under-voice control.

Sound is disabled by default. No source is fetched at runtime.

## Native boundary

The V2 development identity reuses the hardened AppKit/WebKit shell without taking over production document ownership. AppKit owns Finder panels, opaque file grants, staged writes, rollback, window state, native AAC, and the sandbox. The Web application owns project evaluation and pixels. Typed bridge commands are the only crossing point.

The Mac package aliases the browser AAC extension to the project-authored AudioToolbox bridge. The verifier rejects codec WebAssembly, source maps, remote-resource markers, unexpected native libraries, missing legal material, and malformed build/source receipts.

## Release boundary

A source test, browser inspection, package verification, installation, CI run, merge, notarised artifact, and public release are different facts. Each receipt names the exact source and artifact it proves. `/Applications/Drift.app` remains the protected V1 product until a separately authorised production transition.
