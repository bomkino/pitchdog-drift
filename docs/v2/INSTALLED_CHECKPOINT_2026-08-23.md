# Drift V2 Editorial slice — installed checkpoint receipt

Evidence captured: 23 August 2026

Implementation source: `03669850ebda8eb3d064e03bddc94430af6071bb`

Branch: `codex/v2-directors-cut`

Pull request: [#34 — Drift V2: Editorial Performance vertical slice](https://github.com/bomkino/pitchdog-drift/pull/34)

Installed application: `/Applications/Drift V2 Dev.app`

Protected production application: `/Applications/Drift.app`

## Verdict

`0366985` is a clean, source-tested, browser-tested, packaged, installed, and pushed **development checkpoint for the first Editorial Drift V2 renderer slice and its restored-pin repair**. Both exact implementation-head Mac workflows passed. The corresponding CI workflow concluded `success` only after one browser retry, so this receipt does not launder that run into a pristine exact-head CI claim. This is not the complete curated-donor V2, a production document app, a merge, a signed public release, or creative approval.

The app in `/Applications` is universal (`arm64` and `x86_64`), sandboxed, isolated under bundle identifier `dog.pitch.drift.v2.dev`, and records build `273` plus the exact source SHA above. The production V1 app remains source `5fd145207235884790ba071c5d84bc3876ff4989`; its complete file manifest and executable hash were identical before and after the V2 replacement.

## What this checkpoint repairs

- A newly chosen pinned frame now starts as **Still only**, **Protected**, and **Use source**. A landscape slide no longer inherits an accidental 9:16 crop or duplicates itself in the moving carousel.
- Existing Project V4 creative state is never rewritten merely because it was opened by a newer build. The new **Reset pinned frame** action is an explicit recovery operation.
- Reset preserves the selected asset, enabled state, fit, crop and focal point, corner treatment, border, and other authored identity while restoring safe geometry, source ratio, protected layering, and still-only track membership.
- Reapplying the authored Editorial Drift World restores its opaque paper room. Transparent output remains available, but is an explicit choice after that World reset.
- Browser evidence now has separate V1-compatibility and true V2-development app paths, origins, and storage namespaces.
- The presenter-clock journey now samples the renderer after a real paint and waits on the engine's pending seek authority. It no longer mistakes ordinary decoder/rAF scheduling for product drift or silently accepts a seek timeout.

## Source and browser evidence

| Gate | Exact evidence | Verdict |
| --- | --- | --- |
| TypeScript and source contracts | `npm run check` passed on the candidate | Pass |
| Unit and contract suite | 282/282 across 37 files | Pass |
| Real-browser suite | 32/32 in one uninterrupted 8.8-minute run: 31 V1-compatibility journeys plus one true V2 app-path journey | Pass |
| Presenter-clock stress | Exact repaired journey passed 5/5 with all behavioral tolerances unchanged | Pass |
| Restored pin round trip | Historical V3-era hybrid state remained untouched on open; explicit reset survived reconcile, archive, reload, and moving-track resolution | Pass |
| V2 app identity | `v2-dev` build channel and `pitchdog-drift-v2-dev` storage namespace were asserted in the browser before the pin journey | Pass |
| V2 interaction loop | Complete positive and negative deck loops returned byte-identical WebGL canvas hashes | Pass |
| Presenter clock | Running, wrap, pause, reduced motion, export freeze, resume, and pin ownership held in focused and full browser runs | Pass |
| Manual browser views | The historical bad 9:16 hybrid and duplicate moving frame were recreated; Reset produced a clean source-ratio protected still on the opaque paper/grain room | Pass for the inspected browser views only |

The manual browser views are local QA evidence, not public release screenshots or owner approval. The wider visual matrix remains open.

## Package and installation evidence

| Gate | Exact evidence | Verdict |
| --- | --- | --- |
| Candidate source identity | Bundle `DriftSourceRevision` equals `03669850ebda8eb3d064e03bddc94430af6071bb`; bundle build is `273` | Pass |
| Universal executable | `arm64 x86_64` | Pass |
| Candidate executable | SHA-256 `0590fe019ff65dbf2ae2460a404876152289b3e62d6ddf74100b06a30028e87e` | Pass |
| Bundle integrity | Code signature, designated requirement, resource manifest, licences, bridge, and build receipt verified | Pass |
| Packaged WKWebView matrix | Sandboxed ad hoc, unsandboxed ad hoc, and sandboxed self-signed variants all completed | 3/3 pass |
| Candidate → installed bytes | Recursive comparison and full relative-path manifest comparison passed | Pass |
| Installed WKWebView matrix | The production variant launched from `/Applications/Drift V2 Dev.app`; all three variants completed | 3/3 pass |
| Installed permissions | Bundle root is `drwxr-xr-x`; contents are readable/traversable by all local users and the executable is `0755` | Pass |
| V1 preservation | Source remained `5fd145207235884790ba071c5d84bc3876ff4989`; executable remained SHA-256 `d3af7e2824f89c595e6b8a04929afd75b67970cfe810bf5ecb031e2e887a62eb`; full before/after manifests matched | Pass |

The previous installed V2 Dev app, source `dac20dd900c6d630340de727dba341a4d2351797`, was preserved twice rather than deleted:

```text
build/macos/v2-dev/backups/20260823-015110-dac20dd900c6d630340de727dba341a4d2351797/Drift V2 Dev.app
/Applications/.drift-v2-backups/20260823-015110-dac20dd900c6d630340de727dba341a4d2351797/Drift V2 Dev.app
```

Those recovery copies are intentionally ignored/hidden and are not part of the public repository. The detailed local logs, manifests, and packaged-runtime receipts live under the ignored `build/macos/v2-dev/install-evidence-03669850ebda8eb3d064e03bddc94430af6071bb/` boundary.

## GitHub evidence for the repair

The remote feature branch and draft PR read back implementation commit `03669850ebda8eb3d064e03bddc94430af6071bb`:

- [macOS standalone app run 32596579823](https://github.com/bomkino/pitchdog-drift/actions/runs/32596579823): native source, universal V1 app preservation, and isolated V2 app jobs passed;
- [macOS WKWebView runtime run 32596579843](https://github.com/bomkino/pitchdog-drift/actions/runs/32596579843): packaged runtime passed.
- [CI run 32596579855](https://github.com/bomkino/pitchdog-drift/actions/runs/32596579855): source checks passed, but the browser report was `31 passed, 1 flaky`. The first native-import attempt observed `saving`; its retry passed. GitHub therefore reported workflow success, but this receipt records the browser gate as reopened.

The subsequent hardening changes in this branch poll a new post-command native receipt until it is idle and saved, retain the reload proof, and set Playwright `failOnFlakyTests` in CI. Retries remain available for diagnostics, but can no longer turn a flaky run green. That hardening requires its own clean remote run; a later test/documentation commit does not change the source revision installed in the app.

## Earlier vertical-slice GitHub evidence

The branch-selected [macOS standalone app run 32592147135](https://github.com/bomkino/pitchdog-drift/actions/runs/32592147135) completed successfully against exact event and checkout SHA `dac20dd900c6d630340de727dba341a4d2351797`.

The run uploaded:

- `drift-v2-dev-dac20dd900c6d630340de727dba341a4d2351797` — artifact id `9480627422`, digest `sha256:ca045305986ade4b034659c46b506b936c98affb32a51f88650733deed800624`;
- `drift-packaged-webview-evidence-32592147135` — artifact id `9480628396`, digest `sha256:032246a810500da0517ed6453411871d1d01dde134d88df9475a11ff9bf0bff3`.

The exact-head run proves the selected branch commit, its V2 bundle source revision, and its uploaded development artifact. Pull-request runs prove GitHub's proposed merge ref separately; neither state implies merge, release, or publication.

All pull-request checks for implementation head `dac20dd` also completed successfully:

- [CI run 32592149485](https://github.com/bomkino/pitchdog-drift/actions/runs/32592149485): source checks plus 31/31 real-browser journeys in 8.9 minutes;
- [macOS WKWebView runtime run 32592149501](https://github.com/bomkino/pitchdog-drift/actions/runs/32592149501): passed;
- [macOS standalone app run 32592149517](https://github.com/bomkino/pitchdog-drift/actions/runs/32592149517): native, V1 preservation, and isolated V2 jobs passed.

## Failures that changed the evidence

### Restored pin composition

The visible defect was real: a V3-era saved hybrid combined a landscape media source with a custom 9:16 presenter ratio and `moving-and-pinned` track membership. That produced both the ugly tall crop and a duplicate moving copy. Automatic migration would have destroyed legitimate custom direction, so the repair is opt-in: safe first-use defaults for new pins plus an explicit reset for historical projects.

### Presenter-clock sampling

The full browser run initially found 62–97 ms of apparent restored drift. Repetition showed the test was sampling a continuously coasting HTML video between requestAnimationFrame paints while the authored master clock advances at paint time. The repaired journey forces a real paint, waits for the engine's canonical seek to settle, and starts playback from a known `t=0`. No renderer tolerance was loosened and no engine clock code changed.

### Native-import saved-state sampling

GitHub CI exposed a second observer race: the native picker contract, two ordered cards, and both released grants were already correct, but the test sampled the last native client report while it still said `saving`. A traced local pass measured cards appearing about 64 ms after menu-command return and the final `saved` report about 111 ms after return, leaving the old one-shot read only about 19 ms of margin. The repair captures the pre-command client-report count and polls until a new report proves `projectBusy: false` and `saveState: saved`, then independently reloads the two assets. The app persistence path was not changed.

### Reusable controls and test authority

Reusable controls originally derived DOM ids from visible labels. Repeated labels could collide, and values or help text polluted accessible names. The candidate now uses unique React ids, explicit labels, and separate accessible descriptions. Two browser tests that addressed the old private id were repaired to use the visible `Duration` label.

### Reduced motion and grain

One old assertion required the entire V2 lifecycle to remain pixel-identical under reduced motion. That contradicted the authored contract: spatial travel and grain freeze, while opacity timing may still enter or leave. The repaired browser journey finds a stable body interval long enough to falsify a live 12 fps grain plate without outlawing legitimate lifecycle fades. It held three times and in the final full suite.

### Packaged-runtime launch collision

The first local packaged matrix produced no app identity or self-test receipt because an older installed V2 Dev process already owned the same development bundle identity. Only that older V2 process was closed; V1 remained running. The exact same candidate then passed packaged and installed matrices. The failed no-launch receipts are not counted as product passes, but they remain part of the causal record.

## Gates still open

- The Mac was locked during the final desktop-inspection attempt. The installed app passed automated launch/runtime verification, but no human-visible installed-screen approval is claimed until the desktop is unlocked and inspected.
- Ordinary installed-interface transparent PNG and short MP4 saves still need a human-unlocked Save panel, followed by decode and visual inspection.
- Exact-head CI remains open until the post-flake hardening commit completes remotely without a retry; the two implementation-head Mac workflows are already clean.
- Only Editorial Drift is a live V2 World. The complete materials, lighting, forty atmospheres, optics, sound, portrait set, command/receipt/lock/undo system, and Direct journey remain outside this checkpoint.
- PR #34 remains a draft. This receipt does not authorize or claim merge to `main`.
- Developer ID signing, notarisation, stapling, GitHub Release publication, and owner approval have not happened.

Keep using `/Applications/Drift.app` for real `.pitched` projects. Treat `/Applications/Drift V2 Dev.app` as a disposable creative-development checkpoint until the remaining product and release gates hold.
