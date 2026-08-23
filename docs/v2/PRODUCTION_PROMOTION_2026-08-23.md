# Drift V2 production-promotion receipt — 2026-08-23

This receipt records the repaired implementation and the exact local Mac artifact. GitHub branch, pull-request, CI, merge, release, notarization, publication, and owner creative approval remain independent states and must be read from their real surfaces.

## Outcome

- Implementation source: `51459cb7aac663238b1a41961ee50fd4c055fdfd`.
- Installed application: `/Applications/Drift.app`.
- Identity: `Drift`, `dog.pitch.drift`, release channel, version `0.1.0`, build `284`.
- Executable: universal `arm64` + `x86_64`, 2,255,136 bytes, SHA-256 `af0854822fccac234aad8e795fa2c9de8a769ba1955c574760396f309c721e53`.
- Signature: hardened-runtime, App Sandbox, all-user-readable and executable, ad-hoc signed. It is not Developer ID signed or notarized.
- `/Applications` contained exactly one Drift app after installation. The old V1 and isolated V2 Dev app were removed from `/Applications`, not destroyed.

## What the hostile pass found

1. The release identity still created dormant V1-default projects. V2 was present in source but production startup did not actually select it.
2. First-run media hydration round-tripped rich Project V4 state through a lossy compatibility projection and dissolved Editorial Drift provenance.
3. Pin, presenter, master, and lifecycle edits could flatten untouched World-owned motion, card, material, light, atmosphere, or lens domains.
4. Applying an authored World could leave stale per-domain recipe fingerprints.
5. Reduce Motion froze only part of the preview; material, lens, lifecycle, presenter, and grain phases could continue changing pixels.
6. Stage chrome exposed recipe implementation IDs instead of human World names.
7. Pure preflight and delivery-receipt helpers imported the 2,842-line export implementation, pulling the encoder stack into startup.
8. The browser matrix still named production as V1 compatibility and did not run the V2 workflow against the shipping identity.

## Repairs

- One build-independent new-document factory now applies the Editorial Drift V2 9:16 foundation in release and development identities.
- Explicit V1 documents keep `drift-v1-compat/1`; new shipping documents use `drift-v2/1`.
- Media-only reconciliation updates only media and slide directives. Every unchanged World-owned domain is restored from exact Project V4 authority before provenance validation.
- Authored Worlds stamp exact recipe references for every unlocked owned domain.
- Reduce Motion lands at the first body midpoint and freezes the complete preview clock.
- World labels parse recipe and ratio namespaces into concise human names.
- Lightweight export contracts live separately from MediaBunny. The production entry fell from 472.36 kB to 337.18 kB gzip; the encoder remains an export-time chunk.
- The browser matrix now runs the complete current workflow against production and the V2 development identity, while explicit imported-project journeys preserve V1 compatibility evidence.

## Exact gates

| Gate | Result | Boundary |
| --- | --- | --- |
| Consolidated source check | Green: 55 files, 386 tests, TypeScript, native source/import/hardening contracts, both Mac guides, production build | Exact repaired worktree before commit; repeated clean inside the Mac build at `51459cb` |
| Dependency audit | Green: zero production or development vulnerabilities across 93 dependencies | Installed lockfile at audit time |
| Browser matrix | Green: 42/42 in one clean run, 19.0 minutes | Production + V2 Dev; real Chrome/WebGL2; long export excluded |
| Visual inspection | Green for inspected 1440×900 production and installed-app frames | Authored Editorial Drift, borderless faces, rounded-mask shadows, quiet world grain, protected pin; not owner taste approval |
| Full long-export lane | Green in 48.4 seconds | Eight exact nominal frame plans; three complete small-resolution H.264 renders; strict Rec.709/frame/duration/decode checks; 200-slide cancellation and cleanup |
| Universal Mac build | Green | Exact clean source `51459cb`; `arm64` + `x86_64`; signed bundle manifest and runtime licences |
| Native and packaged WKWebView | Green: 3/3 variants | Sandboxed ad-hoc production, unsandboxed diagnostic control, sandboxed self-signed control; durable import/save, recovery, stale rejection, media rehydration, outbound/WebRTC lockdown |
| Installed launch | Green | Exact process `/Applications/Drift.app/Contents/MacOS/Drift`; ordinary window reached WebGL2 and H.264-ready state |

The latest full long-export details are in [LONG_EXPORT_QA_2026-08-23.md](LONG_EXPORT_QA_2026-08-23.md). Generated receipts and screenshots remain ignored local evidence under `output/qa/` and `build/install-backups/`.

## Recovery path

Recovery directory: `build/install-backups/20260823-150226/`.

| Preserved artifact | SHA-256 |
| --- | --- |
| `Drift-V1-build257.zip` | `2fd9107b9828d8c9c1bd61a31791789f60862c3c6d588e14ac089a0b41c39daf` |
| `Drift-V2-Dev-build282.zip` | `5c7abda68598a93593b1ec37d9e98507bdce59cd6850c5f85840ac61097da5d1` |

Both archives passed full ZIP integrity checks. Raw retired bundles are also retained under `retired-apps/`. Existing application containers and project databases were not deleted or reset.

## Honest limits

- The physical long-export lane proves exact nominal frame planning but encodes deliberately small pixels. It does not prove 1080p/4K long-export throughput or peak RSS.
- Intel is represented by a compiled x86_64 slice, not a physical Intel user journey.
- Unified Logging contains expected macOS/WebKit sandbox-service denials. Drift's own boot diagnostics, packaged receipts, and ordinary window showed no application error or crash.
- No valid Developer ID identity was present. A notarized public binary is impossible without Apple credentials and was not attempted.
- Automated and inspected visual evidence can reject obvious failure. It cannot manufacture Kay's creative approval.
