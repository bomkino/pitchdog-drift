# Drift V2 current status

Updated: 23 August 2026

Branch: `codex/v2-directors-cut`

Protected production V1 source: `5fd145207235884790ba071c5d84bc3876ff4989`

Installed V2 Director's Cut source: `39e6cd701dfddfebb02645789b2573e963ea4cbb`

## Current outcome

The branch now contains the integrated V2 Director's Cut candidate described by the curated donor plan. It is no longer the earlier one-World vertical slice. Project V4 is the live V2 creative authority; preview, still, sequence, and MP4 export enter the same explicit-time evaluator and Three.js/WebGL2 draw graph.

The candidate remains an isolated development build. `/Applications/Drift.app` is protected production V1 and is not replaced, opened, or rewritten by V2 packaging. V2 Dev has a separate bundle identifier, executable, App Sandbox container, WebKit store, cache namespace, IndexedDB database, and document-ownership boundary.

## Integrated product surface

### Editorial direction

- Four editorial cuts, six performances, four motion characters, four pose cadences, and six handcrafted motion stacks.
- Independently toggleable entry and exit direction for the background, slides, and pin.
- Body-only or whole-scene looping with an explicit repeat count.
- Even, Fast · Slow · Fast, Slow Build, Rush & Settle, Read & Go, and three-point custom tempo envelopes.
- Deterministic semantic events, fixed-step export time, pause truth, and authored reduced-motion output.

### Space, material, light, and lens

- Ten spatial paths work in horizontal and vertical travel.
- Card, Paper, Silk, and Gel material recipes, each with a truthful bypassable finish path.
- A shared deformed rear shell gives slides material thickness without the face intersections rejected during visual review.
- Twelve analytical light rigs and eight global lens recipes.
- Clean lens bypass, bounded blur/diffusion/aberration/wear, protected presenter treatment, and one final output transform.

### Atmosphere and Worlds

- Forty live structural backgrounds across Solid, Gradient, Aura, Paper, and Void.
- Twenty palettes, deterministic seeds and recuts, transparent bypass, and twelve curated hero studies.
- Eight authored Worlds, each with Restrained, Directed, and Fever pressure levels.
- Sixteen portrait-native scenes: two per World, with vertical travel in both directions represented across the library.
- A compact hero shelf plus searchable, family-filtered access to the complete background atlas.

### Pinned slide and presenter

The optional pinned frame is off by default and has independent control over:

- still-only or still-plus-moving track membership;
- protected overlay or in-scene composition;
- width, horizontal position, vertical position, and safe inset;
- source or custom aspect ratio;
- cover or contain fit and focal X/Y;
- matte colour and opacity;
- corner radius and continuous-corner smoothing;
- border width, colour, and opacity;
- shadow opacity, softness, and X/Y offset;
- presenter level, source trim, entry time, and mute.

Protected pin avoidance is local to the collision neighbourhood. Far-away cards retain their authored size; approaching cards yield into the clear cross-axis lane. Slide borders remain off by default, so imported artwork never acquires a translucent rectangular halo.

### Sound

- Sound is off by default for preview and export.
- Twenty-three provenance-locked CC0 recordings feed Studio, Cinema, and Paper palettes.
- Dry, Editorial, and Organic grammars plan deterministic body, air, contact, and optional landing events.
- Density, texture, take, motion level, master level, and under-voice level are editable.
- The preview audition and the exact 48 kHz stereo export master use the same semantic event plan.
- MP4 export supports sound design alone or one presenter-plus-sound mixed master; audio is never added silently.

### Director workflow and project truth

- Eight authored Worlds provide the fast path; Direct exposes the underlying motion, space, material, light, background, lens, sound, pin, and timing controls.
- World application is deterministic and non-compounding, respects domain locks, and records changed domains.
- Undo and redo retain up to 50 meaningful project states and coalesce continuous gestures.
- Temporary A/B comparison never mutates autosave or export authority.
- A visible change receipt names the creative domains affected by the latest operation.
- Existing compatibility projects remain on `drift-v1-compat/1` until an explicit V2 World transaction.

## Current evidence

- `npm run check`: passed, including TypeScript, 46 Vitest files, 319 tests, native source contracts, user-guide checks, hardening checks, and the production Web build.
- V2 browser build: passed.
- Real Chromium/WebGL2 visual inspection: passed for representative 9:16 and 16:9 Worlds, the background atlas, material thickness, animated grain, pin placement, A/B, undo/redo, and the sound control surface; browser console remained clean.
- Source-level tactile-sound checks: all 23 decoded recordings match their declared byte counts and SHA-256 hashes; event planning and mixed-master behavior are deterministic under test.

The exact implementation source is committed, packaged, installed for all local users at `/Applications/Drift V2 Dev.app`, launched normally, and desktop-inspected. The packaged WKWebView matrix passed all three variants twice. A real browser tactile MP4 completed the internal exporter verification and decoded as H.264 plus 48 kHz stereo AAC. The exact hashes, recovery copies, and state boundary are recorded in the [Director's Cut installed receipt](INSTALLED_DIRECTORS_CUT_2026-08-23.md).

Human owner approval, push of the Director's Cut commits, exact-head remote CI, merge, Developer ID signing, notarisation, public binary release, and publication are still separate gates and have not been performed.

## Known limits

- V2 Dev deliberately does not open, save, register, or own real `.pitched` documents. Use `/Applications/Drift.app` for production projects and portable backups.
- The development app is ad-hoc signed, not Developer ID signed or notarised.
- The browser exporter produced and decoded a tactile H.264/AAC artifact. An ordinary installed-interface sound MP4 has not yet been saved through the native Save panel and decoded.
- The rear slide shell proves deformed back-face depth. It is not described as a volumetric physics simulation or a fully modelled solid at every grazing angle.
- Automated visual checks catch corruption, alpha errors, console failures, and regressions. They are not a substitute for the owner's final taste decision.
- Public GitHub state remains unchanged until an explicit push/merge gate is taken and verified.

## Evidence trail

- [V2 requirement and phase matrix](V2_REQUIREMENT_PHASE_MATRIX.md)
- [V2 Dev user guide](MACOS_V2_DEV_USER_GUIDE.md)
- [Project V4 migration contract](V2_PROJECT_MIGRATION.md)
- [Director's Cut installed checkpoint, source 39e6cd7](INSTALLED_DIRECTORS_CUT_2026-08-23.md)
- [Earlier installed checkpoint, source 0366985](INSTALLED_CHECKPOINT_2026-08-23.md)
- [Until It Holds history](UNTIL_IT_HOLDS_RUN.md)
