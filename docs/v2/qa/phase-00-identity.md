# Phase 00 — V2 identity and coexistence receipt

Recorded: 22 August 2026

V2 branch: `codex/v2-directors-cut`

Verified V2 source: `8756aa872adae820faafd7d3f3ae29650648cd13`

Preserved V1 source: `5fd145207235884790ba071c5d84bc3876ff4989`

## Claim

One committed V2 development build was built, verified, installed, and run beside the existing Drift V1 installation without replacing its application, process, source receipt, executable, Info.plist, container, or project database.

This receipt clears the isolated development-app identity boundary. It does not claim Project V4, canonical V2 render authority, a visually approved V2 World, Developer ID distribution, notarisation, merge, push, public release, or publication.

## Exact V2 artifact

The repository build and installed application matched byte-for-byte on the two identity-bearing files:

| Surface | Verified value |
| --- | --- |
| Repository app | `build/macos/v2-dev/Drift V2 Dev.app` |
| Installed app | `/Applications/Drift V2 Dev.app` |
| Display name | `Drift V2 Dev` |
| Executable | `DriftV2Dev` |
| Bundle identifier | `dog.pitch.drift.v2.dev` |
| Build channel | `v2-dev` |
| Source revision | `8756aa872adae820faafd7d3f3ae29650648cd13` |
| Version / build | `0.1.0` / `259` |
| Architectures | `arm64`, `x86_64` |
| Cache namespace | `DriftV2Dev` |
| IndexedDB name | `pitchdog-drift-v2-dev` |
| Named WebKit store | `7A519E77-39A8-4BAF-89A0-314590BF3D24` |
| Portable-project ownership | absent |
| Executable SHA-256 | `329fa0fae30fece888888d28afb0f6588c7f454dcbdcf7f0e0bdabf290ceeb0d` |
| Info.plist SHA-256 | `9af0a4417d0a41862b1a5026cfda308f435cdf2cefa82c6c5c7a1d6a829da031` |

The installed app is ad-hoc signed with Hardened Runtime. It has no signing team, is rejected by Gatekeeper, and is not Developer ID signed, notarised, stapled, or suitable for public distribution.

## Packaged runtime matrix

`build/macos/v2-dev/verify-packaged-webview/matrix-summary.json` records three completed product passes:

1. sandboxed, ad-hoc signed production variant;
2. unsandboxed, ad-hoc diagnostic control;
3. sandboxed, self-signed diagnostic control.

The production variant reported the exact V2 bundle, source, build channel, cache namespace, storage namespace, and named WebKit store. It also completed persistent isolated Blob storage, native import, saved-state settlement, simulated public-delegate recovery, stale-generation rejection, rehydration, and page-world WebRTC lockdown with no accepted loopback TCP or UDP/STUN traffic. Matrix result: `3/3` passed.

The matrix uses a disposable `drift-project-self-test-*` database for its mutation harness. The normal installed-app launch below separately supplied the physical evidence for the real `pitchdog-drift-v2-dev` database.

## Simultaneous installed run

Both exact installed executables were observed alive at the same time:

| Product | PID | Exact executable |
| --- | ---: | --- |
| Drift V1 | `75493` | `/Applications/Drift.app/Contents/MacOS/Drift` |
| Drift V2 Dev | `84575` | `/Applications/Drift V2 Dev.app/Contents/MacOS/DriftV2Dev` |

V1 remained unchanged across the V2 build, installation, normal launch, and disposable-project rejection check:

| V1 surface | Before and after |
| --- | --- |
| Source revision | `5fd145207235884790ba071c5d84bc3876ff4989` |
| Executable SHA-256 | `d3af7e2824f89c595e6b8a04929afd75b67970cfe810bf5ecb031e2e887a62eb` |
| Info.plist SHA-256 | `ba51174a64b4a7104f05e4689019c41e2ae5eb755a666191088a80e6bd48ae14` |
| Running PID | `75493` |

## Physical storage separation

A normal launch of each installed app produced separate sandbox containers, separate WebKit store roots, separate physical IndexedDB files, and separate logical database names:

| Surface | Drift V1 | Drift V2 Dev |
| --- | --- | --- |
| Container | `~/Library/Containers/dog.pitch.drift` | `~/Library/Containers/dog.pitch.drift.v2.dev` |
| WebKit store root | `Data/Library/WebKit/WebsiteData/Default` | `Data/Library/WebKit/WebsiteDataStore/7a519e77-39a8-4baf-89a0-314590bf3d24` |
| Physical IndexedDB directory | `.../IndexedDB/BB024735CD6AF91AC8A316E8D3C49E8CE7467FC6D996C9113F8A4A4A03EE2732` | `.../IndexedDB/7B7981EB8820997C9C2510756CDDEBCC6EDFE430FF46D9BCE52F4F2B7A464127` |
| `IDBDatabaseInfo.DatabaseName` | `pitchdog-drift` | `pitchdog-drift-v2-dev` |

The logical names were read from each physical `IndexedDB.sqlite3` metadata table. This is normal-runtime evidence, not an inference from source constants or the self-test receipt.

## Production-project boundary

The installed V2 Info.plist contains neither `CFBundleDocumentTypes` nor `UTExportedTypeDeclarations`, and contains no `dog.pitch.pitched-project` declaration. A Finder open attempt using a disposable `.pitched` fixture was refused by the normal V2 process with the development-boundary alert; the fixture was not admitted as a project.

Local ignored screenshots:

| Observation | Path | SHA-256 |
| --- | --- | --- |
| Normal installed V2 launch | `output/v2/identity/macos-v2-dev-normal-launch.png` | `362fcdda445c88c955883e46cb7fd7492fe3ab014921226fca464f171200a455` |
| Disposable `.pitched` rejection | `output/v2/identity/macos-v2-dev-rejects-pitched.png` | `9022950b81e2791f0f90f904909ce961e945d1f53770f91d73a5d14bf332edda` |

These screenshots document the observed UI state; they are not substitutes for the bundle, process, hash, database, or packaged-matrix evidence above. Absence of document declarations proves the V2 bundle makes no document-ownership claim; it is not presented as a historical audit of every cached LaunchServices record on the machine.

## Boundary after Phase 00

- V1 remains the production `.pitched` owner and the place for real portable projects.
- V2 Dev remains a disposable, isolated development application.
- Project V4 has not been implemented yet.
- Nothing from this V2 branch has been pushed, merged, released, notarised, or published.
- The next implementation slice may begin from this identity boundary, but must earn its own migration, renderer, visual, native, and release receipts.
