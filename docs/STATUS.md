# Drift — current state

## Native continuation · 7 September 2026

- Repository: `bomkino/pitchdog-drift`; working branch: `codex/drift-native-completion`.
- Reconciled starting head: `2218cd3a88f0b93935d4b109df36839cecb0e0f7`, tree `18248d6ea2323fca10bbc605a0f9db54f6f9ede4`.
- Main: `340b5f631c9147890bc775c86a71af315dd17929` (earlier hybrid). No native release is accepted or published.
- Active work: H01–H03 / T15, T17, T26, T36, T51. Five Swift private-file/directory masks now use explicit octal; `StagedBatch` has an explicit immutable initializer; the app archive is extracted, checked and used for the required packaged journey before upload.
- Evidence: the read-only handover checker verified 539 files without mismatches. Local Swift parsing and permission-literal reproduction passed. The new ordinary-user filesystem regression and affected debug/release Mac gates must execute on this commit; source changes are `IMPLEMENTED_UNVERIFIED`, not application acceptance.
- Previous exact-head results remain distinct: core run `34065358693` passed; debug integration `34065358645` failed at `StagedBatch`; application `34065358668` built successfully but failed at private proof-directory setup. No previous native installer was uploaded.

Next action: inspect the new debug integration and archived-app journey, fix the first decisive failure, then finish the V3 document/media/creative/output acceptance checks. Do not replay the historical repair or restart the native app.

## Acceptance boundary

The existing native AppKit/NSDocument, SwiftUI, Metal, file-backed media, streamed ZIP64, VP8/VP9 WebM, still/animated WebP, exact 2576 × 1080 canvas, decimal ratios, Pin, Spotlight, global Closing, history, source audition, MP4/PNG output and licensed recorded sound are retained. Source presence is not proof of feature, colour/alpha, audio, project-safety or output acceptance.

Physical M2 mini 8 GB, M1 Pro and the macOS 13.3 deployment floor are untested here. Available local validation is Linux x86_64 Swift parsing/core work; hosted arm64 Mac results must be recorded separately. No performance guarantee follows from compilation.

Only Drift is a write target. Presenter and old-format conversion remain absent from the native model. Preserve source originals, licences, history, protections and unrelated work. Do not merge or publish while a known build, document-safety or output failure remains.
