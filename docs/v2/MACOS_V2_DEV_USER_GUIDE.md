# Drift V2 Dev for macOS — user guide

Drift V2 Dev is an isolated development app for testing the current V2 vertical slice. It can run beside the production `Drift.app` because it uses a different bundle identifier, App Sandbox container, WebKit data store, cache namespace, and local project database.

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

## What this build proves

A verified bundle proves its recorded source revision, V2 development identity, packaged resources, signature structure, native self-tests, and packaged WKWebView matrix. It does not prove the complete V2 roadmap, production document migration, visual approval, signing, notarisation, publication, or release.

Use **Help → View Complete Source** to open the exact source revision recorded in the app. If that revision is absent or malformed, Drift safely falls back to the repository root instead of constructing an untrusted URL.
