# Drift — current state

## Native continuation · 7 September 2026

- Repository: `bomkino/pitchdog-drift`; branch: `codex/drift-native-completion`.
- Last tested head: `622dd8b3ecd1a9589b653a87451d424998c0024a`, descended from handover head `2218cd3a88f0b93935d4b109df36839cecb0e0f7`. Main remains the earlier hybrid `340b5f631c9147890bc775c86a71af315dd17929`; no accepted native release exists.
- **Passed on that exact head:** debug integration run `34079905010`, job `101613089924`, all 15 tests including ordinary-user private-directory traversal, file permissions and project byte round trips. Hosted macOS 15.7.9 arm64, Xcode 16.4. Artifact `10003390758`.
- **Separately passed:** native release build and archive round-trip verification in run `34079905016`, job `101613090233`. The extracted app then failed before import: “The native document window did not open.” No app artifact was published. Independently downloaded evidence artifact `10003394305` matches SHA-256 `ef8e26c3dac0e51ef5999b6dc80efbde851aefb6ac6d80365307d1c9e922c85d`.
- **Current changes, not yet accepted:** leave window attachment to `NSDocument.addWindowController`, make repeated window creation idempotent and expose initialization errors in the packaged journey; preserve displaced destinations across all post-swap exceptions, with six fault-injection regressions; correct packaged copyright to the repository’s existing AGPL-3.0-or-later licence.

Next action: execute both Mac gates on this commit, inspect the first decisive packaged-app failure, and complete V3 document/media/creative/output acceptance. Do not replay the historical repair or restart the native implementation.

## Acceptance boundary

The native AppKit/NSDocument, SwiftUI, Metal, file-backed originals, streamed ZIP64, VP8/VP9 WebM, still/animated WebP, exact 2576 × 1080 canvas, decimal ratios, Pin, Spotlight, global Closing, history, audition, MP4/PNG outputs and licensed recorded sound remain the implementation. Source presence, compilation, archive integrity and the 15 component tests are not full product acceptance.

Physical M2 mini 8 GB, M1 Pro and the macOS 13.3 deployment floor remain untested. Hosted Mac evidence is recorded separately from Linux parsing. No measured performance guarantee is claimed. Do not merge or publish while a known build, document-safety or output failure remains. Preserve history, licences, source originals and unrelated work; only Drift is a write target.
