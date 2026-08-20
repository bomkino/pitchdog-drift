# Drift — director journey gauntlet

Frozen for PR #5 on 20 August 2026.

## Actual user

A pitch-deck designer has already done the hard work: writing, selecting frames, arranging slides, and deciding what the audience must feel. Drift is not allowed to make that person become a motion designer, shader programmer, export technician, or browser-debugger merely to share the deck on Instagram.

The tool succeeds when the user can move from a folder of slides to an authored master quickly, can take creative risks without fear, can understand what will be delivered, and can return tomorrow without reconstructing the session from memory.

## Emotional contract

The first minute should feel promising, not technical. The middle should feel directed, not parameterised. The final minute should feel trustworthy, not hopeful.

Beauty is necessary but insufficient. A beautiful tool that makes the user afraid to touch a control is badly designed.

## Journey 0 — trust before action

The user needs to know immediately:

- media stays local;
- the live study is replaceable, not an example they must reverse-engineer;
- the centre is a working preview, not a fake marketing render;
- the file will be checked before Drift calls it complete;
- mistakes are reversible.

### Acceptance

- The demo identifies itself as a live study.
- Dropping real media communicates whether it replaces the study or extends an existing sequence.
- Undo and redo are visible before the user needs them.
- Export, local-save, and renderer states remain visible without dominating the composition.

## Journey 1 — get to a first convincing cut

A blank inspector is not freedom. It is labour. Most users need a credible starting sentence that they can then rewrite.

Drift therefore offers six authored starting cuts:

1. Deck Reel
2. Presenter + Deck
3. Contact Sheet
4. Travel Diary
5. Horror Tease
6. Wide Trailer

A starting cut owns format, duration, frame rate, path, pace, closure, slide scale, film world, and presenter intent together. It is not a colour preset.

### Acceptance

- One click produces a valid, exportable settings object.
- Stage and output dimensions cannot diverge.
- Presenter recipes never invent missing media.
- Deck-only recipes explicitly unpin presenter media and remain undoable.
- Every recipe is materially distinct in more than palette.

## Journey 2 — direct without fear

Creative software should encourage the user to try the wrong thing. That requires cheap reversal.

### History contract

- Consecutive updates from one slider gesture collapse into one undo step.
- Separate creative actions remain separate.
- A new action clears redo history.
- External media mutations clear director history rather than reviving stale pinned-media references.
- History stores complete validated settings snapshots, not lossy patches.
- Command/Ctrl-Z and Shift-Command/Ctrl-Z work away from text-editing fields.

### A/B memory

A and B capture the look only: film world, motion, slide surface, and atmosphere. Recalling a look preserves delivery dimensions, duration, frame rate, and pinned-media identity. This lets the user compare visual directions without accidentally changing the agreed deliverable.

## Journey 3 — sequence with hands, mouse, or keyboard

The media rail is a storyboard, not a file list.

### Acceptance

- Native drag-and-drop shows the dragged item and insertion target.
- Alt + Up/Down reorders the focused slide.
- Existing move buttons remain for explicit pointer and assistive-technology operation.
- Focus is visible.
- The source filename and sequence number remain readable.
- Demo media is visibly marked.
- File drops and internal reordering cannot be confused with one another.

## Journey 4 — protect composition from platform chrome

Social platforms change their interfaces. Drift must not pretend that any overlay is a permanent platform specification.

The stage therefore provides working guides:

- Off
- Edge safe
- Copy safe
- Reels working safe

Guides are editorial aids, never exported, and the Reels overlay is deliberately labelled a working safe area rather than an official guarantee.

### Acceptance

- Guide mode is visible on the stage element for automation and debugging.
- Guide preference survives a local reload when storage is available.
- Storage denial does not block the studio.
- Guides remain pointer-transparent.
- The output itself is untouched.

## Journey 5 — understand the master before rendering it

A user should not discover delivery contradictions after a long render.

The preflight receipt states:

- exact frame count;
- closed-loop or free-running timeline;
- alpha delivery consequence;
- presenter-audio/frame-rate compatibility;
- per-frame pixel load.

### Acceptance

- Transparent work never implies alpha-capable MP4.
- Presenter audio above 30 fps is flagged before export and still rejected at the encoder boundary.
- Large surfaces are warned about without claiming failure before GPU preflight.
- One-complete-loop and free-run timing are explicit choices.
- Every statement describes an enforced behaviour, not reassurance copy.

## Journey 6 — survive failure and return

The deeper product already protects the project through IndexedDB, verified portable bundles, deterministic export, context-loss handling, rollback-aware files, and honest DOM fallback. The journey pass must not weaken any of those guarantees.

### Regression gates

- Old project payloads remain valid; no settings schema migration is introduced.
- New workflow and history state is session-local and does not pollute portable projects.
- A/B memory never stores Blob references or object URLs.
- Safe guides do not enter renderer or export state.
- The pinned presenter remains outside moving-track optics.
- Reduced-motion and transparent-output contracts remain unchanged.
- New controls use existing validated fields only.

## Ruthless user-perspective checks

### First five minutes

1. Can a user identify the live study without reading the README?
2. Can they produce a plausible vertical cut without opening six inspector groups?
3. Can they undo that choice immediately?
4. Can they compare a radically different direction without losing their delivery settings?
5. Can they see whether the ending closes?

### First real deck

1. Does dropping images replace the study rather than append to it?
2. Can the sequence be reordered with drag, buttons, and keyboard?
3. Does dense slide text stay readable under the strongest starting cuts?
4. Can a presenter be introduced without changing the moving-slide decoder contract?
5. Are platform-risk zones visible but clearly non-exporting?

### First delivery

1. Is the frame count visible before export?
2. Is transparency explained honestly?
3. Is an audio/frame-rate conflict visible before the encoder starts?
4. Does cancellation return the preview to a truthful state?
5. Does the completed artifact still pass decoded verification?

### Return visit

1. Does the local project reopen with media intact?
2. Does the guide preference return?
3. Are ephemeral A/B and undo histories correctly absent rather than misleadingly stale?
4. Can a portable project replace a locked recovery state without data loss?

## Deliberate boundaries

- No PDF ingestion in this pass. It requires a separately reviewed parser/worker and memory contract; a casual dependency would be irresponsible.
- No per-slide crop, duration, or optical overrides yet. That requires a versioned sequence model rather than hidden state attached to transient object URLs.
- No cloud sync, account system, analytics, or remote asset catalogue.
- No claim that working social guides are official or permanent.
- No merge. Human visual comparison against the other active cinematic branches remains necessary.

## Evidence required before merge

- TypeScript passes from a clean checkout.
- All unit and contract tests pass.
- The complete existing Chromium gauntlet passes.
- The new director-journey browser test passes without console errors.
- PR readback shows only intentional files.
- Human review uses at least three real decks: dense text, image-heavy, and mixed-light imagery.
- Human review tests both a deck-only and presenter-led cut.
- Maximum lens energy remains readable at the focal frame.
- Guides, history, A/B memory, and preflight remain useful at 320 px and 390 px widths.
