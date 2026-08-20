# Releasing Drift for macOS

This document covers the final mile between “a local `.app` builds” and “a stranger can safely install it.” Those are different claims.

Drift’s normal development build is ad-hoc signed and suitable for local testing. A public binary requires all of the following:

1. a universal `arm64` + `x86_64` application;
2. a real Developer ID Application signature;
3. hardened runtime and the frozen App Sandbox entitlements;
4. complete legal notices and a dependency inventory inside the app;
5. explicit proof that the Mac bundle excludes the software AAC/FFmpeg WebAssembly path;
6. Apple notarisation of the app and disk image;
7. stapled tickets, Gatekeeper assessment, detached DMG verification, and checksums;
8. a human smoke test on physical Apple Silicon and Intel Macs.

The release scripts create evidence. They do not publish a GitHub release, push a tag, upload to a website, or email anyone.

## Why the release lane is separate

The browser project includes `@mediabunny/aac-encoder` for deterministic presenter audio where native WebCodecs AAC is unreliable. That package embeds an FFmpeg-derived WebAssembly encoder and creates extra LGPL distribution obligations.

The macOS production build aliases that extension to `src/lib/macosAacEncoder.ts`, which does not bundle the encoder. Presenter-audio availability is therefore capability-gated by the system runtime; it is never silently dropped. The release lane additionally fails if the packaged web resources contain:

- any `.wasm` file;
- any source map;
- references to `@mediabunny/aac-encoder`, `libavcodec`, or an FFmpeg runtime.

This is a distribution boundary, not a claim that all obligations disappear. The app still carries the project licence, notices, third-party notices, asset terms, trademark terms, and a CycloneDX source-dependency SBOM in `Drift.app/Contents/Resources/Legal/`.

## Prerequisites

- macOS runner or workstation supported by the pinned Xcode toolchain;
- Node.js 22.12 or newer;
- Xcode command-line tools;
- a **Developer ID Application** certificate installed in a usable keychain;
- App Store Connect notarisation credentials;
- access to both an Apple Silicon Mac and an Intel Mac for the final human run.

Set the signing identity exactly as shown by:

```bash
security find-identity -v -p codesigning
```

Example:

```bash
export DRIFT_MACOS_SIGN_IDENTITY='Developer ID Application: Example Studio (ABCDE12345)'
```

## Notarisation credentials

Use one of two routes.

### Keychain profile

Store credentials once with `notarytool`:

```bash
xcrun notarytool store-credentials drift-notary \
  --key /secure/path/AuthKey_ABC123.p8 \
  --key-id ABC123 \
  --issuer 00000000-0000-0000-0000-000000000000
```

Then:

```bash
export APPLE_NOTARY_PROFILE='drift-notary'
```

### App Store Connect API key

```bash
export APPLE_NOTARY_KEY_PATH='/secure/path/AuthKey_ABC123.p8'
export APPLE_NOTARY_KEY_ID='ABC123'
export APPLE_NOTARY_ISSUER_ID='00000000-0000-0000-0000-000000000000'
```

Never commit the private key, certificate, password, or notary profile material.

## Create release-grade artifacts

```bash
scripts/release-macos-app.sh --notarize
```

The script performs this sequence:

1. clean dependency installation;
2. complete TypeScript, Vitest, Vite, and native source-contract checks;
3. universal native app build;
4. legal bundle and CycloneDX SBOM assembly;
5. Mac runtime scan for source maps, WebAssembly, and the excluded software AAC/FFmpeg path;
6. final hardened-runtime Developer ID signing after every resource is frozen;
7. strict app verification and native self-tests;
8. notarisation of the zipped app;
9. app-ticket stapling and validation;
10. DMG creation with `Drift.app`, an `/Applications` shortcut, and a local-first read-me;
11. DMG signing, notarisation, stapling, and validation;
12. Gatekeeper assessment of app and disk image;
13. mounted-DMG comparison against the source app;
14. release manifest and SHA-256 checksum generation.

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

`--skip-tests` exists for repeated local packaging after the exact source has already passed. Do not use it for a public candidate unless the same commit has a green full workflow receipt.

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
- no client or server network entitlement;
- both CPU architectures;
- complete legal bundle and SBOM;
- no source maps, WebAssembly, or excluded AAC/FFmpeg implementation;
- app and DMG signatures;
- DMG integrity;
- manifest hashes and sizes;
- mounted application signature and executable identity;
- `/Applications` shortcut integrity;
- stapler and Gatekeeper results when the manifest says the candidate is notarised.

A successful build followed by a failed detached verification is a failed release candidate.

## Manual GitHub workflow

`.github/workflows/macos-release.yml` is deliberately `workflow_dispatch` only. It never runs for an untrusted pull request and never creates a GitHub release.

Required repository secrets:

```text
MACOS_CERTIFICATE_P12_BASE64
MACOS_CERTIFICATE_PASSWORD
MACOS_SIGN_IDENTITY
APPLE_NOTARY_KEY_P8_BASE64
APPLE_NOTARY_KEY_ID
APPLE_NOTARY_ISSUER_ID
```

The workflow imports the certificate into a temporary keychain, writes the API key into the runner’s temporary directory, executes the release lane, uploads the evidence bundle as a private workflow artifact, and deletes key material in an `always()` cleanup step.

Workflow artifacts are evidence for maintainers. They are not automatically public binaries.

## Human release gauntlet

Automation cannot certify the experience of importing real decks, waiting through a long encode, or opening the result in another application. Before publishing a candidate, run this matrix on physical hardware.

### Install and first launch

- Download the exact DMG identified by `SHA256SUMS.txt`.
- Mount it from Finder.
- Drag Drift to `/Applications`.
- Eject the disk image.
- Launch from `/Applications`, not from the mounted DMG.
- Confirm Gatekeeper opens it without an override or quarantine workaround.
- Confirm About Drift reports the expected version and build.

### Project truth

- Replace the studies with mixed-aspect-ratio images.
- Reorder, remove, pin, unpin, pause, reverse, and switch axes.
- Quit during a clean idle state and reopen; the local project must survive.
- Attempt to quit during save and export; the app must not silently abandon work.
- Save a `.pitched` project, clear the local profile, and reopen it from Finder.
- Double-click a second `.pitched` project while Drift is already running.
- Try a corrupt project and verify that the current valid project remains intact.

### Output truth

- Export a default 1080 × 1920 H.264 master.
- Export with a muted presenter.
- Export with presenter audio only when the runtime reports it available.
- Cancel early, mid-render, and during finalisation; no apparently valid partial master may remain.
- Replace an existing destination and verify its old bytes survive a cancelled replacement.
- Export a transparent still.
- Export a PNG sequence into an empty folder.
- Attempt a sequence in a folder containing the first expected frame; existing work must not be overwritten.
- Inspect first, middle, and final video frames outside Drift.
- Confirm frame count, dimensions, duration, frame rate, colour, and audio sync using an independent media inspector.

### Native behavior

- Use File → Open Project, Save Project, Export MP4, Export PNG Still, and Export PNG Sequence.
- Exercise the equivalent keyboard shortcuts.
- Drag a `.pitched` project onto the app icon.
- Enter and leave full screen.
- Sleep and wake during an idle project and during a paused export.
- Force-quit the WebContent process in a development run and verify recovery messaging and project restoration.
- Disconnect an external destination volume before close; failure must be explicit and the current project must remain usable.

### Hardware matrix

Run the complete journey on:

- current Apple Silicon macOS;
- the minimum supported Apple Silicon macOS;
- current Intel macOS;
- the minimum supported Intel macOS.

Record model, OS build, Drift commit, app checksum, DMG checksum, and every failed or waived case. “Works on the CI runner” is not a substitute.

## Publishing boundary

A maintainer may publish only after:

- both normal CI and macOS app CI pass on the exact release commit;
- the manual release workflow accepts and staples both artifacts;
- detached verification passes on the downloaded workflow artifact;
- the physical-hardware gauntlet has no unresolved release blocker;
- release notes accurately state codec and presenter-audio capability boundaries;
- the published checksums match the tested files.

Do not rebuild between final testing and publication. A rebuild is a new candidate.
