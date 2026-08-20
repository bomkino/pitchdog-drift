# Third-party notices

Drift’s source licence does not replace dependency licences. Exact versions and transitive packages are locked in `package-lock.json`.

| Dependency | Version | Licence | Role |
| --- | --- | --- | --- |
| React / React DOM | 19.2.8 | MIT | Interface |
| Three.js | 0.185.1 | MIT | WebGL scene and resources |
| Mediabunny | 1.55.1 | MPL-2.0 | Media decode, encode, mux, and readback |
| @mediabunny/aac-encoder | 1.55.1 | MPL-2.0 | Optional software AAC encoder extension for the ordinary browser source build |
| FFmpeg `libavcodec` / `libavutil` | Embedded in the AAC extension’s WASM | LGPL-2.1-or-later under the extension’s published non-GPL configure flags | AAC implementation used only when that extension is bundled |
| fflate | 0.8.3 | MIT | Portable project and PNG-sequence ZIPs |
| Apple AppKit, WebKit, Foundation, UniformTypeIdentifiers | System frameworks | Apple platform terms | Standalone macOS host, sandboxed panels, WebView, and document integration |

Development tooling includes TypeScript, Vite, Vitest, Playwright, Swift, Python, and React type packages under their respective upstream licences or platform terms.

No third-party font, stock photograph, presenter clip, proprietary shader, Electron runtime, update daemon, or cloud SDK is bundled.

## Two distinct build policies

### Ordinary browser build

The repository’s default `npm run build` preserves `@mediabunny/aac-encoder`. The extension states that it embeds a size-optimised FFmpeg AAC encoder compiled to WebAssembly. A party that distributes a compiled browser bundle containing that binary must satisfy the extension licence and FFmpeg’s applicable LGPL corresponding-source, build-provenance, notice, and relinking obligations.

Source publication and a package lock do not automatically satisfy every obligation attached to a redistributed compiled codec binary.

### Standalone macOS build

The standalone app runs `vite build --mode macos`. In that mode, Vite aliases `@mediabunny/aac-encoder` to `src/lib/macosAacEncoder.ts`, whose `registerAacEncoder()` function is intentionally empty. Mediabunny may use AAC only where the installed system WebKit exposes a compatible native encoder.

The app builder and verifier fail if `Drift.app/Contents/Resources/Web` contains:

- any `.wasm` file;
- `libavcodec`;
- an FFmpeg AAC marker.

Therefore the intended `Drift.app` and local DMG do **not** distribute the extension’s FFmpeg WebAssembly binary. They use macOS system media encoders only.

This policy is a capability trade-off, not a silent fallback. On a Mac without compatible system AAC:

- H.264 video may remain available;
- presenter audio export fails visibly;
- the user can mute the presenter, update macOS, or export PNG frames;
- Drift never claims that a silent file contains requested presenter audio.

## macOS bundle notices

`Drift.app` copies the following into `Contents/Resources/Legal`:

- GNU AGPL-3.0-or-later licence text;
- repository NOTICE;
- asset licence;
- this third-party notice;
- trademark policy.

It also copies the Mac architecture, user guide, product contract, threat model, QA gauntlet, and release checklist into `Contents/Resources/Documentation`.

The build manifest covers the native executable and bundled resources. It proves byte consistency of one build; it does not replace dependency licence review.

## Public binary release boundary

Before publishing a browser bundle that includes the software AAC extension, complete a current FFmpeg/LGPL compliance review and provide the required corresponding source and build materials.

Before publishing the system-codec-only Mac app:

1. verify that the exact candidate contains no software codec WebAssembly;
2. preserve these notices in the signed and notarized bundle;
3. provide complete corresponding source for Drift at the released revision under AGPL-3.0-or-later;
4. preserve third-party source offers and notices required by Mediabunny, React, Three.js, fflate, and the build tooling;
5. complete Developer ID signing, notarization, Gatekeeper testing, and the repository’s Mac release checklist;
6. obtain explicit authority to publish the binary.

The Mac policy removes the known FFmpeg binary-distribution blocker. It does not erase the obligations of Drift’s own AGPL licence or any other dependency.
