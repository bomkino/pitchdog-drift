# D05 evidence receipt — Guided Export foundation (active)

Date: 27 August 2026

Repository: `bomkino/pitchdog-drift`

Start: `codex/d05-guided-export-foundation@4a051e0ca19ede8aaf56e5161f254566ef4fa89e`

Current source commits:

- `6b067f4` — guided Export intent/capability/wizard/snapshot/progress slice;
- `c91986f075c25be8e65cb08721dc7a8f11001397` — fixed-point host-boundary corrections.

Current source tree: `63a597d453f8ebd9c34478bd769e4309dfd82d2e`

## Ticket boundary

- Destination for this tranche: put the current reliable H.264 MP4 and PNG Frames implementations behind one platform-neutral intent, exact capability preflight, stable six-step journey, immutable job snapshot, and truthful progress vocabulary.
- Public seams: `ExportIntent`, `deriveExportFormatCapabilities`, `reduceGuidedExport`, `preflightGuidedExport`, `captureGuidedExportSnapshot`, and `assertGuidedExportIntentMatchesPlan`.
- Write surface: shared guided Export domain/component/application wiring, existing sink progress events, focused tests/styles, ledger, and this receipt.
- Preserved exclusions: no evaluator fork, renderer fork, native alpha sink, Linux provider/package, MCP write/export implementation, D00 work, D10 pinned-frame work, merge, release, installation, signing, notarization, or publication.

## Environment

- OS: Linux `6.18.35`, x86_64.
- Node: `v24.19.0`; repository declares Node 22 and engine `>=22.12`.
- npm: `11.9.0`; lock declares `npm@11.19.0`.
- Start reconciled to the exact remote D05 branch commit; worktree was clean.

## Characterized existing authority

The live repository already owned more D05 substrate than the build-kit snapshot implied:

- deterministic `round(duration × fps)` frames at `n / fps`;
- shared preview/export evaluator and fixed-time renderer;
- H.264/AAC runtime probing and current presenter-audio constraints;
- independently reopened/full-decoded MP4 verification;
- transactional native/browser file targets with destination preservation;
- PNG header, alpha, names/count/dimensions, ZIP round-trip, and directory readback checks;
- cancellation reaching decoder, renderer, encoder/finalization, destination rollback, and PNG partial-file cleanup;
- a creative authority snapshot plus existing phase/ETA projection.

This tranche delegates to those implementations. It does not create another exporter.

## Demonstrated

- One frozen platform-neutral intent records purpose, background, dimensions, rational FPS, finite duration/frame count, requested presenter/sound-design audio, preferred format, and destination class. It contains no path, command line, grant, or host handle.
- Four stable format cards exist: current H.264 MP4 and PNG Frames are exact-runtime probed; ProRes 4444 and HEVC Alpha remain visibly `not_packaged` for D06.
- H.264 plus transparent background fails before rendering. Missing AVC/AAC, unsupported audio FPS/duration, unavailable PNG directory/ZIP, lost render surface, and unknown probe state map to stable reason IDs.
- PNG Frames with requested audio remains blocked until the creator explicitly acknowledges that image sequences contain no embedded audio. Direct native/command paths cannot bypass that gate.
- Purpose/background → format → film/audio → destination/preflight → render/verify → complete is a stable six-step reducer. Back/Edit preserve draft choices.
- Destination selection happens before reservation. A job then binds an immutable deep-cloned creative snapshot, document revision, fingerprints, exact timing, and audio request. Stale intent/project combinations fail before rendering.
- Progress distinguishes preparation, render, encode/audio, finalize, verify, commit, and complete. Overall ratio cannot move backwards when per-phase counters reset; ETA stays unknown until real samples accumulate.
- MP4 commit language appears only for a target with a commit seam. Buffer/ZIP results say `download-requested`; the app does not pretend a browser download was read back after delivery.
- The existing PNG ZIP test now observes render → finalize → verify → complete and correctly observes no commit phase.

## Commands and results

- Focused domain/application/export gate: 7 files / 54 tests passed.
- `npm run build:v2-dev`: passed; 237 modules transformed.
- Final `npm run check`: passed — typecheck, 74 test files / 514 tests, macOS source/import/hardening contracts, and production Vite build.
- `git diff --check 4a051e0...c91986f`: passed.

The production build emitted its existing large-chunk advisory. No new dependency or native binary was added.

## Fixed-point review

### Spec

- Pass for this tranche: platform-neutral intent, stable reasoned capabilities, six-step state, explicit alpha/audio consequences, pre-destination runtime checks, immutable snapshot identity, exact frame timing, and truthful phase vocabulary are present through named public seams.
- Pass: current evaluator, renderers, audio policy, verifiers, transactional MP4 target, PNG sinks, and prior formats remain delegated/untouched rather than duplicated or deleted.
- Fixed during review: MP4 and PNG pickers now precede job reservation; snapshot media objects are deep-cloned; job-level progress remains monotonic across phase resets; buffer/download flows no longer claim committed publication.
- Deferred: actual interactive wizard capture, early and mid/late cancellation through the visible journey, exact output artifact receipt/hash from this source tree, long-export smoke, and a reusable public job status/cancel/receipt controller.
- Result: D05 is materially implemented and source-green, but remains active rather than complete/source-ready.

### Standards

- Pass: domain state is pure/frozen and tests protect named promises through public seams.
- Pass: runtime facts are adapted into stable IDs; UI does not parse host error strings.
- Pass: no raw paths, destination grants, process/shell/network authority, dependency, schema, evaluator, renderer, licence, or native target code entered the new intent/snapshot API.
- Pass: existing host sinks remain the external boundary; application wiring does not invent a second codec or verification path.
- Watch item, not hidden acceptance: `GuidedExportWizard` is visually substantial and has semantic static coverage, but no real browser focus/reflow/taste inspection was possible in this host.
- No remaining source-blocking finding in `4a051e0...c91986f` after the boundary fixes above.

## State and gaps

Highest state: **built** production web bundle.

Also tested: guided intent/capability/reducer/preflight/snapshot, application source wiring, progress projection, current export/cancellation/verification contracts, and macOS source contracts.

Not packaged, installed, released, merged, accepted, or complete.

No screenshot or human visual/accessibility acceptance. No Apple-Silicon or exact Garuda artifact was produced. No real H.264/PNG artifact was rendered during this cloud run because no browser executable or packaged target was available, and none was installed.

## Exact resume

Resume `bomkino/pitchdog-drift` on `codex/d05-guided-export-foundation` from source commit `c91986f075c25be8e65cb08721dc7a8f11001397` and this receipt. Continue D05 only. First add the narrow reusable export job controller/status/cancel/receipt seam around the existing reservation, progress, sink, and verifier path; do not create another evaluator or exporter. Then run its causal cancel/snapshot/progress tests and the full source gate. If a real browser becomes available without installation, capture the six-step Back/Edit, unsupported format, audio acknowledgement, cancel, and success journey; otherwise record that gate honestly and leave native Mac/Garuda/artifact/human acceptance unclaimed.
