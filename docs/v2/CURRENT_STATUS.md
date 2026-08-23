# Drift V2 current status

Updated: 23 August 2026

Production-promotion implementation: `51459cb7aac663238b1a41961ee50fd4c055fdfd`

Installed artifact: `/Applications/Drift.app`, release build 284, exact implementation source `51459cb7aac663238b1a41961ee50fd4c055fdfd`.

Historical V1 source: `5fd145207235884790ba071c5d84bc3876ff4989`. Historical V1 and V2 Dev app bundles remain recoverable outside `/Applications`.

## Current outcome

The production source contains the integrated V2 Director's Cut described by the curated donor plan. Project V4 is live creative authority for new documents; preview, still, sequence, and MP4 export enter the same explicit-time evaluator and Three.js/WebGL2 draw graph. Explicit saved or imported V1 projects retain their frozen compatibility contract until the user applies a V2 World.

The verified local installation has one production app identity: `/Applications/Drift.app`. The isolated V2 Dev identity remains available to maintainers as a build lane, not as a second installed product. GitHub branch, pull request, CI, merge, release, notarization, publication, and owner approval remain separate states; this page does not infer one from another.

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

- Sixty-four live structural backgrounds across Solid, Gradient, Aura, Paper, Void, Cutting Map, Grid, and Wave.
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

- Four task-shaped workspaces—Slides, World, Direct, and Master—share one persistent Stage instead of hiding the composition during mode changes.
- Per-slide fit, focal point, scale, health, and reset controls preserve local art direction without manufacturing separate render paths.
- Exact Length and Reading Pace timing can resolve one to one hundred complete passes from the admitted slide count. Authored Fast · Slow · Fast and spin-then-read envelopes close on complete deck cuts and emit an export-duration receipt.
- Story, Reel, Combined, and Custom platform guides are preview-only overlays. They can flag pinned-frame overlap without entering exported pixels.
- Command–K exposes the core directing and export actions without duplicating project authority.
- Eight authored Worlds provide the fast path; Direct exposes the underlying motion, space, material, light, background, lens, sound, pin, and timing controls.
- World application is deterministic and non-compounding, respects domain locks, and records changed domains.
- Undo and redo retain up to 50 meaningful project states and coalesce continuous gestures.
- Temporary A/B comparison never mutates autosave or export authority.
- A visible change receipt names the creative domains affected by the latest operation.
- Existing compatibility projects remain on `drift-v1-compat/1` until an explicit V2 World transaction.

### Native project documents

- Production Drift can Open, Save, Save As, Revert, and own user-selected `.pitched` Finder documents.
- Open binds only after archive verification and exact file SHA-256 confirmation.
- Save stages the existing Project V4 archive, checks staged bytes, commits atomically, checks committed bytes, and marks only the captured revision clean; edits made during Save remain dirty.
- Save As cancellation keeps the prior binding. External modification fails closed as a conflict and preserves the in-app version for recovery through Save As.
- The window edited dot, close protection, menu availability, and native diagnostics derive from the same path-private document facts.

## Current evidence boundary

- The consolidated repository check is green: 55 test files, 386 unit/integration tests, TypeScript, 11-file Swift/native source contracts, both Mac user guides, native import and hardening contracts, and the production Web build.
- The expanded browser matrix is green across all 42 cases in one clean 19.0-minute run. It covers the production and V2 Dev identities, native/import races, alpha, cancellation, renderer authority, bounded media churn, project quarantine, compatibility persistence, workspaces, timing, guides, Command–K, reduced-motion pixel stability, and V2 pin repair.
- Cutting Map, Grid, and Wave rendered in real WebGL2 at 1080 × 1920 and 1920 × 1080 with a clean browser console.
- The final optical atlas contains 35 native-resolution Drift PNG captures across four ratios, eight Worlds, both-axis samples of the three new background families, eight lenses, five finishes, and four grain-isolation plates. Its manifest, contact sheet, and every capture have SHA-256 inventory.
- The complete Swift native self-test currently passes from freshly compiled source, including document lifecycle, broker authority, recovery, conflict, Finder reply, and AAC boundaries.
- The headed installed-Chrome long-export gate is green: all eight nominal-resolution Project V4 frame plans were exact at 24 fps; complete 30-second/8-slide, 60-second/40-slide, and 180-second/200-slide V2 H.264 exports passed mandatory Rec.709/duration/frame/decode readback, bounded cache/decode/heap checks, WebGL context continuity, full unload, and cancellation-without-artifact. Physical encoding used deliberately small dimensions; 1080p/4K throughput and Intel remain separate performance gates.
- The exact clean production implementation, universal Mac build, native gauntlet, and packaged WKWebView matrix are green at `51459cb`. All three packaged variants completed durable native import/save, WebContent recovery, stale-generation rejection, media rehydration, and outbound/WebRTC lockdown.
- `/Applications` contains exactly one Drift app: release build 284 from `51459cb`. Its executable is universal, ad-hoc signed, all-user-readable/executable, and SHA-256 `af0854822fccac234aad8e795fa2c9de8a769ba1955c574760396f309c721e53`. The ordinary installed window reached WebGL2 and system-H.264-ready state and was visually inspected.

The repair list, exact hashes, package matrix, installation, visual evidence, backup path, and preservation boundary are recorded in the [production-promotion receipt](PRODUCTION_PROMOTION_2026-08-23.md). Earlier installed receipts remain historical evidence only.

## Known limits

- The installed app is ad-hoc signed, not Developer ID signed or notarised.
- The browser exporter produced and decoded a tactile H.264/AAC artifact. An ordinary installed-interface sound MP4 has not yet been saved through the native Save panel and decoded.
- The rear slide shell proves deformed back-face depth. It is not described as a volumetric physics simulation or a fully modelled solid at every grazing angle.
- Automated visual checks catch corruption, alpha errors, console failures, and regressions. They are not a substitute for the owner's final taste decision.
- Remote GitHub and CI state must be read from GitHub for the exact head; local evidence cannot certify it.

## Evidence trail

- [V2 requirement and phase matrix](V2_REQUIREMENT_PHASE_MATRIX.md)
- [V2 Dev user guide](MACOS_V2_DEV_USER_GUIDE.md)
- [Project V4 migration contract](V2_PROJECT_MIGRATION.md)
- [Long-export acceptance receipt](LONG_EXPORT_QA_2026-08-23.md)
- [Accessibility QA boundary](ACCESSIBILITY_QA_2026-08-23.md)
- [Production-promotion receipt, source 51459cb](PRODUCTION_PROMOTION_2026-08-23.md)
- [Finishing-sprint installed checkpoint, source 0a011f7](INSTALLED_FINISHING_SPRINT_2026-08-23.md)
- [Director's Cut installed checkpoint, source 39e6cd7](INSTALLED_DIRECTORS_CUT_2026-08-23.md)
- [Earlier installed checkpoint, source 0366985](INSTALLED_CHECKPOINT_2026-08-23.md)
- [Until It Holds history](UNTIL_IT_HOLDS_RUN.md)
