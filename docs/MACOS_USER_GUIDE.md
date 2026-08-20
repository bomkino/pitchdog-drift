# Drift for macOS — user guide

Drift turns pitch-deck slides and one optional presenter video into directed, cinematic social-video compositions. The Mac app keeps the project local, uses the same deterministic renderer for preview and output, and replaces browser download prompts with Finder-native workflows.

## Install a local build

From a clean checkout on macOS 13.3 or newer:

```bash
npm ci
npm run build:mac
open build/macos/Drift.app
```

The default build contains Apple Silicon and Intel slices. It is ad-hoc signed for local use. A public build requires Developer ID signing and Apple notarization; the local command does not pretend otherwise.

Create a local disk image after the app verifies:

```bash
npm run package:mac:dmg
```

Drag `Drift.app` from the disk image to Applications. Keep one copy open at a time. Drift deliberately prohibits multiple application instances because its current project store is single-editor.

## First launch

A built-in study opens immediately so the stage is alive before you import anything. It is starter material, not part of your future deck. The first successful real-slide import replaces the study instead of mixing the two.

No account, login, server, browser extension, cloud folder, or network permission is required.

The header reports three distinct truths:

- whether the cinematic WebGL renderer is ready;
- whether H.264 export is available for the chosen output settings;
- whether the current project is loading, saving, saved, failed, or recovery locked.

“Saved locally” refers to the app-container project. It does not mean a portable `.pitched` backup has been created.

## Start with your deck

Use **File → Add Slides…**, click **Add slides**, or drop images onto the stage. Drift accepts the image formats the current WebKit runtime can decode, including PNG, JPEG, WebP, and AVIF on supported systems.

Current limits:

- up to 200 moving slides;
- 64 MiB per portable-project asset;
- 80 MiB total portable-project media;
- 96 MiB portable archive input.

A larger or unsupported file fails visibly rather than partially entering the project. Reorder with drag, arrow controls, or keyboard focus. Removing a slide changes the current project only; it never deletes the source file in Finder.

Use **File → Add Presenter Video…** or the Presenter control for one MP4, MOV, or WebM video. The presenter can stay pinned while the deck moves. Container support does not guarantee that every embedded codec can be decoded. Drift validates the video before mutating the project.

## Direct the scene

The editor has three surfaces:

- **Media** — slide order, removal, presenter media, and pinned-frame ownership.
- **Stage** — the live WebGL composition. Drag or use the wheel to move; Space plays or pauses; previous/next commands step the track; F toggles full-frame focus.
- **Director** — stage/output ratios, path, pace, spacing, depth, tilt, optical bend, focal point, continuous corners, borders, shadows, background, pinned-frame placement, and output settings.

Native menu equivalents exist for the important actions. They use the renderer’s reported state rather than guessing from the visible interface. Commands disable while Drift is hashing media, replacing a project, saving protected state, or exporting.

App full-frame focus and macOS full screen are separate:

- **F** hides studio chrome around the composition.
- **Control–Command–F** enters macOS full screen.

## Save the project

Drift autosaves the current project and original media into sandboxed app-container storage. That protects the current Mac. It is not a collaboration format or durable external backup.

Use **File → Save Portable Project…** to create a `.pitched` archive. The archive contains:

- a versioned manifest;
- engine and theme versions;
- ordered media references;
- original media bytes;
- SHA-256 digests;
- validated project settings.

Open it through **File → Open Project…**, the Director panel, Finder, or “Open With Drift.” Finder-open events arriving while the application is launching are queued until React’s importer is ready.

Drift verifies an archive before replacing the open project. A malformed, oversized, contradictory, unsupported, or hash-mismatched project is rejected without mutating the current valid one.

Keep `.pitched` backups before major changes or app upgrades. Deleting the app container or clearing website data can remove the autosaved current project; an external `.pitched` file remains independent.

## Export finished media

### MP4 master

Use **File → Export MP4 Master…**. Choose the destination before rendering.

The default output is:

```text
1080 × 1920
30 fps
8 seconds
SDR sRGB / Rec.709
H.264 video at 16 Mbit/s
AAC-LC presenter audio at 48 kHz stereo / 192 kbit/s when enabled
```

The standalone app uses two system paths:

- WKWebView encodes H.264 video.
- Drift’s bounded native bridge sends presenter PCM to Apple’s software AAC-LC encoder in AudioToolbox.

The app does **not** bundle the browser build’s FFmpeg-derived AAC WebAssembly extension.

Presenter-audio exports support 24, 25, or 30 fps. For 50 or 60 fps, mute presenter audio. Drift never silently deletes audio to make an export appear successful.

MP4 completion checks:

- nonempty MP4 container;
- H.264/AVC video;
- exact requested dimensions;
- exact fixed-step frame count;
- `n / fps` packet timestamps and one-frame durations;
- expected timeline duration;
- Rec.709/sRGB-compatible colour metadata;
- first, middle, and final frame decode;
- no false alpha claim;
- expected audio-track presence;
- AAC codec, sample rate, and channel count;
- presenter start/end A/V timing within one output frame.

A file is not called finished merely because bytes were written.

### Destination replacement

The chosen destination is not truncated when rendering begins.

1. Drift creates a staging file in Foundation’s item-replacement directory on the destination volume.
2. Export streams into the staging file.
3. The completed bytes are reopened and verified through the same opaque native grant.
4. Only after success does the native broker commit the selected filename.
5. Cancellation or failure removes staging and preserves the previous destination.

The status message should state whether older work survived. “Cancelled” never means “probably okay.”

### PNG still

Use **File → Export PNG Still…** for one alpha-capable frame. Transparent output must contain actual non-opaque pixels as well as visible pixels. Cancelling the save panel writes nothing.

### PNG sequence

Use **File → Export PNG Sequence…** and choose a directory. Frames are numbered deterministically.

Before rendering, Drift checks the full expected filename set. Existing matching files are never overwritten. If rendering fails, Drift removes only frames created by that attempt and reports any cleanup failure by filename.

Use a directory for full-resolution sequences. The in-memory ZIP fallback has a strict memory ceiling and may reject otherwise valid long or large sequences.

### Reveal output

After a successful native commit, use **File → Reveal Last Export in Finder**. The command refers only to the last committed destination, never to a staged or cancelled one.

## Presenter audio truth

The native AAC bridge is narrow by design:

- AAC-LC only;
- 48 kHz;
- stereo;
- 192 kbit/s target;
- bounded PCM chunks;
- bounded session duration and memory;
- explicit packet sizes;
- AudioSpecificConfig and magic-cookie metadata;
- leading priming and trailing padding counts;
- exact frame-accounting validation.

The muxer receives negative priming timestamps rather than a convenient lie that audio begins at zero. Final MP4 readback then checks the actual audio timeline against video.

A native AAC failure can come from unsupported system behavior, bridge/session corruption, memory pressure, invalid presenter audio, or receipt mismatch. The remedy is not always “update macOS.” Drift reports the failure; muting presenter audio remains the explicit video-only route.

## Cancellation and protected work

An active export can be cancelled from the progress overlay or native menu. Drift aborts the renderer and native write session, then reports cleanup.

Closing the window or quitting during any of these states triggers a warning:

- export;
- project import/replacement;
- local save;
- failed local save;
- recovery lock.

**Keep Working** is the safe default. The destructive action explicitly says that it will cancel or abandon protected work.

If the WebKit content process terminates, Drift aborts every native write session before offering Reload or Quit. Reload uses persistent app-container storage; a staged file is never promoted to completed output.

## Recovery lock

A saved project enters recovery lock when storage exists but cannot be safely hydrated. Demo slides may render as a visual fallback, but autosave remains disabled so they cannot overwrite the preserved saved project.

When a recovery bundle is available, save it before opening a replacement. A recovery export re-verifies and repackages preserved media; it does not claim that the archive is byte-identical to an earlier `.pitched` file.

## Privacy and filesystem boundary

The signed app uses App Sandbox with user-selected read/write access. It has no network client or server entitlement.

Inside Drift:

- HTTP and HTTPS loads are blocked;
- WebSocket and FTP loads are blocked;
- bundled files and generated Blob/data media remain available;
- deliberate source, licence, and documentation links open in the default browser.

Imported media, projects, and renders remain on the Mac unless you move or share them.

JavaScript receives opaque permission tokens, leaf filenames, MIME types, sizes, dates, and bytes. It never receives an absolute Finder path. The bridge exposes no shell, AppleScript, URLSession, socket, selector reflection, arbitrary method dispatch, or recursive deletion.

## Useful Mac commands

- **Command–O:** Open `.pitched` project
- **Shift–Command–O:** Add slides
- **Option–Command–O:** Add presenter video
- **Command–S:** Save portable project
- **Command–E:** Export MP4 master
- **Shift–Command–E:** Export PNG still
- **Option–Command–E:** Export PNG sequence
- **Space:** Play or pause
- **[ / ]:** Previous or next slide
- **F:** Full-frame focus
- **Command–0 / + / –:** Reset, increase, or decrease interface magnification
- **Control–Command–F:** macOS full screen

## Troubleshooting

### MP4 is unavailable

WKWebView could not encode H.264 at the chosen dimensions or settings. Reduce output dimensions, use a supported even size, or export PNG. A macOS update may change capability, but Drift probes the actual request rather than assuming from the OS version.

### MP4 works, presenter audio fails

H.264 and AAC are separate paths. The video encoder succeeded, but the native AudioToolbox AAC session, presenter decode, packet receipt, mux, or A/V verification did not. Read the exact error. Mute presenter audio for an explicit video-only export; do not expect Drift to silently remove it.

### Audio export is blocked at 50/60 fps

Presenter audio is limited to 30 fps or lower. Choose 24, 25, or 30 fps, or mute the presenter.

### A project is recovery locked

The saved project could not hydrate safely. Save the recovery bundle when available, then open a verified replacement. Do not assume the visible demo replaced the damaged saved project.

### A save panel was cancelled

No native destination was committed. Drift suppresses browser-style success while the panel is unresolved and reports native cancellation separately.

### An export was cancelled over an existing file

The native staged-replacement path is designed to preserve the existing destination byte-for-byte. A cleanup error must be reported explicitly. Verify the destination before discarding a backup if the volume disconnected or denied access during cleanup.

### The app reloads after a visual-engine crash

Native staging sessions were aborted first. Reopen the autosaved project, inspect the notice, and repeat the export. Use **Drift → Copy Diagnostics** before filing an issue; diagnostics must not contain deck contents or absolute file paths.

### The app will not open on another Mac

An ad-hoc local build is not a notarized public release. Build from source on that Mac or use a properly Developer-ID-signed and notarized release when one is explicitly published.
