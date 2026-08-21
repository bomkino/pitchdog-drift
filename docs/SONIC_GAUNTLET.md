# Sonic gauntlet

This checklist is the review contract for the tactile sound branch. A green
build is necessary but not sufficient.

## Journey 1 — first open

- The project opens with no browser autoplay warning.
- The interface explains that the vocabulary is foley, not music.
- Preview sound only arms after a trusted gesture.
- Exported effects are visibly off by default.
- Audition is explicit and works without starting carousel playback.
- A muted audition is temporary and returns to muted without altering saved
  preview state.
- Enabling preview from a migrated silent project arms on that first trusted
  click; it does not require a second interaction.
- Muting preview does not change MP4 inclusion.
- Enabling MP4 inclusion does not force preview sound on.

## Journey 2 — shaping the carousel

- A passage cue occurs once per logical threshold, not once per rendered frame.
- Fast motion is density-limited rather than machine-gunned.
- Density is continuous and monotonic: increasing it adds cues without replacing
  already accepted cues.
- Changing palette preserves passage placement and therefore authored rhythm.
- Preview and export choose the same inclusion, take, and restrained pitch for
  the same passage sequence and saved state.
- A click without meaningful movement emits no false grab/release pair.
- A real drag emits one grab and one release, not a continuous loop.
- Lost pointer capture cannot leave the carousel stuck in a dragging state.
- Drag, wheel, and paused-autoplay inertia emit at most one settle when motion
  truly rests.
- Continuous autoplay never emits a false settle, and wheel packets never each
  become a settle cue.
- Slider movement is silent; it does not chatter on every input event.
- Variation changes both sample choice and restrained playback rate.
- Variation zero is stable and repeatable.
- Horizontal direction affects pan; vertical motion remains centred.
- Pausing, focus mode, theme changes, and discrete controls remain restrained.

## Journey 3 — narration

- Presenter speech remains intelligible at every built-in palette.
- Under-voice gain applies only when sound and presenter audio coexist.
- Muting presenter audio cannot accidentally mute authored effects.
- Disabling authored effects cannot remove presenter speech.
- The MP4 contains exactly one audio track.
- A deliberately gapped mono presenter cannot erase, center, or mono-fold
  laterally panned foley inside the gap.

## Journey 4 — export

- Picture and sound use the exact encoded duration, not nominal UI duration.
- 24, 25, and 30 fps sound-bearing exports pass codec and decode readback.
- 50/60 fps fails visibly while audio is enabled.
- Sound-only output is valid AAC, not a silent placeholder track.
- Mixed output is one continuous exact-duration stereo PCM master before AAC.
- Decoded AAC padding is bounded to at most one 1,024-sample access unit.
- Cancellation cannot leave preview muted or resources retained.
- Success and failure feedback occurs only after preview suppression is lifted.
- Renderer-surface recovery failure cannot leave the sound engine suppressed.
- User cancellation is neutral, not misreported or sounded as failure.
- Aborting while a local asset request is shared rejects the caller promptly
  without poisoning the reusable asset cache.
- A failed export restores preview suppression and reports the real failure.
- Repeated exports do not accumulate AudioContexts, nodes, or timers.

## Journey 5 — reopen and migration

- Every sound control persists in the local project.
- Applying a visual theme preserves sound direction.
- Schema-v1 projects migrate without surprise audio: preview off, export off.
- A migrated user can audition once or opt in through the same controls as a new
  project.
- Corrupt or missing sound state fails validation rather than being guessed.

## Accessibility and privacy

- Sound is never the sole carrier of status.
- Every sound control is keyboard accessible and labelled.
- Loading, auditioning, armed, muted, and unavailable states are announced
  without relying on colour.
- Reduced-motion output is silent.
- Hidden tabs suspend preview audio.
- No sound file is requested from a third-party origin at runtime.
- Offline export works from committed assets.

## Asset and treatment integrity

- Every committed recording has a RIFF/WAVE PCM16 header.
- Every recording matches the pinned upstream Git blob SHA-1.
- Every manifest SHA-256 and byte length matches the committed file.
- Every source pack has a local CC0 licence text.
- No generated UI bleeps or Freesound preview files remain.
- The catalogue imports only committed local recordings.
- The licensed WAV bytes are never rewritten by acoustic treatment.
- All 23 recordings have one unique treatment receipt.
- Meaningful treated onset is no later than 50 ms.
- Treated active-event energy spread is no more than 3.5 dB.
- Pre-mix treated peak is no higher than +6 dBFS.
- Production output emits hashed same-origin WAV files and does not inline audio
  into JavaScript.

## Required automated gates

- TypeScript typecheck.
- Unit tests for deterministic planning, continuous nested density, shared
  preview/export decisions, seam handling, panning, migration, PCM mixing,
  catalogue treatment bounds, and asset integrity.
- Production build plus sonic bundle and acoustic treatment audits.
- Pinned-source and licence verification.
- Chromium end-to-end persistence test with zero external requests.
- Chromium sound-design-only MP4 test with verified AAC readback.
- Chromium mixed-master test with mono narration, a deliberate packet gap,
  lateral foley, and full encode/decode inspection.
- Chromium interaction test proving silent clicks, one grab/release/settle drag,
  one wheel settle, accessible mute state, and post-suppression outcome feedback.
- Existing repository CI with no unrelated regression.
- `git diff --check` and a final changed-path audit.
