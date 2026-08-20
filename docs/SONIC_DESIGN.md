# Sonic design

Drift's sound layer is not music and not decorative UI noise. It gives physical consequence to motion: a frame passes, a drag lifts, a gesture lands. The picture remains primary.

## Direction

The vocabulary is intentionally small:

| Drift cue | Meaning | Preview | MP4 |
| --- | --- | --- | --- |
| `passage` | A slide crosses the playhead | Yes | Yes |
| `grab` | Direct manipulation begins | Yes | No |
| `release` | Direct manipulation ends | Yes | No |
| `settle` | A non-looping motion sentence resolves | Yes | Yes |
| `control` | A meaningful control is actuated | Yes | No |
| `success` | A visible operation completed | Yes | No |
| `failure` | A visible operation failed | Yes | No |

Editor feedback never leaks into the exported film. Only authored passage and settle events enter the master.

## Source and provenance

Every bundled cue comes from the open-source [UI SFX](https://github.com/romainsimon/uisfx) corpus at the pinned revision `2001f3dac2d1cf86ad99cbad5cef222c3a8b9082`. Its audio is dedicated to the public domain under CC0-1.0. Drift vendors only seven semantic cues from each of three packs:

- `studio` → **Studio**
- `cinematic` → **Cinema**
- `zen` → **Paper**

The exact upstream path, revision, SHA-256 digest, byte length, and licence are recorded in `src/sonic/assets/manifest.json`. `src/sonic/assets/LICENSE-CC0-1.0.txt` preserves the upstream audio licence text.

The OGG files are compiled into the application with Vite's `?inline` asset contract. `src/sonic/catalog.ts` rejects a non-data URI. Preview and export therefore have no CDN, runtime fetch, or disappearing stock-library dependency.

## Architecture

```text
StudioSettings.sound + motion + asset count + time
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
     semantic preview events   pure buildSonicTimeline()
             │                       │
     lazy SonicEngine         OfflineAudioContext
     user-gesture unlock       exact 48 kHz stereo bed
             │                       │
             └───────────┬───────────┘
                         ▼
              one bounded cue vocabulary
```

`src/sonic/plan.ts` derives passage events from the same slide geometry and distance evaluator as the carousel. It does not count animation frames. A 24 fps and 30 fps export of the same saved composition therefore uses the same cue times.

A seamless composition omits a cue at the exact repeat boundary. A non-seamless composition may receive one quiet settle cue when the final passage leaves enough room. Density thins events by semantic crossing count rather than random deletion. Variation is seeded from saved project state.

## Preview behavior

`SonicEngine` creates an `AudioContext` only after a trusted pointer or keyboard gesture. It decodes local assets lazily, caps concurrent voices, rate-limits repeated cues, and routes them through one master gain and conservative compressor. Muting changes gain immediately; it does not destroy project settings.

Sound is never the only carrier of state. Every cue accompanies an existing visible motion, control, notice, or error. Preview sound suspends with the document, mutes during export, and disposes every source/context with the studio.

The default is audible but restrained. Users can independently direct:

- material palette;
- master, passage, and interface level;
- passage density;
- bounded pitch variation;
- effects level beneath presenter speech;
- preview and MP4 inclusion.

## Export behavior

`renderSonicSoundtrack()` renders the pure event plan into an exact-length, 48 kHz stereo `AudioBuffer` with `OfflineAudioContext`. `exportMp4()` accepts that buffer as an explicit input.

Drift always writes at most one AAC track:

1. Sound-only export: the effects bed becomes the AAC source.
2. Presenter-only export: existing presenter PCM becomes the AAC source.
3. Mixed export: the effects bed is sample-aligned and mixed beneath presenter PCM before AAC encoding.

The PCM mixer performs explicit timestamp mapping, linear sample-rate interpolation, channel mapping, gain, and hard clipping. It does not rely on a second muxed track, wall-clock playback, `MediaRecorder`, or implicit browser mixing.

Audio-bearing MP4 remains capped at 30 fps because Drift's existing AAC priming/readback gate is only verified within one output frame at 24, 25, and 30 fps. Choosing 50 or 60 fps with exported effects fails visibly; it never drops sound silently.

Completed MP4 readback still verifies AAC codec, 48 kHz stereo shape, start/end timing, and decoded start/middle/end probes. The verification receipt identifies whether the track contains presenter speech, sound design, or both.

## Accessibility and restraint

- Preview can be muted in one action without opening the direction panel.
- Browser autoplay policy is respected; first-load audio never starts by surprise.
- Reduced-motion output produces no passage soundtrack.
- Sound is supplemental, never required to understand or operate Drift.
- Dense continuous loops are forbidden. Cues are short, rate-limited, and bounded to eight simultaneous voices.
- Export sound is explicit project state and can be disabled independently of preview sound.

## QA bar

The sound layer holds only when:

- all vendored files match the pinned SHA-256 manifest;
- production source contains no runtime sonic network path;
- v1 projects migrate to the v2 settings schema with authored defaults;
- invalid palettes and gains fail strict validation;
- the timeline is deterministic, density-monotonic, direction-aware, and seam-safe;
- PCM mixing covers resampling, channel mapping, offsets, and clipping;
- browser UI can arm, mute, audition, change palette, persist, and reopen settings;
- sound-only and mixed MP4s contain one verified AAC track;
- 50/60 fps audio attempts fail visibly;
- the complete existing unit, build, and Playwright gauntlet remains green.
