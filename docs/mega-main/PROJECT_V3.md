# Project V3

Project V3 is the first shared project contract for Mega Main. It is introduced beside the current project format before replacing persistence or rendering.

## Principles

- One immutable validated project object owns creative truth.
- Renderer, React components and AppKit do not keep competing creative state.
- File paths, native capability tokens, audio unlock, preview quality and open-panel state never enter the project.
- Original media bytes live behind asset identities; the project stores descriptors, hashes, order and per-slide direction.
- Recipe ids are provenance. Resolved settings remain project truth so library updates cannot silently change an old film.
- Unknown fields and malformed new-domain objects fail visibly rather than receiving invented values.
- Migration builds and validates a candidate before current work is replaced.

## Domains

```text
identity
composition
media
slides
motion
card
material
lighting
atmosphere
lens
sound
presenter
master
provenance
```

Each project command declares the domains it owns. The command reducer rejects a change outside those domains and emits a receipt containing changed paths, preserved domains and project revisions.

## Native revision truth

`currentRevision`, `savedRevision` and `recoveryRevision` are independent.

- Editing increments `currentRevision`.
- Recovery may catch up without marking the Finder document clean.
- A save freezes one revision.
- Edits made while that save runs remain dirty after commit.
- A late older save completion cannot regress a newer saved revision.

This is the basis for a truthful title-bar dirty dot, Save, Save As, Revert and crash recovery.

## Current compatibility bridge

`migrateLegacyStudioProject()` maps the existing schema into Project V3 while preserving:

- ordered media;
- global crop and focal intent as per-slide directives;
- axis, direction, speed, path, spacing, depth and seamless delivery;
- card geometry and border;
- current background;
- presenter placement and audio intent;
- output dimensions, frame rate, duration and bitrates.

New features that did not exist in the legacy project begin neutral. Sound remains silent. Global lens treatment remains off. The legacy world id is retained as provenance rather than being re-applied from a mutable library.
