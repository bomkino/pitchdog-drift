# Mega Main historical status snapshot

> Preserved from 2026-08-21. This file is not the current foundation verdict, and its branch, test-count, and CI observations must not be read as 2026-08-22 evidence. See `FOUNDATION_GAUNTLET.md` and the latest exact-SHA gate receipt for the active state.

Updated: 2026-08-21  
Branch: `integration/mega-main-native`  
Audited source head: `20db7ccbd53004fb6d077fecab04bd1453278202`

## Verdict

**Drift 1.0 is not finished, and the foundation is not yet cleared for higher feature construction.**

The current integration branch is a strong, coherent construction checkpoint. Its current source tree passes against `main`. A deeper foundation gauntlet found one P0 false-green, four P1 native/release defects, and one P1 evidence-integrity defect: default pull-request jobs test a synthetic merge commit, not the literal branch-head SHA they are displayed against.

The native and evidence defects must be repaired before renderer, atmosphere, lens, sound, worlds, or final interface work continues. The release contradiction must be repaired before any release-candidate claim.

See [`FOUNDATION_GAUNTLET.md`](./FOUNDATION_GAUNTLET.md) for the evidence, failure modes, and exact construction gates.

PR #30 remains a draft. `main` remains untouched.

## Verified evidence—and its boundary

The audited source tree passed through:

- CI;
- 130 unit and contract tests across 21 files;
- 18 real-browser Playwright tests;
- macOS WKWebView runtime probes;
- universal standalone-app build and packaged-lifecycle verification;
- native source, file-broker, sandbox, signing-structure, and local DMG gauntlets.

On pull-request events, GitHub’s default checkout is the synthetic `refs/pull/30/merge` commit. That proves compatibility with the current base. It must not be described as literal exact-head proof until an explicit head-SHA lane exists.

## Implemented foundation

### Native chassis

- Sandboxed AppKit/WKWebView host.
- One classic boot-critical Mac web bundle.
- Exact bundled-main-frame URL restriction.
- Opaque native file grants and staged output writes.
- Same-volume atomic file commits.
- Create-only PNG-sequence writes and ownership-aware rollback.
- Native AAC boundary and codec probes.
- Packaged-app boot, reload, recovery, signing-structure, and local DMG evidence.
- A native document-session model and focused self-test.

### Critical qualification

The document-session model is **not yet wired into the privileged bridge**. The current running bridge remains gated by trusted URL and main-frame checks, not by one AppKit-issued per-document generation token. It must not be described as complete native document authority or stale-generation rejection.

### Project and core chassis

- Strict Project V3 schema, defaults, and validation.
- Legacy-project migration into Project V3.
- Portable-project integrity and media-receipt checks.
- Future-version refusal and recovery lock.
- Project commands with declared domain ownership.
- Project revisions and change receipts.
- Explicit frame-evaluation contract.
- Semantic event contract.
- Cadence, performance, master-time, and track mathematics.
- Ten spatial path definitions and tests.
- Motion, material, and lighting recipe registries.
- Built-in study identity survives local persistence and remains replaceable by the first real deck.

### Existing product parity retained

- Slide import and ordering.
- Presenter import and pinning.
- Existing live Three.js renderer.
- Existing themes and controls.
- Deterministic still, PNG-sequence, and H.264 export paths.
- Portable `.pitched` import/export.
- Browser fallback and accessibility regression coverage.

## Evidence blocker before the next product wave

### P1 — separate exact-head proof from merge-compatibility proof

Required:

- Add a lane that explicitly checks out the PR head SHA or integration-branch push SHA.
- Keep a separate job on the synthetic merge ref.
- Record source head, tested commit, base, tree, event, and ref in receipts.
- Run unit, browser, packaged-app, and WKWebView runtime tests against one literal source SHA.
- Never call a synthetic merge run exact-head verification.

## Native foundation blockers before the next product wave

### P0 — wire native-issued document authority

Required:

- AppKit issues one generation token at trusted `didCommit`.
- JavaScript cannot mint or replace authority.
- `runtime-info` claims the prepared token once.
- Every privileged message validates the active token.
- Reload, failure, WebContent termination, close, and quit invalidate it.
- Native panels, WKDownload, Finder/Open-With delivery, broker registration, and stale asynchronous completions are ticket-bound.
- The packaged self-test uses this exact path.
- CI proves the session model is used rather than merely present.

### P1 — make the network boundary truthful

- Stop reporting `networkEntitlements: false` while the signed app carries `com.apple.security.network.client` for WebKit.
- Report helper entitlement and application traffic blocking as separate facts.
- Prove both in the packaged verifier.

### P1 — close remote download bypass

- Validate URL scheme before accepting `shouldPerformDownload`.
- Allow in-app downloads only from trusted local/generated sources.
- Cancel remote attachment downloads before any native save grant exists.
- Bind all download callbacks to the active document ticket.

### P1 — protect active directory grants

- Do not evict a directory authority referenced by an active sequence-frame write.
- Fail safely when every grant is protected.
- Add pressure, commit, and rollback self-tests.

## Release-process blocker

### P1 — pre-merge release evidence is currently impossible

The merge boundary requires the exact candidate to be signed and notarised before it reaches `main`. The manual release workflow accepts only source commits already reachable from `main`.

Before an RC declaration:

- create a protected non-`main` release-candidate ref;
- verify the exact requested SHA against that ref before secrets;
- require environment approval;
- sign, notarise, staple, quarantine-test, and retain receipts without publishing;
- provide an explicitly authorised path for preserving or publishing the exact notarised artifact;
- move `main` to that exact already-verified source SHA only after explicit approval.

## Important architectural truth

The new Project V3 core is **not yet the complete live product engine**.

Project V3 currently projects through a compatibility bridge into the old `StudioSettings` and legacy renderer. The repository still contains the large transitional owners:

- `src/App.tsx`;
- `src/engine/CinematicCarousel.ts`;
- `src/engine/shaders.ts`;
- `src/themes.ts`;
- `src/lib/exportStudio.ts`.

Unsupported future Project V3 paths and atmospheres deliberately fall back in the legacy renderer rather than pretending to be implemented. Schema presence is not live feature completion.

## Major unfinished product systems

After the foundation gate passes:

1. Real associated Mac document behaviour: `⌘S`, Save As, Revert, dirty state, external-change handling, streaming project I/O, and content-addressed local media.
2. Renderer and exporter reconstruction with Project V3 as the sole live authority.
3. Full temporal direction in preview, interaction, export, and UI.
4. All ten paths and four materials at live preview/export parity.
5. Complete twelve-rig lighting renderer and directing experience.
6. Atmosphere atlas, explicit state, search, recuts, previews, and donor parity.
7. One global camera-lens pipeline with correct alpha and colour behaviour.
8. One unified recorded/procedural sound engine and exact mixed master.
9. Final worlds, locks, recuts, A/B, undo, advisories, and Slides → World → Direct → Master studio.
10. Donor parity, combination, stress, chaos, accessibility, physical-hardware, and human taste gauntlets.
11. Developer ID signing, notarisation, stapling, Gatekeeper verification, and one exact release candidate.

## Next dependency order

1. Close the exact-head evidence and native foundation gates.
2. Rerun exact-head and synthetic-merge lanes twice without source changes.
3. Finish the native document model.
4. Decompose renderer/exporter and make Project V3 authoritative.
5. Integrate temporal direction → space/matter → lighting → atmosphere → lens → sound.
6. Compile worlds and rebuild the Director experience.
7. Run donor parity and final convergence gauntlets.
8. Repair and prove the protected pre-merge release-candidate lane.
9. Produce one exact signed and notarised Drift 1.0 candidate.

## Completion rule

Green CI means a tested tree is coherent. It does not mean the literal source head, Drift 1.0, or the release process is complete.

Drift 1.0 is complete only when every evidence, foundation, and product blocker is closed in the packaged Mac app; preview/export parity holds; the pre-merge release lane is satisfiable; final physical and human review passes; and the exact verified candidate receives explicit approval to merge into `main`.
