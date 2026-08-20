# pitch.dog Image Slider — product contract

Frozen: 20 August 2026

## Outcome

Create a local-first directing tool for turning pitch-deck slides and a presenter video into authored, cinematic Instagram sequences. It must let the user shape motion and atmosphere without touching code, then capture the result at a useful social-video resolution.

This is not a carousel demo, a shader toy, or a settings-panel mockup. The real artifact is a controllable moving composition that remains beautiful with the user's own slides, survives awkward inputs, and produces a usable file.

## Audience effect

Viewers should feel a deck unfolding as a filmic sequence rather than watching screenshots pass through a template. The deck remains legible. Motion creates tension, pace, and continuity; it never becomes the subject by accident.

## In scope

- Fresh browser studio built in this exact workspace.
- Three.js/WebGL renderer with custom GLSL for slide shape, optical motion, borders, animated backgrounds, and a deterministic scene-wide lens pipeline.
- Image-slide import, reorder, removal, fit control, and clean object-URL lifecycle. V1 video is deliberately limited to one optional pinned presenter; moving-track items are still images.
- Horizontal and vertical infinite carousels.
- Multiple spatial flows with direct drag, wheel, keyboard, autoplay, inertia, pause, and reverse.
- Independent stage and slide aspect ratios, including 9:16, 4:5, 1:1, 16:9, and custom values.
- Slide scale, spacing, depth, bend, tilt, corner radius, superellipse-style corner smoothing, border, shadow, and motion distortion controls.
- Transparent output plus fourteen procedural shader atmosphere families, with explicit palette, scale, softness, complexity, parallax, motion, grain, vignette, and seed controls.
- Six authored lens recipes and bounded expert controls for soft focus, edge defocus, motion smear, chromatic separation, bloom, halation, flare, lens curvature, vignette, grain, gate weave, and breathing.
- Twelve authored genre worlds, including travel, horror, fashion, documentary, archive, thriller, romance, fantasy, and music directions, that change motion logic, surface, atmosphere, and optics together.
- Optional pinned frame, off by default, which can hold an image or talking-head video while other slides travel. It can remain optically protected or join the full-frame treatment.
- Still capture, deterministic fixed-step MP4 export, honest transparent PNG-sequence export, preset/project import/export, durable local media persistence, and verified pinned-video audio handling.
- Responsive controls, reduced-motion behavior, keyboard access, WebGL failure fallback, and local-only media handling.

## Protected boundaries

- Work only inside this folder.
- Public open-source GitHub publication is explicitly authorized once the frozen bar holds. No website deploy, release attachment, email send, purchase, or source deletion.
- Publish source, shaders, tests, documentation, and local demo assets under strong copyleft/open-content terms; do not hide essential functionality behind proprietary services.
- Prior component studies and public references inform mechanisms and settings only. Do not copy a composition or turn this into Galileo Gallery or Framer Components v3.
- No runtime analytics, tracking, remote fonts, cloud upload, or hidden network request.
- User media never leaves the browser.
- Existing source packages remain untouched.
- First-class editor/export runtime is current desktop Chromium or Brave with WebGL2, WebCodecs AVC, and File System Access. Other browsers are capability-gated and must not pretend to offer an unavailable export.

## Costliest false wins

1. Beautiful demo, unusable with real media. Countercheck: import mixed aspect ratios and video, reorder/remove them, enable a pinned video, reload settings, and capture output.
2. Dense control panel whose controls do not materially affect the rendered result. Countercheck: inspect rendered before/after states, prove the optical pass changes pixels, and test every saved range at its boundaries.
3. Smooth desktop loop that breaks on phone, reduced motion, WebGL loss, low slide counts, transparency, or export. Countercheck: real-browser tests across those states and decoded output inspection.
4. "Instagram export" that is only a real-time canvas recording with dropped frames, missing presenter audio, or unknown dimensions. Countercheck: drive export from frame index and fixed time, then inspect MP4 container, codec, dimensions, duration, frame count, frame decode, and audio track. H.264 output is always opaque; transparency uses PNG sequence.
5. Many presets that are palette swaps. Countercheck: each genre must have a distinct motion sentence: pace, path, depth, surface, full-frame lens treatment, and background behavior.
6. Cinematic preview whose export loses the lens. Countercheck: preview, PNG, sequence, and MP4 must call the same optical shader with explicit evaluated time and velocity.
7. Blanket blur that makes the deck unreadable. Countercheck: centre readability, edge-weighted defocus, velocity-linked smear, bounded channel split, and an optional crisp presenter layer.

## Frozen bar

- Default scene has a clear authored point of view and legible slides at first load.
- Imported moving-track images and the single optional presenter video render without stretching and can be managed without code.
- Carousel loops without visible jumps in both axes; 1, 2, and 12-item sets remain valid.
- Drag is 1:1, interruptible, and hands velocity into inertia; keyboard actions stay immediate.
- Pinned frame remains stable while moving frames continue and is never enabled by surprise.
- Corner radius, smoothing, spacing, speed, flow, borders, slide ratio, stage ratio, backgrounds, and every surfaced lens control create visible, bounded changes.
- Optical finishing is scene-wide, deterministic, alpha-safe, bypassable, and shared by preview and export. A saved timestamp renders the same lens grain, gate position, breathing, and smear every time.
- The pinned presenter can remain crisp after scene-wide optics without becoming detached from stage geometry or export timing.
- Fourteen rendered background families remain materially distinct under their default parameters; scale/softness/complexity/parallax produce bounded variation without turning the tool into a random shader toy.
- Transparent mode yields transparent still output; non-transparent modes fill every exported pixel.
- Reduced motion pauses autoplay and removes vestibular effects while preserving control and legibility.
- WebGL failure presents a usable DOM media strip and explanation rather than a blank stage.
- UI remains operable at 1440 x 900, 1024 x 768, 390 x 844, and 320 x 568.
- Production build and typecheck pass; deterministic geometry/state tests pass.
- Chromium runtime has no uncaught exceptions during core journey.
- Preview and export share a pure time-based scene evaluator; exported frame `n` renders at `n / fps`, independent of display refresh or encoder speed.
- Captured still decodes at requested dimensions. MP4 decodes with expected H.264 dimensions, duration, frame count, colour, and frame rate; pinned presenter audio remains within one frame of video or export fails visibly.
- Transparent output round-trips alpha through PNG. MP4 never claims alpha support.
- Saved project reopens with settings, order, and copied media intact; missing media fails visibly. Portable project bundle contains a versioned manifest plus original assets.
- Default master is 1080 x 1920, 30 fps, 8 seconds, SDR sRGB/Rec.709, opaque H.264 at 16 Mbit/s, and—when a pinned presenter has audio—AAC 48 kHz stereo at 192 kbit/s. Duration is adjustable from 3 to 30 seconds.
- Transparent frame export writes exactly `round(duration * fps)` numbered PNGs at requested dimensions, with decodable nonzero alpha where composition permits. Directory streaming is first class; memory ZIP fallback has a strict safe cap.
- OS reduced-motion preference changes editor preview only. Export follows saved project motion unless the user explicitly selects reduced-motion output.
- Portable bundle survives a fresh browser profile with local storage cleared; ordered asset hashes, manifest schema, engine version, and theme version match.
- Empty project, corrupt image, unsupported presenter codec, oversized texture, canceled export, partial-file cleanup, and WebGL context loss all fail visibly without destroying saved work.
- DOM fallback keeps media/project management usable but labels cinematic preview and export unavailable. It never silently substitutes CSS output.
- Seamless-export mode repeats motion/background state without a visible end-to-start jump.
- Fresh critics must falsify product/visual and technical/accessibility claims, but critic approval never replaces artifact checks.
- Public GitHub readback must match the verified local commit; CI must pass from a clean checkout; license, asset terms, contribution guidance, security policy, and third-party notices must be present.

## Stop conditions

Stop when frozen bar is directly checked, five total builder-critic rounds are exhausted, two consecutive rounds yield no material accepted gain, or missing browser/hardware evidence prevents an honest claim. Never lower the bar to manufacture completion.
