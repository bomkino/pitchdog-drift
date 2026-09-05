# Drift architecture

Current implementation: `0.3.0`, 5 September 2026. Product: Apple-silicon Mac only.

## Ownership today

AppKit owns the application, window, menus, native panels, security-scoped file grants, close decisions, and WebKit lifecycle. `NativeFileBroker` retains descriptor/identity checks, staged writes, exact destination authority, and ownership-safe cleanup. `NativeAacEncoder` owns bounded, private file-backed PCM conversion through AudioToolbox. These components are retained—not replaced by another wrapper.

`src/App.tsx` currently owns creative project state, reversible commands/history, and the preview/export handoff. `ProjectStore` persists one current recovery snapshot in IndexedDB; `.pitched` packages preserve original media, the manifest, and creative payload. Native file binding still crosses the JavaScript bridge. This split remains a migration boundary, not a genuinely native document architecture.

`documentContent.ts` defines semantic saved-content identity (not visual fidelity). `revisions.ts` binds save completion to the captured content and revision. `documentHistory.ts` holds original immutable Blobs, not expiring object URLs, and bounds history by count and distinct media bytes. Open replacement stages and binds the candidate before installing it. If binding fails, durable recovery is restored before the operation rejects.

## Creative compatibility

Retain `drift-v1-compat/1` and `drift-v2/1` render contracts, Project V4 recipe/provenance fields, deterministic seed/cadence, authored worlds, paths, transitions, readable holds, whole-deck repeats, optical protection, and presenter layer/membership semantics. No generic native approximation is an acceptable replacement.

Video slides add an optional `video` directive to a V4 slide: loop, trimStart, trimEnd, rate. Existing image-only projects keep their meaning. Older app versions may reject projects containing video slides; they must never be used to resave those projects. Keep a copy before downgrade.

Moving video is silent. A source clock begins at master zero and is shared by all repeated cards for that asset. Preview uses a muted video texture; offline output explicitly decodes the requested source frame into a bounded canvas texture. Container time is not offset a second time by a track’s first timestamp. Missing lead/tail coverage holds the nearest video frame. A repeated source is not automatically a seamless whole-master composition.

The existing `CinematicCarousel` render graph and `evaluateProjectFrame` remain authoritative for preview and exported frames. Video decoders are released before output-encoder finalization; frame/sample ownership is explicit. MP4 still verifies its packet timeline and decoded probes before committing; that checks integrity/timing, not every pixel’s artistic fidelity.

## Bounded work

Import uses two workers. Common PNG/JPEG/WebP headers allow dimensions before a small validation decode; EXIF-oriented/unknown formats may require the fallback decoder. Originals are never recompressed automatically. Immutable Blob hashes are shared. Autosaves update the manifest and changed assets rather than rewriting unchanged originals. Texture-cache and decode-request bounds remain in the renderer.

Moving clips are capped at eight and 33,177,600 aggregate source pixels. File-backed AAC accepts at most 300 seconds and still maps the full bounded PCM file during conversion. Project ZIP operations remain in memory within existing limits. These bounds are implementation safeguards, not evidence of optimal performance on an 8 GB Mac.

## Native destination and exit condition

Move document ownership and undo to NSDocument; retain the broker’s transactional guarantees. Use AppKit with selective SwiftUI controls for editing, and a native timeline. Move source media and offline writer responsibilities to AVFoundation with rational timing. Port the render graph to Metal, using Core Image only for justified image/colour operations. Core Animation is for interface transitions, not a competing project clock.

The temporary WK renderer exists to preserve exact creative behaviour during this migration. No browser release or web-only feature branch is authorized by this architecture. Remove the boundary only when legacy and V4 projects, every preserved feature class, original media, presenter timing/audio, colour/alpha, preview, and exported outputs meet agreed parity tests through the native pipeline.

Current native app build tests and source assertions do not satisfy this exit condition. The physical M2 mini 8 GB and M1 Pro laptop remain required validation targets.

## 0.3.0 implementation boundaries

`ProjectStore.stageReplacement/commitReplacement` keeps the accepted recovery record separate from an unaccepted Open. Native binding is provisional until that atomic commit succeeds. Undo and export snapshots retain original media references independently of renderer caches.

`SequentialSamples` owns a bounded forward decoder cursor. The paused renderer sleeps after interaction settles; direct edits/media completion wake it. Source audition is separate from authored timing. `storedZip` creates the portable stored ZIP in chunks and reads it through Blob slices; the deflated legacy path remains bounded. This reduces copying, but does not remove the archive-size limit or complete native media storage.

The old GuidedExportWizard import is only a compatibility facade over one export draft. There is no second wizard state. Public Mac artifact identity is frozen after the packaged lifecycle and V2 video-output checks, then verified again by the publisher without rebuilding.
