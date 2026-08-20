# Sonic gauntlet

This checklist is the review contract for the tactile sound branch. A green
build is necessary but not sufficient.

## Journey 1 — first open

- The project opens with no browser autoplay warning.
- The interface explains that the vocabulary is foley, not music.
- Preview sound only arms after a trusted gesture.
- Exported effects are visibly off by default.
- Audition is explicit and works without starting carousel playback.
- Muting preview does not change MP4 inclusion.
- Enabling MP4 inclusion does not force preview sound on.

## Journey 2 — shaping the carousel

- A passage cue occurs once per logical threshold, not once per rendered frame.
- Fast motion is density-limited rather than machine-gunned.
- Dragging emits one grab and one release, not a continuous loop.
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

## Journey 4 — export

- Picture and sound use the exact encoded duration, not nominal UI duration.
- 24, 25, and 30 fps sound-bearing exports pass codec and decode readback.
- 50/60 fps fails visibly while audio is enabled.
- Sound-only output is valid AAC, not a silent placeholder track.
- Mixed output is sample-aligned and clipped safely.
- Cancellation cannot leave preview muted or resources retained.
- A failed export restores preview suppression and reports the real failure.
- Repeated exports do not accumulate AudioContexts, nodes, or timers.

## Journey 5 — reopen and migration

- Every sound control persists in the local project.
- Applying a visual theme preserves sound direction.
- Schema-v1 projects migrate without surprise audio: preview off, export off.
- A migrated user can opt in through the same controls as a new project.
- Corrupt or missing sound state fails validation rather than being guessed.

## Accessibility and privacy

- Sound is never the sole carrier of status.
- Every sound control is keyboard accessible and labelled.
- Reduced-motion output is silent.
- Hidden tabs suspend preview audio.
- No sound file is requested from a third-party origin at runtime.
- Offline export works from committed assets.

## Asset integrity

- Every committed recording has a RIFF/WAVE header.
- Every recording matches the pinned upstream Git blob SHA-1.
- Every manifest SHA-256 and byte length matches the committed file.
- Every source pack has a local CC0 licence text.
- No generated UI bleeps or Freesound preview files remain.
- The catalogue imports only committed local recordings.

## Required automated gates

- TypeScript typecheck.
- Unit tests for deterministic planning, density, seam handling, panning,
  migration, PCM mixing, and asset integrity.
- Production build.
- Chromium end-to-end persistence test with zero external requests.
- Chromium sound-design-only MP4 test with verified AAC readback.
- Existing repository CI with no unrelated regression.
