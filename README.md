# Drift

**A local-first cinematic carousel studio for pitch decks.**

Drift turns still slides and one optional talking-head video into authored, Instagram-ready compositions. Three.js draws the scene, custom GLSL gives motion optical weight, and a fixed-step exporter renders frame `n` at exactly `n / fps`.

This is not a CSS carousel wearing a shader as jewellery. Preview and export share the same scene evaluator. Portable projects contain their source media. MP4 output is reopened, decoded, and checked before Drift calls it finished.

Drift is pre-1.0 and source-first. This tree identifies the `v0.2.1` source-release line dated 30 August 2026; that version is public only when the matching tag and GitHub Release appear on GitHub. Read the [project status](docs/STATUS.md) for the exact boundary between public source, historical downloads, local candidates, verification, and release.

The editor is organised around one visible journey: **Slides → Look → Motion → Export**. The stage and timeline stay put while the task inspector changes. **Apply clean carousel** gives a proof-safe, smooth, continuous starting point without replacing the chosen background, framing, media, or pinned-frame placement. Read the [Mac user guide](docs/MACOS_USER_GUIDE.md#the-shortest-good-path) or the [editor-journey rebuild note](docs/v2/EDITOR_JOURNEY_REBUILD_2026-08-25.md) before opening every advanced control.

## V2 production boundary

Drift's shipping source now creates an authored V2 Project V4 document. It combines one canonical renderer/export path, eight authored Worlds, sixteen portrait scenes, seventy-two live backgrounds, editorial timing, space, material, analytical light, global optics, tactile sound, and a directable pinned frame. Explicitly imported or previously saved V1 projects remain on the frozen compatibility renderer until the creator applies a V2 World.

The isolated `Drift V2 Dev.app` identity remains available for development without taking `.pitched` Finder ownership or sharing the production WebKit store, cache, IndexedDB database, or sandbox container. It is a test identity, not a second product users should install beside Drift. See the [current V2 status](docs/v2/CURRENT_STATUS.md), [requirement matrix](docs/v2/V2_REQUIREMENT_PHASE_MATRIX.md), [production-promotion receipt](docs/v2/PRODUCTION_PROMOTION_2026-08-23.md), and [donor ledger](docs/v2/DONOR_LEDGER.yaml).

```bash
npm run dev                  # browser V2 Dev on 127.0.0.1:4174
npm run build:v2-dev         # isolated Web build
npm run build:mac:v2-dev     # isolated Mac development app
npm run verify:mac:v2-dev    # bundle and packaged-WKWebView verification
```

The repository contains two first-class ways to run the same studio:

- the original local browser application;
- a sandboxed, standalone macOS application in [`macos/`](macos/) with its native build and verification lanes in [`scripts/`](scripts/).

The native application keeps the WebGL renderer and project format intact. AppKit owns the window, menus, Finder integration, file permissions, staged destination writes, recovery, signing, and packaging. It does not invent a second renderer or a second export timeline.

## What Drift directs

- Horizontal and vertical infinite tracks with straight, arc, ribbon, cylinder, and tunnel paths.
- Drag, wheel, keyboard, autoplay, pause, reverse, inertia, and seamless-output lock.
- Custom stage, output, slide, and pinned-frame ratios.
- Cover/contain fit, focal point, scale, spacing, depth, tilt, velocity bend, continuous corners, borders, and shadows.
- Transparent output plus seventy-two Solid, Gradient, Aura, Paper, Void, Cutting Map, Grid, Wave, and living-pigment Atelier backgrounds drawn in GLSL, browsed through an always-visible visual library with restrained world-only film grain.
- Eight authored V2 Worlds with three directing pressures, plus the preserved V1 theme library.
- One optional pinned image or presenter video, off by default.
- Independent pinned-frame size, X/Y position, safe inset, aspect, fit, focal point, matte, corners, border, shadow, timing, and track controls.
- Four cuts, six performances, four motion characters, four pose cadences, six handcrafted stacks, entry/exit direction, exact repeats, and editable tempo envelopes.
- Outcome-first motion recipes, including a clean continuous carousel and a deck-aware Casino Reveal sequence of `FAST ×2 → READ ×1 → FAST ×1`.
- One visible editing timeline with transport, scrubbing, pass blocks, current time, and exact authored duration.
- Ten spatial paths, four material recipes, twelve light rigs, eight lens recipes, seventy-two backgrounds across nine structural families, twenty-eight palettes, and sixteen portrait-native scenes.
- Optional deterministic tactile sound from 23 local CC0 recordings, with three palettes, three grammars, and presenter-under-voice mixing.
- Deterministic H.264 MP4, transparent PNG still, and numbered PNG sequence output.
- Presenter audio at AAC-LC, 48 kHz stereo, with explicit priming, padding, and A/V-sync checks.
- IndexedDB autosave and portable `.pitched` project bundles with SHA-256 asset verification.
- Visible DOM fallback when WebGL2 is unavailable. It keeps media and project management usable while refusing to fake cinematic export.
- FontBlind v13 is the default type family across the studio: seven CC0 WOFF2 binaries are vendored from [`bomkino/pitchdog-type-system`](https://github.com/bomkino/pitchdog-type-system) release `v13.0.0`, exact commit `786b4a2b671182319320f922b8de8f927ea3a002`.
- Interface icons use Phosphor Icons for React `2.1.10`; scale-aware carets, optical centring, spacing tokens, control padding, measured disclosures, and responsive gaps keep the dense editor legible from compact panels through high interface scales.
- No analytics, cloud upload, runtime font download, runtime API, or hidden network request.

Moving-track media is deliberately image-only in v1. One pinned video keeps decoder load, export timing, and failure states legible.

## The Atelier collection

![Sixteen Drift captures showing eight Atelier backgrounds in portrait and landscape stages](docs/media/drift-atelier-atlas.png)

Atelier adds eight original living-pigment rooms: **Saffron Anatomy, Verdigris Fresco, Ultramarine Ledger, Rose Madder Bloom, Charcoal Cartography, Gilded Palimpsest, Indigo Botanical,** and **Oxide Gesture**. They translate watercolour glazing, pooled edges, fresco weather, graphite contours, dry brush, manuscript rules, and paper tooth into Drift's existing raw-GLSL renderer. No reference artwork or third-party sketch code ships in the collection.

Each composition is aspect-correct, deterministic, and exact-loop-safe. Preview and export use the same shader and fixed-step phase. Motion stays deliberately low; the background should disclose itself around a deck, not audition for the foreground. The [Atelier design and verification note](docs/v2/ATELIER_BACKGROUNDS_2026-08-24.md) records the authorship boundary, composition grammar, and repeatable two-axis QA lane.

## Run the browser studio

Requirements: Node.js 22.12 or newer. Current desktop Chrome is the verified complete browser-export path; Brave remains capability-gated.

```bash
npm ci
npm run dev
```

Then open the local URL Vite prints.

```bash
npm run check      # TypeScript, Vitest, source contracts, production build
npm run setup:e2e  # Install the local Chromium runtime once
npm run test:e2e   # Real-browser media, WebGL, fallback, and portability gauntlet
```

## Build the standalone Mac app

Requirements: macOS 13.3 or newer, Node.js 22.12 or newer, and Xcode command-line tools.

```bash
npm ci
npm run build:mac
open build/macos/Drift.app
```

The local build is an Apple-Silicon-only `arm64` application with App Sandbox, hardened runtime, user-selected file access, and an ad-hoc signature. Intel Macs and Windows are unsupported. It does not need Node.js, Vite, Terminal, or a local server after it has been built.

Useful native commands:

```bash
npm run check:mac-source       # bridge, security, packaging, and codec invariants
npm run verify:mac             # bundle, manifest, signature, native and WebView probes
npm run package:mac:dmg        # local drag-to-Applications disk image
```

Start with [the documentation map](docs/README.md), then read [the repository map](docs/REPOSITORY_MAP.md), [Mac architecture](docs/MACOS_APP.md), [user guide](docs/MACOS_USER_GUIDE.md), [product contract](docs/MACOS_PRODUCT_CONTRACT.md), [threat model](docs/MACOS_THREAT_MODEL.md), [QA gauntlet](docs/MACOS_QA.md), and [release boundary](docs/MACOS_RELEASE.md).

## Mac codec truth

The browser build and the standalone app deliberately use different AAC implementations.

### Browser build

The browser project uses `@mediabunny/aac-encoder`. That package provides a software AAC encoder backed by an FFmpeg-derived WebAssembly binary. Its licences and distribution obligations remain documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### Standalone macOS build

The Mac build aliases that package to `src/lib/macosAacEncoder.ts`. This is not an empty shim. It registers a Mediabunny custom encoder that sends bounded PCM chunks through Drift’s typed native bridge to Apple’s software AAC-LC encoder in AudioToolbox.

The native receipt records and validates:

- AAC-LC / `mp4a.40.2`;
- 48 kHz stereo;
- 192 kbit/s target bitrate;
- AudioSpecificConfig and magic-cookie metadata;
- packet sizes and frame counts;
- leading priming frames;
- trailing padding frames;
- the exact equation `represented = leading + input + trailing`.

The Mac bundle therefore contains no FFmpeg runtime or codec WebAssembly. H.264 video still uses the encoder exposed by WKWebView. Presenter audio uses the bounded native AudioToolbox bridge. Either capability can fail visibly; audio is never stripped silently.

Presenter-audio masters remain limited to 24, 25, or 30 fps. Muted presenter video may use 50 or 60 fps.

## Export truth

The default master is 1080 × 1920, 30 fps, 8 seconds, SDR sRGB/Rec.709, opaque H.264 at 16 Mbit/s. Presenter audio, when enabled, is AAC-LC at 48 kHz stereo and 192 kbit/s.

- H.264 does not preserve alpha. Transparent masters use PNG stills or PNG sequences.
- PNG sequences stream to a chosen directory when the platform supports it. The ZIP fallback has a strict memory cap.
- File export writes through rollback-aware destinations. Cancelled work is aborted, removed, or explicitly neutralised instead of being presented as a valid master.
- MP4 completion includes container readback, dimensions, frame count, duration, timestamps, codec, colour, decoded probe frames, and presenter A/V timing checks.
- The macOS app stages file replacements on the destination volume and commits only after export and verification succeed.
- Existing PNG-sequence files are never overwritten.

The macOS runtime workflow separately falsifies four claims on an Apple Silicon runner:

1. WKWebView can create WebGL2 output and encode a real H.264 access unit.
2. AudioToolbox can create AAC-LC packets with coherent priming and padding metadata.
3. The actual deterministic exporter can render 90 fixed-step frames, mux an MP4, reopen it, and decode first/middle/final probe frames.
4. The same exporter can produce an alpha-capable PNG containing both visible and transparent pixels.

Those checks are evidence for the tested runtime, not a substitute for physical Apple Silicon testing, accessibility review, or long-form export QA.

## Runtime boundaries

| Runtime | Preview | MP4 | Presenter audio | Transparent PNG | Portable projects |
| --- | --- | --- | --- | --- | --- |
| Current desktop Chrome | Verified first class | Capability-tested AVC | Software AAC extension | Yes | Yes |
| Standalone Drift.app | Packaged WKWebView + WebGL2 | WKWebView AVC, capability-gated | Native AudioToolbox AAC bridge | Yes | Yes |
| Current desktop Brave | First-class browser target; not independently run in the frozen receipt | Capability-gated AVC | Software AAC extension where supported | Expected | Expected |
| Other WebGL2 browsers | Tested case by case | Capability-gated | Capability-gated | If canvas PNG is available | Yes |
| No WebGL2 | DOM media strip | Blocked visibly | Blocked | Blocked | Yes |

Drift ships no uploader, analytics client, or native network client. FontBlind binaries and V2 tactile-sound recordings are committed locally and require no runtime fetch. The packaged app separately tests its page-level outbound lockdown; the signed network-client entitlement remains app-wide and is documented as a residual risk. The current portable archive cap is 96 MiB, with 80 MiB total source assets and 64 MiB per asset. Those limits prevent a friendly local tool from becoming a memory bomb.

## Why the Mac app is not an Electron bundle

The native shell is compiled directly from Swift using AppKit, WebKit, Foundation, Security, CryptoKit, Uniform Type Identifiers, and AudioToolbox. There is no Electron runtime, Chromium distribution, background server, updater daemon, shell bridge, or arbitrary native method invocation.

JavaScript receives opaque grants rather than absolute file paths. Native save and directory panels produce scoped capabilities. Writes are chunked, bounded, staged, synchronized, and either committed or rolled back. A document-start page boundary removes WebRTC constructors; HTTP, HTTPS, WebSocket, and FTP loads are blocked; remote downloads never receive destination authority. Deliberate help/source links open in the default browser. These are tested application controls, not a claim that arbitrary WebKit or macOS compromise is impossible.

## Release boundary

`v0.2.1` is a source-release line. It does not add a downloadable Mac binary. The earlier `v0.1.0` GitHub Release included an Apple-Silicon DMG signed ad hoc and not notarized; keep it as historical test material, not as a supported or Gatekeeper-ready binary.

A local `.app` or CI-built DMG is not automatically a public release.

A distributable candidate still requires:

- Developer ID Application signing;
- hardened-runtime and App Sandbox entitlement readback;
- Apple notarization and stapling;
- Gatekeeper assessment;
- detached manifest and checksum verification;
- physical Apple Silicon user-journey testing across the supported macOS boundary;
- explicit authorization to publish.

The Mac candidate workflow is manual and uploads text-only Actions evidence suitable for a public repository. It does not create a GitHub Release, push a tag, deploy a website, or publish binaries. A separate source-release workflow waits for successful exact-main CI, standalone macOS, and packaged-WKWebView workflows after a version transition (or validates those same gates on explicit manual dispatch), verifies the matching changelog section, tags that exact current `main` commit, and publishes a source-only GitHub Release. It never uploads an app or DMG.

## Design position

Drift studies the pacing, spatial confidence, and material restraint of excellent film and WebGL work without cloning anyone’s composition. Siena Film Foundation was an art-direction reference; Codrops’ WebGL carousel work was a technical conversation starter. The implementation and demo artwork here are original.

The default is authored on purpose. Controls can bend the scene, but presets are coherent parameter bundles rather than palette swaps. Distortion is bounded so a deck remains readable.

Slides are borderless by default. Five worlds rely on silhouette, spacing, and a shadow cast from the true rounded-card mask; Noir Contact alone uses a deliberate opaque 1 px keyline. Grain belongs to the surrounding world, never to imported artwork or presenter pixels. Its plate advances deterministically with output frames, runs at a quieter capped cadence in preview, and freezes under Pause or Reduce Motion.

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), and never attach confidential deck material to a public report. The [Codex build story](docs/CODEX_BUILD_STORY.md) explains how human art direction, agentic implementation, and falsifiable evidence fit together; the [roadmap](docs/ROADMAP.md) names work that is actually open rather than inventing busywork.

## Freedom, assets, and marks

Project-authored software and documentation are licensed under **GNU AGPL-3.0-or-later**. Original demo slides and synthetic test fixtures are **CC BY-SA 4.0**. Dependencies retain their own licences. See [ASSET-LICENSE.md](ASSET-LICENSE.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [TRADEMARKS.md](TRADEMARKS.md).

Fork it. Study it. Change it. Share the changes. Do not use the pitch.dog marks to make a fork look official.
