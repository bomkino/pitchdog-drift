# Drift product direction

Status: active implementation contract

Drift remains one local-first product with one portable Project V4, deterministic evaluator, and `Slides → Look → Motion → Export` journey.

## Supported destination

- Apple-Silicon macOS: AppKit owns document, lifecycle, menu, file, package, and native-codec authority; WKWebView hosts shared product UI.
- Garuda Linux / Arch family / KDE Plasma: future hardened Electron adapter behind same earned product-facing platform port.
- Browser: development/test adapter, not packaged desktop evidence.

Windows, Intel Mac, Electron-on-Mac, Swift renderer rewrites, cloud rendering, accounts, telemetry, and automatic updates remain out of scope.

## Product truth

- Project V4 owns ordered media identity, composition, slide fit/crop/focal intent, Look, Motion, timeline, pinned-frame intent, sound, presenter intent, and export defaults.
- Host paths, document grants, recent files, presentation preferences, and in-flight jobs never enter portable project bytes.
- Preview and fixed-step export use same evaluator at explicit time.
- Opening invalid or unsupported bytes preserves current project.
- Save and native output commit only after staged verification.

## Pinned-frame invariant

Selected asset, position, size/aspect, crop/fit/focal intent, border/matte/shadow treatment, lens treatment, timing/audio intent, save/reopen state, preview state, and export evaluation remain one Project V4 contract. Platform work may transport exact project bytes; it may not normalize or reinterpret this intent.

## Platform direction

`DesktopPlatform` is earned one document flow at a time. Current AppKit/WKWebView authority in `src/lib/nativeMac.ts`, `macos/NativeBridge.js`, and `macos/App/` remains canonical. Browser and macOS document behaviour delegate through `src/lib/desktopPlatform.ts`; native implementation remains existing bridge, not parallel host logic.

Linux, interface scale, MCP, guided Export, codecs, x86_64 removal, signing, notarization, installation, and release require separate tickets and evidence.
