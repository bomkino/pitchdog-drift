# Mega Main foundation gauntlet

Audited: 2026-08-21  
Branch: `integration/mega-main-native`  
Audited source head: `20db7ccbd53004fb6d077fecab04bd1453278202`

## Verdict

**The foundation is strong, but it is not cleared for higher feature construction yet.**

The audited source tree was green through CI, packaged macOS, and WKWebView runtime workflows. The gauntlet nevertheless found one P0 false-green and five P1 native/evidence/release-boundary defects. These are concentrated and repairable. The native and evidence defects must be closed before renderer, atmosphere, lens, sound, worlds, or final interface work continues. The release-lane contradiction must be closed before any release-candidate claim.

`main` remains untouched. PR #30 remains a draft.

## What the green checkpoint genuinely proves

- Strict Project V3 parsing, validation, migration, and portable-media receipt checks.
- Project commands reject writes outside declared domains and emit revisioned change receipts.
- Current save ordering, unsupported-project quarantine, and built-in-study replacement regressions pass.
- The temporal core is explicit-time, deterministic, monotonic, bounded, and seam-aware at its current tested boundary.
- The spatial core contains ten path definitions, bounded evaluated output, deterministic imperfection, and a resident-render ceiling.
- The native file broker stages writes on the destination volume, commits atomically, rejects traversal and symlinks, preserves sequence collisions, and rolls back only files it can still identify as its own.
- The Mac build uses pinned actions and locked npm dependencies, builds the packaged app, exercises WKWebView codecs, verifies a local DMG, and keeps signing/notarisation secrets isolated from ordinary CI.
- Existing browser and packaged-app regressions are coherent against the current base.

Green means those tested contracts hold. It does not mean every claimed native security property is wired into the product, every workflow tested the literal branch-head commit, or the release policy can currently be satisfied.

## Gauntlet loops

| Loop | Result | Finding |
|---|---|---|
| Source-tree compatibility | Pass | The current branch merges cleanly with the current `main`, and PR workflows pass against that combined tree. |
| Exact-commit evidence | **P1 fail** | Default pull-request checkout uses the synthetic `refs/pull/30/merge` commit. CI/runtime receipts must not call that the exact branch-head SHA. |
| CI independence | Pass with caveat | Unit, browser, native broker, packaged app, and runtime probes are separate; one authority check is marker-based rather than behavioural. |
| Project integrity | Pass | Strict V3 envelopes, media hashes, references, future-version refusal, archive metadata limits, and recovery lock hold. |
| Save-race truth | Pass at current browser boundary | Queued saves and revision comparison prevent an older completion from claiming the latest state. Real associated Mac documents remain unfinished. |
| Timeline determinism | Pass | Explicit time, monotonic performance curves, cadence inversion, event planning, and source-deck seam tests hold. |
| Render/export parity | Transitional | Existing renderer/export parity holds; the new V3 core is not yet authoritative in the live renderer. |
| Native capability authority | **P0 fail** | The session model exists, but the privileged bridge is not generation-bound. |
| Local-only/network boundary | **P1 fail** | Runtime capability reporting contradicts the signed entitlement; remote download policy has a scheme-order bypass. |
| Destructive-write containment | Pass with P1 edge | Atomic write and rollback logic are strong; grant eviction can discard a directory still referenced by an active frame write. |
| Resource bounds | Pass with P2 debt | GPU residency is capped; spatial evaluation still scales with source count before the 24-slide cap. |
| Release truth | **P1 process fail** | The merge policy requires pre-merge signing/notarisation, while the release workflow accepts only commits already reachable from `main`. |
| Documentation truth | Corrected by this audit | Previous wording overstated exact-head evidence, native document authority, and release readiness. This file is now the construction gate. |

## P1 — current PR checks are not exact-head evidence

GitHub pull-request workflows check out the synthetic merge ref by default. Job logs identify a commit such as `refs/remotes/pull/30/merge`, created by combining the PR head with the current base.

That is useful merge-compatibility evidence. It is not proof that the literal branch-head or future RC commit was built and tested as itself. The distinction matters because:

- the synthetic SHA differs from the source head;
- it can change when `main` moves without any source-head change;
- build receipts can record the merge SHA while the PR UI associates the run with the head SHA;
- an exact release candidate must be traceable to one immutable source commit.

Required repair before the foundation gate clears:

1. Add an exact-head lane for same-repository integration work, using the explicit PR head SHA or an integration-branch push checkout.
2. Keep a separate synthetic-merge lane to prove compatibility with the current `main`.
3. Record `sourceHeadSha`, `testedCommitSha`, `baseSha`, `treeSha`, event type, and checkout ref in every build/runtime receipt.
4. Never label a synthetic merge run “exact-head verified.”
5. Require unit, browser, packaged-app, and WKWebView runtime proof on the same literal source SHA before an RC is cut.

## P0 — native document authority is present but not connected

### Current reality

`NativeDocumentSession.swift` contains a ticket model and a self-test, but the running capability path does not use it:

- `NativeBridge.js` sends `{ command, payload }` without a document-generation token.
- `NativeBridgeHost` accepts commands by checking the exact bundled main-frame URL.
- `runtime-info` resets capabilities but does not claim an AppKit-issued generation.
- `DriftAppDelegate` treats trusted `didFinish` navigation as runtime readiness.
- Native panels, downloads, Finder/Open-With delivery, broker registration completions, and other asynchronous callbacks are not bound to a document ticket.
- The structural checker proves that the session file contains expected strings; it does not prove the session guards the bridge.
- The current session API accepts a caller-supplied bootstrap nonce; it does not verify that the nonce was prepared by AppKit for the committed document.

The URL check remains necessary. It is not sufficient across reloads because the replaced and replacement documents have the same signed local URL.

### Required repair

Before higher features:

1. AppKit prepares one fresh, canonical, lower-case UUID only after the trusted main frame commits.
2. AppKit delivers that token directly to the committed page.
3. JavaScript has no token-generation or self-authorisation path.
4. `runtime-info` claims the prepared token exactly once.
5. Every later native message presents and validates the active token before touching files, directories, codecs, panels, menus, or app state.
6. Reload, failed navigation, WebContent termination, window close, and quit invalidate the generation and all capabilities.
7. Native panel completion, WKUIDelegate file panels, WKDownload destination choice, asynchronous file registration, Finder project delivery, and stale callbacks are bound to the originating ticket.
8. The packaged WKWebView self-test uses this exact production path.
9. CI fails when the session model becomes dead code again.

The donor research in PR #25 is useful, but its source-transform workflow failed and its final branch did not land the complete integration. Port the contract; do not merge the transport machinery.

## P1 — network entitlement is reported falsely

The signed entitlement includes `com.apple.security.network.client`, required by the WebKit helper topology. The application then blocks application network traffic with content rules and navigation policy.

`runtimeInfo()` currently reports `networkEntitlements: false`. That is factually incorrect.

Replace the ambiguous field with truthful, independently testable facts, for example:

```text
networkClientEntitled: true
applicationNetworkBlocked: true
networkBoundary: webkit-client-only
```

The packaged verifier must inspect the signature and prove both sides: the helper entitlement exists; application-originated remote traffic remains blocked.

## P1 — remote downloads can bypass the scheme gate

`decidePolicyFor navigationAction` currently returns `.download` when `shouldPerformDownload` is true before it inspects the URL scheme.

A remote `http` or `https` response marked for download can therefore bypass the later remote-navigation cancellation path. The response delegate can also convert an unsupported remote MIME response into a download without an explicit scheme allowlist.

Required repair:

- Parse and validate the scheme first.
- Permit in-app downloads only from trusted local `file:`, generated `blob:`, or deliberately accepted `data:` sources.
- Hand ordinary activated web links to the default browser.
- Cancel all remote application downloads.
- Bind WKDownload callbacks and save-panel completion to the current document ticket.
- Add a packaged test that attempts a remote attachment download and proves no native destination grant is created.

## P1 — active sequence directory grants are not protected from eviction

`NativeFileBroker.trimGrantsIfNeeded()` protects file tokens used by active writes, but it does not protect `directoryToken` values referenced by those writes.

Under grant pressure, the directory grant can be evicted while a frame write remains active. The frame may still commit, but ownership metadata may not be recorded, weakening truthful rollback.

Required repair:

- Protect both active file tokens and active directory tokens.
- Refuse a new grant if every existing grant is protected rather than evicting an active authority.
- Add a self-test that fills the grant table while a create-only frame write is open, then proves commit and rollback ownership remain intact.

## P1 — the release policy and release workflow currently deadlock

The construction contract says the exact Drift 1.0 candidate must be signed, notarised, stapled, and verified before it is merged into `main`.

The manual release-evidence workflow rejects every source commit that is not already an ancestor of `origin/main` before signing secrets are exposed.

Both rules cannot be true at once. Under the present design, either:

- the candidate is merged before notarisation, violating the merge boundary; or
- the release workflow refuses the unmerged candidate, making the required pre-merge evidence impossible.

Required repair before an RC declaration:

1. Introduce a protected release-candidate ref separate from `main`—for example an approved `release/drift-1.0-rc` branch or signed annotated RC tag.
2. Require environment approval before secrets are exposed.
3. Verify the exact requested SHA is reachable from that protected RC ref and belongs to this repository.
4. Build, sign, notarise, staple, Gatekeeper-test, and retain text receipts without publishing a binary.
5. After approval, move `main` to the exact already-verified SHA; do not rebuild a merely equivalent commit.
6. Add a later explicitly authorised distribution lane that preserves or publishes the exact notarised artifact rather than silently rebuilding it.
7. Alternatively, explicitly change the merge policy—but never claim pre-merge notarisation while the workflow structurally forbids it.

## P2 debts to close during their owning waves

### Built-in study identity

Starter studies recover their replaceable status from a reserved ID/name pair. This fixed a real persistence regression, but a crafted portable project could imitate that pair. Persist or derive a stronger non-user-spoofable origin during the real document/asset-store work.

### Spatial evaluation cost

The renderer return set is capped at 24 slides, but `evaluateSpatialSlides()` evaluates the full virtual slot count before filtering. With 200 source slides, CPU work is still proportional to deck size. Replace full enumeration with a bounded neighbourhood calculation before the spatial core becomes the live renderer.

### Imperfection roll and banking

Organic roll is clamped by a limit derived from banking. At zero banking, roll imperfection can disappear. Decide whether this coupling is intentional; encode the decision in material/path tests.

### Pose endpoint cadence

Held-pose masters preserve the exact duration endpoint for seam truth. At output/cadence combinations that do not divide evenly, the final sampled frame can differ more than neighbouring held frames. Keep the exact endpoint, but add a delivery advisory and golden-frame test rather than hiding the jump.

### In-memory portable archives

The current ZIP filter checks entry count and declared expanded sizes before accepting entries, which is good. Import and export still materialise whole archives and media buffers in memory. Keep the existing limits until the native streaming archive and content-addressed asset store replace this browser-era path.

## Foundation construction gate

Higher feature work may start only after one literal source head proves all of the following:

- [ ] Exact-head and synthetic-merge evidence are separate and correctly labelled.
- [ ] Unit, browser, packaged-app, and runtime receipts identify one literal source SHA.
- [ ] Native-issued document authority guards every privileged message.
- [ ] Stale panel, download, Finder-delivery, and asynchronous broker completions are rejected.
- [ ] Packaged WebKit exercises the production authority path through a termination and reload.
- [ ] Network capability reporting matches the signed entitlement and local-only policy.
- [ ] Remote attachment downloads cannot obtain a native save destination.
- [ ] Active directory authorities survive grant pressure, or new grants fail safely.
- [ ] Structural CI checks integration, not merely the existence of an unused session file.
- [ ] CI, macOS standalone app, and macOS WKWebView runtime all pass on the same literal source SHA.
- [ ] A second clean rerun passes without source changes.

Until then, allowed work is restricted to these foundation repairs, tests, workflow evidence, and documentation. Do not begin atmosphere, lens, sound, final worlds, or the final directing interface on top of a privileged boundary we already know is incomplete.

## Release-candidate gate

Before any RC is called verified:

- [ ] A protected non-`main` RC ref can authorise one exact source SHA.
- [ ] Signing/notarisation secrets are exposed only after repository, ref, and SHA verification plus environment approval.
- [ ] The exact pre-merge SHA passes signing, notarisation, stapling, quarantine, and Gatekeeper evidence.
- [ ] The exact notarised artifact has an authorised preservation/publication path.
- [ ] `main` receives that exact source SHA after explicit approval.

## Merge boundary

No merge, release, tag, deployment, or downloadable binary is authorised by this gauntlet. PR #30 remains a construction draft. `main` remains untouched.
