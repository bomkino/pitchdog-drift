# Drift — current state

## Native continuation · 7 September 2026

Repository `bomkino/pitchdog-drift`; working branch `codex/drift-native-completion`. Last tested head: `39a541d0dcf2e61d3d8dca047d0355ef20033de1`. Main remains the earlier hybrid `340b5f631c9147890bc775c86a71af315dd17929`. No accepted native release or installer exists.

**Verified at 39a541d:** debug integration run `34080601224`, job `101615012508`: 21 tests passed, including six destination-swap fault-injection cases and private owner-only directory/file regressions. Downloaded artifact `10003584362` matches SHA-256 `10f8ad844e5281593eb27a15088ba5d4350f13ace095862db32b54c75282dfa7`. Hosted macOS 15.7.9 arm64 / Xcode 16.4; these are component tests, not complete application acceptance.

**Packaged application:** run `34080601230`, job `101615012542`, built and passed archive extraction/signature/resource checks. Native document/window ownership now passed. Mixed-media import then failed at `Video.mp4: Video contains an invalid presentation timestamp.` Downloaded evidence `10003638907` matches SHA-256 `4327d9f09ab1332b53e3c99f919f4f1e25655c21dfb28f8970c5d43c2e906140`. No installer was uploaded or published.

**Current changes awaiting Mac gates:** distinguish zero-sample/decode-only markers from presentation frames while rejecting invalid real-frame timing; reuse immutable decoded WebP/video frames; binary-index positive WebP/WebM hold intervals; prepare each slide at its largest visible occurrence; verify owned media before cache hits and account exact still-cache cost; preserve actionable core errors. Added synthetic B-frame, zero-duration WebP, repeated-hold copy-count and representation-demand regressions. Local Swift parsing passed. These changes are not product acceptance.

Next action: run the affected debug and archived-app gates on this commit, fix the first decisive failure, then complete V3 document/media/creative/output acceptance. Continue existing native work; do not replay the historical repair.

## Remaining acceptance boundary

Actual document Save/Save As/edit-during-save/close/recovery journeys, full media timing/alpha/colour/output pixels and sound decoding, authored creative consumers, global media resource coordination, stable source audition/transport, documentation/build cleanup and an exact-main release remain subject to verification. Source presence, compilation and archive checks alone do not establish them.

Physical M2 mini 8 GB, M1 Pro and the macOS 13.3 deployment floor remain untested. No physical-device performance guarantee is claimed. Keep native-only architecture, 2576 × 1080, exact ratios, all approved creative systems, Pin + Spotlight + global Closing, original media and useful history. Do not merge or publish with a known build, project-safety or output failure. Only Drift is a write target.
