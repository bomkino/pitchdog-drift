# Drift — current state

## Native continuation · 7 September 2026

Repository `bomkino/pitchdog-drift`; branch `codex/drift-native-completion`. This correction continues `c60419b04c26d520829105bbae5796086fd34070`, tree `375e9f50bf5e15584b273c694304305e54549455`, preserving all preceding native work. Main was last checked at hybrid `340b5f631c9147890bc775c86a71af315dd17929`; no native release has been accepted or published.

**Verified at c60419b:** directing-core run `34083702298` passed. Integration run `34083702296`, job `101623651813`, passed all 27 tests. This includes explicit-octal private files, all six destination transaction fault injections, positive WebP timing/copy reuse, largest representation demand, B-frame forward/backward/final sampling and three playback-continuity regressions. Downloaded artifact `10004527299` matches SHA-256 `b3b77cc85379acb5f38e8d850560b9dd18bb7f4b2b9086e4205a8e0772cd2fd9`. Hosted macOS 15.7.9 arm64 / Xcode 16.4; not physical target testing.

**Actual packaged app at c60419b:** run `34083702297`, job `101623651749`, built and passed archive extraction/signature/resource checks. It then passed six-format ordered import, media Undo/Redo, real document Save/portable reopen, World/canvas ownership, Metal role-boundary renders, latest preview seek/play, source video loop-phase checks, four decoded MP4 exports, exact 2576 × 1080 transparent WebP PNG and PNG-sequence range. The next check failed during AAC export: `The encoder stopped accepting frames. The destination is unchanged.` This remains an output blocker. Artifact `10004561866` matches SHA-256 `e7ee563eb0cf5f1a6bafd2c67ccb252ed0cc62e0904a907bcf430184d53047d2`. No installer was uploaded or promoted.

**Active correction:** independently pump ready video/audio inputs without blocking one track behind the other; preserve bounded decoding, exact timestamps and offline encoding. Decode and inspect finished AAC PCM before publication, including sample shape, continuity and duration rather than track count alone. These changes are locally parsed, not accepted until exact-head Mac integration and the packaged journey pass.

Local document transaction/recovery acceptance work is retained separately and not yet included in this commit. Next action: inspect this commit's AAC export, then run the actual Save As/edit-during-save/failure/close/recovery journeys and remaining V3 acceptance.

## Remaining boundary

Full media timing/alpha/colour/output-pixel and decoded-sound comparisons, authored creative consumers, shared resource coordination, stable source audition, documentation/build cleanup and exact-main release still require evidence. Compilation and a passing archive check alone are not application acceptance. Physical M2 mini 8 GB, M1 Pro and macOS 13.3 remain explicitly untested.

Preserve native-only architecture, 2576 × 1080, exact ratios, every approved creative system, Pin + Spotlight + one global Closing, owned original media, useful history and licences. Do not merge or publish with a known build, project-safety or output failure. Only Drift is a write target.
