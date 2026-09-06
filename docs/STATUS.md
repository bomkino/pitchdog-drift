# Drift — current state

## Native completion execution · 6 September 2026

Authorized scope: DRIFT_EXECUTION_SPEC_V3. Keep Pin; add Spotlight and Closing; remove Presenter entirely. No old-project compatibility. Exact 2576 × 1080 defaults. WebM plus still and animated WebP. Apple silicon Mac only, deployment floor 13.3. Galileo is read-only reference. Final native completion and release require the specification's actual app/output gates; this branch is not a released application.

Base main: `340b5f631c9147890bc775c86a71af315dd17929`.
Working branch: `codex/drift-native-completion`.

Accepted component work: pure Swift exact ratios/canvas values and frame-quantized presentation insertion, including one global Closing. Commit `c5b10862d8f67bce14f04f4e6368efb5c8740b88` passed four core tests on an arm64 Mac runner (macOS 15.7.9, build 24G830, Swift 6.1.2). This does not prove an integrated editor or exported media.

In progress: exact-size editor repair; native document/command ownership; analytical motion port and role integration; native codec adapters. The codec SDK job builds immutable libwebp/libwebm/libvpx revisions and retains their notices. SDK compilation is not an end-to-end format-support claim. Originals are never replaced by compatibility transcodes.

Execution environment: direct Git DNS is unavailable but the GitHub connector can read/write. Local Chromium navigation is blocked by administrator policy; no bypass is attempted. Use supported Mac CI for actual app/output proof. The user's physical M2 mini 8 GB and M1 Pro have not been tested.

## Existing main / release boundary

Main remains the 0.3.0 AppKit/WKWebView hybrid until the native candidate passes acceptance. It includes video-slide loop/trim/rate, transactional recovery handoff, media-aware history, saved-content tracking, Save-on-close, bounded sequential video decoding, settled-preview scheduling, and direct export. It retains 64 MiB/file, 80 MiB total and 96 MiB archive limits, silent video slides, and a separate presenter slot. Those existing limits are not raised by this native-core or SDK commit.

The inspected v0.3.0 release record `383255443` remains an unpublished draft with no assets. Do not treat source/main, a passing component job, a tag, an installer artifact and a published release as the same state. Do not claim native completion or installation readiness from this branch yet.

Next implementation boundary: integrate the native typed document, complete command/snapshot semantics and faithful frame evaluation; finish actual WebM/WebP decoding, file-backed original ownership and native editor/render/output. The final release additionally requires exact-artifact packaging, release-ID-based publication, mandatory checksums and a non-destructive reinstall/rollback path.

Historical plans and earlier QA remain evidence, not competing current status documents. Licensing, attribution, old tags/releases and user files remain intact.
