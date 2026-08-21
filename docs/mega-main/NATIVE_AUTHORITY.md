# Native-issued document authority

## Threat

A trusted bundled `file:` URL is necessary but not sufficient authority. The document before reload and the replacement document use the same URL. A page-generated nonce is also insufficient: a late message from a replaced WebContent process could mint a fresh token and reclaim native file, AAC or menu capability after the new page committed.

## Contract

1. AppKit creates one canonical lower-case UUID only after WebKit commits Drift’s trusted bundled index.
2. AppKit delivers that generation token directly into the currently committed page with `callAsyncJavaScript`.
3. JavaScript has no token-generation or self-authorising path.
4. `runtime-info` claims the prepared token exactly once.
5. Every later bridge message carries the active token and is rejected before touching native state when stale.
6. Navigation start, failed navigation, reload, WebContent termination, close and quit invalidate the generation and revoke native capabilities.
7. The token never enters project data, diagnostics, receipts, filenames, logs or error copy.

## Async completion boundary

The document ticket binds more than the first message:

- native save, directory and open panels;
- hidden WebKit file-input panels;
- WKDownload destination panels;
- file and directory broker replies;
- native AAC replies;
- Finder/Open-With project delivery;
- native-to-JavaScript import callbacks.

A replacement document cancels an open panel where possible. A late completion receives `SecurityError`; any newly created grant is released instead of reaching the replacement page.

## Readiness

The Mac studio is authoritative only when all of these are true:

```text
trusted navigation finished
+ native generation delivered
+ generation claimed by runtime-info
+ authoritative React client state received
= native commands and Finder delivery enabled
```

Navigation completion alone never unlocks menus or queued project replacement.

## Packaged-runtime evidence

`WebViewSelfTest` uses the same `didCommit`-issued token path as the application. It also injects a bounded first-fault diagnostic recorder before the signed application script, so a production boot failure reports JavaScript errors, unhandled rejections and bounded console errors rather than being misdiagnosed as a codec or project timeout.

The self-test receipt records only authority state and bounded boot diagnostics. It never records the token itself.

## Falsification

The native session self-test proves:

- an unissued token cannot bootstrap;
- an invalid claim does not consume the prepared ticket;
- duplicate bootstrap is rejected;
- replacement cancels the old panel;
- the old page cannot reclaim authority;
- stale messages and panel completions fail;
- malformed token input does not revoke the valid prepared generation;
- explicit invalidation leaves no active authority.

Static hardening gates additionally reject page-side `crypto.randomUUID`, URL-only authority, unbound native runtime markers and a packaged self-test that bypasses the production `didCommit` path.
