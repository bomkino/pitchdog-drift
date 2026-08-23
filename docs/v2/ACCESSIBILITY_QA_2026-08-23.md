# Drift V2 accessibility QA — 23 August 2026

Accessibility does not turn Drift into a motionless product. Authored entry,
body, exit, tempo, and export motion remain project truth. The boundary is the
editing app: a person who requests reduced motion must be able to direct and
export that authored motion without the preview, grain, inertia, or chrome
moving against them.

## Verified in the browser matrix

- Every visible control has a keyboard focus treatment. Native file inputs stay
  outside the Tab order while their visible buttons remain operable.
- Flow-axis and frame-rate radio groups work with standard keyboard movement.
- Slide selection, ordering, pinning, removal, and the four workspaces remain
  keyboard operable.
- Command–K is a real modal interaction: focus enters the search field, stays
  trapped, the active result is exposed to assistive technology, Escape closes
  it, and focus returns to the trigger.
- The WebGL canvas is decorative to the accessibility tree. A live textual
  preview description names the slide count, centred slide, World, travel axis,
  path, playback state, and stage size.
- Platform-guide chrome is preview-only and hidden from the accessibility tree;
  its overlap result is exposed as Master status text.
- At 320 px and 390 px widths, the application keeps one viewport and a stable
  footer without horizontal or vertical document overflow.
- With the OS reduced-motion preference active, the preview and animated grain
  become pixel-stable. Saved project motion and exported motion are not mutated.
- Pause kills existing inertial velocity; it does not merely stop adding new
  velocity while the deck drifts.

## Native/AppKit boundary

- Open, Save, Save As, Revert, close protection, dirty-window state, and menu
  availability are native AppKit surfaces driven by the same document facts as
  the WebView.
- V2 does not register `.pitched` ownership. Explicit user-selected project
  operations remain available without stealing Finder ownership from V1.

## Not yet claimed

Automated semantics and keyboard checks are green. A full human VoiceOver
journey in the installed candidate is still an owner/release gate; no automated
result is presented as human assistive-technology approval.
