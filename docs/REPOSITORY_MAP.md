# Drift repository map

This repository contains one cinematic studio with two runtime shells. Source, generated output, evidence, and release authority stay deliberately separate.

## Authored source

| Path | Owns |
| --- | --- |
| `src/` | React studio, deterministic scene/export logic, project model, themes, default FontBlind type declarations, and native web adapters |
| `src/assets/fonts/pitchdog/v13/` | Seven checksum-pinned CC0 FontBlind binaries from `pitchdog-type-system` v13, exact commit `786b4a2b671182319320f922b8de8f927ea3a002` |
| `macos/App/` | AppKit lifecycle, generation-bound bridge host, scoped file broker, native AAC, recovery, and packaged WKWebView self-test |
| `macos/NativeBridge.js` | The fixed page-world bridge installed before the packaged studio boots |
| `macos/Probes/` | Small native runtime probes; never a second product implementation |
| `tests/` | deterministic unit and browser-contract tests |
| `e2e/` | real-browser user journeys and falsification cases |
| `scripts/` | build, verification, packaging, codec, evidence, and non-publishing release lanes |
| `.github/workflows/` | CI orchestration for the same scripts |
| `docs/` | indexed product, architecture, threat-model, QA, user, roadmap, build-story, and release truth |
| `docs/v2/` | living V2 architecture and compatibility boundaries; never release proof by itself |

The canonical native Swift graph is `macos/App/*.swift`. Root-level or duplicate Swift implementations are forbidden by the source contract.

## Re-creatable generated material

These ignored paths may be recreated by a build or test:

- `dist/` — browser or packaged-web build output;
- `build/` — app bundles, probe binaries, DMGs, and bounded evidence;
- `output/`, `test-results/`, `playwright-report/`, `.playwright-cli/` — local test output;
- `node_modules/`, coverage, Python caches, and Finder metadata.

## Protected local material

Ignored does not mean disposable. Preserve these paths unless their owner explicitly authorises a narrowly scoped change:

- `artifacts/qa/` — retained local visual masters and QA evidence;
- `Handover/` — private construction context, never publication input unless explicitly curated.

Do not delete generated evidence merely to make a run look clean. A new gauntlet owns a narrowly named evidence directory and records the exact source identity it tested.

## Truth gates

These words are not synonyms:

1. **edited** — source changed;
2. **tested** — a named check passed against a named tree;
3. **built** — an app or artifact was produced;
4. **installed** — that exact artifact was copied to `/Applications` and read back;
5. **pushed** — a commit exists on a remote branch;
6. **merged**, **released**, **published**, and **approved** — separate maintainer actions.

The construction and binary-candidate workflows do not merge, tag, create a GitHub Release, publish a binary, or mark a draft ready. `.github/workflows/source-release.yml` is the narrow exception: after a version transition reaches protected `main` (or an explicit manual dispatch), it verifies the matching changelog section, tags that exact commit, and publishes a source-only GitHub Release. It never uploads an app or DMG. The historical `v0.1.0` Release and its ad-hoc, unnotarized arm64 DMG do not satisfy the binary gates. Release documentation describes the additional Developer ID, notarisation, Gatekeeper, checksum, hardware, and human-acceptance gates.

## First checks

Use Node.js from `.nvmrc`.

```bash
npm ci
npm run check
npm run check:fonts
npm run setup:e2e
npm run test:e2e
npm run build:mac
```

`npm run build:mac` verifies the signed bundle and its packaged runtime by default. CI may split that work into explicit jobs, but it may not weaken the underlying contract.

V2 development uses the isolated commands and identity in [`v2/DEVELOPMENT_IDENTITY.md`](v2/DEVELOPMENT_IDENTITY.md). It never replaces or registers document ownership ahead of an approved release candidate.
