# Drift 2

Slides into reels, made for 9:16 first. Drop a deck (a PDF, slide images or short clips), pick a scene, press Export.

**[Download the latest release](https://github.com/bomkino/pitchdog-drift/releases/latest)** · Apple silicon, macOS 14 or later

Drift 2 is a native Mac app, rebuilt from the ground up. This repository holds it together with Galileo 2 and Backdrop, which share its engine and interface. Drift 1 is kept at the tag [`v1-final`](https://github.com/bomkino/pitchdog-drift/tree/v1-final).

---

## pitch.dog Studio

Three native Mac apps that turn your work into beautiful moving images, made for 9:16 first.

- **Drift 2** turns a deck (a PDF, slide images or short clips) into a reel. Pick a scene, press Export.
- **Galileo 2** turns artwork, photographs and clips into a moving gallery. Pick a scene, press Export.
- **Backdrop** makes moving backgrounds, and shares them with Drift and Galileo through its library.

Everything loops seamlessly, previews exactly as it exports, and runs locally on Apple silicon. Drift and Galileo can add tactile sound: recorded foley placed on the moments the cards move, looping with the picture.

## Using the apps

- A new window opens on sample work, already playing. Drop your own files anywhere in the window and they replace the samples.
- The scenes sit on the left at the shape you are making, each with a line on what happens in it. Rest the pointer on one to watch it on the stage; click to use it; the arrow keys step through them.
- Scenes that share a movement come as styles of one scene, picked at the top of the inspector. Drift: Stream in nine moods (Editorial, Noir, Sunstruck, Dread, Tender, Velvet, Celluloid, Night Run, Procession); Spotlight as Feed, Rail, Cascade or Focus; Wall as Tilted or Lanes; Contact as Marks or Assemble; plus Opening, Story, Shuffle, Vortex and Loom. Galileo groups its scenes by how the work is met: one at a time (Vitrine, Hang, Rail, Focus, Compare), walk-through (Corridor, Shelf, Wall), in motion (Flow as Calm or Cascade, Orbit, Vortex, Loom, Opening) and on the table (Scatter, Hand, Deck, Story, Contact).
- Several scenes come from pitch.dog's carousel research: Loom (Unwoven: cards weave from threads and unravel), Lanes (a three-lane wave wall), Cascade (a progressive turn), Vortex (rings orbiting a central work), Rail (a depth-graded rail), Assemble (a radial assembly into a contact sheet) and Focus (an editorial strip with focus pulls).
- **Follow work**, on the Colour page, leans the background's colours towards the work in the middle of the frame as it changes; it is on by default where one work leads.
- The inspector has five pages: **Motion** (loop length in one click: 10, 15, 30 or 60 s), **Title**, **Colour**, **Sound** and **Finish**.
- Scroll with two fingers over the stage to move through the loop the way the work flows; playback carries on when you let go. The ticks under the transport mark the moments the cards land: the playhead holds on one as you scrub past it (Option scrubs freely), and Command-[ and Command-] jump between them.
- The toolbar switches between 9:16, 4:5, 1:1 and 16:9; Cinema and 4K are in the menu beside it. Every scene lays itself out for the shape, and in a tall frame the work flows up the screen.
- Export writes MP4, HEVC, ProRes, ProRes 4444 with transparency, numbered PNG frames or a still, for one shape or several at once.

## Installing a release

Download the disk image from the repository's Releases page, open it and drag the app to Applications. The apps are ad-hoc signed and not notarized, so the first time, Control-click the app and choose Open (or allow it under System Settings › Privacy & Security). They use their own bundle identifiers, so Drift 1 and Galileo Gallery stay installed and untouched beside them.

## Build

Needs the Command Line Tools (no Xcode) on macOS 14 or later.

```bash
bash scripts/build-apps.sh release
```

The apps land in `../dist/` as `Drift 2.app`, `Galileo 2.app` and `Backdrop.app`.

The script builds against the macOS 26.5 SDK because the macOS 27 SDK expands SwiftUI's `@State` with a macro plugin that only ships with Xcode.

## Layout

| Module | Job |
|---|---|
| `Sources/RenderCore` | Metal context and caches, shader prelude (hashing, looping simplex noise, OKLab), palettes, finishing (bloom, grade, vignette, grain, dither), readback and video writing |
| `Sources/BackdropKit` | 29 analytic background looks in 8 families, the backdrop renderer and the shared library |
| `Sources/StageKit` | Card renderer (curl and folds, continuous corners, surfaces, depth of field, analytic shadows, mirror floor, motion blur, stacking layers), the scenes, sound events and the loop mixer, media and video decoding, exporter |
| `Sources/StudioKit` | Everything Drift and Galileo share: the window, scene browser and previews, stage, inspector, export sheet, document model, theme and type |
| `Sources/DriftApp`, `GalileoApp`, `BackdropApp` | Each app's scenes and entry point |
| `Sources/StudioLab` | Headless renders, benchmarks and icon generation |
| `Resources/Icons` | App icons rendered by the engine |
| `Resources/Sound` | 23 CC0 foley recordings (Kenney), pinned by hash, with measured trims and levels |

Drift and Galileo share one engine and one interface; what differs is each app's catalogue of scenes, its sample work and its words.

## Checking the apps without a screen

Every app accepts flags for headless checks. Give every flag a value: AppKit reads a bare word after a valueless flag as a document to open.

```bash
"../dist/Drift 2.app/Contents/MacOS/Drift" --snapshot out.png --scene noir --format square --tab finish
"../dist/Galileo 2.app/Contents/MacOS/Galileo" --still frame.png --scene hang --time 4
"../dist/Drift 2.app/Contents/MacOS/Drift" --export reel.mp4 --media deck.pdf --scene editorial --seconds 8
```

Other flags: `--size 1440x900`, `--tab motion|title|colour|sound|finish`, `--preview-scene <id>` (what resting on a scene shows), `--feature <index>`, `--save-to <path>`, `--show-export 1`, `--samples <n>`, `--transparent 1` (ProRes 4444 or PNG with alpha), `--sound editorial|cinema|paper`, `--probe-preview <out.png>` (reads back the live stage and reports its frame rate), and `-appearance light` for light mode.

Titles: `--title "Fieldnote" --kicker "SERIES A · 2026"`, with `--title-place corner|centre`, `--title-time throughout|opening|closing` and `--title-ink auto|light|dark`. Several formats in one run, as the export sheet writes them: `--export <folder> --formats reel,square,landscape [--kind h264|hevc|prores|prores4444|png|still]`. `--with-samples 1` adds the sample media before `--media`, to check that an import replaces it. `--palette-from-media 1` applies the palette drawn from the work (Drift, Galileo); `--palette-from <picture>` borrows one from a picture (Backdrop). `--export-done a.mp4,b.mp4` shows the export sheet's finished state.

`STUDIO_LAUNCH_PROBE=1` times an ordinary launch: when the window appears, when the samples are in and when the media has loaded.

## Checking everything at once

```bash
bash scripts/verify.sh
```

Builds the apps, then checks headlessly the interface type, Stream's styles and scene previews, undo (including typing a title and a change arriving mid-drag), saving, a title card that loops cleanly, a three-format export with sound in every file, and Corridor, Hang, Vitrine and Scatter through the motion audit in landscape and reel. It prints one line per check and exits non-zero if any fails. Output goes to a `studio-verify` folder inside the folder you name (the temporary folder by default); only that folder is replaced. About ten minutes on an M2.

## Checking motion

```bash
bash scripts/motion-audit.sh /tmp/motion-audit path/to/deck.pdf
```

Exports every Drift and Galileo look without motion blur, in landscape and reel, then checks each video tile by tile for one-frame pops and for the seam where the loop joins. Some intended motion also trips it (stepped poses, throws, feature exchanges, fast entrances, an edge that clips a tile for one frame as it passes behind a card); look at the flagged frames before calling them bugs.

## Rights

No fonts are bundled. The interface uses the system font; titles are set in faces that ship with macOS (Avenir Next, Helvetica Neue, Didot, Futura). Soft Bloom follows LUMEN's region structure (MIT, Leonxlnx); simplex noise is from webgl-noise (MIT, Ashima Arts and Stefan Gustavson). The sound recordings are CC0 (Kenney). See `NOTICES.md`.
