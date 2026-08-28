# D00 evidence receipt — Apple-Silicon-only source migration

Date: 27 August 2026

Repository: `bomkino/pitchdog-drift`

Start: clean `codex/d05-guided-export-foundation@f94596c5480d7cb5e8ae94f419342f9ee468d2f0`

Task branch: `codex/d00-apple-silicon-only-source`

Source commit: `707b4d3f6dbb955a9d7f9fdf668dd55fa9923f1a`

Source tree: `6630a1d12ea1a145d9fa737e89e6b1d4c04f1268`

## Ticket boundary

- Destination for this tranche: remove maintained Intel/universal assumptions from the canonical Mac source, build, CI, verification, packaging, release-evidence, and current support paths while preserving macOS 13.3.
- Public seams: canonical AppKit/WKWebView build profile, architecture/build receipt, verifier/release manifest, CI runner identity, DMG identity, and current Mac support documentation.
- Preserved exclusions: no renderer, Project schema, `DesktopPlatform`, Linux, alpha codec/transport, signing, notarization, installation, publication, release, or macOS-floor change.
- Historical evidence is preserved: dated universal-build receipts and changelog facts were not rewritten to pretend the old artifacts were arm64-only.

## Environment

- OS: Linux `6.18.35`, x86_64.
- Node: `v24.19.0`; repository declares Node 22 and engine `>=22.12`.
- npm: `11.9.0`; lock declares `npm@11.19.0`.
- Apple-Silicon host: unavailable in this execution environment.

## Delivered source

- `build-macos-app.sh` defaults to and accepts only `arm64`; a supplied Intel/universal architecture list fails closed.
- `verify-macos-app.sh` accepts only an exact `arm64` executable identity and still validates the build receipt against it.
- Release verification requires `lipo -archs` to equal `arm64` and requires the manifest architecture value to be exactly `["arm64"]`.
- Local DMG defaults are renamed from `macOS-universal` to `macOS-arm64`, with package and verifier agreement.
- The release constructor no longer requests an Intel slice.
- Native runtime identity reports `arm64` for the supported compiler target and `unsupported` otherwise.
- The three normal Mac jobs, runtime job, and signed release-evidence job use `macos-15` and fail before build or secret use unless `uname -m` reports `arm64`. GitHub's current official hosted-runner reference mapped `macos-15` to Apple M1/arm64 when retrieved on 27 August 2026; the runtime assertion guards future routing drift.
- Current README, architecture/build, product-contract, QA, threat-model, release, and release-checklist documentation now state Apple-Silicon-only support and explicitly exclude Intel Mac/Windows where relevant.
- The macOS 13.3 floor is unchanged; existing packaged verification continues to require exactly `13.3`.
- `check:mac-arm64` protects the maintained source boundary and is included in `check:mac-source`. It is source evidence only.

## Commands and results

- `npm run check:mac-arm64`: passed.
- `npm run check:mac-source`: passed — canonical Swift graph, arm64 source contract, user guides, native import, packaged-WebView evidence budget, hardening, and shell syntax.
- `npm run check`: passed — typecheck, 76 test files / 518 tests, Mac source contracts, and production Vite build; 238 modules transformed.
- `npm run build:v2-dev`: passed; 238 modules transformed.
- `git diff --check`: passed.

The web builds emitted the existing large-chunk advisory. No dependency, native binary, package, installed application, credential, signature, or public artifact was added.

## Fixed-point review

### Spec

- Pass at source level: every maintained Mac architecture declaration inspected by D00 now names only `arm64`; current support docs exclude Intel; the deployment floor remains 13.3; historical receipts remain historical.
- Pass: build and release verification require exact one-slice identity rather than merely checking that arm64 is present among other slices.
- Pass: CI now runs on the current Apple-Silicon label and independently falsifies runner architecture at runtime.
- Deferred by the explicit host boundary: actual Swift compilation, `file`/`lipo` inspection, signed-bundle verification, DMG production/hash, launch, Open → Save → quit/reopen, destructive-replacement cancellation, and recovery.
- Result: source-ready, not D00-complete.

### Standards

- Pass: the migration deepens the existing canonical Mac build/package seam and adds no parallel platform abstraction.
- Pass: the source contract protects stable public build facts but is not represented as runtime, package, or security acceptance.
- Pass: no D05/D10 creative or export behavior, Linux source, dependency, licence, credential, secret, or external authority changed.
- Pass: runtime checks fail closed if the CI label ever resolves to a non-arm64 host.
- No source-blocking finding remained in `f94596c...707b4d3` after the single review.

## State and gaps

Highest D00 state: **tested source migration**. Production and v2-development web bundles also built as repository gates.

Not native-built, packaged, installed, launched, signed with Developer ID, notarized, released, published, or human-accepted.

No Mach-O architecture output, package hash, package identity, screenshot, hardware journey, or D01 packaged-document receipt exists for `707b4d3`. D00 cannot close until those exact Apple-Silicon checks run.

## Exact resume

Resume `bomkino/pitchdog-drift` on `codex/d00-apple-silicon-only-source` from source commit `707b4d3f6dbb955a9d7f9fdf668dd55fa9923f1a` and this receipt. Verify the clean branch, source tree `6630a1d12ea1a145d9fa737e89e6b1d4c04f1268`, and current ledger first. On an already-authorized Apple-Silicon Mac, run the exact source through `npm run check`, `npm run build:mac`, `npm run verify:mac`, `npm run package:mac:dmg`, and `npm run verify:mac:dmg`; record `file`/`lipo` output for every shipped Mach-O, source/build/package identity and hashes, then exercise D01 Open → Save → quit/reopen plus cancellation/recovery without replacing an installed app. Claim no signing, notarization, installation, release, publication, or human acceptance without its separate gate.
