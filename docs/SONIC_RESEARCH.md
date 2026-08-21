# Organic editorial sound research

This note documents the craft reference behind Drift's layered micro-Foley. It
is not a claim of affiliation with Vox and it does not reproduce proprietary
Vox recordings, music, branding, animation, or signature cue sequences.

## Primary observations

In a July 2026 Journalism Institute interview, Vox producer Nate Krieger
explained that a major technique he learned at Vox was grounding animation with
sound: photo changes receive click-like physical motivation, drawn writing
receives pencil texture, and abstract screen events should rarely happen without
a corresponding audible cause. The lesson is causal and editorial, not a
specific sound library.

Vox Media's own Explainer Studio description emphasizes a combination of design,
quirky animation, texture, personality, and curiosity. In sound terms, that
suggests small material details that clarify the edit without competing with the
narration or turning the explainer into a trailer.

Sources:

- Journalism Institute, “How a Vox video producer makes visual investigations,”
  21 July 2026: https://journalism-institute.org/2026/07/21/how-a-vox-video-producer-makes-visual-investigations/
- Vox Media, “Vox Explainer Studio”: https://www.voxmedia.com/2023/8/22/23841858/vox-explainer-studio

## Generalized craft rules

1. **Give every audible event a visible owner.** A page, card, hand-off, latch,
   contact, or landing must explain the sound.
2. **Use literal material before synthetic metaphor.** Paper for paper, cloth for
   air, a close contact for an edit—not a generic digital whoosh.
3. **Build micro-gestures, not piles.** Body carries identity; air describes
   travel; contact punctuates; landing is optional consequence.
4. **Let narration own the mix.** Effects remain short, sparse, locally ducked,
   and constrained by a secondary-layer budget.
5. **Silence is structural.** Hover, every drag pixel, every range tick, ambient
   beds, and constant projector loops are deliberately absent.
6. **The edit owns timing.** Sound begins from semantic focus hand-off, not an
   export-only approximation or frame-scraped heuristic.
7. **Texture should reveal detail, not rewrite rhythm.** Raising Texture adds
   deterministic layers while body take, time, pitch, and pan remain fixed.
8. **Speed reduces detail.** Fast sequences simplify toward body and air so a
   carousel stays legible and presenter speech remains intelligible.
9. **Physical speed should change the gesture, not only its volume.** Faster
   passages shorten and brighten the real recording slightly; slower passages
   retain a longer release without becoming a synthetic stretch effect.

## Implementation translation

- `src/sonic/plan.ts` defines semantic focus events and balanced body takes.
- `src/sonic/grammar.ts` builds deterministic body/air/contact/landing plans.
- `src/sonic/orchestrate.ts` places those layers on the export timeline.
- `src/sonic/SonicEngine.ts` and `src/sonic/renderSoundtrack.ts` use the same
  filters, envelopes, micro-delays, gain budgets, playback rates, and pan.
- `src/sonic/graph.ts` owns shared filter construction and envelope fitting so
  preview and export cannot quietly diverge.
- One micro-gesture avoids stacking the exact same physical recording against
  itself through two differently filtered roles when an alternative take exists.
- All layers use the existing 23 pinned Kenney CC0 recordings. No new binary
  sound corpus or runtime network dependency is introduced by this branch.

## Deliberate distance from imitation

Drift does not copy a Vox bumper, transition sequence, mix master, proprietary
asset, or trademarked presentation. The reference is a transferable editorial
principle: make abstract visuals feel physically caused, human, textured, and
quietly precise.
