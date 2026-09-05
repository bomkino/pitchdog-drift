> Historical planning/snapshot material. The current Mac-only product and validation boundary is [docs/STATUS.md](../STATUS.md). Do not use older completion tables as proof for 0.3.0.

# Drift V2 current status

Updated: 30 August 2026

Release line: `v0.2.1` source tree. The matching tag and GitHub Release become public only when they appear on GitHub; this document does not infer publication from the version in source. No `v0.2.1` Mac binary is part of the source release.

The exact-source lines below are retained as dated evidence anchors from the V2 promotion work, not as claims about the `v0.2.0` or `v0.2.1` tag commits.

Atelier implementation commit: `9e51740a6367dd5caf29f0cab89787d7d53341ca`. Its follow-up compositor-proof repair changes test evidence only.

Editor-journey implementation commit: `8efe4b92d2dac26276b22a23100ecfd32a82899a`. A clean detached worktree produced release build 332 from that exact source; it is a proved candidate, not yet the installed app.

Pre-promotion installation baseline, re-read on 25 August: `/Applications/Drift.app`, release build 305, exact source `077110237bdcdb493b20162e8a8a9ed61814c5c4`, historical universal executable SHA-256 `452a657f434fd045e0bb6ba18947b0b88a9c44410f4d15013f99c9e35c3d99a5`. This is the recovery snapshot entering promotion, not the maintained architecture target. Later installation state must be read from `/Applications/Drift.app` rather than inferred from this dated document.

Historical V1 source: `5fd145207235884790ba071c5d84bc3876ff4989`. Historical V1 and V2 Dev app bundles remain recoverable outside `/Applications`.

## Current outcome

The production source contains the integrated V2 Director's Cut described by the curated donor plan. Project V4 is live creative authority for new documents; preview, still, sequence, and MP4 export enter the same explicit-time evaluator and Three.js/WebGL2 draw graph. Explicit saved or imported V1 projects retain their frozen compatibility contract until the user applies a V2 World.

The pre-promotion local installation had one production app identity: `/Applications/Drift.app`. The isolated V2 Dev identity remains available to maintainers as a build lane, not as a second installed product. GitHub branch, pull request, CI, merge, build, installation, release, notarization, publication, and owner approval remain separate states; this page does not infer one from another. The historical `v0.1.0` Release included an ad-hoc, unnotarized arm64 DMG; it is not a supported binary and is not carried forward into the `v0.2.x` source releases.

## `v0.2.0` interface integration

- FontBlind v13 now supplies the default Head, Body, Body Alt, and Eyebrow families from seven locally bundled CC0 WOFF2 files. Their source is [`bomkino/pitchdog-type-system`](https://github.com/bomkino/pitchdog-type-system) release `v13.0.0`, exact commit `786b4a2b671182319320f922b8de8f927ea3a002`; a checksum gate protects the vendored files.
- Phosphor Icons for React `2.1.10` is the single utility-icon vocabulary. Keyboard shortcuts, dimensions, and semantic status copy remain text rather than decorative icon substitutions.
- Media, Stage, Timeline, Director, menus, notices, disclosures, form controls, and high-scale panel reflow share audited spacing, padding, gap, and target-size rules.
- Both browser and packaged-WebKit builds use the same local font and icon resources. They do not fetch typography or icon assets at runtime.

## `v0.2.1` interface fit and motion

- Labels, Phosphor icons, carets, and button contents use shared scale-aware sizing, optical centring, and container spacing.
- Nested panels, menus, footer disclosures, background controls, and compact/high-scale layouts have bounded overflow and stable interior padding.
- Measured disclosures use 180–250 ms opening and 140–180 ms closing windows, retarget while interrupted, return focus before hiding active content, and settle immediately for keyboard activation or reduced-motion preferences.
- The single-panel threshold retains a 1120 px viewport floor at every interface scale, preventing low-scale three-panel clipping without changing saved Project state.

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

- Seventy-two live structural backgrounds across Solid, Gradient, Aura, Paper, Void, Cutting Map, Grid, Wave, and Atelier.
- Twenty-eight palettes, deterministic seeds and recuts, transparent bypass, and twelve curated hero studies.
- Eight authored Worlds, each with Restrained, Directed, and Fever pressure levels.
- Sixteen portrait-native scenes: two per World, with vertical travel in both directions represented across the library.
- An always-visible visual browser with a live selected preview, mood/name search, family filtering, clear selection state, and responsive two-column phone layout for the complete background atlas.
- Eight original Atelier studies translate living pigment, fresco, graphite, manuscript, and botanical marks into aspect-correct, exact-loop-safe GLSL for both horizontal and vertical stages.

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

### Editor journey and project truth

- Four task-shaped rooms—Slides, Look, Motion, and Export—share one persistent Stage and one persistent visual Timeline. Their Inspector panes remain mounted, inert while inactive, and restore their exact scroll position.
- The Media rail, Stage, Timeline, and Inspector preserve their geometry across room changes. A tab click preserves focus; notices no longer displace the timeline.
- Apply Clean Carousel is the prominent safe action: continuous readable motion plus literal source pixels, while media, Look, background, stage geometry, axis, direction, and pin placement survive.
- Look exposes Protected artwork versus Literal source pixels. Make Literal removes slide lens, relighting, border, and local finish while keeping the surrounding WebGL world.
- Per-slide fit, focal point, scale, health, and reset controls preserve local art direction without manufacturing separate render paths.
- Exact Length and Reading Pace timing can resolve one to one hundred complete passes from the admitted slide count. Authored Fast · Slow · Fast and spin-then-read envelopes close on complete deck cuts and emit an export-duration receipt.
- Casino Reveal authors `FAST ×2 → READ ×1 → FAST ×1` at 0.22/0.90/0.22 seconds per slide. Content-paced duration derives from the moving-slide count; Exact Length deliberately fits that sequence only when requested.
- When an authored sequence owns timing, incompatible free-run controls stay hidden. The Timeline makes fast/read blocks, pass boundaries, playhead, current time, and total duration visible.
- Story, Reel, Combined, and Custom platform guides are preview-only overlays. They can flag pinned-frame overlap without entering exported pixels.
- Command–K exposes the core directing and export actions without duplicating project authority.
- Eight authored Worlds remain a complete-look fast path; advanced controls expose motion, space, material, light, background, lens, sound, pin, and timing without becoming the first-run journey.
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

## Evidence boundary

The `v0.2.1` release gate must run against its eventual exact source commit. Source publication waits for successful exact-main CI, standalone macOS, and packaged-WKWebView workflows. `npm run check` includes checksum verification for the bundled fonts, the full TypeScript/Vitest source gate, macOS/Linux source contracts, and the production Web build. The following bullets preserve the exact evidence already recorded for earlier V2 integration commits:

- The editor rebuild's consolidated repository check is green: 69 test files, 495 unit/integration tests, TypeScript, Swift/native source contracts, both Mac user guides, native import and hardening contracts, and the production Web build.
- The production-browser UI lane passed 19 journeys with one screenshot-only case intentionally skipped. The isolated V2 UI matrix passed 10/10 journeys across production and V2-development identities. Dedicated checks cover Clean Carousel fidelity, Casino pacing, stable geometry and focus, exact room scroll restoration, visual background cards, edge-aware tooltips, disclosure interruption, source-proof rendering, and world-only animated grain.
- The expanded browser matrix is green across all 46 cases in one clean 13.6-minute run. It covers the production and V2 Dev identities, native/import races, alpha, cancellation, renderer authority, bounded media churn, project quarantine, compatibility persistence, workspaces, timing, guides, Command–K, reduced-motion pixel stability, V2 pin repair, and the Atelier renderer/browser journeys.
- Cutting Map, Grid, and Wave rendered in real WebGL2 at 1080 × 1920 and 1920 × 1080 with a clean browser console.
- The final optical atlas contains 35 native-resolution Drift PNG captures across four ratios, eight Worlds, both-axis samples of the three new background families, eight lenses, five finishes, and four grain-isolation plates. Its manifest, contact sheet, and every capture have SHA-256 inventory.
- The separate Atelier atlas contains 16 real-stage PNG captures: all eight living-pigment studies at 9:16 and 16:9 with bundled slides. A dirty-worktree fingerprint prevents candidate collisions; its manifest, contact sheet, and every capture have SHA-256 inventory.
- The complete Swift native self-test passed from the freshly compiled source recorded in its dated receipt, including document lifecycle, broker authority, recovery, conflict, Finder reply, and AAC boundaries.
- The headed installed-Chrome long-export gate was rerun on editor commit `8efe4b9` and is green: all eight nominal-resolution Project V4 frame plans were exact at 24 fps; complete 30-second/8-slide (720-frame), 60-second/40-slide (1,440-frame), and 180-second/200-slide (4,320-frame) V2 H.264 exports passed mandatory Rec.709/duration/frame/decode readback, bounded cache/decode/heap checks, WebGL context continuity, full unload, and cancellation-without-artifact. Physical encoding used deliberately small dimensions, so 1080p/4K throughput remains a separate performance gate. Intel performance evidence was historically open; Intel is now outside the maintained target.
- The historical editor-candidate universal Mac build 332 records exact source `8efe4b9`. Its native gauntlet and all three packaged WKWebView variants were green. Production sandboxed, unsandboxed diagnostic control, and self-signed sandbox control completed durable native import/save, WebContent recovery, stale-generation rejection, media rehydration, and outbound/WebRTC lockdown with zero accepted TCP requests and zero WebRTC/STUN token hits. This proves that dated candidate bundle, not installation or current universal support. The maintained Mac target is arm64-only.
- The pre-promotion `/Applications` snapshot contained exactly one Drift app: release build 305 from `0771102`, executable SHA-256 `452a657f434fd045e0bb6ba18947b0b88a9c44410f4d15013f99c9e35c3d99a5`. This proves the starting baseline only; any later replacement requires its own direct-executable and LaunchServices/Finder launch readback.

The older repair list, package matrix, installation, visual evidence, backup path, and preservation boundary are recorded in the [production-promotion receipt](PRODUCTION_PROMOTION_2026-08-23.md). Its build-284 installation is historical evidence, not current state.

## Known limits

- The installed app is ad-hoc signed, not Developer ID signed or notarised.
- No signed, notarized, or supported Mac binary is part of the `v0.2.1` source-release line.
- The browser exporter produced and decoded a tactile H.264/AAC artifact. An ordinary installed-interface sound MP4 has not yet been saved through the native Save panel and decoded.
- The rear slide shell proves deformed back-face depth. It is not described as a volumetric physics simulation or a fully modelled solid at every grazing angle.
- Automated visual checks catch corruption, alpha errors, console failures, and regressions. They are not a substitute for the owner's final taste decision.
- Remote GitHub and CI state must be read from GitHub for the exact head; local evidence cannot certify it.

## Evidence trail

- [V2 requirement and phase matrix](V2_REQUIREMENT_PHASE_MATRIX.md)
- [Editor-journey rebuild](EDITOR_JOURNEY_REBUILD_2026-08-25.md)
- [Atelier backgrounds: design and verification](ATELIER_BACKGROUNDS_2026-08-24.md)
- [V2 Dev user guide](MACOS_V2_DEV_USER_GUIDE.md)
- [Project V4 migration contract](V2_PROJECT_MIGRATION.md)
- [Long-export acceptance receipt](LONG_EXPORT_QA_2026-08-23.md)
- [Accessibility QA boundary](ACCESSIBILITY_QA_2026-08-23.md)
- [Production-promotion receipt, source 51459cb](PRODUCTION_PROMOTION_2026-08-23.md)
- [Finishing-sprint installed checkpoint, source 0a011f7](INSTALLED_FINISHING_SPRINT_2026-08-23.md)
- [Director's Cut installed checkpoint, source 39e6cd7](INSTALLED_DIRECTORS_CUT_2026-08-23.md)
- [Earlier installed checkpoint, source 0366985](INSTALLED_CHECKPOINT_2026-08-23.md)
- [Until It Holds history](UNTIL_IT_HOLDS_RUN.md)
