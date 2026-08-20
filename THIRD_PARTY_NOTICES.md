# Third-party notices

Drift’s source licence does not replace dependency or asset licences. Exact
package versions and transitive packages are locked in `package-lock.json`;
exact sound-file provenance is locked in `src/sonic/assets/manifest.json`.

| Dependency / asset | Version | Licence | Role |
| --- | --- | --- | --- |
| React / React DOM | 19.2.8 | MIT | Interface |
| Three.js | 0.185.1 | MIT | WebGL scene and resources |
| Mediabunny | 1.55.1 | MPL-2.0 | Media decode, encode, mux, and readback |
| @mediabunny/aac-encoder | 1.55.1 | MPL-2.0 | Software AAC encoder extension |
| FFmpeg `libavcodec` / `libavutil` | Embedded in the AAC extension’s WASM | LGPL-2.1-or-later under the extension’s published non-GPL configure flags | AAC encoding implementation |
| fflate | 0.8.3 | MIT | Portable project and PNG-sequence ZIPs |
| Kenney Casino Audio | pinned files | CC0-1.0 | Card slides, placements, and shoves |
| Kenney RPG Audio | pinned files | CC0-1.0 | Paper, cloth, leather, book, and metal foley |
| Kenney Impact Sounds | pinned files | CC0-1.0 | Restrained soft, hard, and wood impacts |

The Kenney files are transported from `Daarko/sparkstream-sounds` at exact
revision `a7a3ee178d2ec48f4354782f244ab777a0e238df`. Canonical source pages,
licence copies, hashes, and per-file purposes are preserved with the assets.

Development tooling includes TypeScript, Vite, Vitest, Playwright, Python, and
React type packages under their respective upstream licences.

No third-party font, stock photograph, presenter clip, proprietary shader,
music track, generated UI sound, or remote runtime sound is bundled.

## AAC / FFmpeg distribution boundary

`@mediabunny/aac-encoder` states that it embeds a size-optimised FFmpeg AAC
encoder compiled to WASM. FFmpeg’s
[official legal guidance](https://ffmpeg.org/legal.html) identifies its default
terms as LGPL-2.1-or-later and requires a distributor to provide the exact
corresponding source and build provenance for the binary it ships.

This GitHub project publishes source and a package lock only. `node_modules/`,
Vite `dist/`, and rendered application bundles are excluded. No hosted or
downloadable compiled build is released from this repository yet.

Before distributing a compiled Drift build, a maintainer must record the exact
FFmpeg source revision, configure command, patches, and relink materials used
by the embedded WASM; provide the corresponding source and LGPL text alongside
that build; and satisfy the current FFmpeg compliance checklist. Until that
evidence exists, the verified publication scope is the source repository and
local builds—not a binary release or hosted deployment.
