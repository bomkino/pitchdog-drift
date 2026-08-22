# Drift V2 Editorial Performance vertical slice

Updated: 22 August 2026

This document defines one narrow **candidate promise**: inside the isolated V2 development identity, Drift can evaluate and draw one authored Editorial Drift World as a deterministic beginning, body, ending, and repeatable slide performance. It supports an optional protected still image or presenter video. It is not the complete curated-donor V2. Package, installation, and CI receipts must separately name the exact source they prove.

## Activation boundary

- A fresh V2 Dev project starts as Editorial Drift 9:16 under `drift-v2/1`.
- A V1/V3 migration or imported compatibility project stays on `drift-v1-compat/1`.
- Applying Editorial Drift inside V2 Dev is the explicit upgrade transaction.
- Release/V1 startup does not silently select `drift-v2/1`.
- `/Applications/Drift.app` remains the untouched production document app.

## What is live in the candidate

- One pure V2 evaluator joins entry/body/exit lifecycle, repeats, body tempo, pose cadence, semantic events, spatial placement, ordered media, reduced motion, and deterministic frame diagnostics.
- Project V4 media order is renderer authority. A pinned-only still retains its project identity but is excluded from the moving track.
- Preview, requested PNG stills, and PNG sequence frames enter the same `CinematicCarousel` draw graph. Sequence time is owned by `frameIndex / fps`; still and preview requests keep their explicit requested time.
- Optional opening and ending animations independently address background, slide layers, and the pinned presenter.
- Body-only and full-scene repeat modes support two to six plays.
- Even, Fast · Slow · Fast, Slow Build, Rush & Settle, Read & Go, and three-point Custom tempo envelopes remain available.
- Reduced-motion output preserves duration and opacity timing while removing spatial transition travel and stagger.
- Editorial Drift has authored 9:16, 4:5, 1:1, and 16:9 recuts. Ratio recognition accepts proportional output sizes, so 2160 × 3840 remains authored 9:16; arbitrary proportions become Custom.
- Per-slide cover/contain and focal directives reach the shared slide shader.
- Presenter video preview follows the same authored show clock. Normal delivery remains decoder-driven within a one-frame tolerance; drift, master wrap, pause, reduced motion, and export freeze trigger a canonical correction that is not accepted until the decoded seek settles.
- Midpoint PNG stills remain the UI default, so an enabled opening does not accidentally produce a blank still. An exact time, including frame zero, can still be requested.
- Project V4 local autosave remains isolated inside the V2 development database.

This convergence is a first slice, not the completed Phase 2 renderer. Project V4 is canonical at the new evaluator boundary, but `StudioSettings` projection still supplies compatibility-shaped inputs to parts of the existing draw graph.

## Authored defaults

The default V2 Dev master is 1080 × 1920, 30 fps, and 8.00 seconds:

- opening: 0.72 seconds;
- body: 6.72 seconds;
- ending: 0.56 seconds;
- tempo: Fast · Slow · Fast;
- repeat: off;
- pin participation: protected at rest unless explicitly included;
- slide border: off;
- grain: restrained, background-only, and held at a handcrafted 12 fps plate cadence for output.

Grain is a real-time finishing plate, not a physical-film simulation. It never textures imported slide or presenter pixels.

## Timeline contract

The lifecycle is analytical and boundary-owned:

```text
entry -> body cycle(s) -> exit
```

- `Off`: one entry, one body, one exit.
- `Body`: entry once, body repeated `n` times, exit once.
- `Full scene`: the complete entry/body/exit scene repeated `n` times.
- Entry and exit never steal body duration.
- Seamless travel owns one source-deck pass per body cycle rather than renderer padding distance.
- A completed exit reaches zero layer visibility; reduced motion reaches the same visibility without spatial displacement.
- Pause freezes preview time, presenter playback, and grain phase.
- Presenter preview does not silently loop a short source. It holds the last decodable frame; export keeps its separate exact-frame decoder and rejects insufficient source coverage.

## Current visual integrity repairs

- The preview canvas resolves width and height together, preserving 9:16 and 16:9 instead of distorting a wide stage after a one-axis CSS clamp.
- Protected-pin avoidance is local and deterministic in both axes. A distant card keeps its authored scale; only a card approaching the presenter footprint yields into the clear lane.
- Moving cards below a small visible-stage threshold are hidden, then eased in, preventing transparent slivers at the stage edge.
- Opaque V2 compositions keep alpha 255 through background entry and exit fades by fading RGB over an opaque black matte. Transparent compositions retain alpha zero outside content.
- Border presence remains independently controllable and defaults to zero; the old accidental translucent-looking frame is not part of the authored default.

These are implemented repairs with focused and full browser locks, not a completed visual approval. Manual browser inspection now covers authored 9:16, 16:9, protected-pin, and scaled 2160 × 3840 compositions; the broader grain, transparency, entry/exit, reduced-motion, export, and packaged-app visual matrix still needs review.

## Project and provenance truth

Editorial Drift now applies an explicit `drift-v2/1` World transaction in V2 Dev. Visible changes reconcile back into Project V4. An unchanged hydrated project remains lossless even where current controls project a simpler view, and media-only changes preserve dormant authored card, atmosphere, lighting, presenter, and per-slide values.

A supported ratio change re-applies its authored ratio recipe only while truthful Editorial recipe references and fingerprints still prove ownership. A custom size releases aggregate ratio provenance without destroying those truthful domain references; a creative edit, compatibility project, unknown future World, or mixed provenance blocks automatic recut. Recipe references that no longer match visible settings clear, and aggregate World provenance becomes Custom.

V2 Dev intentionally disables ordinary portable `.pitched` Open/Save and Finder ownership. Its local sandbox remains disposable development space. V1 retains production document ownership.

## What remains foundation-only

The repository contains registry or metadata foundations for eight World identities, forty atmosphere records, twelve hero-atmosphere candidates, ratio-native recipes, and selected exact-SHA donor study. Only Editorial Drift is a live V2 renderer slice. The other five visible themes are compatibility studies, not additional V2 Worlds, and the remaining registry identities are not live choices.

The following are outside this slice: the complete command/receipt/lock/undo system; all four cuts, six performances, four motion characters, four pose cadences, and six approved presets as one finished collection; ten proven paths; Card/Paper/Silk/Gel; analytical lighting; forty rendered atmospheres; global optics; sixteen portrait scenes; tactile Foley; the complete Slides → World → Direct → Master journey; production V2 document ownership; and public release.

Every donor remains `frozen-not-ported` until re-authored behavior and parity evidence exist. Source study is not integration.

## Acceptance gates for this source

A usable local checkpoint requires all of these on one clean candidate:

1. Full unit suite, typecheck, source contracts, and V2 Web build.
2. Uninterrupted real-browser suites covering Project V4, native-import races, recovery, WebGL fallback, still/sequence/MP4 parity, alpha, cancellation, and resource cleanup.
3. Human visual review of all supported ratios, both travel axes, entry/body/exit, pin collisions, edge reveal, borders, shadows, grain, opaque and transparent output, and reduced motion.
4. A committed exact-SHA `Drift V2 Dev.app` build plus packaged WKWebView matrix.
5. Installation at `/Applications/Drift V2 Dev.app`, installed-bundle readback, normal launch, simultaneous V1 use, and ordinary installed export checks.
6. Push and exact-SHA CI only after the local artifact holds. Pull-request CI tests GitHub's synthetic merge ref; the exact feature head requires a green branch-selected `workflow_dispatch` run whose tested SHA and bundle source revision agree.

These gates prove only this vertical slice. They do not turn it into full V2, a merge, a notarised release, publication, or human creative approval.

## Pre-package acceptance snapshot

At the pre-package evidence freeze, `npm run check` passed TypeScript, 280/280 source tests across 37 files, native/source contracts, and the V1 production Web build. The final uninterrupted real-browser suite passed 31/31 journeys; the repaired stage-layout path separately held for five consecutive repetitions, and the corrected native admission, export lifecycle, and reduced-motion checks held for three consecutive repetitions each. Focused evaluator, geometry, pin, projection, lossless-hydration, scaled-ratio, presenter-clock, interaction-loop, and alpha checks passed. The real-video presenter journey passed three consecutive focused repetitions across running alignment, wrap, pause, reduced motion, export freeze, resume, and unrelated slide-pin preservation. Positive and negative complete-deck gestures returned byte-identical WebGL canvas hashes after wrapping. Manual browser inspection covered authored portrait, landscape, protected-pin, and scaled-portrait views, without claiming complete creative approval.

No clean implementation commit, exact-SHA package, fresh installation, candidate branch push, or candidate CI run existed at that snapshot. Later receipts must state those gates independently and name their exact source SHA.

The [installed checkpoint receipt](INSTALLED_CHECKPOINT_2026-08-22.md) describes older source `b7bb5a520a23755306bf2f07656f604fd90b7b65`. Its package and installation evidence remains historical and must not be used to claim these current V2 renderer and visual repairs are installed.
