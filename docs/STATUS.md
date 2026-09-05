# Project status

This is the single current status record for Drift. Updated 5 September 2026 for the `0.3.0` Mac release line. Publication is determined by the exact GitHub tag, release assets, and their receipts—not this document or a green source check.

## Product boundary

Drift is exclusively an Apple-silicon Mac application. No browser, Windows, or Linux product is maintained. The current app remains an AppKit/WKWebView hybrid with native scoped file handling and AudioToolbox AAC. The NSDocument, native inspector/timeline, AVFoundation media pipeline, and Metal renderer migration are **not complete**.

## Implemented in this line

- Project Open stages the replacement beside the current recovery project and preserves the original binding until commit. An atomic IndexedDB transaction replaces manifest and media together. Failed acceptance leaves the old recovery intact; failed cleanup enters recovery.
- Undo/redo retains project state and original-media references, including media removal, import, ordering, presenter replacement, and pin changes. History is bounded by count and unique original bytes.
- Dirty state compares canonical document content to the saved snapshot while preserving revisioned save completion. Undo to the saved document is clean. Save snapshots are captured before asynchronous work.
- Native close/quit offers Save, Cancel, and Don’t Save for a dirty idle document. Save completion must succeed before closing. Don’t Save leaves any completed local recovery copy; it does not overwrite the bound file.
- Image admission reads common headers before validation decoding; image import concurrency is two. Unknown image encodings still use a decoder fallback. Video metadata and frame waits have deadlines.
- Unchanged original Blobs reuse digest work and IndexedDB records during settings-only autosaves.
- Moving slides accept images and silent MP4/MOV/WebM video. Video directives save looping, source start/end, and playback rate. The interface exposes loop, trim, speed, Reset trim, and on-demand source filmstrip/audition. Clips share one master-relative source clock across repeated cards.
- Native AAC PCM is staged to private disk storage, then mapped for conversion, rather than accumulated as one heap buffer. Limit: 300 seconds. This is not a fully incremental audio encoder or proof of long-form mixed-output fidelity.
- Ordinary export uses one direct form and one draft; advanced background/destination fields expand in place. Stale results and audio-loss acknowledgments cannot belong to a different draft. Timeline shows output-frame timecode; presenter video trim remains available while muted.

## Performance changes

- A paused, settled preview no longer schedules continuous rendering. UI edits, media arrival, scrubbing, inertia, visibility changes, and playback wake the renderer.
- Forward video export retains a bounded sample iterator and reuses a source frame while it covers an output timestamp. Loops, backward seeks, and sparse jumps reset the decoder.
- Cancellation reaches texture/video preparation, not only later output frames; late results are released.
- Source audition uses one on-demand decoder and five small thumbnails. Closing it releases the video, callbacks, and thumbnail URLs.

## Validation boundary

The release pipeline requires exact-source unit/type/source checks, project handoff/reopen tests, video-loop MP4 pixel checks, Mac compilation/broker tests, packaged lifecycle and V2 video-output proof, native AAC probing, and verification of the exact disk image. A release asset is uploaded only from the successful exact-main Mac run; it is not rebuilt for publication. CI jobs and release receipts carry their exact commits; no future result is asserted here.

Neither the physical Mac mini M2 with 8 GB nor the M1 Pro MacBook Pro was tested during this implementation. No claim of measured frame rate, memory peak, thermal behaviour, battery use, sleep/wake reliability, wide-gamut fidelity, or low-memory crash recovery is made.

## Retained limits and remaining work

Audio-bearing output stays limited to 24/25/30 fps. Video slides are silent and cannot themselves become the pin; the dedicated presenter slot retains its audio, placement, and timing. Byte budgets remain 64 MiB/file, 80 MiB total, 96 MiB archive. Moving-video admission is at most eight sources and 33,177,600 combined source pixels. Stored project ZIPs are written in chunks and read as Blob slices, avoiding a second full set of original-media arrays. Archives and originals still live within conservative Blob/IndexedDB budgets; this is not the future native file-backed original vault. Deflated legacy ZIPs use the existing bounded compatibility reader.

Full native document/render migration, comprehensive colour/alpha visual parity, actual process-crash recovery, physical-Mac performance profiling, installation/rollback, and long-form mixed presenter audio remain acceptance work. Do not equate a silent browser MP4 test or native AAC packet equation with that coverage.

## Publication vocabulary

Committed, tested, merged, tagged, asset-published, signed, and notarized are separate states. Developer ID/notarization checks remain mandatory for a distribution described as notarized. An explicitly identified ad-hoc test DMG may be published with its unnotarized and untested-hardware limitations.

## Historical material

`docs/programme/`, `docs/v2/`, dated QA reports, and Linux tracer documents retain useful design and provenance evidence. Their completion tables and browser/platform assumptions are historical, not the current product contract. Consult this page first, then the Mac user guide and architecture.
