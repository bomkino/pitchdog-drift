# Phase 00 — V2 foundation receipt

Recorded: 22 August 2026

V2 branch: `codex/v2-directors-cut`

Frozen V1 source: `5fd145207235884790ba071c5d84bc3876ff4989`

## Claim

V2 development starts from one exact public V1 source revision while the installed V1 application remains usable and outside the V2 storage, document, and application identities.

This receipt clears isolated V2 development. It is not a V2 release-candidate, signing, notarisation, merge, publication, or visual-approval receipt.

## Verified source truth

- Local V2 branch is based directly on `5fd145207235884790ba071c5d84bc3876ff4989`.
- `origin/main` read back as that exact SHA on 22 August 2026.
- Exact-SHA GitHub runs completed successfully for [CI](https://github.com/bomkino/pitchdog-drift/actions/runs/32564741864), [macOS standalone app](https://github.com/bomkino/pitchdog-drift/actions/runs/32564742025), and [macOS WKWebView runtime](https://github.com/bomkino/pitchdog-drift/actions/runs/32564741860).
- All 18 donor commit SHAs pinned by `docs/mega-main/SOURCE_MANIFEST.yaml` resolve to local immutable commit objects. Their implementation study and parity evidence remain explicitly pending in `docs/v2/DONOR_LEDGER.yaml`.
- No Git tag points at the V1 SHA. That remains an explicit release-history gap; V2 development does not invent or publish a tag.

## Verified installed V1 boundary

The installed application was read back from `/Applications/Drift.app` before the V2 Mac build:

| Surface | Observed value |
| --- | --- |
| Bundle identifier | `dog.pitch.drift` |
| Version | `0.1.0` |
| Source revision | `5fd145207235884790ba071c5d84bc3876ff4989` |
| Executable SHA-256 | `d3af7e2824f89c595e6b8a04929afd75b67970cfe810bf5ecb031e2e887a62eb` |
| Info.plist SHA-256 | `ba51174a64b4a7104f05e4689019c41e2ae5eb755a666191088a80e6bd48ae14` |
| Architectures | `arm64`, `x86_64` |
| Signature | valid ad-hoc Hardened Runtime signature |
| Running app | exact `/Applications/Drift.app/Contents/MacOS/Drift` process observed |
| Production container | present |
| V2 development container | absent before first V2 launch |

The application is a local development installation. Gatekeeper rejected it because it is ad-hoc signed; no Developer ID, notarisation, stapling, or public distribution claim is made.

## Reference machine

- Mac mini with Apple M2 and 8 GB memory.
- macOS 27.0, build `26A5416b`.
- Apple Silicon is directly observed. Intel compatibility remains compile/runtime-matrix evidence until physical Intel proof exists.

## Preserved V1 visual evidence

The ignored local evidence set under `output/playwright/visual-gauntlet-2026-08-22/` contains V1 world, grain, shadow, responsive, reduced-motion, stage, and export captures. These files are local QA evidence, not source-controlled product assets or public release proof.

## Known gaps that remain visible

- No V1 Git tag exists at the frozen SHA.
- The installed V1 is ad-hoc signed and is not a notarised distribution artifact.
- This receipt does not repeat the full real-document Save, Save As, Revert, external-change, or recovery gauntlet; those were V1 gates and must be rerun on the exact future V2 release candidate.
- Human V2 visual approval does not yet exist.
- V2 Project V4, canonical renderer authority, Worlds, portrait scenes, optical work, and sound are not claimed here.

## Stop conditions for the identity slice

The V2 development app may be installed beside V1 only after all of these hold for one committed V2 source SHA:

1. exact V2 app name, executable, bundle identifier, cache, IndexedDB, WebKit store, and window-state identity;
2. no `.pitched` document declaration or LaunchServices ownership;
3. ordinary V2 runs refuse real portable-project open/save authority;
4. signed native and compiled Web identities agree at runtime;
5. V1 and V2 run simultaneously from their exact application paths;
6. V1 process, hashes, source revision, signature, container, and document ownership remain unchanged after the V2 run;
7. the V2 bundle is all-user readable and executable before installation in `/Applications`.
