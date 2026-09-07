# Drift for macOS — user guide

The native app requires Apple silicon and macOS 13.3 or later. It follows macOS Light/Dark appearance automatically, including Auto changes. Canvas artwork and exported pixels keep their authored colors.

## Start and arrange

Choose **File → New**. The default canvas is **2576 × 1080**. Click the dimensions in the toolbar for exact dimensions or a ratio; `25.76:10.80` represents `322:135`. A World or Recut changes creative decisions, never canvas dimensions.

Use **Add media** or **File → Add Media…** to import images, static or animated WebP, opaque VP8/VP9 WebM, or supported native movie files. Original media is copied without transcoding. Unsupported or corrupt files produce a visible decision; a partial batch does not silently replace the deck. Use search and the media sidebar to select, duplicate, remove or reorder slides. Undo/Redo preserves media identities.

## Direct

The inspector has **Look**, **Motion** and **Slide** tabs. Look offers the authored Worlds, pressure, arrangement, Recut and detailed materials, lighting, background, optics and sound. Keep selected creative groups when changing World. **Audition Look changes** previews a temporary choice; apply or cancel it before saving.

Motion controls the path, cadence, entry/exit and finite repeats or Loop. Slide controls inclusion, layout and its source playback. Source trim, speed, loop and audition are independent of the presentation clock. With source looping disabled, playback holds the exact final interval. Video-slide audio is silent; stored originals retain their bytes.

**Pin** is a protected persistent card, including moving media. **Spotlight** inserts a timed feature and returns to the sequence. **Closing** appears once after all finite passes. These are separate assignments: a Pin can also appear in sequence, or be Pin-only. Loop temporarily disables Closing without forgetting it. A Closing-only document remains renderable.

## Preview and appearance

Use Play/Pause, frame stepping, cue navigation, the timeline slider or the exact-frame field. Fit/zoom changes the workspace view, not output dimensions. Changing Light/Dark appearance changes native chrome, not the project or image treatment. Preview quality affects displayed resolution; export uses the requested canvas.

## Save and recover

Use **File → Save** or **Command–S**. Use **File → Save As…** for another named copy. Open through **File → Open…**, Open Recent or **Command–O**. The native `.pitched` ZIP64 archive includes project settings and unchanged original media. This is a new format: legacy web/hybrid `.pitched` files are rejected rather than guessed or migrated.

A save captures one immutable document state. Later edits remain dirty. Undoing to the saved state makes it clean. Save As preserves the old file. Revert to Saved is a deliberate replacement of edits with the saved content. Cancel Close or Cancel Quit keeps the document open.

Private recovery snapshots do not overwrite named projects. Recovered work opens as dirty and untitled, requiring a new Save decision. Keep source media and backups until important deliverables have been verified.

## Export

Click **Export…** to choose MP4, PNG still or PNG sequence, exact canvas, frame rate and range. PNG can retain alpha. MP4 cannot: choose an opaque background explicitly. A sequence writes its selected frame range into a destination directory; it does not overwrite unrelated files. Optional Drift sound is mixed from the bundled recorded palette. Source-video audio is not included.

Export owns the captured document snapshot. Switching or editing another document does not redirect its output or completion receipt. Cancel preserves an existing destination. A completed export has passed decoded output checks; still review the visible result before delivering it.

## Install and update

Use `Install-Drift.command` from the verified native GitHub release. Run it with `bash` in Terminal; optional `--destination "$HOME/Applications"` selects an existing writable folder. It verifies the receipt, source, signature and DMG checksum before requesting Quit. A cancelled Quit aborts replacement. Your previous app remains in the printed rollback folder on the same volume. Projects and recovery files are untouched.

An interrupted installer preserves both apps and its recovery marker. If it reports an installation lock, inspect the named folder and confirm no installer is still running before retrying. Do not delete the previous app to resolve an error. No sudo or security-setting bypass is required by the script.

Ad-hoc releases are unnotarized. For a trusted, verified download blocked at launch, use System Settings → Privacy & Security → Open Anyway. Never disable Gatekeeper. Read `MacReleaseReceipt.json` for the actual signing and tested-host status.

Keyboard: **Command–N** New; **Command–O** Open; **Command–I** Add Media; **Command–S** Save; **Shift–Command–S** Save As; **Command–Z** Undo; **Shift–Command–Z** Redo; **Command–W** Close; **Command–Q** Quit. Text fields retain normal editing commands.
