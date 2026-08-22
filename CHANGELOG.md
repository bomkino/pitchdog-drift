# Changelog

Notable user-visible and maintainer-facing changes will be recorded here. Drift is pre-1.0, and a changelog entry is not evidence of a tag, release, publication, or approval.

## Unreleased

Changes intended for a future public release belong here. Nothing in this section has been promoted to a tagged release.

### Added

- An explicit **Reset pinned frame** recovery action for historical projects. It restores source ratio, protected layering, authored safe geometry, and still-only track membership without discarding the selected media, crop/focal direction, corners, or border.
- A sandboxed, universal macOS application foundation with native menus, Finder-backed project and export workflows, rollback-aware destination writes, receipt-verified packaged assets, and a deterministic WKWebView export probe.
- Durable native import completion: the Mac shell now waits for original media to reach project storage before reporting success or allowing termination.
- A semantic description of the live WebGL composition for assistive technology, including slide count, centred slide, film world, path, playback state, stage size, and available controls.
- Runtime licence staging and verification for every dependency distributed inside the standalone app.

### Changed

- New V2 pins begin source-ratio, protected, and still-only. Reapplying Editorial Drift restores its opaque paper room; transparent output remains an explicit option afterward.
- Browser CI now exercises V1 compatibility and the V2 development app through separate origins, build identities, and storage namespaces.
- Browser CI retains one diagnostic retry but now fails the workflow if any journey is flaky; retries cannot manufacture a green gate.
- The visual system now defaults to borderless slide and presenter frames. Five film worlds use no keyline; Noir Contact alone keeps a deliberate, fully opaque 1 px warm-grey rule.
- Drop shadows are cast from the original rounded-card mask. The larger shadow mesh provides Gaussian falloff only, eliminating the translucent rectangular mats visible in earlier screenshots.
- Film grain is monochrome, spatially correlated, background-only, deterministic per output frame, capped at a quiet 30 Hz in preview, and frozen by Pause or Reduce Motion. Imported slide and presenter pixels remain untouched.
- Operational typography, muted contrast, desktop targets, touch targets, responsive panel scrolling, hover behavior, reduced-transparency, increased-contrast, and forced-colour treatments were tightened across the studio.
- The README hero now shows the current repaired renderer instead of the obsolete shadow treatment.

### Fixed

- Legacy hybrid pin settings no longer force the intended still into an accidental tall crop or leave a duplicate copy in the moving carousel after the user invokes Reset.
- Escape now exits full-frame focus even when the exit control owns keyboard focus, then restores focus to the initiating control.
- Recovery saves can no longer be overtaken by older autosaves, and native multi-file imports report completion only after their exact persisted revision succeeds.
- Browser and packaged-app recovery probes now distinguish durable success from a merely delivered native message.
