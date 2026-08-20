# Drift

**A local-first cinematic carousel studio for pitch decks.**

Drift turns still slides and one optional talking-head video into deterministic, Instagram-ready compositions. The editor runs entirely in the browser: Three.js draws the scene, custom GLSL gives motion optical weight, and a fixed-step exporter renders frame `n` at exactly `n / fps`.

![Drift studio with media, a vertical WebGL composition, and director controls](docs/media/drift-studio.png)

This is not a CSS carousel wearing a shader as jewellery. Preview and export share the same scene evaluator. Projects include their source media. MP4 output is decoded and checked before the app calls it finished.

## What is here

- Horizontal and vertical infinite tracks with straight, arc, ribbon, cylinder, tunnel, and editorial-cadence paths.
- Four material-led editorial cuts—Explainer, Paper Argument, Clean Data, and Documentary Glide—before raw motion controls.
- Editorial holds, stepped pose accents, source-owned paper registration, bounded settle, and exact source-deck closure without lowering the master frame rate.
- A delivery receipt that distinguishes Partial, Open, Closed, Retimed, and Rushed masters before export.
- One-click Close at cut tempo repair that preserves authored pace, fits sensible loops, and recommends chapters instead of destructive speed.
- Drag, wheel, keyboard, autoplay, pause, reverse, inertia, and seamless-output lock. Editorial direct manipulation works in visible cadence space so holds do not trap the pointer.
- Truthful pause: carousel, residual velocity, optical response, shadow lag, atmosphere, and presenter playback freeze together.
- Custom stage, output, slide, and pinned-frame ratios.
- Cover/contain fit, focal point, scale, spacing, depth, tilt, velocity bend, edge fade, drag weight, continuous corners, borders, and shadows.
- Transparent, solid, gradient, aura, paper, and void backgrounds drawn in GLSL.
- Six authored motion worlds: Editorial Drift, Road Memory, Dread, Noir Contact, Tender Light, and Chrome Dream.
- One optional pinned image or presenter video, off by default.
- Deterministic H.264 MP4, transparent PNG still, and numbered PNG sequence output.
- AAC presenter audio at 48 kHz stereo with an explicit A/V-sync gate.
- IndexedDB autosave and portable `.pitched` project bundles with SHA-256 asset verification.
- Visible DOM fallback when WebGL2 is unavailable. It keeps media and project management usable while refusing to fake cinematic export.
- No analytics, cloud upload, remote font, runtime API, or hidden network request.

Moving-track media is deliberately image-only in v1. One pinned video keeps decoder load, export timing, and failure states legible.

## Run it

Requirements: Node.js 22.12 or newer. Current desktop Chrome is the verified complete export path; Brave is a first-class target but remains capability-gated in this receipt.

```bash
npm ci
npm run dev
```

Then open the local URL Vite prints. Replace the built-in study slides, direct the motion, and use the Output panel to create a master.

```bash
npm run check      # TypeScript, deterministic tests, production build
npm run test:e2e   # Real-browser media, WebGL, fallback, and portability checks
```

## Export truth

The default master is 1080 × 1920, 30 fps, 8 seconds, SDR sRGB/Rec.709, opaque H.264 at 16 Mbit/s. When the pinned video has audio, Drift uses AAC at 48 kHz stereo and 192 kbit/s.

- H.264 does not preserve alpha. Transparent masters use PNG stills or PNG sequences.
- PNG sequences stream to a chosen directory when File System Access is available. The ZIP fallback has a strict memory cap.
- Presenter audio is allowed at 24, 25, or 30 fps. At 50/60 fps, mute presenter audio or export fails visibly. This is an honest guard around current browser AAC priming behaviour, not an arbitrary UI limit.
- File export writes through a rollback-aware target. Cancelled work is aborted or neutralised instead of being presented as a valid master.
- MP4 completion includes container readback, dimensions, frame count, duration, codec, colour, decoded probe frames, and audio timing checks.

See [the architecture](docs/ARCHITECTURE.md), [research notes](docs/RESEARCH.md), [director's editorial cuts guide](docs/EDITORIAL_CUTS_GUIDE.md), [editorial cadence gauntlet](docs/EDITORIAL_CADENCE_GAUNTLET.md), [product contract](docs/PRODUCT_CONTRACT.md), and [QA receipt](docs/QA_REPORT.md) for the boundaries behind those claims.

## Browser support

| Runtime | Preview | MP4 | Transparent PNG | Portable projects |
| --- | --- | --- | --- | --- |
| Current desktop Chrome | Verified first class | Capability-tested AVC | Yes | Yes |
| Current desktop Brave | First-class target; not independently run in this receipt | Capability-gated AVC | Expected | Expected |
| Other WebGL2 browsers | Expected, tested case-by-case | Capability-gated | If canvas PNG is available | Yes |
| No WebGL2 | DOM media strip | Blocked visibly | Blocked | Yes |

Media never leaves the browser. IndexedDB holds the current project; a `.pitched` file is the portable backup. The current portable archive cap is 96 MiB, with 80 MiB total source assets and 64 MiB per asset. Those limits prevent a friendly local tool from becoming a memory bomb.

## Design position

Drift studies the pacing, spatial confidence, and material restraint of excellent film and WebGL work without cloning anyone’s composition. Siena Film Foundation was an art-direction reference; Codrops’ WebGL carousel work was a technical conversation starter. The implementation and demo artwork here are original.

The editorial path studies a wider visual-explainer motion grammar—evidence-first pacing, purposeful holds, stepped accents, and recurring tactile motifs—without copying a brand skin or claiming affiliation with another studio.

The default is authored on purpose. Controls can bend the scene, but presets are coherent parameter bundles rather than palette swaps. Distortion is bounded so a deck remains readable.

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), and avoid attaching confidential deck material to public reports.

## Freedom, assets, and marks

Project-authored software and documentation are licensed under **GNU AGPL-3.0-or-later**. Original demo slides and synthetic test fixtures are **CC BY-SA 4.0**. Dependencies retain their own licenses. See [ASSET-LICENSE.md](ASSET-LICENSE.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [TRADEMARKS.md](TRADEMARKS.md).

Fork it. Study it. Change it. Share the changes. Do not use the pitch.dog marks to make a fork look official.
