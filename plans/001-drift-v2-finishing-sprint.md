# Plan 001: Finish Drift V2 without a second architecture loop

> **Executor instructions**: Do not execute this plan until Kay explicitly says
> to build from Plan 001. Once authorized, follow it in order. Run focused
> verification at the end of each causal phase, not after every edit. Stop at
> every named owner, GitHub, Apple, install, and release gate. Do not improvise a
> second project model, timeline, renderer, exporter, or Mac document stack.
>
> **Drift check (run first)**:
> `git diff --stat 627931d..HEAD -- src tests e2e macos scripts docs package.json`
> If an in-scope file changed after this plan was written, compare the live
> symbols listed in **Current state** before proceeding. If the canonical
> Project V4, lifecycle, travel evaluator, or native document boundary changed
> materially, stop and rebase this plan rather than porting it blindly.

## Status

- **Priority**: P1
- **Effort**: L; 27–43 focused engineering hours for the complete candidate
- **Risk**: HIGH at native document and long-export boundaries; MED elsewhere
- **Depends on**: none
- **Category**: product direction, motion, correctness, UX, release readiness
- **Planned at**: commit `627931d`, 2026-08-23
- **Branch**: `codex/v2-directors-cut`
- **State**: DONE — all authorized local gates green at source `0a011f7`; stopped at owner, GitHub, and Apple gates

## The decisions, mapped to Kay's list

| # | Decision | When |
|---:|---|---|
| 1 | Build **Delivery Receipt** and **Close at Cut Tempo**. | First core phase |
| 2 | Build objective advisories/preflight, including Instagram overlap checks. | Last, after the UI and guide geometry settle |
| 3 | Reorganize the app into **Slides → World → Direct → Master** without remounting the stage. | Early core phase |
| 4 | Finish production `.pitched` document behavior. | Last native phase |
| 5 | Build per-slide crop, focal point, scale, and source health. | Early core phase |
| 6 | Build preview-only platform guides for Instagram Story, Reel, combined overlap, and custom guides. | After the workspace shell |
| 7 | Build Command-K only after the visible workflow is stable. | Endcap |
| 8 | Finish keyboard/VoiceOver/app-chrome motion behavior. Do not invent a motionless export product. | Final gauntlet |
| 9 | Prove long exports and bounded memory/cancellation behavior. | Final gauntlet |
| 10 | Build an optical A/B atlas so lens and grain choices are judged at output size. | Core visual phase |
| 11 | Kay's visual approval and additional feedback remain deferred. | Owner gate after candidate |
| 12 | Reconcile the donor ledger against what is actually visible, saved, and exported. | Documentation endcap |
| 13 | Do not pay for Apple membership, Developer ID, or notarization. | Hard boundary |

## Why this matters

Drift already has the expensive foundations: Project V4, an analytical
performance lifecycle, deterministic renderer/export evaluation, the donor
registries, and an isolated Mac development app. The remaining risk is not a
missing WebGL idea. It is product coherence: timing currently has two loop
surfaces, duration has one overloaded meaning, useful V4 ranges are hidden
behind narrower legacy controls, and the visible journey is still one long
inspector.

The fastest correct move is to consolidate those existing authorities, expose
them through a four-workspace journey, add evidence surfaces, then close native
documents and release readiness once. Rebuilding the renderer or packaging after
every feature would consume time without improving the thing Kay uses.

## Outcome

After this plan is executed and all non-owner gates hold, Drift V2 Dev will:

1. let a director choose either an exact master length or a reading pace that
   grows with the deck;
2. fit one or more complete deck passes inside that timing, including a
   **Spin then Read** performance;
3. state the exact video length, frames, pass boundaries, pace, cadence, seam,
   and sound-event count before export;
4. expose wider useful control ranges without making every slider coarse;
5. make Slides, World, Direct, and Master legible while keeping one persistent
   WebGL stage;
6. direct individual slides and see honest source-health warnings;
7. preview Instagram interface/safe-area overlap without burning guides into the
   export;
8. save and reopen the same Project V4 intent in the isolated Mac app;
9. have a truthful donor ledger, optical atlas, preflight, and release record;
10. remain open-source and locally usable without spending money on Apple
    distribution.

## Non-goals

- No Project V5 in this sprint.
- No new renderer, physics engine, keyframe editor, or pass sequencer.
- No animated thumbnail farm.
- No fake pixel-level "readability AI" or subjective preflight blocker.
- No separate reduced-motion export mode beyond the existing author-controlled
  master option; OS accessibility affects app chrome and preview behavior only.
- No public unsigned Mac binary presented as a frictionless release.
- No Apple purchase, Developer ID request, notarization submission, App Store
  submission, V1 replacement, GitHub push, merge, or release without its gate.

## Current state at the plan commit

The older handover
`Handover/DRIFT_V2_RUTHLESS_BUILD_PLAN_ZERO_CIRCLEJERK_2026-08-23.md`
remains the feature-inventory record. Its branch SHA and dirty-worktree section
are historical. At `627931d`:

- `git status --short --branch` is clean and the branch is seven commits ahead
  of `origin/codex/v2-directors-cut`.
- `src/core/project/schema.ts:336-343` defines Project V4 and a namespaced JSON
  `extensions` record. Use it for timing *author intent*; do not version-bump the
  whole project before native documents settle.
- `src/core/timeline/performanceLifecycle.ts:49-61` already owns entry, body,
  exit, tempo, repeat, and author-controlled reduced motion.
- `src/core/timeline/renderTravel.ts:61-68` already makes one seamless body own
  `slotCount × stride × seamlessLoops`. Entry and exit do not steal travel.
- `src/core/timeline/tempoCurve.ts:1-7` explicitly defines start/middle/finish as
  **relative** speed. Multiplying all three values by the same amount changes
  nothing; their shape is normalized to unit travel.
- `src/components/ControlPanel.tsx:619-626` exposes free-run speed plus seamless
  loops, while `ControlPanel.tsx:1214-1249` exposes a second Body/Full scene
  repeat surface. Those concepts must be named and separated, not stacked.
- `src/components/ControlPanel.tsx:1252-1265` presents one 3–30 second Duration
  control with no distinction between exact length and content-paced length.
- `src/lib/exportStudio.ts:390-399` already owns the export frame-count rule:
  `Math.round(duration × fps)`. Receipts must call the same helper, not copy it.
- `src/core/project/schema.ts:84-90` already stores per-slide fit, focal X/Y, and
  scale offset. This is primarily an interface and health-engine job.
- `src/engine/CinematicCarousel.ts:316-328` excludes a pinned-only image from the
  moving track, while `CinematicCarousel.ts:1285-1295` repeats related counting
  logic. Move the pure rule into core and reuse it everywhere.
- `src/components/Stage.tsx:128-133` has four generic corner guides. Replace the
  guide layer; do not touch rendered pixels.
- `src/App.tsx:1722-1807` mounts Media, Stage, and one ControlPanel. Keep Stage
  mounted and filter/recompose the side surfaces around it.
- `src/App.tsx:309-315` intentionally disables portable project controls in V2
  Dev except native self-test. Production `.pitched` ownership is therefore a
  later native gate, not an early UI switch.
- `src/components/controls.tsx:15-37` has a slider-only `RangeField`, while
  `controls.tsx:50-109` already has the typed-number behavior needed for precise
  extremes.

## Commands the executor will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline | `git status --short --branch` | correct branch; no unexplained changes |
| Typecheck | `npm run typecheck` | exit 0, no TypeScript errors |
| Focused unit | `npm run test -- tests/<file>.test.ts` | named file passes |
| Unit suite | `npm run test` | all tests pass |
| Selected browser | `npm run test:e2e -- e2e/<file>.e2e.ts` | named project passes |
| Full source gate | `npm run check` | typecheck, unit, Mac source checks, and web build pass |
| Full browser gate | `npm run test:e2e` | all Playwright projects pass |
| Build isolated Mac app | `npm run build:mac:v2-dev` | exit 0; V2 Dev bundle produced |
| Verify isolated Mac app | `npm run verify:mac:v2-dev` | exit 0; identity and bundle checks pass |

Do not run `npm install` unless the lockfile and local dependencies are actually
missing. Do not add a dependency for timing math, overlays, command dispatch, or
preflight; none is required.

## The timing model

### Plain-language contract

Drift needs two timing modes, because "ten seconds" and "comfortable reading
pace" answer different questions:

1. **Exact Length** — the director sets the exported video length. Drift fits the
   chosen number of complete deck passes inside it. More slides means faster
   travel. The master length never changes silently.
2. **Reading Pace** — the director sets seconds per slide. Drift counts the
   moving slides and deck passes, then derives the master length. More slides
   means a longer export. The pace never changes silently.

The UI must always show the resolved result before export. "Dynamic" means the
duration updates as slides or pass count change; it never means an unknown
duration.

### Vocabulary

- **Moving slide**: an ordered deck asset that travels. An enabled image used as
  `pinned-only` is excluded. A `moving-and-pinned` asset is included.
- **Deck pass**: every moving slide crosses the authored path once.
- **Body**: one continuous carousel movement containing one or more deck passes.
- **Scene**: optional entry + body + optional exit.
- **Scene repeat**: repeats entry/body/exit as a unit. This remains Advanced and
  is not the same as deck passes.
- **Continuous preview**: loops playback in the studio only. Every export remains
  finite.
- **Master length**: exact encoded output duration after frame quantization.

### Persisted intent without Project V5

Create `src/core/timeline/timingIntent.ts` and store only the authoring intent
that Project V4 does not already own under:

```ts
project.extensions["dog.pitch.drift.timing"] = {
  schemaVersion: 1,
  mode: "fixed-master" | "content-paced",
  secondsPerSlide: number
};
```

Do not duplicate resolved truth:

- `project.master.duration` remains the resolved master duration.
- `project.performance` remains entry/body/exit/tempo/repeat authority.
- `project.motion.seamless.enabled` and `.loops` remain exact deck-pass travel
  authority.
- the extension stores mode and the content-paced input only.

Missing or malformed extension data resolves safely to `fixed-master` while
preserving the current master. Parsing must be strict and pure; unknown extension
keys remain untouched.

### Equations

For the primary flow where scene repeat is off:

```text
movingSlides = canonical moving-media count after pinned-only exclusion
deckPasses = project.motion.seamless.loops
deckDistanceInSlides = movingSlides × deckPasses
entrySeconds = enabled entry duration, otherwise 0
exitSeconds = enabled exit duration, otherwise 0

Exact Length:
bodySeconds = masterSeconds - entrySeconds - exitSeconds
averageSlidesPerSecond = deckDistanceInSlides / bodySeconds

Reading Pace:
bodySeconds = movingSlides × deckPasses × secondsPerSlide
masterSeconds = entrySeconds + bodySeconds + exitSeconds
averageSlidesPerSecond = 1 / secondsPerSlide
```

The resolver must reject or repair impossible exact masters where entry + exit
leave less than the canonical minimum body. It must never make a transition
negative or silently disable one. The UI shows the minimum legal master and one
explicit repair action.

When Advanced full-scene repeats are active, use lifecycle counts rather than a
second formula:

```text
bodySecondsPerCycle =
  (masterSeconds - sceneCount × (entrySeconds + exitSeconds)) / bodyCycleCount
```

Existing `repeat.mode="body"` projects remain readable. Do not rewrite them on
open. Show them as **Legacy body repeats** with an explicit **Consolidate into
deck passes** command that multiplies the travel count, checks the supported hard
limit, sets repeat off, and creates one undoable project command.

### Required recipes

| Director request | Resolved settings | Receipt result |
|---|---|---|
| One complete pass in 10 s | Exact Length, 10 s, 1 deck pass, Even | one pass; 10 s when entry/exit are off |
| Three passes in 30 s | Exact Length, 30 s, 3 deck passes, Even | three 10 s pass windows when entry/exit are off |
| Casino spin, then readable pass in 10 s | Exact Length, 10 s, 2 deck passes, Spin then Read | first pass roughly 1.5 s, second roughly 8.5 s when entry/exit are off |
| Deck grows naturally | Reading Pace, e.g. 0.75 s/slide, chosen passes | duration recomputes from moving slide count |
| Fast → slow → fast | either timing mode, Fast · Slow · Fast tempo | same exact total; pace changes within it |

Add `spin-then-read` to the existing analytical tempo registry with the starting
target `{ start: 3, middle: 0.12, finish: 0.12 }`. This is a continuous
velocity curve, not a cut or a second sequencer. The fixture above should place
50% of travel at approximately 15.1% of body time. Tune only if the real 9:16
feel check shows an unreadable settle; preserve exact endpoints.

### Delivery Receipt

Create `src/core/timeline/deliveryReceipt.ts`. It consumes the resolved Project V4,
moving-media order, export settings, event plan, and the existing lifecycle. It
returns data only; UI formatting belongs in Master.

The receipt must show:

- timing mode and whether duration or pace is the protected input;
- moving slide count and whether a pinned-only asset was excluded;
- deck-pass count and any Advanced scene repeats;
- entry, body, exit, and exact master seconds;
- one boundary and duration for every deck pass;
- average, minimum, and peak slides per second;
- approximate average read window per slide, clearly labelled as a pace
  diagnostic rather than content understanding;
- output dimensions, aspect ratio, FPS, exact `getExportFrameCount()` result, and
  encoded duration after frame quantization;
- pose cadence compatibility: exact twos for 12-at-24, deterministic mixed frame
  holds for 12-at-25/30, and any endpoint mismatch;
- seamless closure status;
- deterministic sound event count when sound export is on;
- presenter participation and pinned-only moving-track exclusion;
- transparent-output/container compatibility;
- export workload class from frame count × pixel count.

Do not fabricate a pre-export wall-clock ETA. Before export, show frames, pixels,
and a plain workload class. During export, show a rolling ETA only after enough
frames have completed to calculate it; label it an estimate.

Invert `evaluateTempoCurve()` with a deterministic bounded bisection helper to
find each pass boundary where travel progress equals `passIndex / deckPasses`.
Test endpoints, monotonicity, zero-handle holds, and the Spin then Read fixture.

### Close at Cut Tempo

This is an explicit repair button, not an automatic rewrite. Show it only when a
free-run/non-seamless master ends on a fractional deck or when frame/cadence
quantization produces an uneven final pose.

- In **Exact Length**, preserve the chosen master length and solve travel pace or
  nearest complete deck-pass count.
- In **Reading Pace**, preserve seconds per slide and adjust the derived master
  to the nearest complete pass/cadence endpoint.
- Preview old vs proposed values before applying.
- Apply as one undoable command.
- If the existing exact-deck settings already close, show **Closes cleanly** and
  no button.

## Control-range contract

### One precise component, not giant coarse rails

Add `RangeNumberField` beside the existing fields in
`src/components/controls.tsx`. It combines:

- a **soft range** slider for the useful/tasteful everyday zone;
- a directly editable number for the wider **hard range**;
- arrow-key stepping, Escape revert, Enter/blur commit, clamping, and units;
- no state update on invalid intermediate text;
- one `onChange` contract so the project history does not get two commands for
  one value.

This gives genuinely larger minima/maxima while keeping the rail controllable.
Do not stretch every normalized taste control to absurd values.

### Range audit and target values

| Control | Soft rail | Hard range | Decision |
|---|---:|---:|---|
| Free-run speed | 0.02–4 slides/s | 0–8 | Widen; label actual unit, not `×` |
| Exact master | 1–60 s | 0.5–300 s | Widen; >60 remains Advanced until long-export gate holds |
| Seconds per slide | 0.1–3 s | 0.05–10 s | New Reading Pace control |
| Deck passes | 1–12 | 1–100 | New primary loop control; finite export only |
| Entry / exit | 0.08–3 s | 0.05–6 s | Widen and constrain against body minimum |
| Start / middle / finish tempo | 0–4 relative | 0–10 relative | Widen ratios; explain scale-free behavior |
| Slide size | 10–160% | 10–160% | Widen from 24–110%; update V4 geometry/validation together |
| Spacing | 0–250% | 0–250% | Widen from 120%; prove both axes |
| Depth | 0–100% | 0–100% | Expose existing V4 range |
| Banking | −45°–45° | −45°–45° | Replace the narrower one-sided `Tilt` surface |
| Focus lift | 0–50% | 0–50% | Expose existing V4 range |
| Corner radius | 0–256 px | 0–512 px | Wider typed extreme; preserve smoothing separately |
| Slide / pin border | 0–24 px | 0–32 px | Widen; transparent default remains zero |
| Slide / pin shadow softness | 0–192 px | 0–256 px | Widen without changing the tasteful default |
| Pin width | 5–100% | 5–100% | Widen from 14–82%; retain height-aware fit/collision rules |
| Pin shadow X/Y | −128–128 px | −512–512 px | Widen; keep zero easy to hit |
| Material thickness | 0–40% | 0–100% | Widen carefully; no validator-only fantasy values |
| Key / fill / rim | 0–200% | 0–200% | Unify the three existing V4 maxima |
| Shadow reach | 0–320 px | 0–512 px | Expose existing V4 maximum |
| Presenter gain | 0–200% | 0–200% | Do not widen until limiter/listening evidence exists |

Keep these constrained because their current limits already express their full
meaning or a taste/safety ceiling: focal X/Y, smoothing, opacities, artwork/hero
protection, roughness, sheen, background grain, camera grain, lens intensities,
sound levels, and pin X/Y. In particular, do **not** widen grain merely because a
validator can. Animated grain needs a restrained useful range and a good default,
not radioactive snow.

Every widened range must update all three owners in one phase: Project V4
validation, legacy/studio projection validation where applicable, and renderer
clamps. A control does not count as widened if the renderer silently clamps it
back to the old value.

## Four-workspace journey

Keep the central `Stage` mounted. Add a session-only
`activeWorkspace: "slides" | "world" | "direct" | "master"` in `src/App.tsx`
and pass it to composed inspector surfaces. Do not save which tab was open into
Project V4.

### Slides

- import, order, remove, selected-slide state;
- source-health badge and exact reason;
- per-slide fit, focal X/Y, and scale offset;
- pinned frame source, pinned-only vs moving-and-pinned, position, size, aspect,
  fit/crop, focal point, radius/smoothing, border, matte, shadow, trim/start/gain;
- one explicit reset for the selected slide and one for the pin.

### World

- authored World cards and pressure;
- portrait Scene when applicable;
- background hero row, Browse all, search/tag/family filters;
- palette, Recut, A/B, transparent/custom state;
- no duplicated motion/material controls.

### Direct

- exact timing/reading pace summary and tempo profile;
- motion, path, card size/spacing, material, lighting, atmosphere fine controls,
  lens, sound, entry/exit, presenter interaction;
- Advanced groups remain collapsed by default;
- no output codec or safe-guide controls.

### Master

- output ratio/dimensions/FPS/alpha/audio;
- exact length or derived length, deck passes, continuous-preview toggle;
- platform guides and poster moment;
- Delivery Receipt, later preflight, still/sequence/MP4;
- rolling export progress and ETA only while real frames complete.

Desktop uses one compact workspace switch above the side panel. Mobile uses the
same four labels plus Stage; do not maintain a separate mobile information
architecture. Switching workspaces must not recreate the WebGL context, reset
preview time, re-decode media, or lose undo/redo.

## Per-slide direction and honest source health

Create `src/core/media/slideHealth.ts` as a pure metadata-based evaluator. It may
report only facts Drift can prove:

- manifest asset missing;
- decode failed or unsupported media;
- zero/invalid source dimensions;
- source pixel dimensions below the maximum projected output footprint;
- highly unusual ratio or mixed-ratio deck;
- crop/focal values that put the selected focal point outside the visible crop;
- selected slide is pinned-only and therefore excluded from deck timing.

Do not claim a slide is semantically unreadable, too text-heavy, or ugly without
pixel/content analysis. Low-resolution is a warning, not a blocker, unless export
cannot decode it.

Use existing `project.slides[assetId]` directives. Update one directive per user
gesture through the existing Project V4 command/history path. Global card fit
remains the default for slides without an override. Add selected-slide state to
the app session, not the project.

## Platform guides and Instagram overlap

Create a versioned data registry in `src/core/platformGuides/` with normalized
rectangles and source metadata:

```ts
interface PlatformGuideProfile {
  id: string;
  label: string;
  aspect: number | null;
  lastVerified: string;
  sourceUrls: readonly string[];
  obstructions: readonly NormalizedRect[];
  safeInsets?: { top: number; right: number; bottom: number; left: number };
  status: "official" | "conservative-observed" | "custom";
}
```

Ship these profiles:

1. None.
2. Instagram Story — Meta-safe authoring region.
3. Instagram Reel — conservative app-chrome overlay.
4. Instagram combined — union of Story and Reel obstructions.
5. Custom — independent top/right/bottom/left controls.

Meta's public Story ad guidance says to leave roughly 14% of the top and 20% of
the bottom free of key elements. Use those percentages for the official
Story-safe profile. Draw a recognizable preview silhouette inside the obstructed
zones: progress/header at top; reply/CTA tray at bottom. For 1080×1920 this is
approximately 269 px top and 384 px bottom, but store normalized values.

Meta's public Reels material requires 9:16 creative with key messages in a safe
zone, but exact app chrome moves and some pages are login-gated. Treat the Reels
profile as `conservative-observed`, version it with `lastVerified`, and visually
re-check it against a fresh physical Instagram screenshot before the final
preflight. Never label it a permanent platform guarantee.

The guide layer is DOM/SVG above the canvas, preview-only, and excluded from
still, sequence, and video exports. Stage geometry must expose normalized bounds
for the presenter and selected slide so Master can say exactly which obstruction
they overlap. Combined mode uses the geometric union, not stacked opacity.

Primary references to retain in the registry and docs:

- Meta Story CTA/safe-area guidance:
  <https://www.facebook.com/help/instagram/192168966243613>
- Meta Reels creative guidance:
  <https://www.facebook.com/business/ads/facebook-instagram-reels-ads>
- Meta's 2025 social best-practices PDF, which emphasizes mobile-first sizing,
  safe zones, and previewing:
  <https://communityforums.atmeta.com/t5/s/hucou38897/attachments/hucou38897/General_Development_Discussion/538/1/GTMA_Unfold_Social_Best_Practices-1.pdf>

No runtime network call is allowed. Updating guides is a source change with a
date and evidence, not a server dependency.

## Optical atlas and grain judgment

The atlas is a QA artifact, not another effect system. Add a deterministic
capture script only if the existing Playwright screenshot infrastructure cannot
compose it directly.

Fixtures:

- ratios: 9:16, 4:5, 1:1, 16:9;
- decks: dense text, full-bleed image, mixed ratios, transparent artwork;
- states: clean/rest, peak motion, dark, light, transparent, presenter;
- comparisons: clean gate against every approved local finish/global lens,
  plus each World default;
- grain: background grain alone, material microtexture alone, camera grain alone,
  and the authored combined default at native output size.

Write ignored artifacts under:

```text
output/qa/v2-optical-atlas/<candidate-sha>/
  manifest.json
  contact-sheet.png
  <ratio>/<fixture>/<treatment>.png
  SHA256SUMS
```

Each accepted visual change needs a clean A/B at real output size. Fix only a
reproducible defect: transparent border/muddy shadow, pin collision, illegible
background competition, unstable grain, rest-state blur, off-centre aberration,
or a portrait scene that is merely a cropped landscape. Maximum three visual
iterations per defect; after that, park it for Kay rather than churn the system.

## Donor ledger reconciliation

Update `docs/v2/DONOR_LEDGER.yaml` only after the visible features settle.
For every donor SHA/domain:

- record what source was actually studied;
- map accepted semantics to exact destination files and registries;
- record rejected shell/project/export code and why;
- name the focused tests and atlas artifacts that prove the accepted behavior;
- synchronize counts with the public UI;
- say `partial` or `not integrated` when that is the truth.

Forty names are not forty backgrounds if they resolve to cosmetic aliases.
Conversely, do not re-port a donor because the ledger wording is stale. Inspect
the live registry first. Donor parity is a documentation conclusion after
evidence, never a target that excuses duplicate code.

## Command palette endcap

After Slides/World/Direct/Master settles, add Command-K as a thin dispatcher over
the same commands used by buttons. It must not create a second action model.

Initial command registry:

- switch to Slides, World, Direct, Master;
- add slides, add/replace presenter;
- toggle pause, focus mode, platform guides, A/B;
- undo, redo, Recut;
- export still, sequence, MP4;
- open/save/save as/revert only when the native document capability is present.

The palette opens instantly with no entrance animation: it is a high-frequency
keyboard tool. Search and selection remain keyboard/VoiceOver legible. Escape
closes; destructive actions are absent.

## Preflight and advisories — deliberately last

Create a pure `src/core/preflight/` engine after the final UI geometry exists.
Use three levels: blocker, warning, note. Only conditions that make the requested
artifact impossible or corrupt are blockers.

Objective checks:

- missing/failed media decode;
- invalid dimensions, FPS, duration, encoder, alpha/container, or audio plan;
- insufficient export storage/budget according to existing export estimators;
- non-closing free-run endpoint or cadence mismatch;
- unresolved native save conflict or dirty/recovery state;
- presenter/selected-slide overlap with the active platform guide;
- low source resolution relative to projected output;
- mixed aspect ratios and heavy cover crops;
- a very short read window for the current slide count;
- long-export workload and unsupported physical validation lanes.

Taste warnings stay warnings. Do not claim the deck has too much text or that a
World is aesthetically wrong. Each repair is an explicit existing project
command, previewed before application. No advisory silently changes creative
work.

## Native `.pitched` behavior — deliberately last

Use the existing `macos/App/NativeDocumentSession.swift`,
`macos/App/NativeFileBroker.swift`, `macos/NativeBridge.js`, and browser portable
project code. Do not invent another archive or autosave format.

Required isolated V2 Dev behavior:

- Open, Save, Save As, Revert;
- native dirty-state/window title;
- atomic write and readback of the exact destination bytes;
- recovery after interrupted save;
- external-conflict detection with fail-closed replacement;
- media and Project V4 round-trip, including timing extension and per-slide data;
- Finder/open-event behavior tested without registering V2 Dev as production
  owner first;
- V1 `.pitched` compatibility and rollback path preserved.

Only after those tests hold may an executor propose registering `.pitched` or
replacing the V1 app. That proposal is an owner gate, not part of autonomous
execution.

## Accessibility, hardware, and long-export gauntlet — deliberately last

Accessibility is narrow and relevant:

- keyboard access and visible focus across the four workspaces;
- VoiceOver names/state for controls, guide warnings, receipt, progress, and
  palette;
- pause remains reachable;
- macOS Reduce Motion may simplify decorative app-chrome transitions and preview
  autoplay, but never rewrites an authored export;
- no parallel reduced-motion directing system.

Performance matrix:

| Duration | Slides | Ratios | Required observations |
|---:|---:|---|---|
| 30 s | 8 and 40 | 9:16, 16:9 | frame agreement, memory returns, cancel works |
| 60 s | 40 | 9:16, 16:9 | progress/ETA stable, no context reset |
| 180 s | 40 and 200 | 9:16 | bounded decode/texture memory, exact artifact |

Run on the available Apple Silicon Mac. Do not claim Intel validation without a
physical Intel run. Universal binary architecture is not behavioral proof.

## Apple and open-source boundary

Apple currently lists the Apple Developer Program at USD 99 per membership year
and includes Developer ID/notarization in the paid program. Developer ID
distribution requires membership and notarization. Therefore this plan stops
before any purchase, certificate request, or notarization submission.

The no-cost release lane is:

- AGPL-3.0-or-later source on GitHub;
- exact source commit, lockfile, CI, contributor/security/user docs;
- reproducible local build instructions and checksums;
- isolated ad-hoc `/Applications/Drift V2 Dev.app` for Kay's own machine;
- source-only public release unless Kay later confirms an existing paid account
  or explicitly chooses to pay.

References:

- <https://developer.apple.com/support/compare-memberships/>
- <https://developer.apple.com/support/developer-id/>

## Execution phases

### Phase 0 — freeze reality, 15–30 minutes

1. Verify branch/head/worktree and read the current installed V1/V2 Dev bundle
   identities without changing them.
2. Confirm the older handover inventory against the live registries; do not
   re-port already integrated domains.
3. Record baseline focused test counts. Do not package.

**Verify**: `git status --short --branch` and `git rev-parse HEAD` match the
executor's recorded baseline. No source changed.

### Phase 1 — timing authority, receipt, and widened ranges, 4–7 hours

Expected files:

- create `src/core/project/movingMedia.ts`;
- create `src/core/timeline/timingIntent.ts`;
- create `src/core/timeline/deliveryReceipt.ts`;
- edit `src/core/timeline/tempoCurve.ts`;
- edit `src/core/project/validation.ts`, `src/lib/settingsValidation.ts`,
  `src/core/spatial/spatial.ts`, `src/lib/exportStudio.ts` only where range
  contracts require;
- edit `src/components/controls.tsx` and the timing/range sections of
  `src/components/ControlPanel.tsx`;
- minimally edit `src/engine/CinematicCarousel.ts` to consume the core moving
  media helper;
- create focused tests beside existing timeline/project/export patterns.

Order:

1. Characterize moving-media count, current exact-loop travel, frame count, and
   lifecycle duration.
2. Extract the pure moving-media rule and switch both current callers.
3. Add timing intent parse/resolve/update and the two-mode equations.
4. Add Spin then Read and pass-boundary inversion.
5. Add Delivery Receipt and Close at Cut Tempo proposal/apply functions.
6. Add `RangeNumberField`; widen the audited contracts end-to-end.
7. Replace the two primary loop surfaces with Deck passes + Advanced scene
   repeats. Preserve legacy body repeats without auto-migration.

**Focused verification**:

```sh
npm run test -- tests/timingIntent.test.ts tests/deliveryReceipt.test.ts tests/v2FrameEvaluation.test.ts tests/exportStudio.test.ts
npm run typecheck
```

Expected: all named tests pass; typecheck exits 0. Inspect one 10 s / one pass,
30 s / three passes, 10 s Spin then Read, and content-paced slide-add/remove
fixture. Do not run the full Mac build here.

### Phase 2 — four workspaces and per-slide direction, 4–6 hours

Expected files:

- edit `src/App.tsx`, `src/components/MediaLibrary.tsx`,
  `src/components/ControlPanel.tsx`, `src/components/Stage.tsx`, and
  `src/styles.css`;
- create `src/core/media/slideHealth.ts` and focused tests;
- extend existing Project V4 command tests, not the project schema.

Order:

1. Add session-only workspace/selected-slide state.
2. Keep Stage mounted while routing the existing groups into the four surfaces.
3. Add per-slide controls and health facts.
4. Place all existing pinned-frame control in Slides/Direct; do not fork pin
   state.
5. Confirm undo/redo, A/B, playback time, textures, and project state survive
   workspace switches.

**Focused verification**:

```sh
npm run test -- tests/slideHealth.test.ts tests/projectCommands.test.ts tests/appPresentation.test.ts
npm run test:e2e -- e2e/studio-workspaces.e2e.ts e2e/studio-projects.e2e.ts
npm run typecheck
```

Expected: selected slide survives workspace navigation; per-slide edit is one
undo step; Stage canvas node identity does not change; no media re-decode storm.

### Phase 3 — guides and optical atlas, 4–6 hours

Expected files:

- create `src/core/platformGuides/registry.ts`, geometry helper, and tests;
- edit `src/components/Stage.tsx`, Master controls, and `src/styles.css`;
- add only the smallest existing-infrastructure-compatible atlas script/fixture;
- write ignored artifacts under `output/qa/`.

Order:

1. Implement normalized guide registry and geometric overlap.
2. Render preview-only Story, Reel, combined, and custom overlays.
3. Wire presenter/selected-slide overlap facts into the receipt, not preflight
   yet.
4. Generate the first atlas from the frozen fixtures.
5. Repair only material A/B defects, with the three-iteration limit.

**Focused verification**:

```sh
npm run test -- tests/platformGuides.test.ts tests/deliveryReceipt.test.ts tests/engineShader.test.ts
npm run test:e2e -- e2e/studio-renderer.e2e.ts
npm run typecheck
```

Expected: guides never appear in still/sequence/video pixels; normalized overlap
holds at 9:16 and resizes; atlas manifest and hashes match decoded files.

### Phase 4 — first integrated source checkpoint, 1–2 hours

Run the first broad gate only now:

```sh
npm run check
npm run test:e2e -- e2e/studio-timing.e2e.ts e2e/studio-workspaces.e2e.ts e2e/studio-export.e2e.ts
```

Repair causal failures once. If the same gate fails twice for the same reason,
stop and diagnose; do not spray retries or weaken assertions.

This is the **usable core checkpoint**. Expected focused engineering time from
authorization: roughly 12–18 hours.

### Phase 5 — ledger and Command-K endcap, 3–5 hours

1. Reconcile `docs/v2/DONOR_LEDGER.yaml` against live files/tests/artifacts.
2. Add the static command registry and instant Command-K surface.
3. Update user/architecture docs only for now-visible behavior.

**Verify**: focused command keyboard test, donor-ledger validator if present,
`npm run typecheck`. Do not package.

### Phase 6 — preflight, 3–5 hours

1. Implement pure objective checks.
2. Reuse receipt, guide, export-budget, and health facts.
3. Wire explicit repair commands.
4. Falsify each blocker/warning class once.

**Verify**:

```sh
npm run test -- tests/preflight.test.ts tests/exportStudio.test.ts tests/projectMediaBudget.test.ts
npm run test:e2e -- e2e/studio-export.e2e.ts
```

Expected: blockers prevent only impossible/corrupt exports; warnings never mutate
the project; Instagram overlap reflects the active versioned guide.

### Phase 7 — native documents, 5–8 hours

1. Characterize existing portable round-trip and native self-test.
2. Wire V4 timing/slide/guide-independent state through Open/Save/Save As/Revert.
3. Add dirty/recovery/external-conflict/readback tests.
4. Test Finder open in the isolated V2 lane without production registration.

**Verify**: native focused tests and `npm run check:mac-source`. Do not install or
replace V1 yet.

### Phase 8 — accessibility, long export, package once, 4–7 hours

1. Complete keyboard/VoiceOver/app-chrome checks on the settled interface.
2. Run the long-export matrix once; inspect memory, cancellation, recovery, and
   exact destination artifacts.
3. Run the final source and browser gates once on the exact candidate SHA.
4. Build and verify the isolated V2 Dev app once after the last accepted source
   change.
5. With Kay's existing installation authority, install only
   `/Applications/Drift V2 Dev.app`; preserve `/Applications/Drift.app` byte for
   byte. Read back installed identity and export one real file.

Final commands:

```sh
npm run check
npm run test:e2e
npm run build:mac:v2-dev
npm run verify:mac:v2-dev
```

If packaging or installed verification causes a source repair, repeat only the
affected check and then the final candidate gate once. Do not enter an install
loop.

### Phase 9 — document reality and stop at external gates, 1–2 hours

Record separately:

- edited SHA;
- source-tested SHA;
- browser-tested SHA;
- packaged bundle identity;
- installed V2 Dev identity;
- real export path/hash/codec/duration/frame evidence;
- unpaid Apple distribution status;
- owner visual-approval status;
- GitHub push/PR/merge/release status.

Stop. No push, PR mutation, merge, public release, `.pitched` ownership change,
notarization, or V1 replacement in this plan's autonomous lane.

## Parallel work without merge theatre

After implementation is authorized, use parallel agents only for disjoint work:

- **Timing lane**: core timing/receipt tests; no `App.tsx` or native files.
- **Guide/atlas lane**: guide registry, geometry tests, capture fixture; no
  project/timeline schema.
- **Ledger audit lane**: read-only donor-to-live reconciliation draft; no source
  edits until integration settles.
- **Integration owner**: Project V4 commands, `App.tsx`, `ControlPanel.tsx`, Stage,
  native boundary, and final conflict resolution.

Never let two agents edit `App.tsx`, `ControlPanel.tsx`, project validation, or
the native bridge concurrently. Parallelism is for independent evidence and pure
modules; shared UI integration stays serial because conflict repair costs more
than it saves.

## Test economy

- Write one falsifier per material risk, not a snapshot for every label.
- Run focused unit files after each causal phase.
- Run typecheck at phase boundaries.
- Run the broad web/source gate after the core integration and once on the final
  candidate.
- Run the full browser suite once on the final candidate.
- Package/install once after source settles.
- A failed assertion is evidence to diagnose, not something to rewrite until
  green.
- Tests establish correctness. Atlas A/B and Kay establish taste.

## Git workflow

- Work on `codex/v2-directors-cut` unless Kay names a different branch.
- Make one coherent commit per converged phase; match the repository's existing
  imperative commit style.
- Before every commit, inspect `git diff --stat`, `git diff --check`, and the
  exact changed paths.
- Never reset, stash, clean, or revert unrelated work.
- Do not push, update PR 34, merge main, create a release, or publish artifacts
  without the explicit external gate.

## Done criteria

All must hold before calling the non-paid V2 Dev candidate complete:

- [x] Exact Length and Reading Pace round-trip in Project V4.
- [x] 10 s/one pass, 30 s/three passes, Spin then Read, and slide-count-derived
  timing produce the receipt's exact expected boundaries.
- [x] Pinned-only media is excluded consistently from timing and rendering.
- [x] Entry, body, exit, deck passes, scene repeats, and continuous preview have
  distinct names and behavior.
- [x] Every widened control reaches the renderer and round-trips; no hidden old
  clamp wins.
- [x] Slides, World, Direct, and Master switch without remounting Stage.
- [x] Per-slide direction is undoable and health claims are metadata-provable.
- [x] Instagram Story/Reel/combined/custom guides are versioned, preview-only,
  and geometrically tested.
- [x] Optical atlas manifest, decoded images, hashes, and contact sheet exist for
  the candidate SHA.
- [x] Command-K dispatches existing commands and opens instantly.
- [x] Preflight distinguishes blocker/warning/note and never silently repairs.
- [x] `.pitched` Open/Save/Save As/Revert/dirty/recovery/conflict/readback work in
  the isolated V2 Dev lane.
- [x] Long-export matrix completes or cancels cleanly with bounded resources.
- [x] `npm run check` and `npm run test:e2e` pass on the implementation SHA.
- [x] `/Applications/Drift V2 Dev.app` is verified independently if installed;
  `/Applications/Drift.app` remains untouched.
- [x] Donor ledger and public docs match the verified candidate, including
  partial/unknown states.
- [x] Apple paid distribution remains not attempted.
- [x] GitHub, merge, release, and owner visual approval are reported as separate
  states.

## STOP conditions

Stop and report; do not improvise if:

- Project V4, lifecycle, travel, or native document architecture no longer
  matches the current-state contract at the plan commit.
- A requirement appears to need a second renderer/timeline/project version.
- the same verification gate fails twice for the same causal reason;
- a visual defect has consumed three material A/B iterations;
- range widening produces NaN, unbounded geometry, context loss, or a breaking V1
  migration that cannot be repaired inside the named phase;
- native `.pitched` work risks overwriting a real existing document or registering
  production ownership;
- the only next step requires money, credentials, signing identity, publishing,
  merge, release, or replacement of V1;
- physical Intel behavior is required but no Intel machine is available;
- the live Instagram UI materially contradicts the versioned conservative guide;
- an unrelated dirty-worktree change overlaps an in-scope file.

## Estimate and check-in points

These are focused executor-time estimates, not calendar promises:

- timing, ranges, four workspaces, per-slide controls, guides, and atlas:
  **12–18 hours**;
- ledger, Command-K, and preflight: **6–10 hours**;
- native documents, accessibility, long exports, packaging, and final evidence:
  **9–15 hours**;
- complete non-paid candidate: **27–43 hours**.

The first worthwhile screen check is after Phase 4: the timing model, wider
controls, four-workspace journey, per-slide direction, guides, and first atlas
should all exist. Checking earlier would mostly expose temporary wiring. The next
check is the final isolated Mac candidate before any GitHub/main/release decision.

## Maintenance notes

- If Project V5 is introduced later, migrate the timing extension intentionally;
  do not leave two writable copies of timing intent.
- Platform-guide dates and sources need periodic review because social UI chrome
  changes independently of Drift.
- If a public signed Mac release becomes desirable, treat Apple membership and
  notarization as a new, explicitly funded release plan.
- Future timeline UI may add key points only if the analytical three-point curve
  fails a concrete directing case. It is not part of this sprint.
- Keep the Delivery Receipt as the shared fact source for UI, preflight, tests,
  docs, and export status. Duplicated timing arithmetic will drift.
