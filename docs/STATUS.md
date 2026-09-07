# Drift — current state

## Native continuation · 7 September 2026

Repository `bomkino/pitchdog-drift`; branch `codex/drift-native-completion`. Reconciled starting head for this correction: `14fb3e3f580202d6da3fd159c9cf15c2d494269e`, tree `d17b252ea10378117bcb68cd34a64118f87fb579`. Newer destination, document ownership and media/cache changes were preserved. Main last checked at the earlier hybrid `340b5f631c9147890bc775c86a71af315dd17929`; no accepted native release or installer.

**Exact-head evidence at 14fb3e3:** core run `34082006479` passed. Debug integration `34082006554` / job `101618941453` built; 23 of 24 test cases passed, including all six destination-swap fault injections, private-file permissions, positive WebP hold intervals and largest representation demand. B-frame forward/backward/final sampling failed five assertions/errors: raw timeline began at 0.1666667 rather than zero and the final requested frame was unavailable. This is a media/output acceptance blocker.

**Packaged application at 14fb3e3:** run `34082006504` / job `101618941182` built and passed archive extraction, arm64/signature/resource/identity checks. The actual extracted application then failed during `Video.mp4` import: `Video timing is incomplete.` No installer upload, merge or release was accepted. Build number 11 / version 0.4.0 is an unaccepted ad-hoc-signed build, not a release.

**Active correction:** read container-adjusted output timestamps and durations consistently in the compressed index and decoded source path; retain strict timeline/order/duration checks and existing B-frame assertions. Add opt-in synthetic timing diagnostics and exact-head native source evidence to integration artifacts. Local parsing is not Mac validation; this change is `IMPLEMENTED_UNVERIFIED` until the affected integration and actual packaged-app journey run.

Next action: inspect this commit's B-frame test and six-format packaged import, then finish the existing V3 acceptance boundaries below. Do not replay the historical repair or reset newer work.

## Remaining acceptance boundary

Actual document Save/Save As/edit-during-save/close/recovery journeys, full media timing/alpha/colour/output pixels and decoded sound, authored creative consumers, shared resource coordination, stable audition/transport, documentation/build cleanup and exact-main release still require evidence. Source presence, compilation and archive checks do not establish application acceptance.

Physical M2 mini 8 GB, M1 Pro and the macOS 13.3 deployment floor remain untested. Preserve native-only architecture, 2576 × 1080, exact ratios, creative systems, Pin + Spotlight + one global Closing, owned original media, useful history and licences. Do not merge or publish with a known build, project-safety or output failure. Only Drift is a write target.
