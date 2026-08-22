# Drift V2 Editorial Performance vertical slice

Updated: 22 August 2026

This checkpoint makes one narrow promise: Drift can turn a slide deck and one optional pinned image or presenter video into a controlled, deterministic performance with a tasteful beginning, body, ending, and repeat structure. It is an isolated creative/export beta, not the complete curated-donor V2. The [installed checkpoint receipt](INSTALLED_CHECKPOINT_2026-08-22.md) records which parts of that promise are package-verified and which still require an unlocked-screen UI check.

## What is live

- Horizontal and vertical carousels using the five compatibility paths.
- A protected pinned frame that stays outside perspective, keeps source aspect by default, supports focal crop, and receives an authored first-use lane in portrait and landscape motion.
- Optional opening and ending animations for the background, slide layers, and—independently—the pinned frame.
- Body-only repeats and full-scene repeats from two to six plays.
- Even, Fast · Slow · Fast, Slow Build, Rush & Settle, Read & Go, and three-point Custom tempo envelopes.
- Reduced-motion output that preserves duration and opacity timing while removing spatial transition travel and stagger.
- Explicit-time preview and export evaluation. Export distance, velocity, background phase, transition state, and held grain are functions of master time and frame identity rather than wall-clock drift.
- Midpoint PNG stills by default, so an enabled opening does not produce a blank still. Callers can still request frame zero explicitly.
- V4 local autosave and migration compatibility inside the isolated V2 database.

## Authored defaults

The default master is 1080 × 1920, 30 fps, and 8.00 seconds:

- opening: 0.72 seconds;
- body: 6.72 seconds;
- ending: 0.56 seconds;
- tempo: Fast · Slow · Fast;
- repeat: off;
- pin participation: protected at rest unless explicitly included;
- slide border: off;
- grain: restrained, held at a handcrafted 12 fps plate cadence for export.

The pin does not receive a fake glass panel or dark contain matte. On first use, it explicitly returns to source aspect and safe-overlay composition: a landscape pin occupies 42% of a portrait stage and a portrait pin 38%; the moving track yields on the cross-axis. User-positioned or remembered pins are never silently recomposed.

## Timeline contract

The lifecycle is analytical and boundary-owned:

```text
entry -> body cycle(s) -> exit
```

- `Off`: one entry, one body, one exit.
- `Body`: entry once, body repeated `n` times, exit once.
- `Full scene`: the complete entry/body/exit scene repeated `n` times.
- Entry and exit never steal body duration.
- Seamless travel owns whole-strip distance per body cycle.
- A completed exit reaches zero visibility; reduced motion reaches the same visibility without spatial displacement.
- Pause freezes preview time, presenter playback, and grain phase.

## Project and provenance truth

Project V4 is still rendered through `drift-v1-compat/1`. No `drift-v2` render contract is claimed. The live Studio does not automatically apply the registry-only Editorial Drift recipe. If a future World-authored domain is changed by visible controls, its mismatched recipe reference is cleared and aggregate World provenance becomes Custom instead of retaining a false fingerprint.

V2 Dev intentionally disables portable `.pitched` Open/Save and Finder ownership. Its local sandbox is disposable development space. V1 remains the production document app.

## What is foundation-only

The repository contains validated foundations for an eight-identity World registry, forty atmosphere metadata records, twelve hero-atmosphere candidates, ratio-native recipes, and one explicit Editorial Drift recipe transaction. None of those counts describes live rendered choices. Every World identity remains `registry-only`, and the donor ledger remains `frozen-not-ported` until exact donor source study and parity evidence exist.

The following are not part of this checkpoint: the donor-plan renderer reconstruction; ten live paths; four live materials; analytical lighting; global optics; forty rendered atmospheres; sixteen portrait scenes; tactile Foley; the Slides → World → Direct → Master journey; production V2 document ownership; public binary release; Developer ID signing; notarisation; or publication.

## Acceptance evidence

A usable local checkpoint requires all of these on one candidate:

1. Unit tests, typecheck, Mac source contracts, and the V2 Web build.
2. The uninterrupted real-browser suite, including native-import races, project recovery, WebGL fallback, transparent PNG, MP4, and cancellation.
3. Visual review of the default stage, lifecycle motion, grain, shadows, transparency, and the protected pin in both axes.
4. A clean exact-SHA `Drift V2 Dev.app` build and packaged WKWebView matrix.
5. Installation at `/Applications/Drift V2 Dev.app`, installed-bundle readback, normal launch, and simultaneous V1 use.

These gates prove only the checked vertical slice. They do not turn source, tests, a local package, an installation, or a branch into a merged, notarised, released, published, or owner-approved product.

## Current acceptance state

Implementation source `b7bb5a520a23755306bf2f07656f604fd90b7b65` passes `245/245` units, typecheck, Mac source contracts, the freshly compiled native gauntlet, three targeted browser repair journeys, packaged `3/3`, exact candidate/install comparison, and installed `3/3`. V1 remained running and untouched during installation.

Two gates remain open because the Mac screen locked: inspect the repaired first-use source-aspect pin in the installed app, and save/decode one transparent PNG plus one short MP4 through the ordinary installed Save panels. Until those checks pass, package/install HOLD is not whole-artifact HOLD.
