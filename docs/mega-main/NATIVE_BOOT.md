# Signed Mac application bootstrap

## User-visible promise

Opening `Drift.app` must produce one working studio window from signed local resources. No server, terminal, network request, login or development environment may be required.

## Production topology

```text
Resources/Web/index.html
        │
        ├── drift-app.css
        └── drift-app.js   classic IIFE; complete boot-critical graph
```

The browser build may remain an ES-module graph. The packaged Mac application may not depend on local module loading, late application chunks or source maps.

## Required readiness chain

```text
window-created
→ trusted-document-started
→ trusted-document-committed
→ native-generation-issued
→ bridge-claimed
→ application-script-running
→ React-mounted
→ renderer-ready
→ project-settled
→ authoritative-ready
```

The packaged self-test must observe the real application root, canvas, native bridge marker, installed typed app contract and settled project state. A second independent matrix tests sandboxed and unsandboxed variants so signature, sandbox and general package failures are distinguishable.

## Failure boundary

A page that loads but never mounts React is a boot failure, not an encoder or project timeout. A content-process termination invalidates native capabilities, aborts native writes and AAC, and receives at most one automatic recovery attempt before a hard visible failure.

## Current construction change

Mega Main replaces the previous `vite build --mode macos` ES-module output with `scripts/build-macos-web.mjs`, which creates one classic IIFE, one or more static stylesheets, a local `index.html`, and a SHA-256 topology receipt. The Mac workflow no longer suppresses the packaged WebView self-test.
