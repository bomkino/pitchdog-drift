# V2 long-export QA — 2026-08-23

Status: green in the opt-in headed installed-Chrome acceptance lane. This is not part of default CI.

The durable lane is `playwright.long-export.config.ts`. It deliberately does not use the default headless SwiftShader launch: that environment encoded every tested plain and V2 sample as SMPTE 170M and the production verifier correctly rejected it. Headed installed Chrome, with no ANGLE override, reads the same strict exports back as SDR Rec.709.

Run the quick gate:

```sh
npm run qa:long-export
```

Run all three physical cases:

```sh
npm run qa:long-export:full
```

## Final evidence

Latest full machine receipt: `output/qa/v2-long-export/2026-08-23T09-25-24.105Z/receipt.json` (ignored output, not source controlled).

The pure Project V4 matrix passed 8/8 at 24 fps:

| Duration | Slides | Aspect | Exact frames |
| ---: | ---: | :---: | ---: |
| 30s | 8 | 9:16 | 720 |
| 30s | 8 | 16:9 | 720 |
| 30s | 40 | 9:16 | 720 |
| 30s | 40 | 16:9 | 720 |
| 60s | 40 | 9:16 | 1,440 |
| 60s | 40 | 16:9 | 1,440 |
| 180s | 40 | 9:16 | 4,320 |
| 180s | 200 | 9:16 | 4,320 |

The physical lane used actual V2 WebGL rendering, H.264 encoding, and mandatory MP4 readback at deliberately small dimensions:

| Case | Physical size | Frames | Strict duration | MP4 bytes | Peak texture cache | Peak decodes | Elapsed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 30s / 8 slides / 9:16 | 90×160 | 720 | 30s | 1,701,476 | 8 | 4 | 4,006ms |
| 60s / 40 slides / 16:9 | 160×90 | 1,440 | 60s | 2,212,131 | 24 | 4 | 5,408ms |
| 180s / 200 slides / 9:16 | 72×128 | 4,320 | 180s | 8,461,665 | 24 | 4 | 17,919ms |

All three artifacts verified H.264 frame count, fixed `n/fps` timestamps, first/middle/last decode, opacity, exact duration, and `{ primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false }`. Their SHA-256 values are recorded in the receipt.

The 180-second/200-slide cancellation probe stopped at completed frame 12, returned `CANCELLED`, published no artifact, retained the same WebGL context, and returned to zero cached textures plus zero pending, queued, or active decodes.

After forced garbage collection, JS heap was 29,846,384 bytes before and 31,752,684 bytes after the full gate: a 1,906,300-byte delta inside the 33,554,432-byte allowance. Every physical engine also returned renderer textures and geometries to no more than its pre-export baseline after project unload. No context-loss or context-restoration event occurred.

The full headed test took 42.9 seconds; Playwright completed in 48.4 seconds. The source fingerprint was `b6a019d57e01151f54181dd724a07fe0b55728c2528de5545b5adbbf1ef04de5`.

## Boundary

This proves exact 24 fps frame planning at nominal 1080p dimensions and complete physical exports at safe small dimensions. It does not prove 1080p/4K long-export throughput or RSS, Intel behavior, encoder behavior outside this installed headed-Chrome lane, or diverse source-image decode cost: the 200 asset identities deliberately share one deterministic 32×32 PNG fixture. Those are separate performance and platform gates.
