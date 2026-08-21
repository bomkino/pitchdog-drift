# Sonic QA receipt

This receipt is specific to the tactile-sound branch. It does not replace the wider renderer and product receipt in [`QA_REPORT.md`](QA_REPORT.md).

## State and authority

- Pull request: **#19**.
- Branch: `feat/tactile-sound-system-v2`.
- State: **draft only; unmerged**.
- This receipt does not authorize merge, auto-merge, deployment, publication, or a ready-for-review transition.
- The branch intentionally avoids unrelated lighting, shader, physics, background, layout, and carousel-redesign work.

## Actual product claim

Drift can give carousel motion physical consequence without becoming a music player or a noisy soundboard. The authored vocabulary is recorded tactile foley—cards, paper, cloth, leather, wood, metal, and soft impacts—attached to semantic motion and editor outcomes.

The branch does **not** bundle music, generated sound effects, hover chatter, slider ticks, remote sound playback, or continuous ambience.

## Source and treatment evidence

- 23 untouched WAV recordings are committed locally.
- The recordings come from Kenney Casino Audio, RPG Audio, and Impact Sounds packs released under CC0 1.0.
- Exact upstream repository revision, upstream path, Git blob SHA-1, SHA-256, byte length, physical material, intended use, canonical source, and licence are recorded in `src/sonic/assets/manifest.json`.
- Original pack licence texts are preserved under `src/sonic/assets/licenses/`.
- `scripts/vendor-sonic-assets.py --verify` checks the committed files without downloading anything.
- Production assets are emitted as separately hashed same-origin WAVs. They are not embedded into JavaScript and no third-party sound host is contacted at runtime.
- `src/sonic/assets/treatments.json` records non-destructive trim and gain treatment. Original WAV bytes remain hash-identical to upstream.
- The treatment gate constrains active-energy spread, onset delay, pre-mix peak, file coverage, and ledger consistency.
- Live preview and offline export use the same trim window, treatment gain, deterministic sample choice, pitch, pan, and compressor contract.

## User-journey evidence

### First use and migration

- New projects expose tactile preview only after a trusted gesture.
- Exported foley starts off by default.
- Older silent projects migrate with preview and export sound disabled, preventing surprise audio.
- Enabling preview from a migrated project uses the same click to initialize Web Audio; it does not require a second gesture.
- Muting preview and including foley in MP4 are independent controls.
- Every sound control is labelled, keyboard reachable, persisted, and non-essential to understanding visible status.

### Motion

- Passage cues follow logical slide crossings rather than rendered frames.
- Preview and export use the same seeded density and variation decisions.
- A canvas click remains silent. Grab/release begins only after a deliberate drag threshold.
- A real drag receives one grab and one release, not continuous friction noise.
- Drag, wheel, and paused-autoplay inertia emit at most one settle when motion genuinely rests.
- Continuous autoplay does not emit false settle cues.
- Repeated wheel packets do not each become a sound.
- Hidden documents, context loss, settings replacement, asset replacement, step commands, export, and reduced motion discard stale settle state.
- Cue cooldowns, density, and an eight-voice ceiling prevent machine-gun overlap.

### Narration and export

- Presenter speech and authored foley are mixed into one exact-duration 48 kHz stereo master before AAC encoding.
- Mono narration remains centred while lateral foley remains stereo.
- Foley survives deliberate packet gaps in presenter audio.
- The under-voice control applies only when speech and foley coexist.
- Sound-only, presenter-only, and mixed output each produce one verified audio track rather than competing tracks.
- Preview sound is suppressed throughout capture and restored in cleanup.
- Success or failure feedback can play only after suppression is lifted.
- User cancellation is neutral; it is not sounded or announced as failure.
- Renderer-surface recovery failure cannot leave preview sound permanently suppressed.
- The existing MP4 readback gate remains strict; this branch does not weaken Rec.709, frame-count, duration, or decoded-audio verification to make tests pass.

## Executed gauntlets

### Baseline full branch CI

Commit `d574bf3d426e999bdc766e1b1626470467d8f4fa` passed the repository’s complete CI workflow in run `32434255764` before the final interaction/lifecycle patch. That run covered TypeScript, unit and contract checks, production build, sonic bundle and treatment gates, and the complete Chromium suite then present on the branch.

### Interaction/lifecycle hardening

The one-shot guarded workflow that produced commit `0c09dd633cec0ba852e5e186e1879ea41c4aad85` could commit only after all of the following completed successfully:

- `npm ci` from the committed lockfile;
- `npm run check`;
- the tactile interaction browser journey;
- the lazy-loading/privacy browser journey;
- stale-head checks before validation and again before push;
- `git diff --check`;
- removal of its own workflow and the obsolete phase-parity trigger.

The interaction browser journey proves accessible mute state, silent clicks, one grab/release/settle drag, one wheel settle, and export-success feedback occurring after preview suppression is released.

### Independent local falsification

A separate headed Chromium/WebGL run repeated the new interaction journey against a clean source simulation. TypeScript, 74 focused unit/contract tests, production build, treatment gate, bundle gate, and the browser journey passed. A headless environment that silently entered DOM fallback was rejected explicitly rather than misreported as a motion-test timeout.

## Final review gate

The commit adding this receipt is intentionally authored outside `github-actions[bot]` so GitHub runs the ordinary full pull-request workflow again. This draft is not considered audit-complete unless that final head reports a successful full CI run and the final diff contains no one-shot materializer, repair workflow, empty trigger, build output, downloaded archive, or generated test artifact.

## Deliberate limits and non-goals

- This branch does not claim that every future deck has good sound direction. Density, palette, narration, speed, and subject matter still require editorial judgment.
- Music, ambience, user-uploaded sample libraries, a DAW timeline, automatic loudness mastering, moving-track video, and automatic genre scoring are not part of this branch.
- Export audio remains constrained by the project’s existing codec matrix. Audio-bearing 50/60 fps output is not silently approximated.
- Browser builds that cannot produce the project’s verified SDR Rec.709 master should fail visibly. Cross-encoder colour-tag compatibility is a wider export concern and must not be “fixed” by weakening verification inside this sound PR.
- Compiled distribution remains subject to the FFmpeg/AAC source-provenance and LGPL obligations documented in `THIRD_PARTY_NOTICES.md`.
