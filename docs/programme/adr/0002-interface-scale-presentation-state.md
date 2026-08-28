# ADR 0002: Interface Scale is local presentation state

Status: accepted for D03 source tracer

## Context

Drift needs 75%–200% Interface Scale without changing Project V4, evaluator, renderer coordinates, export settings, undo, dirty state, or current editor anchors. Current shell already has a responsive single-panel mode below 1120 px. Browser development is the host available for this source tracer; native menu and Preferences acceptance require later exact targets.

## Decision

- Own typed scale normalization, commands, persistence, and subscription in `DesktopPlatform.presentation.interfaceScale`.
- Persist browser-development scale under a product-owned local key outside Project storage.
- Read the persisted snapshot before the first React paint.
- Derive semantic shell tokens from the normalized value; never use browser zoom or a whole-root transform.
- Keep the three-panel shell through 125%. At 150% and above, use the existing panel identities in a stable single-panel tab layout without remounting editor state.
- Route the visible header control, command search, and keyboard shortcuts through the same presentation command seam.

## Consequences

- Scale changes can reflow chrome while Project/evaluator/export inputs remain untouched.
- Selection, playhead, workspace, focus target, and scroll containers remain the same React instances across reflow; real-browser evidence is still required to prove their visible restoration.
- Browser persistence is source-ready. Native View menu, Preferences, external preference events, packaged relaunch, and accessibility acceptance remain separate host work.

## Rejected

- CSS `transform: scale(...)` on the app root.
- Browser zoom as product state.
- Storing Interface Scale in Project V4 or undo history.
- Maintaining a second editor layout tree for large scale.
