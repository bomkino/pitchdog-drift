# D00 — Apple-Silicon-only package migration

Status: source-ready at `707b4d3`; exact Apple-Silicon package/runtime acceptance pending

## Destination

Remove x86_64 build, verification, packaging, documentation, and release assumptions. Prove one Apple-Silicon-only Drift package against exact source SHA without changing product behaviour.

Keep the current macOS 13.3 deployment floor. Architecture migration does not opportunistically raise it.

## Scope

- audit every architecture declaration and universal-binary check;
- set canonical macOS build/package target to `arm64` only;
- remove stale x86_64 claims and tests;
- build package on Apple-Silicon macOS;
- verify executable slices, bundled native libraries, signing shape, source/build receipt, launch, document association, Open → Save → quit/reopen, export smoke, and rollback;
- record exact package hash, source SHA, host/macOS identity, commands, results, and unrun gates.

## Boundaries

No `DesktopPlatform` redesign, Linux work, renderer/schema change, macOS deployment-floor change, signing/notarization, installation replacement, publication, release, or merge without separate authority.

## Acceptance

- source contains no supported x86_64 package claim;
- exact package and all shipped Mach-O files report only `arm64`;
- packaged Apple-Silicon app completes verified Open → Save → quit/reopen with Project V4 and pinned-frame intent intact;
- package identity matches exact source SHA;
- prior installed app remains untouched unless installation is separately approved.

## Current evidence

The maintained source/build/CI/package/documentation path is arm64-only on
`codex/d00-apple-silicon-only-source`. Linux source gates are green. No native
Mac app, Mach-O, DMG, installation, launch, or D01 packaged journey has been
produced from this source commit; those remain exact Apple-Silicon gates.

Receipt: [`receipts/D00-apple-silicon-only-source.md`](receipts/D00-apple-silicon-only-source.md)
