# Drift for macOS — QA gauntlet

This is a falsification plan, not a ceremonial checklist. Automated checks establish source and bundle properties. They do not substitute for using the finished application with real decks on real Macs.

## Evidence classes

1. **Source contract:** static files, scripts, security markers, and command parity.
2. **Compilation:** Swift builds for `arm64` and `x86_64`; JavaScript, TypeScript, Python, and shell syntax hold.
3. **Bundle:** plist, resources, icon, signature, hardened runtime, entitlements, architecture, codec policy, and checksum manifest.
4. **Native behavior:** file-broker self-test and packaged WebView self-test.
5. **Editor behavior:** existing Vitest and Chromium E2E suite.
6. **Media evidence:** decoded MP4/PNG outputs generated inside `Drift.app`.
7. **Human review:** visual pacing, legibility, native fit, accessibility, and failure clarity.

Every receipt must say which class produced a claim.

## Automated clean-checkout gate

```bash
npm ci
npm run check
npm run build:mac
npm run verify:mac
npm run package:mac:dmg
```

Expected facts:

- TypeScript and deterministic unit tests pass.
- Production browser build passes.
- Native source contract passes on non-macOS CI.
- Dedicated macOS web build uses relative assets and the system-codec AAC stub.
- No `.wasm`, FFmpeg AAC, or `libavcodec` marker exists in the bundled web runtime.
- Swift compiles both architecture slices against the minimum deployment target.
- App bundle is ad-hoc or Developer-ID signed with hardened runtime.
- Signed entitlements contain App Sandbox and user-selected read/write only.
- Signed entitlements contain no network client or server entitlement.
- Build manifest byte-checks every executable and resource except itself.
- Native smoke, file-broker, and WebView self-tests pass.
- DMG verifies and its SHA-256 receipt matches.
- CI does not upload the compiled app or DMG.

## Native file-broker gauntlet

The executable `--native-self-test` must directly prove:

- A staged replacement atomically changes the destination only at close.
- An aborted replacement preserves the previously committed destination bytes.
- Staged bytes are removed after abort.
- Seek, write, truncate, synchronize, close, and readback remain consistent.
- A file created through a selected directory can be written, read, and removed.
- `../` traversal is rejected.
- symbolic-link imports or destinations are rejected.
- output-cap violations fail visibly.
- repeated abort is harmless.

Add tests whenever a broker bug is found. Do not replace byte evidence with comments.

## Packaged WebView gauntlet

The executable `--webview-self-test` loads the copied `Resources/Web/index.html`, not the development server. It must observe:

- `file:` runtime.
- React’s `main.app` root.
- bridge version 2 marker.
- native save picker.
- native directory picker.
- no root-absolute asset failure.

This probe may run in a nonpersistent website data store. It must not touch the user’s current project.

## First-launch journey

On a fresh app container:

1. Open from Applications, not Xcode or Vite.
2. Confirm a single window appears, restores sensible size, and traffic lights do not overlap controls.
3. Confirm the study scene appears without a server or network prompt.
4. Confirm the native capability status resolves rather than remaining “checking.”
5. Close the window, click the Dock icon, and confirm the one studio window returns.
6. Quit and reopen. Confirm the current local project survives.

Repeat at 1440 × 900, 1024 × 768, and the minimum 960 × 620 window.

## Import journey

Test image batches of 0, 1, 2, 12, 200, and 201 items. Include mixed 16:9, 4:3, 1:1, 4:5, and 9:16 images; filenames with spaces, emoji, long Unicode, and duplicate display names; corrupt files; symlinks; 64 MiB boundary; and 80 MiB aggregate boundary.

Verify:

- File → Add Slides and the in-app button open equivalent native panels.
- Accept filters are truthful.
- Cancellation changes nothing.
- Demos are replaced, not mixed, by the first real deck.
- Partial decode failures reject only bad files and report counts.
- source files in Finder are never modified or deleted.
- drag/drop remains functional.
- reordering and pinning persist after relaunch.

Test presenter MP4, MOV, WebM, audio-only media, unsupported codec, corrupt metadata, short duration, no audio, mono audio, and long audio. Only one presenter may be active.

## Portable project journey

- Save a `.pitched` project through File → Save Portable Project.
- Cancel the native panel and verify no destination exists and no false success remains.
- Open the archive through the app control, File → Open Project, Finder double-click, and “Open With.”
- Clear app-container website data in a test copy, then reopen the portable project.
- Corrupt manifest JSON, asset bytes, digest, path, size, engine version, theme version, and references one at a time.
- Verify every invalid archive leaves the current project unchanged.
- Open project A, then trigger delayed A followed by B; B must win.
- Confirm Finder-open while the app is launching queues until the React importer exists.

## MP4 export journey

Use 1080 × 1920, 1080 × 1350, 1080 × 1080, 1920 × 1080, a small test size, and a near-GPU-limit size. Test 24, 25, 30, 50, and 60 fps; 3, 8, and 30 seconds; every path and background; 1, 2, 12, and 200 slides; pinned image; muted presenter; and presenter audio where system AAC is available.

For every completed master, independently inspect:

- nonzero file size;
- MP4 container;
- H.264 video;
- requested dimensions;
- exact fixed-step frame count;
- `n / fps` timestamps;
- requested duration;
- first/middle/last frame decode;
- Rec.709/sRGB-compatible colour metadata;
- no alpha claim;
- expected audio-track presence or absence;
- AAC sample rate and channels when present;
- start/end A/V offset within one frame;
- visual motion across extracted frames;
- pinned presenter changes over time rather than freezing.

On a Mac without system AAC, presenter-audio output must fail before a convincing silent master is returned. Muting the presenter must permit video-only output if H.264 remains supported.

## Cancellation and replacement journey

For MP4 and still output:

1. Place a known file at the chosen destination and record its SHA-256.
2. Begin a replacement export.
3. Cancel during preparation, frame rendering, encoding, and finalization.
4. Confirm the old destination retains the exact SHA-256 or, only if the platform committed despite the cancellation race, a visibly neutralized zero-byte file is reported. The native broker’s intended path is preservation through staged replacement.
5. Confirm no replacement-directory debris remains after normal abort.

For PNG sequences:

- choose a nonempty folder containing a colliding frame name and confirm preflight refusal;
- cancel after several frames and confirm created frames are removed;
- deny removal permission and confirm cleanup failure lists exact filenames;
- verify unrelated files remain untouched.

## App lifecycle and failure journey

- Attempt Close and Quit during export, project import, local save, failed save, and recovery lock.
- Confirm “Keep Working” is the safe first button.
- Choose destructive close and confirm native staging writes abort.
- Force WebKit content-process termination and confirm rollback plus Reload/Quit alert.
- Sleep and wake during preview and during a paused export test.
- Disconnect a removable export volume during write and confirm visible failure.
- Fill the destination volume and confirm `QuotaExceededError` or a clear native write failure.
- Revoke a security-scoped destination between selection and write.
- Trigger WebGL context loss/restore inside the app.
- Deny WebGL2 and confirm DOM fallback preserves projects but blocks cinematic output.

## Native fit and accessibility review

- VoiceOver reads Media, Stage, Director, transport, export progress, native warnings, and status messages in a coherent order.
- Full Keyboard Access reaches every control and menu command.
- Focus is visible at normal and 200% interface magnification.
- Reduced-motion preference pauses vestibular preview effects without silently changing the saved export choice.
- Native titlebar inset works in light/dark appearance and at minimum width.
- macOS full screen, app full-frame mode, and WebKit magnification remain distinct and reversible.
- Save/open panels have clear prompts, allowed types, and safe default buttons.
- Error copy states what happened, whether existing work survived, and what the user can do next.
- No status says “saved” before a native destination commits.

## Hardware matrix

Before public binary release, run at minimum:

- Apple Silicon Mac on the oldest supported macOS version.
- Apple Silicon Mac on the current macOS version.
- Intel Mac or an independently verified Intel execution environment on a supported macOS version.
- One low-memory machine under a 30-second 1080 × 1920 export.
- One external or removable destination volume.

CI cross-compilation of `x86_64` is evidence that the slice builds. It is not evidence that Intel GPU, WebKit, and encoder behavior have been exercised.

## Release receipt

Record:

- source commit and tree;
- package-lock digest;
- app and DMG SHA-256;
- architecture list;
- extracted entitlements;
- code-sign identity and notarization submission ID;
- macOS and hardware for each manual run;
- exact automated command output;
- decoded media metadata and hashes;
- screenshots or video of first launch, import, export, cancel, recovery, and Finder-open;
- known limits and untested surfaces.

A clean receipt may still conclude “not release-ready.” That is a useful result. A vague receipt must never conclude “done.”
