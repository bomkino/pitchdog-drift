# D10 — Complete optional pinned-frame contract

Status: source-ready at `84f9388`; experiential and packaged acceptance remain open

## Delivered source tranche

The existing Project V4 presenter/pin seam remains the only authority for the
optional, default-off pinned frame. It already owned source selection, moving-
track membership, position, size/aspect, safe anchoring, contain/cover, focal
crop, matte, corners, border, shadow, lens treatment, audio intent, and portable
save/reopen state.

D10 adds the two missing authored facts without replacing that seam:

- `layer`: above or below moving slides while retaining independent protected
  or through-lens treatment;
- exclusive story end, paired with existing `startAt` and `trimStart`, so a pin
  has one visible story range and one source clock.

One pure pinned-frame presentation result now enters the existing Project frame
adapter for preview, scrub, still, MP4, and PNG sequence evaluation. The renderer
uses that result for visibility and uses a split optical pass when a protected
pin belongs below lens-treated slides. Presenter video decode and audio mixing
consume the same trim/range mapping; output outside the range is transparent or
silent rather than a frozen or silently shifted presenter.

## Acceptance still open

- real browser interaction, focus, keyboard, disclosure, and Interface Scale
  matrix inspection;
- exact preview/scrub pixels and H.264/PNG artifact comparison from a reachable
  runtime with presenter video and audio;
- packaged Apple-Silicon and Garuda save/reopen/export journeys;
- human visual, motion, audio, and accessibility acceptance.

## Boundary

No parallel presenter model, evaluator, renderer, exporter, audio engine,
Project format version, platform bridge, package, release, installation, or
publication was created.

Receipt: [`receipts/D10-pinned-frame-foundation.md`](receipts/D10-pinned-frame-foundation.md)
