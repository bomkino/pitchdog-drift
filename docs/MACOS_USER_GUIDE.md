# Drift for macOS — user guide

Drift turns images and video slides into directed sequences. This guide describes the `0.3.0` Mac application. The interface is still hybrid; no account, cloud project, or browser product is required.

## Install and open

Download **Drift-0.3.0-macOS-arm64.dmg** from the matching GitHub release. Drag `Drift.app` to Applications and open it. When macOS blocks an unnotarized app you trust, open System Settings → Privacy & Security → Open Anyway after the first launch attempt. Ad-hoc test downloads are unnotarized; they are not represented as Gatekeeper-ready. Do not disable system-wide security to install Drift. Keep the previous application and a copy of your `.pitched` files before upgrading.

The source’s deployment floor is macOS 13.3. Refer to the artifact’s receipt for the actual macOS version tested. Intel Macs, Windows, and Linux are outside this product.

## Add and arrange media

Use Add slides or the File menu to select PNG, JPEG, WebP, AVIF, MP4, MOV, or WebM files. Codec support depends on the installed Mac runtime, not just the extension. Imported originals remain unchanged. Select a tile to adjust its fit and crop; reorder or remove it from Media. Undo/Redo includes media edits and original bytes.

A video slide starts at master time zero. **Loop video** repeats the selected source range; off holds its last frame. Source start/end trim and playback speed remain in the project. **Reset trim** restores the whole source without changing its speed. **Preview source clip** opens an on-demand filmstrip and silent audition; playing it pauses the master preview. Repeated cards share the same clip clock. Turning a clip into a seamless loop may still require an authored source edit; Drift does not manufacture a dissolve across its cut.

Video slides are silent. Their embedded source audio is preserved in the portable original, but is not mixed. Use the separate presenter video slot for voice. Moving video slides cannot themselves be pinned in this release. Images can be pinned, and the dedicated presenter retains protected/in-scene placement, layer order, fit, borders, shadows, and timing.

This build admits up to eight video slides and 33,177,600 combined decoded source pixels. Originals remain limited to 64 MiB per file and 80 MiB total. Very large or unsupported files produce an actionable error instead of silently recompressing the original.

## Direct and preview

Slides controls framing. Look controls worlds, backgrounds, surfaces, and optics. Motion controls paths, readable holds, cadence, tempo, transitions, and repeats. The stage stays dominant; explanatory and advanced material is expandable.

Use Space for playback, arrow controls for output-frame steps, and the timeline for scrubbing. The clock reads minutes:seconds:frames at the selected output frame rate. Preview Reduce Motion does not silently change the authored export. A/B previews an earlier direction without saving it; it is unavailable for comparisons that change the media set.

Presenter source trim is separate from mute. Its story start/end place the source in the sequence; muting does not alter its video timing.

## Save, open, and recovery

Use **File → Save Project** or **Command–S** to save the current document. Use **File → Save Project As…** to preserve another named copy. A successful native Save includes staged writing and readback verification. Edits made while saving remain dirty unless the exact saved content is restored by Undo.

Open it through **File → Open Project…**, Finder, or Open With Drift. A candidate project is verified and staged beside the current project. The current recovery project stays intact until an atomic replacement commits all its media and manifest together. Failed native acceptance restores the prior file binding; failed cleanup is shown as recovery, not as saved work.

Local recovery and the named `.pitched` file are different. The local copy protects completed autosaves; it does not mean the named file contains the latest edits. On close/quit, Save must succeed before Drift closes. Cancel keeps the document open. Don’t Save leaves the named file unchanged; a completed local recovery copy may remain. An unfinished import/export has its own operation warning.

New video-slide projects require this app version or later. Older image-only V4/legacy projects retain compatibility. Before downgrading, retain an untouched project copy. Never resave a video-slide project in an older version that does not understand it.

## Export

Open Export, choose MP4 or PNG sequence, then **Export…** and a destination. There is one export form; no step-by-step wizard. Use **Export PNG still** for a single frame. More export options changes the background and frame destination without mutating the project; Output details is an optional diagnostic summary.

MP4 is opaque H.264. Transparent output uses PNG. PNG frames contain no audio; when the project includes audio, explicitly acknowledge the silent frame sequence. Invalid media, unsupported output, or unsafe destination replacement blocks export. Creative/reading-time recommendations are advisory.

Native AAC accepts up to 300 seconds at 24/25/30 fps; 50/60 fps remains silent-only. This limit is backed by a native encoder test, not a claim that every five-minute mixed-media composition has been tested. Presenter audio is never dropped silently.

Cancel before final commit preserves the previous destination and removes only Drift-owned temporary output. Once atomic publication begins, the committed result is final. File → Reveal Last Saved File in Finder reveals the most recent committed file. A complete frame sequence contains numbered frames; failed cleanup is reported rather than hidden.

## Shortcuts

- **Command–O:** Open `.pitched` project
- **Command–S:** Save project
- **Command–Shift–S:** Save Project As
- **Command–Z / Command–Shift–Z:** Undo / Redo
- **Space:** Play / pause outside text fields
- **Left / Right:** Output-frame step with timeline focus

## Known validation boundaries

Physical M2 mini 8 GB and M1 Pro laptop testing, sleep/wake, external displays, actual process-crash recovery, colour-managed visual comparisons, and installation rollback remain separate from source/build tests. Keep original project copies. Report the app version, build number, source revision, operation, and error; do not upload private client decks to public issues or CI.
