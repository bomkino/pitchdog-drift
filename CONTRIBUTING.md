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

Use `npm ci` and `npm run check` for authored source regressions. On Apple silicon with full Xcode and the build tools listed in README, run `npm run test:mac`, build the native app, archive it, run the external UI journey and package the tested DMG. Follow `docs/MACOS_RELEASE.md` for the exact sequence. Browser tests remain historical renderer references; they do not certify the native app.

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

Work in `macos/NativeCore`. NSDocument owns document lifecycle; SwiftUI owns native controls; typed core state and a shared frame plan own preview/export semantics; native media and Metal own rendering and output. Preserve originals, tickets, cancellation, transaction boundaries and recorded-source provenance. The app is local-first without claiming sandbox containment. The authored browser sources are build inputs/reference tests, not a second shipped runtime. Follow the current native architecture, product contract and release procedure.

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
