# Drift

**A local-first cinematic carousel studio for pitch decks. Now also a real Mac application.**

Drift turns still slides and one optional talking-head video into deterministic, Instagram-ready compositions. Three.js draws the scene, custom GLSL gives motion optical weight, and a fixed-step exporter renders frame `n` at exactly `n / fps`.

![Drift studio with media, a vertical WebGL composition, and director controls](docs/media/drift-studio.png)

This is not a CSS carousel wearing a shader as jewellery. Preview and export share the same scene evaluator. Projects include their source media. MP4 output is decoded and checked before Drift calls it finished.

## What is here

- Horizontal and vertical infinite tracks with straight, arc, ribbon, cylinder, and tunnel paths.
- Drag, wheel, keyboard, autoplay, pause, reverse, inertia, and seamless-output lock.
- Custom stage, output, slide, and pinned-frame ratios.
- Cover/contain fit, focal point, scale, spacing, depth, tilt, velocity bend, continuous corners, borders, and shadows.
- Transparent, solid, gradient, aura, paper, and void backgrounds drawn in GLSL.
- Six authored motion worlds: Editorial Drift, Road Memory, Dread, Noir Contact, Tender Light, and Chrome Dream.
- One optional pinned image or presenter video, off by default.
- Deterministic H.264 MP4, transparent PNG still, and numbered PNG sequence output.
- Explicit presenter-audio capability and A/V-sync gates. Audio is never discarded silently.
- IndexedDB autosave and portable `.pitched` project bundles with SHA-256 asset verification.
- Visible DOM fallback when WebGL2 is unavailable. It keeps media and project management usable while refusing to fake cinematic export.
- A dependency-light AppKit/WKWebView Mac app with native menus, Finder documents, sandboxed file panels, staged replacement, universal compilation, and DMG packaging.
- No analytics, cloud upload, remote font, runtime API, or hidden network request.

Moving-track media is deliberately image-only in v1. One pinned video keeps decoder load, export timing, and failure states legible.

## Run the browser studio

Requirements: Node.js 22.12 or newer. Current desktop Chrome is the verified complete browser-export path; Brave is a first-class target but remains capability-gated in the current QA receipt.

```bash
npm ci
npm run dev
```

Then open the local URL Vite prints. Replace the built-in study slides, direct the motion, and use the Output panel to create a master.

```bash
npm run check      # TypeScript, deterministic tests, browser build, native source contract
npm run test:e2e   # Real-browser media, WebGL, fallback, and portability checks
```

## Build Drift for macOS

Requirements: macOS 13.3 or newer, Xcode Command Line Tools, Node.js 22.12 or newer, and a clean locked install.

```bash
npm ci
npm run build:mac
open build/macos/Drift.app
```

The default app is universal for Apple Silicon and Intel. It runs the production Vite bundle directly from `Drift.app`; there is no Node runtime, local server, Electron layer, login, or cloud service.

```bash
npm run verify:mac       # manifest, signature, entitlements, archs, broker and WKWebView tests
npm run package:mac:dmg  # verified local drag-to-Applications disk image + SHA-256
```

The Mac application adds:

- one restored AppKit window and native File/Edit/Playback/View/Window/Help menus;
- `.pitched` ownership in Finder;
- App Sandbox with only user-selected read/write access;
- no network client or server entitlement;
- main-frame-only `WKScriptMessageHandlerWithReply` bridge;
- opaque file grants rather than renderer-visible paths;
- native image, presenter, project, MP4, still, and directory panels;
- same-volume staged writes and atomic destination replacement;
- symlink, traversal, chunk, output, and grant limits;
- Finder reveal for completed output;
- close/quit warnings around export, save failure, and recovery lock;
- WebKit content-process crash rollback and reload;
- executable native file-broker and packaged-WebView self-tests.

See [the Mac architecture](docs/MACOS_APP.md), [product contract](docs/MACOS_PRODUCT_CONTRACT.md), [user guide](docs/MACOS_USER_GUIDE.md), [threat model](docs/MACOS_THREAT_MODEL.md), [QA gauntlet](docs/MACOS_QA.md), and [release checklist](docs/MACOS_RELEASE_CHECKLIST.md).

### Mac codec policy

The ordinary browser source can register Mediabunny’s separately licensed software AAC extension. The standalone app deliberately cannot: `vite build --mode macos` aliases that module to an empty system-codec shim. Bundle verification rejects `.wasm`, FFmpeg AAC, and `libavcodec` markers.

The result is a cleaner distributable application, but capability follows installed macOS/WebKit. On a Mac with H.264 but no compatible system AAC encoder, mute the presenter, update macOS, or export PNG frames. Drift fails visibly rather than returning a convincing silent master.

### Binary-release boundary

The repository builds and locally packages `Drift.app`, but CI does not upload it. A public binary still requires explicit release authority, Developer ID signing, notarization, stapling, Gatekeeper testing through a quarantined download, physical Apple Silicon and Intel QA, and a completed release receipt. Ad-hoc local signing is not publisher identity.

## Export truth

The default master is 1080 × 1920, 30 fps, 8 seconds, SDR sRGB/Rec.709, opaque H.264 at 16 Mbit/s. In the browser build, a supported presenter-audio path targets AAC at 48 kHz stereo and 192 kbit/s. In the Mac app, AAC must come from system WebKit.

- H.264 does not preserve alpha. Transparent masters use PNG stills or PNG sequences.
- PNG sequences stream to a chosen directory when File System Access is available. The ZIP fallback has a strict memory cap.
- Presenter audio is allowed only where the active runtime can encode and verify it within one output frame. Higher frame rates may require muting it.
- File export writes through a rollback-aware target. Cancelled work is aborted or neutralised instead of being presented as a valid master.
- Native Mac destinations are staged outside the selected file and committed only after close.
- MP4 completion includes container readback, dimensions, frame count, duration, codec, colour, decoded probe frames, and audio timing checks.

See [the architecture](docs/ARCHITECTURE.md), [research notes](docs/RESEARCH.md), [product contract](docs/PRODUCT_CONTRACT.md), and [browser QA receipt](docs/QA_REPORT.md) for the boundaries behind those claims.

## Runtime support

| Runtime | Preview | MP4 | Transparent PNG | Portable projects |
| --- | --- | --- | --- | --- |
| Drift.app on supported macOS | AppKit + system WebKit | Capability-gated system H.264; system AAC only | Yes when canvas PNG is available | Yes; Finder document |
| Current desktop Chrome | Verified first class | Capability-tested AVC | Yes | Yes |
| Current desktop Brave | First-class target; not independently run in the browser receipt | Capability-gated AVC | Expected | Expected |
| Other WebGL2 browsers | Expected, tested case-by-case | Capability-gated | If canvas PNG is available | Yes |
| No WebGL2 | DOM media strip | Blocked visibly | Blocked | Yes |

Media never leaves the active local runtime. Browser IndexedDB or Drift’s sandboxed WebKit store holds the current project; a `.pitched` file is the portable backup. The current archive cap is 96 MiB, with 80 MiB total source images and 64 MiB per asset. Those limits prevent a friendly local tool from becoming a memory bomb.

## Design position

Drift studies the pacing, spatial confidence, and material restraint of excellent film and WebGL work without cloning anyone’s composition. Siena Film Foundation was an art-direction reference; Codrops’ WebGL carousel work was a technical conversation starter. The implementation and demo artwork here are original.

The default is authored on purpose. Controls can bend the scene, but presets are coherent parameter bundles rather than palette swaps. Distortion is bounded so a deck remains readable.

The Mac app follows the same position. Native chrome exists to remove friction, not to decorate a wrapper. Menus, Finder documents, save semantics, recovery, and sandboxing must earn their presence.

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), and avoid attaching confidential deck material to public reports. Mac changes must include source-contract updates and a concrete user-journey or threat-model reason.

## Freedom, assets, and marks

Project-authored software and documentation are licensed under **GNU AGPL-3.0-or-later**. Original demo slides and synthetic test fixtures are **CC BY-SA 4.0**. Dependencies retain their own licences. See [ASSET-LICENSE.md](ASSET-LICENSE.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [TRADEMARKS.md](TRADEMARKS.md).

Fork it. Study it. Change it. Share the changes. Do not use the pitch.dog marks to make a fork look official.
