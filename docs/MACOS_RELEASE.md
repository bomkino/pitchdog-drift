# Releasing Drift for macOS

This document covers the distance between “a local `.app` builds” and “a stranger can safely install it.” Those are different claims.

Drift’s normal development build is ad-hoc signed and suitable for local testing. A public binary requires all of the following:

1. a universal `arm64` + `x86_64` application;
2. a real Developer ID Application signature;
3. hardened runtime and the frozen App Sandbox entitlements;
4. complete legal notices and a dependency inventory inside the app;
5. direct proof that the Mac bundle excludes the browser software-AAC/FFmpeg WebAssembly path;
6. direct proof that the native AudioToolbox AAC path still produces coherent packets and timeline metadata;
7. Apple notarization of the app and disk image;
8. stapled tickets, Gatekeeper assessment, detached DMG verification, and checksums;
9. a human journey test on physical Apple Silicon and Intel Macs;
10. explicit authority to publish.

The release scripts create evidence. They do not publish a GitHub Release, push a tag, deploy a website, merge a branch, or email anyone.

## Why the release lane is separate

The browser project includes `@mediabunny/aac-encoder` for deterministic presenter audio. That package embeds an FFmpeg-derived WebAssembly encoder and creates additional LGPL distribution obligations.

The standalone macOS production build aliases that package to `src/lib/macosAacEncoder.ts`. The adapter registers a Mediabunny custom encoder that routes bounded PCM through Drift’s typed native bridge to Apple’s software AAC-LC component in AudioToolbox. It does not bundle the browser extension’s encoder.

The release lane fails if packaged Web resources contain:

- any `.wasm` file;
- any source map;
- references to `@mediabunny/aac-encoder`;
- FFmpeg or `libavcodec` runtime markers.

It also fails if the native bundle cannot prove:

- App Sandbox, user-selected read/write, and network-client entitlements from the signed finished app;
- no network-server, broad-directory, or temporary-exception entitlement;
- production WebKit lockdown with zero token-bearing TCP and UDP loopback hits and no shipped native network client;
- no non-system linked dynamic library;
- a valid native AAC self-test;
- a complete byte manifest;
- a packaged React/WebKit/bridge self-test;
- a Developer ID Application signature in release mode.

This is a distribution boundary, not a claim that all obligations disappear. The app still carries the project licence, notices, third-party notices, asset terms, trademark terms, macOS documentation, and a CycloneDX source-dependency SBOM in `Drift.app/Contents/Resources/Legal/`.

## Prerequisites

- a supported macOS runner or workstation with the pinned Xcode toolchain;
- Node.js 22.12 or newer;
- Xcode command-line tools;
- a **Developer ID Application** certificate installed in a usable keychain;
- App Store Connect notarization credentials;
- access to physical Apple Silicon and Intel Macs for the final run;
- a clean checkout of the exact candidate commit.

Find the signing identity:

```bash
security find-identity -v -p codesigning
```

Set it exactly:

```bash
export DRIFT_MACOS_SIGN_IDENTITY='Developer ID Application: Example Studio (ABCDE12345)'
```

The release scripts reject ad-hoc, Apple Development, Mac Developer, or ambiguous identities for public candidates.

## Notarization credentials

Use one of two routes.

### Keychain profile

```bash
xcrun notarytool store-credentials drift-notary \
  --key /secure/path/AuthKey_ABC123.p8 \
  --key-id ABC123 \
  --issuer 00000000-0000-0000-0000-000000000000

export APPLE_NOTARY_PROFILE='drift-notary'
```

### App Store Connect API key

```bash
export APPLE_NOTARY_KEY_PATH='/secure/path/AuthKey_ABC123.p8'
export APPLE_NOTARY_KEY_ID='ABC123'
export APPLE_NOTARY_ISSUER_ID='00000000-0000-0000-0000-000000000000'
```

Never commit private keys, certificates, passwords, exported keychains, or notary profile material.

## Create release-grade artifacts

```bash
scripts/release-macos-app.sh --notarize
```

The script performs this sequence:

1. clean dependency installation;
2. complete TypeScript, Vitest, source-contract, Vite, and browser checks;
3. universal native app build;
4. macOS-specific Vite build with the native AudioToolbox adapter;
5. legal bundle and CycloneDX SBOM assembly;
6. bundle scan for source maps, WebAssembly, browser AAC extension, FFmpeg, and libavcodec markers;
7. final hardened-runtime Developer ID signing after every resource is frozen;
8. strict app verification and native self-tests;
9. packaged WKWebView load, typed command round-trip, and recovery probe;
10. notarization of the zipped app;
11. app-ticket stapling and validation;
12. DMG creation with `Drift.app`, an `/Applications` shortcut, and a local-first read-me;
13. DMG signing, notarization, stapling, and validation;
14. Gatekeeper assessment of app and disk image;
15. mounted-DMG comparison against the source app;
16. release manifest and SHA-256 checksum generation.

Outputs:

```text
build/macos/Drift.app
build/release/Drift-macOS.zip
build/release/Drift-macOS.dmg
build/release/ReleaseManifest.json
build/release/SHA256SUMS.txt
build/release/notary-app.json
build/release/notary-dmg.json
```

`--skip-tests` exists for repeated local packaging after the exact source has already passed. Do not use it for a public candidate unless the same commit has a complete green workflow receipt and no resource has changed.

## Runtime evidence before release packaging

The standalone app workflow and the WKWebView runtime workflow prove different things.

### Packaged application workflow

This lane builds and verifies the actual `.app`:

- universal slices;
- app structure and resources;
- signing flags and entitlements;
- truthful App Sandbox, user-selected read/write, and app-wide network-client entitlements, with no network-server/broad-filesystem exceptions;
- the production WebKit rule identifier, remote response/download denial, and exact packaged TCP/UDP loopback zero-hit receipt;
- no native `URLSession`, Network.framework, socket, updater, analytics, or cloud-upload client;
- no non-system library;
- no browser AAC/FFmpeg binary path;
- build-manifest byte identity;
- native file-broker self-test;
- packaged React/WebKit/typed-bridge load;
- native command round-trip;
- WebKit content-process reload recovery;
- three signing identities: sandboxed ad hoc, unsandboxed ad hoc, sandboxed self-signed;
- explicit proof that only the production sandboxed lifecycle is accepted.

### WKWebView runtime workflow

This lane exercises the media stack in a visible hosted Apple Silicon WKWebView lifecycle:

- WebGL2 creation and pixel readback;
- alpha-capable PNG encode;
- real H.264/AVC access-unit encode;
- native Apple software AAC-LC encode;
- AudioSpecificConfig, magic-cookie, priming, padding, and frame-equation validation;
- 90 deterministic frames at 320 × 568, 30 fps, 3 seconds;
- MP4 mux, readback, frame-count and `n / fps` timestamp verification;
- Rec.709/sRGB-compatible colour metadata;
- first/middle/final MP4 decode;
- transparent PNG with visible and non-opaque pixels;
- native progress events and content-process stability.

The deterministic exporter probe and the shipped app are separate receipt-verified, single-entry classic IIFEs. The packaged app self-test owns the exact production application graph; the exporter probe owns the real export source path. This prevents a bootstrap failure from being misreported as an encoder failure while keeping both claims directly tested.

## Detached verification

Verification can run separately from packaging:

```bash
scripts/verify-macos-release.sh \
  build/macos/Drift.app \
  build/release/Drift-macOS.dmg \
  build/release/ReleaseManifest.json
```

It checks:

- Developer ID authority;
- hardened runtime;
- App Sandbox enabled;
- app-wide network-client entitlement present in the sandboxed signature and network-server/broad-directory entitlements absent;
- production WebKit policy plus exact packaged TCP/UDP zero-hit evidence;
- no shipped native networking surface;
- both CPU architectures;
- complete legal bundle and SBOM;
- no source maps, WebAssembly, browser AAC extension, FFmpeg, or libavcodec implementation;
- app and DMG signatures;
- DMG integrity;
- manifest hashes and sizes;
- mounted application signature and executable identity;
- `/Applications` shortcut integrity;
- stapler and Gatekeeper results when the manifest says the candidate is notarized.

A successful build followed by failed detached verification is a failed release candidate.

## Manual GitHub workflow

`.github/workflows/macos-release.yml` is deliberately `workflow_dispatch` only. It never runs for an untrusted pull request and never creates a GitHub Release.

Required repository secrets:

```text
MACOS_CERTIFICATE_P12_BASE64
MACOS_CERTIFICATE_PASSWORD
MACOS_SIGN_IDENTITY
APPLE_NOTARY_KEY_P8_BASE64
APPLE_NOTARY_KEY_ID
APPLE_NOTARY_ISSUER_ID
```

The workflow imports the certificate into a temporary keychain, writes the API key into the runner’s temporary directory, executes the release lane, uploads publication-safe text receipts as an ordinary Actions artifact, and deletes key material in an `always()` cleanup step. The artifact is evidence, not a confidentiality boundary.

Workflow artifacts are maintainership evidence. They are not automatically public binaries.

## Human release gauntlet

Automation cannot certify the experience of importing a real confidential deck, waiting through a long encode, navigating with VoiceOver, disconnecting a drive, or opening the result in another application.

### Install and first launch

- Download the exact DMG named in `SHA256SUMS.txt`.
- Verify the checksum before mounting.
- Mount it from Finder.
- Drag Drift to `/Applications`.
- Eject the disk image.
- Launch from `/Applications`, not the mounted DMG.
- Confirm Gatekeeper opens it without an override or quarantine workaround.
- Confirm About Drift reports the expected version, build, and source revision.
- Confirm one normal studio window appears and can be restored from the Dock.

### Project truth

- Replace the studies with mixed-aspect-ratio images.
- Reorder, remove, pin, unpin, pause, reverse, and switch axes.
- Import through app buttons, File menu, and drag-and-drop.
- Quit during a clean idle state and reopen; local project and media must survive.
- Attempt to quit during save and export; the app must not silently abandon work.
- Save a `.pitched` project, clear a test app container, and reopen from Finder.
- Double-click a second `.pitched` project while Drift is already running.
- Open a project while Drift is launching.
- Try a corrupt project and verify the current valid project remains intact.

### Output truth

- Export a default 1080 × 1920 H.264 master.
- Export with a muted presenter.
- Export a 24/25/30 fps presenter-audio master.
- Attempt 50/60 fps with audio and confirm the explicit guard.
- Cancel early, mid-render, during native write, and during finalization.
- Replace an existing destination and prove its old SHA-256 survives cancelled replacement.
- Export a transparent still.
- Export a PNG sequence into an empty folder.
- Attempt a sequence in a folder containing the first expected frame; existing work must not be overwritten.
- Inspect first, middle, and final video frames outside Drift.
- Confirm frame count, dimensions, duration, frame rate, colour, audio, and A/V sync using an independent inspector.

### Native behavior

- Use File → Open Project, Save Project, Export MP4, Export PNG Still, and Export PNG Sequence.
- Exercise keyboard shortcuts and disabled states.
- Drag a `.pitched` project onto the app icon.
- Reveal a completed export in Finder.
- Enter and leave app focus mode and macOS full screen independently.
- Sleep and wake during idle preview and a paused export test.
- Force-quit the WebContent process in a development run and verify rollback/reload messaging.
- Disconnect an external destination volume before commit; failure must be explicit and the current project must remain usable.
- Copy diagnostics and confirm they contain no deck data or absolute path.

### Accessibility

- VoiceOver can traverse Media, Stage, Director, export progress, notices, and native warnings.
- Full Keyboard Access reaches every editor and menu action.
- Focus remains visible at 200% interface magnification.
- Reduced motion changes preview behavior without silently mutating saved export motion.
- Every destructive alert makes the safe action visually and semantically primary.

### Hardware matrix

Run the complete journey on:

- current Apple Silicon macOS;
- the minimum supported Apple Silicon macOS;
- current Intel macOS;
- the minimum supported Intel macOS;
- one low-memory machine;
- one removable or external destination volume.

Record model, OS build, Drift commit, app checksum, DMG checksum, and every failed, skipped, or waived case. “Works on the CI runner” is not a substitute.

## Publishing boundary

A maintainer may publish only after:

- normal CI, standalone Mac CI, and WKWebView runtime CI pass on the exact release commit;
- the manual release workflow accepts and staples both artifacts;
- detached verification passes on the downloaded workflow artifact;
- physical-hardware, accessibility, and destructive-failure gauntlets have no unresolved release blocker;
- release notes accurately state codec, presenter-audio, project, minimum-OS, and privacy boundaries;
- the published checksums match the tested files;
- complete corresponding source is available at the exact revision;
- publication is explicitly authorized.

Do not rebuild between final testing and publication. A rebuild is a new candidate.
