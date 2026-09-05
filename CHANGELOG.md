# Changelog

Notable user-visible and maintainer-facing changes will be recorded here. Drift is pre-1.0, and a changelog entry is not by itself evidence of a tag, GitHub Release, binary publication, or approval.

## [0.3.0] — 2026-09-05

### Changed

- Mac-only product direction; retain the existing AppKit/WKWebView and native file/audio foundation.
- Video slides with explicit silent playback, saved looping and trim, frame-timed offline decoding, and bounded source admission.
- Media-aware undo/redo, saved-content tracking, transactional Open rollback, and asynchronous native Save-on-close.
- Two-worker imports, common image-header admission, shared immutable-media digests, and incremental IndexedDB asset writes.
- File-backed AudioToolbox PCM staging and a 300-second encoder boundary; audio output remains 24/25/30 fps only.
- Direct ordinary export, optional advanced details, frame timecode, and presenter trim independent of mute.

### Fixed and optimized

- Project Open stages originals separately and atomically commits the accepted manifest/media set; interrupted staging cannot replace current recovery.
- Paused previews stop continuous redraw; edits, decode completion, scrubbing and resumed playback wake them.
- Video export reuses covering source frames and reads forward sequentially; loop/backward seeks reset safely.
- Cancel propagates into image/video preparation and releases late decoder results.
- Portable stored ZIP output uses chunks, and reopening uses Blob slices instead of fully inflating stored originals.
- Added video speed, Reset trim, on-demand source filmstrip and loop audition.
- Consolidated export into one form/draft; format, background, audio acknowledgement and completion stay tied to the current document.
- Corrected stale UI/persistence tests while retaining actual media, pixel and save-race assertions. Added packaged V2 video-loop MP4/PNG evidence and atomic recovery/reopen coverage.

### Download and installation

The Apple-silicon DMG is built and verified in macOS CI, then published from that exact artifact with SHA-256 and build receipts. It is **ad-hoc signed, unnotarized**, and has not been tested on the physical M2 mini or M1 Pro laptop. Drag Drift to Applications; use Privacy & Security → Open Anyway only for this known download. Retain project copies for rollback. No NSDocument/Metal completion or measured physical-Mac performance is claimed.

### Boundaries

- Still a hybrid application, not a finished NSDocument/Metal migration.
- Physical M2 mini/M1 Pro validation and measured performance are not claimed.
- Any published ad-hoc Mac test artifact is explicitly unnotarized. Developer ID distribution guards remain intact.
- Keep earlier project copies; older apps do not understand video-slide directives.

## Unreleased

Changes intended for the release after `v0.2.1` belong here.

## [0.2.1] - 2026-08-30

This entry describes the `v0.2.1` source-release tree. Public availability begins only when the matching tag and GitHub Release exist. No signed or notarized Mac binary is part of this release.

### Changed

- Panel and control interiors now use consistent optical alignment for text, Phosphor icons, carets, button labels, control heights, padding, and gaps.
- Measured disclosures now use shorter, direction-aware opening and closing motion, retain interruptibility, restore focus safely, and settle immediately for keyboard activation or reduced-motion preferences.
- Responsive panel selection now keeps the established 1120 px compact-layout floor at every interface scale, preventing low-scale three-panel layouts from becoming too narrow.
- Source-release publication now waits for successful exact-main CI, standalone macOS, and packaged-WKWebView workflows before tagging the current default-branch commit.

### Fixed

- Nested panels, menus, buttons, background controls, footer disclosures, and compact/high-scale layouts no longer clip content or create unintended overflow.
- Carets now keep one scale-aware size and spacing relationship with their labels; icons and button text remain optically centred without unstable wrapping.
- Expanding and closing disclosures no longer leave stale measured heights or introduce avoidable jumps when their content changes during motion.

## [0.2.0] - 2026-08-30

This entry describes the `v0.2.0` source-release tree. Public availability begins only when the matching tag and GitHub Release exist. No signed or notarized Mac binary is part of this release.

### Added

- Seven self-hosted FontBlind v13 WOFF2 binaries from [`bomkino/pitchdog-type-system`](https://github.com/bomkino/pitchdog-type-system) release `v13.0.0`, pinned to exact commit `786b4a2b671182319320f922b8de8f927ea3a002` and verified by checksum.
- Phosphor Icons for React `2.1.10` as the canonical interface-icon library.

### Changed

- The complete interface now defaults to the pitch.dog type system's Head, Body, and Eyebrow families, with local-only font loading and explicit fallback stacks.
- Hand-authored utility glyphs and SVG paths were replaced with a consistent Phosphor icon vocabulary while keyboard shortcuts and semantic status text remain text.
- Panel gutters, nested padding, control spacing, disclosure rhythm, and high-scale reflow were audited and normalized across the Media, Stage, Timeline, and Director surfaces.
- Release and support documentation now consistently identify the maintained Mac target as Apple-Silicon-only `arm64`; dated universal-build receipts remain historical evidence, not a current support claim.

## [0.1.0] - 2026-08-28

The first public GitHub Release included source plus an Apple-Silicon DMG signed ad hoc and not notarized. That DMG is historical test material, not a supported or Gatekeeper-ready binary.

### Added

- The complete V2 Director's Cut surface: eight authored Worlds, three directing pressures, sixteen portrait scenes, seventy-two live backgrounds, twenty-eight palettes, twelve light rigs, eight lens recipes, ten spatial paths, four material systems, and the full editorial motion library.
- Atelier, an original eight-study living-pigment background family spanning watercolour, fresco, graphite, manuscript, botanical, and oxide treatments. All studies use aspect-correct raw GLSL, restrained closed-loop motion, deterministic variation, and the existing preview/export renderer.
- A repeatable Atelier visual-proof lane that captures all eight studies at 9:16 and 16:9 with bundled slides, records a manifest and SHA-256 inventory, and builds a labelled contact sheet.
- Independently controlled entry and exit performances, body/whole-scene repeat counts, and editable tempo envelopes including Fast · Slow · Fast.
- Fine pinned-frame direction for position, size, safe inset, aspect, fit, focal point, matte, continuous corners, border, shadow, timing, track membership, presenter level, and mute.
- Project V4 undo/redo, temporary non-mutating A/B comparison, domain locks, and visible change receipts.
- Opt-in deterministic tactile sound from 23 provenance-locked CC0 recordings, with Studio/Cinema/Paper palettes, Dry/Editorial/Organic grammars, and one presenter-plus-sound export master.
- An explicit **Reset pinned frame** recovery action for historical projects. It restores source ratio, protected layering, authored safe geometry, and still-only track membership without discarding the selected media, crop/focal direction, corners, or border.
- A sandboxed macOS application foundation with native menus, Finder-backed project and export workflows, rollback-aware destination writes, receipt-verified packaged assets, and a deterministic WKWebView export probe.
- Durable native import completion: the Mac shell now waits for original media to reach project storage before reporting success or allowing termination.
- A semantic description of the live WebGL composition for assistive technology, including slide count, centred slide, film world, path, playback state, stage size, and available controls.
- Runtime licence staging and verification for every dependency distributed inside the standalone app.

### Changed

- The background picker now leads with twelve curated hero studies and keeps all seventy-two backgrounds across nine structural families available through searchable filters.
- Slides now have a shared deformed rear shell for material thickness without intersecting the artwork face.
- New V2 pins begin source-ratio, protected, and still-only. Reapplying Editorial Drift restores its opaque paper room; transparent output remains an explicit option afterward.
- Browser CI now exercises the shipping V2 identity and the isolated V2 development identity through separate origins and storage namespaces. Explicit V1-import journeys preserve compatibility coverage.
- Browser CI retains one diagnostic retry but now fails the workflow if any journey is flaky; retries cannot manufacture a green gate.
- Export-only MediaBunny code is now split behind the export boundary instead of inflating startup. The production entry chunk fell from 472.36 kB to 337.18 kB gzip in the promotion build.
- The visual system now defaults to borderless slide and presenter frames. Five film worlds use no keyline; Noir Contact alone keeps a deliberate, fully opaque 1 px warm-grey rule.
- Drop shadows are cast from the original rounded-card mask. The larger shadow mesh provides Gaussian falloff only, eliminating the translucent rectangular mats visible in earlier screenshots.
- Film grain is monochrome, spatially correlated, background-only, deterministic per output frame, capped at a quiet 30 Hz in preview, and frozen by Pause or Reduce Motion. Imported slide and presenter pixels remain untouched.
- Operational typography, muted contrast, desktop targets, touch targets, responsive panel scrolling, hover behavior, reduced-transparency, increased-contrast, and forced-colour treatments were tightened across the studio.
- The README hero now shows the current repaired renderer instead of the obsolete shadow treatment.

### Fixed

- New production documents no longer start on dormant V1 defaults merely because the app uses the release identity.
- First-run media hydration, pin edits, presenter edits, and master/timeline edits no longer flatten untouched World domains or dissolve their provenance into Custom.
- Authored World recuts now stamp truthful per-domain fingerprints, so provenance survives only while the exact resolved domain still matches.
- Reduce Motion now lands on a stable body composition and freezes the complete preview clock, including material, lens, lifecycle, presenter, and grain phases.
- Human-facing stage labels no longer leak internal recipe namespaces such as `world/dread` or ratio suffixes such as `editorial-drift/9:16`.
- Legacy hybrid pin settings no longer force the intended still into an accidental tall crop or leave a duplicate copy in the moving carousel after the user invokes Reset.
- Escape now exits full-frame focus even when the exit control owns keyboard focus, then restores focus to the initiating control.
- Recovery saves can no longer be overtaken by older autosaves, and native multi-file imports report completion only after their exact persisted revision succeeds.
- Browser and packaged-app recovery probes now distinguish durable success from a merely delivered native message.
- Command search no longer advertises Film World and V1-theme choices it cannot complete; the truthful World workspace command remains searchable.
- A/B comparison pixels are restored after MP4, still, sequence, cancellation, and failed export paths, so the canvas cannot silently disagree with the visible Before/After state.
- Native slide and presenter imports now persist their staged project before replacing live media or acknowledging Finder; a persistence failure leaves the prior project and media usable.
- Project validation now rejects unsurfaced bitrate values instead of accepting numbers the fixed H.264/AAC encoders would ignore.
- Presenter edits no longer disable an independently enabled tactile-sound master.
- Pinning media now opens and focuses its placement controls, accidental media removal requires an explicit second click, and macOS Reduce Motion visibly identifies a preview-only hold.
- Native callback diagnostics log stable error classes instead of user-controlled filenames or localized error prose.
