# Native Drift architecture

The active application is `macos/NativeCore`, an Apple-silicon Swift package targeting macOS 13.3. `DriftApplication` supplies AppKit's NSApplication/NSDocument lifecycle and SwiftUI controls. `DriftCore` owns typed projects, exact canvas/rates, history, authored recipe catalog, frame plans, scheduling and creative evaluation. `DriftNative` owns original media, ZIP64 storage, native decoding, Metal rendering, audio, output and bounded work.

`DriftDocumentController` resolves native `.pitched` files independently of legacy LaunchServices registrations and initializes documents on the main actor. Archive reads run on the opening queue. NSDocument still owns open registration, recent files, windows and save decisions. `DocumentStorage` publishes immutable save snapshots; document tickets reject stale completion after replacement or close. Recovery is private and untitled, never an implicit overwrite of a named file.

Projects preserve exact original bytes. `ProjectIO` streams ZIP64 through pinned libarchive; it rejects malformed paths, identities and schemas. MediaWorkspace grants ownership of extracted originals and validates their hashes. Decode representations and GPU caches are bounded; export uses original-backed data. libwebp handles static and animated WebP, including alpha and frame composition; libwebm/libvpx handle opaque VP8/VP9 WebM. AVFoundation, CoreMedia, CoreVideo and ImageIO supply native media and output services.

A shared `RenderSnapshot` and native frame plan drive preview, scrubbing, PNG and MP4. Source clocks are independent of presentation repeats. Pin, Spotlight and one finite global Closing remain independent. The renderer preserves the authored background/optical grammar in Metal, linear premultiplied surfaces and explicit output conversion. Project geometry is independent of both preview scale and the native Light/Dark window appearance.

Creative catalogs, recorded sound and shader sources remain under `src/` as authored build-time inputs. Generators retain the eight Worlds, 72 variants and recipe families. GLSL is translated to Metal at build time. The shipped app contains no browser, WebKit, JavaScript, WebAssembly, Node.js, FFmpeg executable, Homebrew library or runtime codec download. Legacy browser/hybrid files are reference/test history, not an alternative application path.

Exports own immutable snapshots even if another document becomes active. Output uses a staged publication transaction; cancellation or failure preserves prior destinations. Native verification decodes outputs, checks frame counts/timestamps/dimensions and audio, and refuses invalid output.

The app is local-first but is not presented as a sandbox security boundary. It has normal user-process access. Input parsers, ownership rules and transactional writes reduce specific risks; they do not contain a compromised native process. See the current threat model and exact release receipt for limits.
