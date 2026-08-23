# Drift V2 development identity

Drift V2 is developed as a separate Mac product boundary. It must never share the installed Drift app's container, WebKit store, project database, cache receipts, window state, or Finder document ownership.

## Exact identities

| Surface | Drift | Drift V2 Dev |
| --- | --- | --- |
| App bundle | `Drift.app` | `Drift V2 Dev.app` |
| Executable | `Drift` | `DriftV2Dev` |
| Bundle identifier | `dog.pitch.drift` | `dog.pitch.drift.v2.dev` |
| Build channel | `release` | `v2-dev` |
| IndexedDB | `pitchdog-drift` | `pitchdog-drift-v2-dev` |
| Cache namespace | `Drift` | `DriftV2Dev` |
| WKWebsiteDataStore | default | `7A519E77-39A8-4BAF-89A0-314590BF3D24` on macOS 14+ |
| Browser development origin | caller-selected V1 port | `http://127.0.0.1:4174` |
| `.pitched` ownership | registered | absent |

On macOS 13, named persistent WebKit stores are unavailable. The distinct App Sandbox container still separates V2 Dev's default WebKit store from Drift.

## Work rules

- Keep `/Applications/Drift.app` installed and usable.
- Use copied, rights-safe fixtures for destructive tests. V2 Dev can open and save user-selected `.pitched` documents through native verified transactions.
- V2 Dev does not register Finder ownership or accept Finder-open events. V1 remains the default `.pitched` application.
- Slide and presenter imports remain available for disposable test material.
- Production package, DMG, release, document association, and publication scripts remain release-only.
- A V2 release candidate may regain the production identity only after explicit compatibility, migration, visual, native, and release approval.

## Commands

```sh
npm run dev
npm run build:v2-dev
npm run build:mac:v2-dev
npm run verify:mac:v2-dev
```

The Mac development app is built at:

```text
build/macos/v2-dev/Drift V2 Dev.app
```

## What verification proves

The V2 Dev verifier fails closed unless the signed app, generated plist, native runtime, compiled Web bundle, cache namespace, IndexedDB namespace, named WebKit store, executable name, and document-ownership policy all agree. The packaged WKWebView matrix also proves the page reports the same build and storage identity after boot and recovery. Native document transactions remain user-selected and path-private; they do not grant LaunchServices ownership.

This is an isolation receipt, not a claim that Project V4, the V2 renderer, a cinematic World, or a public V2 release exists yet.
