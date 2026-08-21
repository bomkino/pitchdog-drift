# Drift for macOS — export presence in the Dock

A long cinematic export should remain legible when the studio window is hidden, minimized, covered, or on another Space. Drift therefore uses the existing native export-protection lifecycle to show one short Dock badge while protected export work is active.

## User-facing behavior

- The Dock badge reads **EXPORT** only while Drift reports an authoritative protected export lifecycle.
- The badge appears for MP4, PNG still, and PNG-sequence work after that export path enters the shared lifecycle.
- MP4 asks for its destination first. Cancelling that save panel returns before rendering, power protection, or the Dock badge begins.
- PNG sequence enters protected export state before its directory chooser. The badge can therefore remain visible while the user chooses a folder; cancelling the chooser clears it through the shared terminal path.
- PNG still renders before its native save panel. The badge remains visible through capture, destination choice, native commit, or cancellation so a rendered-but-not-yet-saved still is not presented as idle.
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

The bridge already calls the shared cleanup during native abort, replacement-document boot, and deinitialisation. AppKit invokes native abort before process recovery, close, and termination paths.

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
- quit, document reset, and abort call the shared cleanup;
- MP4 destination selection precedes `beginExport()`;
- PNG still enters `beginExport()` before its native save;
- PNG sequence enters `beginExport()` before its directory chooser.

## Physical-Mac review

Hosted compilation can prove AppKit API availability and the injected lifecycle test. Before integration, manually verify on a physical Mac that:

1. choosing an MP4 destination and beginning render adds `EXPORT`;
2. cancelling the MP4 save panel before rendering never shows the badge;
3. opening the PNG-sequence folder chooser shows the already-protected export state, and cancelling the chooser clears it;
4. PNG-still capture keeps the badge visible while its post-render save panel is open, then clears on either commit or cancellation;
5. hiding, minimizing, switching Spaces, and locking or unlocking the screen do not strand or duplicate the badge;
6. successful completion of each export path clears it;
7. Cancel Export clears it before the app becomes idle;
8. reloading during an allowed idle state leaves no badge;
9. a forced WebKit content-process termination clears it before recovery UI appears;
10. quitting or closing an allowed idle app leaves no badge after relaunch;
11. the badge remains readable in light and dark appearance and at small Dock sizes;
12. VoiceOver continues to identify the application as Drift without exposing project information.

## Deliberate exclusions

This pass does not add a numerical progress ring, Dock-menu progress text, notifications, completion sounds, or time remaining. Those features would require additional state, rate limiting, accessibility design, and stronger truth guarantees. The fixed presence badge earns its complexity because it answers one reliable question: **is Drift still exporting?**
