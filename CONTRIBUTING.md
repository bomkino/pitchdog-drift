# Contributing to Drift

Drift is a local-first directing tool, not a shader gallery. Contributions should improve a real person’s ability to turn a deck into legible, authored motion and to recover safely when media, storage, GPU, codec, or filesystem behavior goes wrong.

## Maintainer and decision authority

Drift is currently a maintainer-led project. [`@bomkino`](https://github.com/bomkino) is the primary maintainer and final decision-maker for product scope, architecture, merge, security coordination, release, and use of the pitch.dog marks. A maintainer may delegate a review or decision, but that delegation should be explicit in the issue or pull request.

Discussion and dissent are useful; hidden vetoes are not. When a material trade-off remains, the maintainer should record the decision and its reason in the pull request or an architecture document. Review, merge, signing, release, and publication are separate decisions. A merged contribution does not authorize a tag or binary release.

Contributors keep copyright in their work while licensing accepted contributions under the project licence. Nobody should sink days into a speculative rewrite for free: discuss broad redesigns, new dependencies, schema changes, native authority, or release machinery before implementing them.

## Low-risk first contributions

Useful first changes do not require a private deck, signing certificate, or deep knowledge of the renderer. Good lanes include:

- fixing a broken documentation link or clarifying a verified boundary;
- reproducing a public bug with synthetic media and exact steps;
- adding a focused regression test for an existing contract;
- improving keyboard, focus, labels, or error copy without weakening behavior;
- tightening a public fixture, type, or diagnostic that contains no user material;
- identifying stale dependency, licence, notice, or accessibility evidence without silently changing policy.

A small, self-contained fix may go straight to a pull request. Open an issue first when the change would alter the native bridge, file authority, portable-project schema, deterministic timeline, codecs, entitlements, dependency graph, signing, or release process.

## Before opening a change

1. Read `docs/PRODUCT_CONTRACT.md` and `docs/ARCHITECTURE.md`.
2. For Mac work, also read `docs/MACOS_PRODUCT_CONTRACT.md`, `docs/MACOS_THREAT_MODEL.md`, and `docs/MACOS_QA.md`.
3. State the user journey or failure mode the change addresses.
4. Separate visual judgment from technical correctness.
5. Do not attach confidential deck material. Create synthetic fixtures.

Small, coherent pull requests are easier to falsify than bundles of unrelated polish.

## Local checks

```bash
npm ci
npm run check
npm run test:e2e
```

`npm run check` covers TypeScript, focused tests, the production browser build, and the native source contract. The Playwright suite exercises real Chromium behavior.

On macOS 13.3 or newer:

```bash
npm run build:mac
npm run verify:mac
npm run package:mac:dmg
```

A Mac PR is not complete because Swift parses. It must compile on macOS, preserve the web engine’s tests, pass bundle verification, and include direct evidence for any native behavior it claims.

## Visual and motion changes

- Keep slides readable. Distortion is supporting cast.
- Test 1, 2, 12, and 200-item decks, not only the demo.
- Test mixed aspect ratios and real text-heavy slides.
- A preset needs a motion sentence—pace, path, depth, optical treatment, and background behavior—not merely a palette.
- Reduced motion must remain useful rather than becoming a blank or frozen interface.
- Preview and deterministic export must evaluate the same state.
- Add or update geometry, shader, browser, and decoded-output tests where the mechanism permits.
- Document visual judgment as judgment. Do not turn taste into a fabricated invariant.
- Never add procedural grain, tint, or finishing texture to imported slide or presenter pixels by default. Atmosphere belongs to the world unless a future explicit destructive-look control makes that contract unmistakable.
- A shadow’s expanded mesh is falloff support, not the card mask. Test transparent artwork, zero-width borders, intentional opaque borders, Pause, Reduce Motion, and a delivery H.264 transcode after changing surface shaders.

## Project and export changes

- Import failure must not destroy the current project.
- Async operations must define which action wins when completion order differs from invocation order.
- Object URLs are runtime handles, not persisted identity.
- Export frame `n` remains `n / fps`.
- Audio must never be dropped silently.
- H.264 must never claim alpha.
- Completion requires readback appropriate to the artifact.
- Cancellation must clean or neutralize partial persistent output.
- Directory output must never overwrite unrelated or pre-existing files.
- New limits need a material memory, safety, or compatibility reason and a boundary test.

## macOS contributions

The native app exists to supply Mac behavior that the web runtime cannot supply honestly. Do not move rendering, project semantics, or media verification into Swift without a demonstrated reason and a migration plan.

### Native command rule

Every bridge command must have:

- one concrete user journey;
- a fixed command name;
- bounded, typed payload validation;
- main-frame enforcement;
- no renderer-provided path;
- a success/failure envelope;
- cancellation and cleanup semantics;
- a source-contract marker;
- a test or a documented reason why only physical-Mac testing can prove it.

Do not add general method dispatch, arbitrary Objective-C selectors, shell execution, AppleScript, `Process`, `NSTask`, URLSession, sockets, recursive deletion, or temporary-exception entitlements.

### Filesystem rule

- Access begins with a user panel or Finder document event.
- Renderer receives opaque tokens, not absolute paths.
- Reject symlinks and traversal.
- Keep bridge chunks bounded.
- Stage destination replacement in `itemReplacementDirectory`.
- Commit only after synchronize and close.
- Abort preserves the prior destination.
- Directory sequence operations remain one validated leaf at a time.
- Extract and inspect the signed entitlements of the finished app.

### Codec rule

The Mac build is system-codec-only. Do not remove or bypass the Vite alias to `src/lib/macosAacEncoder.ts`. Do not add a `.wasm` codec binary to `Drift.app` without an explicit architecture, licensing, source-provision, security, size, and release review.

A feature that requires unavailable AAC should fail visibly or offer an honest alternative. Silent audio removal is not an alternative.

### App lifecycle rule

The current project store is single-editor. Preserve one application instance and one window unless project storage is redesigned for multiwriter coordination. Close, Quit, WebKit process termination, sleep/wake, and removable-volume failure are first-class paths.

## Tests and receipts

A useful pull request description includes:

- user problem;
- mechanism;
- protected invariants;
- tests run;
- output or screenshots inspected;
- known limits;
- what remains unverified;
- whether the change alters licensing, entitlements, supported macOS, codecs, project schema, engine version, or theme version.

For output changes, provide synthetic artifacts and decoded metadata rather than only a screen recording. For Mac changes, include architecture and extracted-entitlement output from the built app.

## Dependencies

Prefer the platform and existing dependencies. A new runtime dependency needs a clear user-facing benefit, maintenance assessment, licence, bundle-size impact, offline behavior, supply-chain review, and failure plan.

Do not add remote fonts, analytics, cloud SDKs, update daemons, proprietary services, or hidden network requests.

## Licensing and marks

Contributions to project-authored software and documentation are accepted under GNU AGPL-3.0-or-later. Original demo assets remain under the terms stated in `ASSET-LICENSE.md`. Dependencies retain their own licences.

Do not submit third-party images, video, fonts, sounds, shaders, or code unless redistribution rights and attribution are clear. Do not use pitch.dog marks to make a fork look official; see `TRADEMARKS.md`.

## Conduct

Follow `CODE_OF_CONDUCT.md`. Critique mechanisms and claims, not people. Ruthless QA is useful. Humiliation is not.
