# D03 evidence receipt — Interface Scale tracer

Date: 27 August 2026

Repository: `bomkino/pitchdog-drift`

Start: `codex/d01-platform-port-tracer@a24badfa79a7d607b13a3cbc4e8dfc2b2e83995b`

Task branch: `codex/d03-interface-scale-tracer`

Source commit: `a864e28cf8331e4cf48426ec33cf8177f500ce48`

Source tree: `a59bd3cb8a297e3857e3c9987e5c5bcdddaf6da5`

## Ticket boundary

- Destination: browser-development Interface Scale tracer through `DesktopPlatform.presentation` and shared shell.
- Demo: set 75%, 125%, 150%, 200%, then Reset through visible controls/commands while Project and output truth remain equal.
- Public seam: typed Interface Scale store/commands, `DesktopPlatform.presentation.interfaceScale`, shell tokens/reflow, canonical Project/evaluator/export interfaces.
- Write surface: Interface Scale model/menu, DesktopPlatform presentation extension, App routes, shell CSS, command registry, focused tests, compact ADR/status/receipt.
- Stop condition reached: real visual capture unavailable; ticket is not complete and D10 is not unblocked.

## Environment

- OS: Linux `6.18.35`, x86_64.
- Node: `v24.19.0`; repository declares Node 22 and engine `>=22.12`.
- npm: `11.9.0`; lock declares `npm@11.19.0`.
- Worktree at start: clean; exact remote D01 source selected.

## Files changed

- `src/lib/interfaceScale.ts` — bounded model, set/smaller/larger/reset commands, local snapshot revision, persistence, subscription, stable layout mode.
- `src/lib/desktopPlatform.ts` — presentation seam shared by browser-development and current Mac adapter construction without changing native authority.
- `src/components/InterfaceScaleMenu.tsx` — named current value, five representative presets, step/reset controls, shortcut copy.
- `src/App.tsx` — pre-paint preference read, shared route, shortcuts, command dispatch, scale/layout attributes.
- `src/core/commands/studioCommandRegistry.ts` — smaller/larger/reset command-search entries.
- `src/styles.css` — semantic shell tokens and stable three-panel/single-panel reflow; no whole-root scale transform or browser zoom.
- `tests/interfaceScale.test.ts` — model, persistence/relaunch, platform/component route, and creative invariants.
- `tests/studioCommandRegistry.test.ts` — registered/searchable scale commands.
- `docs/programme/adr/0002-interface-scale-presentation-state.md` — durable state/layout decision.
- `docs/programme/IMPLEMENTATION_STATUS.md` and this receipt — honest frontier/evidence.

## Demonstrated

- Malformed, off-step, and out-of-range values normalize to default or a 75%–200% five-point value.
- Set, smaller, larger, and Reset share one command model; larger at 200% remains bounded.
- Injected browser storage persists 150%; a fresh store reads 150% as its initial snapshot.
- `DesktopPlatform.presentation.interfaceScale` exposes the same store consumed by the rendered header control.
- Command search exposes stable smaller/larger/reset action tokens.
- A scale-only dispatch leaves JSON Project state, Project revision state, canonical `evaluateProjectFrame` result, and `exportPlanFromProject` equal.
- Production web build and macOS source contracts remain green.

## Commands and results

- Red: `npm test -- --run tests/interfaceScale.test.ts` failed because `src/lib/interfaceScale.ts` did not exist.
- Focused: Interface Scale, command registry, and DesktopPlatform tests passed — 3 files, 15 tests.
- Final `npm run check` passed: typecheck, 71 test files / 504 tests, macOS source/import/hardening contracts, production Vite build.
- Local Vite server reached ready state at `http://127.0.0.1:4174/`.
- Required cloud-browser inspection failed before page load: `net::ERR_BLOCKED_BY_CLIENT` for the local URL.

## Visual, motion, audio, and artifact evidence

- No screenshots or real-browser scale matrix produced. No claim of clipping, hierarchy, focus, scroll, stage-centre, or visual quality acceptance.
- No renderer, authored motion, audio, Project schema, output dimensions, frame cadence, or export sink changed.
- Built artifact: production web bundle only. No native package or distributable.

## Fixed-point review

### Spec

- Pass: exact range/step/reset model; local persistence; browser-development header, shortcut, and command-search routes; DesktopPlatform presentation seam; stable shell mode; Project/evaluator/export separation.
- Pass: existing `Slides → Look → Motion → Export` identities and editor state objects remain mounted; no creative/output source changed.
- Deferred: real 75/100/125/150/200 matrix at minimum and ordinary windows; visible focus, hit-region, clipping, scroll/playhead/stage-anchor evidence; real relaunch; native menu/Preferences routes.
- Result: source tracer is built but D03 acceptance is incomplete. D10 remains blocked.

### Standards

- Pass: one local preference store feeds UI, shortcuts, command search, and DesktopPlatform; no duplicate Project/evaluator logic.
- Pass: persisted write occurs before local snapshot publication; failure leaves prior snapshot unchanged and App reports failure.
- Pass: no dependency, raw path, OS branch in creative code, root transform, browser zoom, schema mutation, or cross-product source.
- Pass: tests exercise public model, platform, registry, rendered component, Project, evaluator, and export-plan seams without claiming visual taste.
- No source-blocking finding after focused verification.

## State and gaps

Highest state: **built** production web bundle.

Also tested: source/model/platform/application contracts.

Not packaged, installed, released, merged, accepted, or complete.

Unrun:

- real browser matrix and screenshots;
- keyboard focus/scroll/selection/playhead/stage-centre observation during reflow;
- macOS View menu, Preferences, shortcut, packaged relaunch, and accessibility journey;
- Garuda/KDE Electron route and package;
- human visual acceptance.

Blocker: available cloud browser cannot open the local development URL, and no browser/app installation is authorized. D02, D04, and D05 remain independent dependency-ready source frontiers. D10 remains blocked until D03 visual/layout evidence and host acceptance are reconciled.
