# D05 evidence receipt — Guided Export foundation (active)

Date: 27 August 2026

Repository: `bomkino/pitchdog-drift`

Start: `codex/d05-guided-export-foundation@4a051e0ca19ede8aaf56e5161f254566ef4fa89e`

Current source commits:

- `6b067f4` — guided Export intent/capability/wizard/snapshot/progress slice;
- `c91986f075c25be8e65cb08721dc7a8f11001397` — fixed-point host-boundary corrections;
- `980c559bf8852bd947dca966302a8bccc0e81c1b` — reusable job status/cancel/receipt controller and application integration.

Current source tree: `fb4b850caaa146398fb112b509aa136c49fba427`

## Ticket boundary

- Destination for this tranche: put the current reliable H.264 MP4 and PNG Frames implementations behind one platform-neutral intent, exact capability preflight, stable six-step journey, immutable job snapshot, and truthful progress vocabulary.
- Public seams: `ExportIntent`, `deriveExportFormatCapabilities`, `reduceGuidedExport`, `preflightGuidedExport`, `captureGuidedExportSnapshot`, `assertGuidedExportIntentMatchesPlan`, and `ExportJobController`.
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
- One session-scoped controller now owns the real H.264/PNG cancellation token, immutable monotonic status, safe terminal state, bounded reconnect history, and verified completion receipt. The quick PNG Still path remains explicitly outside Guided Export job truth.
- A second job cannot start while one is active. Cancel from the Stage or native command reaches the adopted `AbortController`; late success after cancel is rejected. Raw thrown errors, paths, tokens, Project/media objects, and snapshot fingerprints never enter public job status or failure.
- Completion identity, format, dimensions, FPS, exact encoded duration, frame count, and byte bounds must match the locked job. Nominal duration is not confused with encoded duration: a nominal 8.01-second, 30-fps plan owns 240 frames and an 8.0-second encoded artifact receipt.
- Directory-sequence completion remains `directory-written`, accurately distinguishing its verified per-file writes and failure cleanup from the atomic MP4 `committed` publication seam. ZIP/blob completion remains `download-requested`.

## Commands and results

- Focused job/controller/application gate: 7 files / 15 tests passed.
- `npm run build:v2-dev`: passed; 237 modules transformed.
- Final `npm run check`: passed — typecheck, 76 test files / 518 tests, macOS source/import/hardening contracts, and production Vite build; 238 modules transformed.
- Final `npm run build:v2-dev`: passed; 238 modules transformed.
- `git diff --check`: passed.

The production build emitted its existing large-chunk advisory. No new dependency or native binary was added.

## Fixed-point review

### Spec

- Pass for this tranche: platform-neutral intent, stable reasoned capabilities, six-step state, explicit alpha/audio consequences, pre-destination runtime checks, immutable snapshot identity, exact frame timing, truthful phase vocabulary, and reusable job status/cancel/receipt truth are present through named public seams.
- Pass: current evaluator, renderers, audio policy, verifiers, transactional MP4 target, PNG sinks, and prior formats remain delegated/untouched rather than duplicated or deleted.
- Fixed during review: MP4 and PNG pickers now precede job reservation; snapshot media objects are deep-cloned; job-level progress remains monotonic across phase resets; buffer/download flows no longer claim committed publication.
- Fixed during controller review: receipt duration now validates the encoded `frameCount / fps` timeline instead of nominal input duration; success notices follow controller settlement; cancellation from UI and native commands shares the adopted exporter token; late completion cannot overwrite cancel/failure truth.
- Deferred: actual interactive wizard capture, early and mid/late cancellation through the visible journey, exact output artifact receipt/hash from this source tree, and long-export smoke.
- Result: D05 is source-ready and source-green, but remains incomplete and unaccepted behind exact runtime/human evidence gates.

### Standards

- Pass: domain state is pure/frozen and tests protect named promises through public seams.
- Pass: runtime facts are adapted into stable IDs; UI does not parse host error strings.
- Pass: no raw paths, destination grants, process/shell/network authority, dependency, schema, evaluator, renderer, licence, or native target code entered the new intent/snapshot API.
- Pass: existing host sinks remain the external boundary; application wiring does not invent a second codec or verification path.
- Pass: one frozen controller stores only bounded job metadata and completion facts, never portable Project bytes or raw host failures. Listener exceptions cannot alter settlement, one active job is enforced, terminal history is capped at 20, and receipt identity/timing mismatches fail closed.
- Watch item, not hidden acceptance: `GuidedExportWizard` is visually substantial and has semantic static coverage, but no real browser focus/reflow/taste inspection was possible in this host.
- No remaining source-blocking finding in `4a051e0...980c559` after the single Spec/Standards review.

## State and gaps

Highest state: **built** production web bundle.

Also tested: guided intent/capability/reducer/preflight/snapshot, controller lifecycle and redaction, application status/cancel/receipt wiring, progress projection, current export/cancellation/verification contracts, and macOS source contracts.

Not packaged, installed, released, merged, accepted, or complete.

No screenshot or human visual/accessibility acceptance. No Apple-Silicon or exact Garuda artifact was produced. No real H.264/PNG artifact or long-export smoke was rendered during this cloud run: `google-chrome`, `chromium`, `chromium-browser`, and `brave` were absent from `PATH`; no Chrome/headless-shell binary existed in the Playwright cache or searched system locations; no browser or app was installed.

## Exact resume

Resume `bomkino/pitchdog-drift` on `codex/d05-guided-export-foundation` from source commit `980c559bf8852bd947dca966302a8bccc0e81c1b` and this receipt. Verify the clean branch, source tree `fb4b850caaa146398fb112b509aa136c49fba427`, remote divergence, and full D05 ledger first. D05 has no remaining useful source task: only run its real six-step Back/Edit/unsupported/audio/cancel/success journey, exact H.264/PNG artifact receipts, and named long-export smoke if an already-authorized browser/target exists; claim no host or human acceptance otherwise. If those gates remain unavailable, preserve D05 unchanged and activate D02 as the next dependency-ready ticket on a new isolated `codex/` branch only after reconciling its authoritative ticket brief. Keep D00 separate and do not touch D10's complete pinned-frame contract.
