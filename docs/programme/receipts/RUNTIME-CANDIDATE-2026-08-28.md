# Integrated runtime candidate receipt

Date: 28 August 2026

Repository: `bomkino/pitchdog-drift`

Integration branch: `codex/drift-runtime-candidate`

Runtime source commit: `8837aa99ea153f8baa975c1b797b575ff9fe55c9`

Runtime source tree: `0d94fe5a9e45a54b516b1ea9dae594ccce2d6bb3`

The receipt reconciliation commit follows the runtime source commit. It changes
only current programme documentation; it does not retroactively change any
runtime artifact identity below.

## Candidate boundary

- Base: D10 evidence commit
  `3b6bc4a9129860fbb0f6c4adc5ea438bce94abc4`.
- Linux authority integrated from the five required D02 source/hardening
  commits, without importing stale D02 ledger claims.
- One Project V4 schema, evaluator, renderer, export implementation, audio
  engine, `ExportJobController`, destination/sink/verifier path, document
  platform seam, and automation service remain authoritative.
- macOS remains AppKit/WKWebView, Apple-Silicon-only, with a macOS 13.3 floor.
  Electron remains Linux x64 only. No `--no-sandbox` lane exists.

## Source and browser evidence

- `npm run check` passed: typecheck, 83 test files / 553 tests, macOS and Linux
  source contracts, and a 244-module production build.
- `npm run build:v2-dev` and `git diff --check` passed.
- The installed-Chrome runtime suite exercised current D03, D05, D08, and D10
  public seams, including scale reflow/state preservation, Guided Export
  consequence and cancellation truth, development automation reuse, and
  pinned-frame project/evaluation/export timing.
- `npm run qa:presenter-export` passed both physical installed-Chrome cases:
  256 x 256 and 1080 x 1920, H.264 at 24 fps with AAC 48 kHz stereo, 36 video
  frames and 71 audio frames, duration 1.514667 s.
- Presenter artifacts retained under
  `artifacts/runtime-evidence/af2871116bfda4edaa6334714e3fc57a33d6a1ab/browser-artifacts/`:
  - `presenter-256x256.mp4`: 83,026 bytes,
    SHA-256 `cdb5f7b72ce06124e520b0506ccfac774afa5797c7b1d5d5cab2fe4d100c70a1`.
  - `presenter-1080x1920.mp4`: 1,349,909 bytes,
    SHA-256 `62578fe64d89aca44e9bb837b622a34c66c96cf77bb9230efa7a67f1e1063644`.
- `npm run qa:long-export` and `npm run qa:long-export:full` passed. The full
  source-bound receipt is
  `output/qa/v2-long-export/2026-08-28T02-16-22.836Z/receipt.json`: 8,893 bytes,
  SHA-256 `ab65f27130f9a56c2812a08e2edf7202b6d65fab629447cc60d737ddc8c26f60`.
  It completed 30 s / 8-slide, 60 s / 40-slide, and 180 s / 200-slide
  software-encoded H.264 cases at deliberately small resolutions; exact frame
  count, duration, BT.709, opaque output, bounded caches/decoders, unload, and
  cancellation-without-artifact passed. It does not claim 1080p/4K long-run
  throughput, physical Intel, or other encoder implementations.

The captured screenshots are machine layout evidence. They are not human
visual, accessibility, or taste acceptance.

Current production-native UI capture:
`artifacts/runtime-evidence/af2871116bfda4edaa6334714e3fc57a33d6a1ab/mac/ui/brutalist-production-native.png`,
3,708 x 2,098, 3,303,079 bytes,
SHA-256 `bfc7e42d35799b7e6a105baf5d678f20bc64112db01036ba21f4d434c7f2dcef`.

## Apple-Silicon package evidence

Host used for this receipt: arm64 macOS 27.0 (build 26A5421a), Apple Swift 6.4,
Node 26.7.0, npm 11.19.0, Git 2.55.0, stable Google Chrome 152.0.7977.64, and
FFmpeg/ffprobe 9.0.1.

At product source parent `af2871116bfda4edaa6334714e3fc57a33d6a1ab`
(the final source commit adds only the documented violet/touch-target CSS pass
and corrects one icon-generator comment):

- `npm run build:mac`, `npm run verify:mac`, `npm run package:mac:dmg`, and
  `npm run verify:mac:dmg` passed.
- The production bundle is `dog.pitch.drift`, build channel `release`, build
  385, source revision `af2871116bfda4edaa6334714e3fc57a33d6a1ab`, and
  minimum system version 13.3.
- Every shipped Mach-O inspected by the verifier is exactly `arm64`. The app is
  ad-hoc signed, sandboxed, and retains only the documented user-selected file
  and WKWebView network-client entitlement boundary.
- The real packaged WKWebView matrix passed its sandboxed production variant
  and both diagnostic controls. It proved exact-source launch, native document
  authority, durable imported media, saved Project state, stale-generation
  rejection after the simulated public WebContent recovery seam, bounded
  cleanup, and zero accepted fetch/image/frame/WebSocket/beacon/TCP/WebRTC
  outbound probes. It does not claim arbitrary renderer-compromise containment.
- App executable: 1,125,744 bytes,
  SHA-256 `cdfba837440b08ddf0c18e4202a0b9c93f899063f0037dcaeaf33b04c5fef406`.
- App `BuildReceipt.txt`: 933 bytes,
  SHA-256 `6e92a2df94b1688bb30a826117ba3e76d21280311ff5f9fbad467e04d68b8cc3`.
- Packaged WKWebView matrix summary: 28,522 bytes,
  SHA-256 `4fadfd1206cbec81cd20565636ad1220e968da275b6c955635684350c3ba4645`.
- Local DMG `build/macos/Drift-0.1.0-macOS-arm64.dmg`: 4,641,536 bytes,
  SHA-256 `6f3002722c88b81ce19f9a4146bf9d808c262995c35390d6d2fc1c3b458cd61a`.

The app and mounted DMG were launched from isolated build/staging locations.
No existing `/Applications/Drift.app` was replaced. Ad-hoc signing is local
runtime evidence, not Developer ID signing, notarization, Gatekeeper
distribution acceptance, installation, or release.

## Linux x86_64 evidence

The isolated candidate branch was the only branch pushed. GitHub origin and
remote ref were read back as `bomkino/pitchdog-drift` and the exact 40-character
candidate commit before CI claims were admitted.

Ubuntu CI receipt details are recorded separately in
[`D02-linux-runtime-candidate.md`](D02-linux-runtime-candidate.md).

Ubuntu evidence is automated Linux x86_64 evidence. It is not exact
Garuda/KDE identity, a physical GPU/audio/performance result, desktop portal
acceptance, system accessibility, or human acceptance.

## Exact Garuda/KDE attempt

- Official Garuda Dr460nized ISO `garuda-dr460nized-linux-garuda-260819.iso`:
  3,559,471,104 bytes,
  SHA-256 `3dac6b04225fe9577ea0143a1c712e13316dff26985c2c4417f8c5e4af77f7f7`.
- UTM/QEMU machine data, ISO, EFI storage, sparse 20 GB qcow2 disk, and
  candidate bundle were kept on the external SSD. The light x86_64 machine used
  2 cores, 2.5 GB RAM, no 3D acceleration, and no shared host directory.
- The exact ISO reached Garuda's boot menu, completed systemd boot, started the
  Plasma Login Manager/SDDM, networking, QEMU and SPICE guest agents, and the
  graphical target under virtio-gpu, QXL, and VGA attempts.
- Every graphical handoff became a black guest surface with a live guest
  pointer. A visible KDE session/TTY could not be obtained. Therefore Drift was
  not imported, built, or launched in exact Garuda and no portal, GPU, codec,
  audio, accessibility, or performance claim is made.

This is a narrow emulated-display blocker, not a Linux source or Ubuntu
runtime failure. A physical or remotely accessible x86_64 Garuda/KDE host
remains the exact distro gate.

## State manifest

- Edited: yes — integrated Linux host, runtime fixes, browser evidence hooks,
  CI workflow, brutalist UI spacing/targets, violet visual identity, icon and
  favicon assets, receipts, and current ledger.
- Tested: yes — source, browser, encoder, long-export, native package, and
  Ubuntu lanes as bounded above.
- Built: yes — production and `v2-dev` web, Linux x64 tracer, production and
  `v2-dev` Apple-Silicon apps.
- Packaged: yes — bounded Linux tracer and local Apple-Silicon DMG.
- Launched: yes — installed Chrome, Linux CI Electron, local Mac app, mounted
  DMG app, and exact Garuda ISO; Drift itself was not launched inside Garuda.
- Artifact verified: yes — bounded artifacts named and hashed above and in the
  D02 receipt.
- Installed: no — no production Drift installation was replaced or created.
- Pushed: yes — only `codex/drift-runtime-candidate` for CI.
- CI passed: recorded in the D02 receipt for the exact admitted run.
- Merged: no.
- Released: no.
- Human accepted: no.

## External gates only

- physical or remote x86_64 Garuda/KDE portal, GPU/WebGL/fallback, codec/audio,
  performance, system-accessibility, and physical-device journey;
- standard external automation/MCP client transport beyond the bounded
  development-client transcript;
- human visual, motion, audio, keyboard, accessibility, and taste acceptance;
- Developer ID signing, notarization, Gatekeeper distribution, production
  replacement/installation, merge, tag, release, and publication.
