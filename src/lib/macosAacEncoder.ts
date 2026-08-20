// The standalone macOS bundle deliberately uses only system WebCodecs encoders.
// Vite aliases @mediabunny/aac-encoder to this module in `--mode macos`, so the
// distributable app does not contain the extension's embedded FFmpeg WASM.
// Mediabunny will still discover a native AAC AudioEncoder where system WebKit
// provides one. On older macOS versions, presenter audio fails visibly and the
// user can mute it or export PNG frames; audio is never dropped silently.
export function registerAacEncoder(): void {
  // Intentionally empty.
}
