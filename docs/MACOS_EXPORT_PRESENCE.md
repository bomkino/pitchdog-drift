# Drift for macOS — export presence in the Dock

A long cinematic export should remain legible when the studio window is hidden, minimized, covered, or on another Space. Drift therefore uses the existing native export-protection lifecycle to show one short Dock badge while an export is active.

## User-facing behavior

- The Dock badge reads **EXPORT** only while Drift reports an authoritative active export.
- The badge appears for MP4, PNG still, and PNG-sequence work that enters the shared export lifecycle.
- Completion, cancellation, native abort, document reload, WebKit content-process termination, window teardown, and app termination all converge on the same clear operation.
- Repeated identical renderer state does not repaint the Dock tile.
- The badge is presence, not progress. Drift does not claim a percentage or completion time it cannot prove.

## Privacy boundary

The badge is a fixed allow-listed literal. It never contains:

- project or deck names;
- source or destination filenames;
- absolute paths;
- renderer notices;
- frame numbers, percentages, or time estimates;
- any bytes from a project or export.

No new renderer message, timer, DOM observer, polling loop, or high-frequency bridge event was added. The native host already receives the authoritative boolean export state for protected-exit and power-activity behavior; Dock presence is attached to that exact state.

## Lifecycle contract

`ExportActivityGuard` owns both native power protection and Dock presence so the two cannot drift apart:

1. `update(isExporting: true)` starts process activity once and writes `EXPORT` once.
2. Duplicate `true` state keeps the activity and does not rewrite the badge.
3. `end()` ends process activity when present and clears the badge whether or not an activity token still exists.
4. Duplicate cleanup remains idempotent.
5. `deinit` is the final safety net.

The bridge already calls the shared cleanup during native abort, replacement-document boot, and deinitialisation. AppKit invokes native abort before process-recovery, close, and termination paths.

## Automated falsification

The native self-test injects a badge writer instead of touching the real Dock. It proves this exact write sequence:

```text
EXPORT
clear
```

It also proves duplicate start and duplicate cleanup do not emit additional writes. The source checker independently verifies that:

- the badge is the literal `EXPORT`;
- the badge writer is reachable only through the deduplicating setter;
- there is one convergent `setDockBadge(nil)` cleanup implementation;
- the guard carries no dynamic or identifying fields;
- quit, document reset, and abort call the shared cleanup.

## Physical-Mac review

Hosted compilation can prove AppKit API availability and the injected lifecycle test. Before integration, manually verify on a physical Mac that:

1. starting each export type adds `EXPORT` to Drift’s Dock icon;
2. hiding, minimizing, switching Spaces, and locking/unlocking the screen do not strand or duplicate the badge;
3. successful completion clears it;
4. Cancel Export clears it before the app becomes idle;
5. cancelling the save panel before rendering never shows it;
6. reloading during an allowed idle state leaves no badge;
7. a forced WebKit content-process termination clears it before recovery UI appears;
8. quitting or force-closing an allowed idle app leaves no badge after relaunch;
9. the badge remains readable in light and dark appearance and at small Dock sizes;
10. VoiceOver continues to identify the application as Drift without exposing project information.

## Deliberate exclusions

This pass does not add a numerical progress ring, Dock-menu progress text, notifications, completion sounds, or time remaining. Those features would require additional state, rate limiting, accessibility design, and stronger truth guarantees. The fixed presence badge earns its complexity because it answers one reliable question: **is Drift still exporting?**
