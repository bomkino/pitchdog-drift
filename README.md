# Drift

**A local-first cinematic carousel studio for pitch decks.**

Drift turns still slides and one optional talking-head video into deterministic, Instagram-ready compositions. The editor runs entirely in the browser: Three.js draws the scene, custom GLSL shapes both atmosphere and lens response, and a fixed-step exporter renders frame `n` at exactly `n / fps`.

![Drift studio with media, a vertical WebGL composition, and director controls](docs/media/drift-studio.png)

This is not a CSS carousel wearing a shader as jewellery. Preview and export share the same scene evaluator. Projects include their source media. MP4 output is decoded and checked before the app calls it finished.

## What is here

- Horizontal and vertical infinite tracks with straight, arc, ribbon, cylinder, and tunnel paths.
- Drag, wheel, keyboard, autoplay, pause, reverse, inertia, and seamless-output lock.
- Custom stage, output, slide, and pinned-frame ratios.
- Cover/contain fit, focal point, scale, spacing, depth, tilt, velocity bend, continuous corners, borders, and shadows.
- A deterministic full-frame optical pipeline: soft focus, edge defocus, directional motion smear, chromatic aberration, bloom, halation, anamorphic flare, lens curvature, vignette, grain, gate weave, and breathing.
- Six authored lens recipes plus bounded custom controls. A protected pinned frame can stay crisp while the moving world carries the treatment.
- Fourteen procedural atmosphere families plus transparent output: solid, gradient, aura, paper, void, horizon, fog, prism, velvet, emulsion, night drive, tidal light, ember smoke, and projector gate.
- Twelve authored film worlds whose motion, surface, atmosphere, and lens direction change together—not palette swaps.
- One optional pinned image or presenter video, off by default.
- Deterministic H.264 MP4, transparent PNG still, and numbered PNG sequence output.
- AAC presenter audio at 48 kHz stereo with an explicit A/V-sync gate.
- IndexedDB autosave and portable `.pitched` project bundles with SHA-256 asset verification.
- Visible DOM fallback when WebGL2 is unavailable. It keeps media and project management usable while refusing to fake cinematic export.
- No analytics, cloud upload, remote font, runtime API, or hidden network request.

Moving-track media is deliberately image-only in v1. One pinned video keeps decoder load, export timing, and failure states legible.

## Directing path

Drift has a fast route through the editor: **Slides → World → Direct → Master**. Apply one of 18 authored film worlds, choose a direction pressure, generate non-compounding takes, compare against clean glass, inspect deck health and social-safe guides, then resolve output readiness before export.

Press `⌘/Ctrl + K` or `?` outside a text field to open **Director Commands**. Search in creator language—“variation”, “before after”, “social safe”, “output”, “undo”—instead of memorising panel architecture. A visible launcher keeps it discoverable for mouse and touch users.

See [the creator journey](docs/CREATOR_JOURNEY.md).

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
- Preview, stills, frame sequences, and MP4 share the same full-frame optical shader. Lens grain and motion are evaluated from saved time, not wall-clock accident.
- PNG sequences stream to a chosen directory when File System Access is available. The ZIP fallback has a strict memory cap.
- Presenter audio is allowed at 24, 25, or 30 fps. At 50/60 fps, mute presenter audio or export fails visibly. This is an honest guard around current browser AAC priming behaviour, not an arbitrary UI limit.
- File export writes through a rollback-aware target. Cancelled work is aborted or neutralised instead of being presented as a valid master.
- MP4 completion includes container readback, dimensions, frame count, duration, codec, colour, decoded probe frames, and audio timing checks.

See [the architecture](docs/ARCHITECTURE.md), [research notes](docs/RESEARCH.md), [product contract](docs/PRODUCT_CONTRACT.md), and [QA receipt](docs/QA_REPORT.md) for the boundaries behind those claims.

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

The default is authored on purpose. Controls can bend the scene, but presets are coherent motion + surface + atmosphere + lens bundles rather than palette swaps. Scene-wide blur and chromatic separation are edge- and velocity-aware, not blanket filters; the deck stays readable at the centre of the frame.

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), and avoid attaching confidential deck material to public reports.

## Freedom, assets, and marks

Project-authored software and documentation are licensed under **GNU AGPL-3.0-or-later**. Original demo slides and synthetic test fixtures are **CC BY-SA 4.0**. Dependencies retain their own licenses. See [ASSET-LICENSE.md](ASSET-LICENSE.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [TRADEMARKS.md](TRADEMARKS.md).

Fork it. Study it. Change it. Share the changes. Do not use the pitch.dog marks to make a fork look official.
