# Cinematic system

This document is the acceptance contract for Drift's optics, procedural atmospheres, and film-world presets.

## Actual goal

Make pitch-deck slides feel filmed without making them harder to read, harder to export, or harder to trust.

The system fails if it produces an impressive demo while any of these regress:

- slide typography loses legibility;
- transparent output changes meaning;
- preview and export diverge;
- an old `.pitched` project stops loading;
- 4K/8K export silently doubles GPU memory through unnecessary render targets;
- reduced motion becomes a frozen accident rather than an authored state;
- a “theme” changes only three colours.

## Optical stack

The slide shader owns four coordinated effects behind one bounded `distortion` control.

1. **Geometric bend.** Existing vertex displacement responds to signed velocity.
2. **Directional motion blur.** Up to 5 px in slide-space. Zero at rest.
3. **Peripheral defocus.** Up to 3.5 px, inferred from the existing focus/edge envelope. The focal slide stays crisp.
4. **Chromatic separation.** Up to 2.8 px, driven mostly by velocity and secondarily by lens radius.

Maximums are explicit shader clamps, not polite UI suggestions. A malformed project still cannot push the optical system beyond them.

The blur branch uses one sample when inactive and nine bounded samples at maximum energy. No temporal history buffer, afterimage pass, or frame accumulation exists, so frame `n` remains a pure function of project settings and `n / fps`.

## Optical characters

Presets compile to existing fields; they do not add project schema:

| Character | Intended use | Behaviour |
| --- | --- | --- |
| Clean Glass | Dense copy, restrained editorial work | Minimal bend, softness, and focus lift |
| 16mm Breath | General cinematic default | Moderate velocity response and photochemical softness |
| Dream Glass | Romance, memory, lyric work | Higher peripheral softness and broad shadows |
| Panic Lens | Horror, thriller, music | Strong velocity response and tighter shadow field |
| Ghost Focus | Slow dream, grief, recollection | Sharp centre, hazy periphery, very soft shadows |

Manual changes correctly report **Custom** instead of pretending a preset still applies.

## Procedural atmosphere corpus

The six public background engines remain unchanged for project compatibility:

- transparent;
- solid;
- gradient;
- aura;
- paper;
- void.

Twenty-one authored scenes compile to those engines. The transparent scene has no shader. Every opaque engine has four materially different procedural recipes selected by `seed % 4`.

**Recut atmosphere** advances the deterministic seed while preserving `seed % 4`. It changes dust, noise, cloud, scratch, and field placement without changing the authored silhouette.

### Authorship rule

A new scene is accepted only when it changes at least three of the following:

- spatial silhouette;
- luminance hierarchy;
- material behaviour;
- temporal behaviour;
- colour role;
- narrative use.

Changing a palette alone is not a scene.

## Film worlds

A film world owns motion, surface, optics, and atmosphere together. It may preserve output dimensions, duration, and presenter choices, but it must not preserve stale transparent state when selecting an opaque atmosphere.

The twelve current worlds cover editorial, travel, horror, documentary, romance, music, archive/history, thriller, cold drama, myth/period, coming-of-age, and comedy/light work.

## Performance budget

- No full-frame post-processing target.
- No React state update per rendered frame.
- No random value generated during render.
- Each background FBM call uses three fixed octaves; the heaviest fog recipes add one cheap warp noise sample.
- Optical multisampling branches off below a visible threshold.
- Pinned media remains outside moving-track optics.
- Existing 24-item renderer pool remains the hard upper bound.
- Preview and export continue to share one evaluator and shader path.

## Accessibility and reduced motion

OS reduced-motion preview continues to suppress velocity. Therefore motion blur and velocity chromatic separation fall to zero. A chosen peripheral softness can remain as a static art-direction choice, but themes keep it bounded and the focal slide remains sharp.

The DOM fallback remains functional and honest. It does not fake shader output when WebGL2 is absent.

## Gauntlet checks

Every change to this system must answer yes:

- Does the focal slide remain readable at maximum lens energy?
- Does zero velocity remove directional blur?
- Are chromatic offsets capped in shader code?
- Does transparent background still skip the background scene entirely?
- Does `seed + 4k` preserve scene identity?
- Do all scenes validate through the unchanged settings schema?
- Do all themes validate as complete settings?
- Does every custom material still encode once into renderer output colour space?
- Does the old vignette reversal bug remain absent?
- Does production build complete without adding a post-processing dependency?
