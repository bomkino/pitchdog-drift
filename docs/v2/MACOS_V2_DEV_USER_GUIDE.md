# Drift V2 Dev for macOS — user guide

Drift V2 Dev is the isolated development app for the V2 Director's Cut candidate. It can run beside the production `Drift.app` because it uses a different bundle identifier, App Sandbox container, WebKit data store, cache namespace, and local project database.

Drift V2 Dev does **not** open, save, register, or own `.pitched` documents. Use `/Applications/Drift.app` for real projects and portable `.pitched` backups.

## Build and verify

Build only from a clean, committed checkout on macOS 13.3 or newer:

```bash
npm ci
npm run build:mac:v2-dev
npm run verify:mac:v2-dev
open "build/macos/v2-dev/Drift V2 Dev.app"
```

The local development bundle is ad-hoc signed. It is not a Developer ID release, notarised download, GitHub Release, or production replacement.

## Safe testing boundary

- Import copied, synthetic, or publication-safe slide images.
- Add one copied presenter image or video when testing protected-frame behavior.
- Direct and export disposable PNG stills, PNG sequences, or MP4 proofs.
- Keep `/Applications/Drift.app` installed for production work.
- Never treat V2 Dev local autosave as a durable backup or collaboration format.

Portable-project Open and Save commands stay disabled. Finder document ownership remains with `Drift.app`. V2 Dev may use its own isolated local autosave only; deleting its container can remove that disposable state.

## Fast directing path

1. Add copied or publication-safe slide images in **Slides**.
2. Pick one of the eight authored **Worlds** and a Restrained, Directed, or Fever pressure level.
3. Choose the output shape. Authored 9:16, 4:5, 1:1, and 16:9 recipes recompose rather than merely crop.
4. Press Play and use **Direct** only where the World needs intervention.
5. In **Master**, choose duration, frame rate, entry, exit, repeat behavior, and optional sound before export.

World application is non-compounding and records the changed domains. **Undo**, **Redo**, and temporary **A/B** comparison sit beside the World controls. A/B changes only what you see; it does not replace autosave or export truth.

## Pinned slide or presenter

The pinned frame is optional and off by default. Once enabled, you can control its track membership, protected/in-scene behavior, width, X/Y position, safe inset, source/custom aspect, cover/contain fit, focal point, matte, continuous corners, border, shadow, source trim, entry time, presenter level, and mute.

Use **Protected** for a talking-head or still that should remain legible while the moving track yields around it. Use **In scene** when the frame should share the carousel's perspective. Borders default to off.

## Motion, atmosphere, and sound

- Entry and exit can direct the background, slides, and pin independently.
- Loop the body or the whole scene for an exact repeat count.
- Tempo can remain even or follow an authored envelope such as Fast · Slow · Fast; Custom exposes start, body, and finish speed.
- The complete forty-background atlas lives behind **Browse all backgrounds**; twelve hero studies stay visible for fast selection.
- Sound is off by default. Enabling preview sound still requires an explicit audition or playback action. MP4 sound can contain tactile sound alone or a presenter-plus-sound mixed master.
- Grain is a restrained, deterministic world finish. It never alters imported slide or protected-presenter pixels.

## Export truth

- MP4 is opaque H.264. Transparent output uses a PNG still or PNG sequence.
- Preview and export share the same deterministic scene evaluator.
- Tactile sound exports at 48 kHz stereo and remains opt-in.
- Completion means the produced container was reopened and checked; a cancelled or failed export is not presented as a valid master.

## What a verified build proves

A verified bundle proves its recorded source revision, V2 development identity, packaged resources, signature structure, native self-tests, and packaged WKWebView matrix. It does not prove production document migration, owner visual or listening approval, Developer ID signing, notarisation, publication, or release.

Use **Help → View Complete Source** to open the exact source revision recorded in the app. If that revision is absent or malformed, Drift safely falls back to the repository root instead of constructing an untrusted URL.
