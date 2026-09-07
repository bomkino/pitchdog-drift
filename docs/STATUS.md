# Drift — current state

## Native continuation · 7 September 2026

Repository `bomkino/pitchdog-drift`; branch `codex/drift-native-completion`. This correction continues `ea0078ed47c4e270f64dc2d5198ec69e0cec8f29`, preserving all preceding implementation. Main was last checked at hybrid `340b5f631c9147890bc775c86a71af315dd17929`; no native release is accepted or published.

**Verified baseline:** integration at `c60419b04c26d520829105bbae5796086fd34070` passed 27 tests (run `34083702296`). Packaged app run `34084378343` at `6fa74b64ea8a668cf4dd61768c7dfb44e8bf48a8` passed native import/Undo/Save/reopen, role boundaries, native preview, four fully decoded looped-video MP4 exports, exact 2576 × 1080 WebP alpha PNG, PNG sequence, AAC export with complete PCM verification, cancellation protection and original hashes. Its application artifact is `10004803192`, an unaccepted smoke-test build, not the main/release installer.

**Expanded document check:** `8a143950bbba0b155d5d5a71d803579f98b9c407` added real Open, edit-during-Save, failure, Save As, recovery, close decisions, Revert and stale-write checks, plus decoded AAC/reference-mixer comparison. The app built but crashed before those checks completed. Diagnostic run `34085418978` / job `101628413442` at `ea0078...` established the first fault: `@objc DriftDocument.init()` asserts the main actor on `NSDocumentController Opening`. Downloaded artifact `10005138972` SHA-256 `838404fe973bf17b56ca93cd0a294aa924db9457514efe33f83e8eaaeb0c0cd8`; the crash report, not a guessed compiler issue, governs this correction. Integration at 8a143950 still passed all 27 tests; actual document opening exposed this additional boundary.

**Active correction:** make the document's initialization and thread-safe dirty getter nonisolated; defer audio/UI construction until the main-actor window boundary. Keep concurrent file reading and guarded adoption. Add precise document-journey checkpoints without disabling runtime checks or weakening signing. These changes are locally parsed and require exact-head Mac results.

Separate local audition/cache and timeline-layout changes remain uncommitted pending this document boundary. They are not evidence for this commit's acceptance.

## Acceptance remaining

Complete the expanded document and audio checks, then close the remaining targeted media/pixel, creative-consumer, role, resource, audition and export-ownership questions in the supplied H04–H12 register. Do not expand the product or manufacture tests after a boundary is settled. Retain the existing V3 creative feature set, native-only architecture and original source ownership. Documentation/build cleanup, exact-main promotion and the matching installer remain pending.

Hosted evidence is macOS 15.7.9 arm64, not physical M2 mini 8 GB/M1 Pro or minimum macOS 13.3 testing. Compilation and archive validation alone are not app acceptance. No merge or release with known build, project-safety or output failure. Only Drift is a write target.
