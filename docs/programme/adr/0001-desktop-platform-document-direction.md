# ADR 0001: deepen existing native document seam through DesktopPlatform

Status: accepted for D01

## Context

Drift already has a mature Mac document seam: typed TypeScript functions in `src/lib/nativeMac.ts`, generation-bound JavaScript in `macos/NativeBridge.js`, and AppKit document/file authority in `macos/App/`. `App.tsx` called native document operations directly while browser save/open used separate UI paths. Future Linux support needs one small product-facing port without duplicating native authority or project logic.

## Decision

Add `DesktopPlatform.documents` around one complete portable-project journey.

- macOS adapter delegates to existing native functions and preserves their verified receipt/revision rules;
- browser adapter owns browser selection/download behaviour and returns same typed outcome vocabulary;
- `App.tsx` consumes capability results, not direct native document calls;
- Project parsing, validation, transactional replacement, persistence, rendering, and export stay in existing product modules;
- `nativeMac.ts` remains canonical native web adapter;
- Swift and `NativeBridge.js` remain unchanged in D01.

## Consequences

- Browser cancellation and host failure become explicit typed states.
- Native save completion still requires unforgeable receipt issued by existing seam.
- Browser download reports no readback verification and no bound document.
- Existing slide/presenter bridge and other native commands remain intentionally unmigrated.
- Future Linux adapter can implement earned document interface without OS checks in creative code.

## Rejected

- New parallel native bridge.
- Generic filesystem service or raw-path API.
- Moving Project serialization or transactional install into platform adapter.
- Broad migration of menus, export, codecs, or lifecycle inside D01.
