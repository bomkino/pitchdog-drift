# Drift for macOS — user guide

Drift turns pitch-deck slides and one optional presenter video into directed, cinematic social-video compositions. The Mac app keeps the project local, uses the same deterministic renderer for preview and output, and replaces browser download prompts with native Finder workflows.

## Install a local build

From a clean checkout on macOS 13.3 or newer:

```bash
npm ci
npm run build:mac
open build/macos/Drift.app
```

The default build is universal for Apple Silicon and Intel. It is ad-hoc signed for local use. A public build requires Developer ID signing and Apple notarization; the local command does not pretend otherwise.

A disk image can be created after the app verifies:

```bash
npm run package:mac:dmg
```

Drag `Drift.app` from the disk image to Applications. Keep one copy open at a time. Drift deliberately prohibits multiple application instances because its current project store is single-editor.

## Start with your deck

The opening study exists to show motion immediately. It is not mixed into your real deck.

Use **File → Add Slides…**, click **Add slides**, or drop images onto the stage. Drift accepts PNG, JPEG, WebP, and AVIF. A batch can contain up to 200 moving slides, 64 MiB per file, and 80 MiB total. Reorder with drag, arrow controls, or keyboard focus. Removing a slide removes it from the current project but never deletes the source file in Finder.

Use **File → Add Presenter Video…** or the Presenter control for one MP4, MOV, or WebM video. The presenter can stay pinned while the deck moves. Drift checks video decode and audio export capability; it does not promise that every codec inside those containers is supported by the installed macOS version.

## Direct the scene

The main editor remains divided into Media, Stage, and Director surfaces.

- **Media** controls slide order, removal, and which image or presenter occupies the pinned frame.
- **Stage** is the live WebGL composition. Drag or use the wheel to move; Space plays or pauses; bracket keys step between slides; F toggles full-frame focus.
- **Director** controls aspect ratio, path, pace, spacing, depth, tilt, optical bend, focal point, continuous corners, borders, shadows, background, pinned-frame placement, and output settings.

Native menu equivalents exist for the most important actions. They are disabled while Drift is hashing media, replacing a project, or exporting, rather than firing into an ambiguous state.

## Save the project

Drift autosaves the current project and original media into its sandboxed local storage. That protects the current Mac, not portability.

Use **File → Save Portable Project…** to create a `.pitched` archive. The archive includes a versioned manifest, ordered asset metadata, original media, and SHA-256 digests. Open it through **File → Open Project…**, the Director panel, Finder, or “Open With Drift.” Drift verifies the archive before replacing the current project. A rejected project leaves the previous project intact.

Keep portable projects as intentional backups before major changes or app upgrades. A browser cache clear or app-container deletion can remove the autosaved current project; a `.pitched` file remains independent.

## Export finished media

### MP4 master

Use **File → Export MP4 Master…**. Choose the destination before rendering. Drift writes into a same-volume replacement directory and commits the selected filename only after encoding and final verification succeed.

The default output is 1080 × 1920, 30 fps, 8 seconds, SDR sRGB/Rec.709, H.264. With a presenter, audio is AAC only when system WebKit exposes a compatible encoder. The standalone app does not bundle the software FFmpeg AAC extension. On an older Mac, mute presenter audio, update macOS, or export PNG frames. Audio is never dropped silently.

MP4 completion includes container, dimensions, frame count, timestamps, duration, codec, colour, decoded probe frames, and presenter A/V timing checks. A file is not called finished merely because bytes were written.

### PNG still

Use **File → Export PNG Still…** for one alpha-capable frame. Transparent compositions must contain actual non-opaque pixels as well as visible pixels. The Mac save panel remains open until a destination is chosen; cancelling it writes nothing.

### PNG sequence

Use **File → Export PNG Sequence…** and choose an empty folder. Frames are numbered deterministically. Existing matching filenames are detected before output and are never overwritten. If rendering fails, Drift removes frames it created during that attempt. Full-resolution sequences should use a directory rather than the in-memory ZIP fallback.

After a successful native write, use **File → Reveal Last Export in Finder**.

## Cancellation and replacement safety

Cancelling an export removes its staged file and preserves any previously committed file at the chosen destination. Drift does not write a convincing partial MP4 over older work. Directory-sequence cancellation removes newly created frames where macOS permits and reports any cleanup failure.

Closing the window or quitting while export, project replacement, saving, failed-save recovery, or recovery lock is active triggers a warning. “Keep Working” is the safe default. The destructive button explicitly cancels or abandons the protected operation.

If the WebKit content process crashes, Drift aborts all native write sessions before offering a reload. The last autosaved project can reopen; an incomplete native output is not promoted to finished.

## Privacy and network behavior

Drift’s application sandbox grants only user-selected file access. The signed app has no network client or network server entitlement. HTTP, HTTPS, WebSocket, and FTP loads are blocked inside the WebView.

Links to source, licences, or documentation open in the default browser as a separate user action. Imported media, project data, and renders stay on the Mac unless you move or share them.

JavaScript receives opaque permission tokens, filenames, MIME types, sizes, and bytes. It never receives an absolute Finder path. The bridge exposes no shell, arbitrary native method, recursive deletion, URLSession, socket, or AppleScript surface.

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

**MP4 works, presenter audio does not.** The Mac has a system H.264 encoder but no compatible system AAC WebCodecs encoder. Mute the presenter or update macOS. Drift will not substitute silent output.

**Only PNG output is available.** System WebKit could not expose H.264 at the requested dimensions. Reduce dimensions, update macOS, or use PNG.

**A project is recovery locked.** The saved project could not hydrate safely. Export the recovery bundle if offered, then open a verified replacement. Do not assume the demo slides replaced the damaged saved project.

**A save panel was cancelled.** No native destination was committed. A browser-style success message is suppressed while the panel is unresolved; the native status pill reports cancellation.

**The app reloads after a visual-engine crash.** Native staging files were rolled back. Reopen the autosaved project, then repeat the export. Copy diagnostics from the Drift menu before filing an issue.

**The app will not open on another Mac.** An ad-hoc local build is not a notarized public release. Build from source on that Mac or use a properly Developer-ID-signed and notarized release when one is explicitly published.
