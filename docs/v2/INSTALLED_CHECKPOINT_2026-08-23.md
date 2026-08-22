# Drift V2 Editorial slice — installed checkpoint receipt

Evidence captured: 23 August 2026

Implementation source: `dac20dd900c6d630340de727dba341a4d2351797`

Branch: `codex/v2-directors-cut`

Pull request: [#34 — Drift V2: Editorial Performance vertical slice](https://github.com/bomkino/pitchdog-drift/pull/34)

Installed application: `/Applications/Drift V2 Dev.app`

Protected production application: `/Applications/Drift.app`

## Verdict

`dac20dd` is a clean, source-tested, browser-tested, packaged, installed, pushed, and exact-head-CI-verified **development checkpoint for the first Editorial Drift V2 renderer slice**. It is not the complete curated-donor V2, a production document app, a merge, a signed public release, or creative approval.

The app in `/Applications` is universal (`arm64` and `x86_64`), sandboxed, isolated under bundle identifier `dog.pitch.drift.v2.dev`, and records build `271` plus the exact source SHA above. The production V1 app remains source `5fd145207235884790ba071c5d84bc3876ff4989` and was not replaced.

## Source and browser evidence

| Gate | Exact evidence | Verdict |
| --- | --- | --- |
| TypeScript and source contracts | `npm run check` passed on the candidate | Pass |
| Unit and contract suite | 280/280 across 37 files | Pass |
| Real-browser suite | 31/31 in one uninterrupted 6.3-minute run | Pass |
| Repaired browser trio | Native admission race, export lifecycle, and reduced-motion grain contract passed 9/9 across three repetitions | Pass |
| V2 interaction loop | Complete positive and negative deck loops returned byte-identical WebGL canvas hashes | Pass |
| Presenter clock | Running, wrap, pause, reduced motion, export freeze, resume, and pin ownership held in focused and full browser runs | Pass |
| Manual browser views | Authored 9:16, 16:9, protected-pin, and scaled 2160 × 3840 views inspected without ratio distortion or default slide borders | Pass for the inspected views only |

The manual browser views are local QA evidence, not public release screenshots or owner approval. The wider visual matrix remains open.

## Package and installation evidence

| Gate | Exact evidence | Verdict |
| --- | --- | --- |
| Candidate source identity | Bundle `DriftSourceRevision` equals `dac20dd900c6d630340de727dba341a4d2351797` | Pass |
| Universal executable | `arm64 x86_64` | Pass |
| Bundle integrity | Code signature, designated requirement, resource manifest, licences, bridge, and build receipt verified | Pass |
| Packaged WKWebView matrix | Sandboxed ad hoc, unsandboxed ad hoc, and sandboxed self-signed variants all completed | 3/3 pass |
| Candidate → installed bytes | Recursive byte comparison passed before replacement | Pass |
| Installed WKWebView matrix | The production variant launched from `/Applications/Drift V2 Dev.app`; all three variants completed | 3/3 pass |
| Installed permissions | Bundle and contents are readable and traversable by all local users; executable is `0755` | Pass |
| V1 coexistence | V1 and V2 Dev ran simultaneously from their distinct `/Applications` paths | Pass at capture time |

The previous V2 Dev app, source `b7bb5a520a23755306bf2f07656f604fd90b7b65`, was preserved rather than deleted:

```text
build/macos/v2-dev/previous-installed-b7bb5a520a23755306bf2f07656f604fd90b7b65.app
```

That recovery copy is intentionally ignored and is not part of the public repository.

## GitHub evidence

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

### Reusable controls and test authority

Reusable controls originally derived DOM ids from visible labels. Repeated labels could collide, and values or help text polluted accessible names. The candidate now uses unique React ids, explicit labels, and separate accessible descriptions. Two browser tests that addressed the old private id were repaired to use the visible `Duration` label.

### Reduced motion and grain

One old assertion required the entire V2 lifecycle to remain pixel-identical under reduced motion. That contradicted the authored contract: spatial travel and grain freeze, while opacity timing may still enter or leave. The repaired browser journey finds a stable body interval long enough to falsify a live 12 fps grain plate without outlawing legitimate lifecycle fades. It held three times and in the final full suite.

### Packaged-runtime launch collision

The first local packaged matrix produced no app identity or self-test receipt because an older installed V2 Dev process already owned the same development bundle identity. Only that older V2 process was closed; V1 remained running. The exact same candidate then passed packaged and installed matrices. The failed no-launch receipts are not counted as product passes, but they remain part of the causal record.

## Gates still open

- The Mac was locked during the final desktop-inspection attempt. The app was launched and left waiting, but no installed-screen visual approval is claimed.
- Ordinary installed-interface transparent PNG and short MP4 saves still need a human-unlocked Save panel, followed by decode and visual inspection.
- Only Editorial Drift is a live V2 World. The complete materials, lighting, forty atmospheres, optics, sound, portrait set, command/receipt/lock/undo system, and Direct journey remain outside this checkpoint.
- PR #34 remains a draft. This receipt does not authorize or claim merge to `main`.
- Developer ID signing, notarisation, stapling, GitHub Release publication, and owner approval have not happened.

Keep using `/Applications/Drift.app` for real `.pitched` projects. Treat `/Applications/Drift V2 Dev.app` as a disposable creative-development checkpoint until the remaining product and release gates hold.
