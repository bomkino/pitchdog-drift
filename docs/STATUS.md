# Project status

This is the single current status record for Drift. Updated 5 September 2026 for the `0.3.0` implementation candidate. Publication is determined by the exact GitHub tag, release assets, and their receipts—not this document or a green source check.

## Product boundary

Drift is exclusively an Apple-silicon Mac application. No browser, Windows, or Linux product is maintained. The current app remains an AppKit/WKWebView hybrid with native scoped file handling and AudioToolbox AAC. The NSDocument, native inspector/timeline, AVFoundation media pipeline, and Metal renderer migration are **not complete**.

## Implemented in this line

- Project Open commits durable recovery and native binding before replacing visible state. Failed native finalization restores the prior durable snapshot; rollback failure enters recovery.
- Undo/redo retains project state and original-media references, including media removal, import, ordering, presenter replacement, and pin changes. History is bounded by count and unique original bytes.
- Dirty state compares canonical document content to the saved snapshot while preserving revisioned save completion. Undo to the saved document is clean. Save snapshots are captured before asynchronous work.
- Native close/quit offers Save, Cancel, and Don’t Save for a dirty idle document. Save completion must succeed before closing. Don’t Save leaves any completed local recovery copy; it does not overwrite the bound file.
- Image admission reads common headers before validation decoding; image import concurrency is two. Unknown image encodings still use a decoder fallback. Video metadata and frame waits have deadlines.
- Unchanged original Blobs reuse digest work and IndexedDB records during settings-only autosaves.
- Moving slides accept images and silent MP4/MOV/WebM video. Video directives save looping, source start/end, and playback rate. The interface exposes loop and trim; rate remains a model-level value. Clips share one master-relative source clock across repeated cards.
- Native AAC PCM is staged to private disk storage, then mapped for conversion, rather than accumulated as one heap buffer. Limit: 300 seconds. This is not a fully incremental audio encoder or proof of long-form mixed-output fidelity.
- Ordinary export uses a direct form. Advanced delivery options remain available on demand. Timeline shows output-frame timecode; presenter video trim remains available while muted.

## Validation boundary

Local Linux type checking and unit tests passed during development. The candidate must still pass its exact-source Mac compilation, broker tests, packaged lifecycle, native AAC file-backed probe, and synthetic video export regression before promotion. CI jobs and release receipts carry their exact commits; no future result is asserted here.

Neither the physical Mac mini M2 with 8 GB nor the M1 Pro MacBook Pro was tested during this implementation. No claim of measured frame rate, memory peak, thermal behaviour, battery use, sleep/wake reliability, wide-gamut fidelity, or low-memory crash recovery is made.

## Retained limits and remaining work

Audio-bearing output stays limited to 24/25/30 fps. Video slides are silent and cannot themselves become the pin; the dedicated presenter slot retains its audio, placement, and timing. Byte budgets remain 64 MiB/file, 80 MiB total, 96 MiB archive. Moving-video admission is at most eight sources and 33,177,600 combined source pixels. Full project archive creation/readback still uses bounded in-memory ZIPs.

Full native document/render migration, comprehensive colour/alpha visual parity, actual process-crash recovery, physical-Mac performance profiling, native video-slide export coverage, installation/rollback, and long-form mixed presenter audio remain acceptance work. Do not equate a silent browser MP4 test or native AAC packet equation with that coverage.

## Publication vocabulary

Committed, tested, merged, tagged, asset-published, signed, and notarized are separate states. Developer ID/notarization checks remain mandatory for a distribution described as notarized. An explicitly identified ad-hoc test DMG may be published with its unnotarized and untested-hardware limitations.

## Historical material

`docs/programme/`, `docs/v2/`, dated QA reports, and Linux tracer documents retain useful design and provenance evidence. Their completion tables and browser/platform assumptions are historical, not the current product contract. Consult this page first, then the Mac user guide and architecture.
