# Director library gauntlet

Pass date: 20 August 2026.

## User failure being solved

Eighteen authored worlds are only useful when a director can find the right one, understand what is active, bend it without losing orientation, and restore it without sacrificing delivery decisions. A larger preset count without retrieval and state truth is not abundance; it is a wall.

## Material changes

- Search across world name, description, genre sentence, and intent tags.
- Intent filters: Quiet, Human, Dark, Graphic, and Kinetic.
- Persistent current-world summary even when filters hide its card.
- Honest authored/modified state and a look-only restore action.
- Theme changes preserve slide-motion intent, drag response, closure, loop count, and reduced-motion delivery.
- A/B look recall stores visual direction only. It cannot rewrite delivery or interaction state.
- Director undo history clears when slide order or media identity changes, preventing stale pinned-media references from returning.
- Starting cuts explicitly turn slide motion on because they author a complete cut rather than merely changing a look.
- Delivery preflight reports source-slide count, derived seamless pace, estimated MP4 size, and the fact that renderer-padding copies never count.

## Rejected false wins

- A giant dropdown with eighteen names.
- Search that only matches titles.
- “Restore” that also resets export choices.
- A/B snapshots that overwrite closure or reduced-motion intent.
- Undo history that survives a deck replacement and can resurrect removed media IDs.
- A file-size promise presented as exact rather than estimated.

## Gates

- Exhaustive world classification.
- Tokenized search and compound intent filtering.
- Look/session partition covers every motion field exactly once.
- Film-world selection preserves session fields.
- Starting cuts enable slide motion.
- Media revisions clear undo history while A/B memory survives.
- Source-grounded delivery math is unit tested and visible in the browser.
- Existing project, media, export, fallback, accessibility, and cinematic tests remain green.
