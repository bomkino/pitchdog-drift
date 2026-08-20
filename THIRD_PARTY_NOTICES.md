# Third-party notices

Drift’s source licence does not replace dependency licences. Exact JavaScript versions and transitive packages are locked in `package-lock.json`. A compiled artifact must also be evaluated against the code it actually contains; the browser bundle and standalone Mac bundle deliberately differ in their AAC implementation.

## Source dependencies

| Dependency | Version | Licence | Role |
| --- | --- | --- | --- |
| React / React DOM | 19.2.8 | MIT | Interface |
| Three.js | 0.185.1 | MIT | WebGL scene and resources |
| Mediabunny | 1.55.1 | MPL-2.0 | Media decode, encode, mux, readback, and custom encoder contracts |
| `@mediabunny/aac-encoder` | 1.55.1 | MPL-2.0 | Browser-build software AAC encoder extension |
| FFmpeg `libavcodec` / `libavutil` | Embedded in the browser AAC extension’s WebAssembly | LGPL-2.1-or-later under the extension’s published non-GPL configure flags | Browser-build AAC implementation |
| fflate | 0.8.3 | MIT | Portable project and PNG-sequence ZIPs |

Development tooling includes TypeScript, Vite, Vitest, Playwright, React type packages, and GitHub Actions under their respective upstream licences.

No third-party font, stock photograph, presenter clip, proprietary shader, analytics SDK, updater SDK, cloud client, or Electron runtime is bundled by this repository.

## Browser-build AAC boundary

The normal web build imports `@mediabunny/aac-encoder`. The package states that it embeds a size-optimised FFmpeg AAC encoder compiled to WebAssembly.

FFmpeg’s official legal guidance identifies its default terms as LGPL-2.1-or-later and requires distributors of the binary to provide the exact corresponding source and build provenance, including applicable configure flags, patches, and relink materials.

Therefore a hosted or downloadable compiled **browser build** that contains this WebAssembly path must ship the required LGPL materials. A package lock and a link to upstream are not enough by themselves.

The repository may publish source without publishing `node_modules/`, `dist/`, or the generated WebAssembly binary. That source-only publication does not authorize a maintainer to publish a compiled web bundle without completing the FFmpeg compliance work.

## Standalone macOS AAC boundary

The standalone Mac build uses `vite build --mode macos`. In that mode, `@mediabunny/aac-encoder` resolves to the project-authored adapter `src/lib/macosAacEncoder.ts` rather than the extension package’s WebAssembly implementation.

The adapter registers a Mediabunny custom audio encoder and communicates through Drift’s bounded typed bridge with `macos/App/NativeAacEncoder.swift`. The Swift implementation uses Apple’s AudioToolbox framework and explicitly requests Apple’s software AAC-LC encoder. It returns encoded access units plus AudioSpecificConfig, magic-cookie, priming, padding, and frame-accounting metadata.

The Mac build and verifier reject:

- any `.wasm` resource;
- source maps in the finished runtime;
- references to `@mediabunny/aac-encoder` in packaged Web resources;
- FFmpeg and `libavcodec` runtime markers;
- non-system linked dynamic libraries.

A verified `Drift.app` therefore does **not** distribute the FFmpeg-derived AAC WebAssembly binary and does not need to provide corresponding source for a binary it does not contain. It still must comply with every dependency and project licence that remains in the app, including Mediabunny’s MPL-2.0 terms, MIT dependencies, AGPL project source, CC BY-SA demo assets, notices, and trademark conditions.

Apple system frameworks are provided by macOS and are not copied into the application bundle.

## Native application legal bundle

Release-grade Mac packaging copies these materials into `Drift.app/Contents/Resources/Legal/`:

- `LICENSE`;
- `NOTICE`;
- `ASSET-LICENSE.md`;
- `THIRD_PARTY_NOTICES.md`;
- `TRADEMARKS.md`;
- macOS product, user, threat, QA, and release documentation;
- a CycloneDX source-dependency SBOM.

The release verifier checks that the legal bundle and SBOM are present before accepting a candidate.

## Distribution rule

“Builds locally” is a technical fact, not a legal conclusion.

Before distributing any compiled Drift artifact, inspect the exact artifact rather than assuming which dependency path it contains:

- a browser bundle containing the software AAC extension requires the FFmpeg/LGPL compliance package;
- a verified standalone Mac bundle must prove that extension and its WebAssembly are absent;
- both forms retain the licences and notices for every component they do ship;
- a public binary additionally needs the signing, notarization, checksum, source-availability, and publication authorization described in the release documentation.
