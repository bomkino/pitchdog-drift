import type { SonicPalette, StudioSettings } from "../model";
import {
  clamp,
  distanceAtTime,
  getLogicalSlotCount,
  getSlideGeometry,
  velocityAtTime,
} from "../engine/evaluate";

export type ExportSonicCue = "passage" | "settle";

export interface SonicTimelineEvent {
  cue: ExportSonicCue;
  /** Absolute semantic crossing index. Settles use 0. */
  sequence: number;
  time: number;
  gain: number;
  playbackRate: number;
  pan: number;
  variant: number;
}

export interface SonicPassageDecision {
  included: boolean;
  signedVariation: number;
  playbackRate: number;
  variant: number;
}

const GOLDEN_CONJUGATE = 0.618_033_988_749_894_9;
const EDITORIAL_PASSAGE_TAKE_COUNT = 5;

function hashUnit(seed: number): number {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_295;
}

function paletteSeed(palette: SonicPalette): number {
  switch (palette) {
    case "cinematic": return 0x3f21;
    case "paper": return 0x7a11;
    case "editorial": return 0x5e93;
    case "studio":
    default: return 0x1c87;
  }
}

function paletteRate(palette: SonicPalette): number {
  switch (palette) {
    case "cinematic": return 0.94;
    case "paper": return 1.04;
    case "editorial": return 1.02;
    case "studio":
    default: return 1;
  }
}

function variantSeed(seed: number): number {
  return Math.floor(hashUnit(seed ^ 0x63a9b71d) * 2_147_483_647);
}

function normalizeSequence(sequence: number): number {
  if (!Number.isFinite(sequence)) return 1;
  return Math.max(1, Math.abs(Math.trunc(sequence)));
}

/**
 * Editorial has five materially distinct passage takes. At full density each
 * five-crossing cycle uses every take once, then rotates its starting point.
 * This removes adjacent identical body takes without introducing mutable
 * shuffle state or making preview/export depend on frame rate.
 */
function editorialPassageVariant(seed: number, sequence: number): number {
  const normalizedSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const normalizedSequence = normalizeSequence(sequence);
  const zeroBased = normalizedSequence - 1;
  const cycle = Math.floor(zeroBased / EDITORIAL_PASSAGE_TAKE_COUNT);
  const slot = zeroBased % EDITORIAL_PASSAGE_TAKE_COUNT;
  const start = Math.floor(
    hashUnit(normalizedSeed ^ 0x6e624eb7) * EDITORIAL_PASSAGE_TAKE_COUNT,
  );
  // Both 2 and 3 are coprime with five, so each cycle is a full permutation.
  const step = hashUnit(normalizedSeed ^ 0x4f1bbcdc) < 0.5 ? 2 : 3;
  return (
    start
    + cycle
    + slot * step
  ) % EDITORIAL_PASSAGE_TAKE_COUNT;
}

/**
 * Continuous, deterministic and monotonic passage thinning.
 *
 * A golden-ratio sequence spreads selected crossings more evenly than a raw
 * pseudo-random gate. Raising density can only add cues: every event retained
 * at a lower value remains retained at a higher value. The first meaningful
 * crossing is always represented once sound is above its intentional-off zone.
 */
export function shouldIncludeSonicPassage(
  sequence: number,
  density: number,
  seed = 0,
): boolean {
  const normalizedDensity = clamp(
    Number.isFinite(density) ? density : 0,
    0,
    1,
  );
  if (normalizedDensity <= 0.01) return false;
  if (normalizedDensity >= 0.995) return true;

  const normalizedSequence = normalizeSequence(sequence);
  if (normalizedSequence === 1) return true;

  const phase = hashUnit(seed ^ 0x2c1b3c6d);
  const gate = (
    phase + (normalizedSequence - 1) * GOLDEN_CONJUGATE
  ) % 1;
  return gate < normalizedDensity;
}

/**
 * Shared sample and pitch decision for live preview and deterministic export.
 * Inclusion deliberately ignores palette so changing material does not rewrite
 * the composition's rhythm; sample and pitch still respond to the palette.
 */
export function getSonicPassageDecision(
  palette: SonicPalette,
  density: number,
  variation: number,
  seed: number,
  sequence: number,
): SonicPassageDecision {
  const normalizedSequence = normalizeSequence(sequence);
  const normalizedVariation = clamp(
    Number.isFinite(variation) ? variation : 0,
    0,
    1,
  );
  const eventSeed = (
    (Number.isFinite(seed) ? Math.trunc(seed) : 0)
    + paletteSeed(palette)
    + Math.imul(normalizedSequence, 977)
  ) | 0;
  const unit = hashUnit(eventSeed);
  const signedVariation = (unit * 2 - 1) * normalizedVariation;

  return {
    included: shouldIncludeSonicPassage(normalizedSequence, density, seed),
    signedVariation,
    playbackRate: clamp(
      paletteRate(palette) * (1 + signedVariation * 0.09),
      0.78,
      1.2,
    ),
    variant: normalizedVariation <= 0.01
      ? 0
      : palette === "editorial"
        ? editorialPassageVariant(seed, normalizedSequence)
        : variantSeed(eventSeed),
  };
}

/**
 * Builds exact editorial sound events from the same pure motion evaluators as
 * picture export. The timeline is independent of preview frame rate and wall
 * clock timing, including density, sample choices and pitch.
 */
export function buildSonicTimeline(
  settings: StudioSettings,
  assetCount: number,
  duration = settings.output.duration,
): SonicTimelineEvent[] {
  if (
    !settings.sound.exportEnabled
    || assetCount <= 0
    || settings.motion.reducedMotionOutput
    || !Number.isFinite(duration)
    || duration <= 0
  ) return [];

  const geometry = getSlideGeometry(settings);
  const slotCount = getLogicalSlotCount(assetCount, geometry);
  if (slotCount <= 0 || geometry.stride <= 0) return [];

  const velocity = velocityAtTime(settings, slotCount, geometry.stride, true);
  const speed = Math.abs(velocity);
  if (speed <= Number.EPSILON) return [];

  const travel = Math.abs(
    distanceAtTime(settings, duration, slotCount, geometry.stride, true),
  );
  const crossingCount = Math.floor(travel / geometry.stride + 1e-8);
  if (crossingCount <= 0) return [];

  const slidesPerSecond = speed / geometry.stride;
  const intensity = clamp(slidesPerSecond / 0.78, 0.34, 1);
  const seed = settings.background.seed;
  const panDirection = settings.motion.axis === "horizontal"
    ? clamp(-settings.motion.direction * 0.44, -0.7, 0.7)
    : 0;
  const events: SonicTimelineEvent[] = [];

  for (let crossing = 1; crossing <= crossingCount; crossing += 1) {
    const decision = getSonicPassageDecision(
      settings.sound.palette,
      settings.sound.density,
      settings.sound.variation,
      seed,
      crossing,
    );
    if (!decision.included) continue;

    const crossingTime = (crossing * geometry.stride) / speed;
    const lead = clamp(
      0.08 / Math.max(slidesPerSecond, 0.18),
      0.024,
      0.105,
    );
    const time = crossingTime - lead;
    // A cue exactly on the loop seam is heard twice by repeating social players.
    if (time < 0 || time >= duration - 0.045) continue;

    events.push({
      cue: "passage",
      sequence: crossing,
      time,
      gain: clamp(
        0.42 + intensity * 0.43 + decision.signedVariation * 0.05,
        0.26,
        0.92,
      ),
      playbackRate: decision.playbackRate,
      pan: settings.motion.axis === "horizontal"
        ? clamp(
          panDirection + decision.signedVariation * 0.09,
          -0.78,
          0.78,
        )
        : 0,
      variant: decision.variant,
    });
  }

  if (!settings.motion.seamless && events.length > 0) {
    const last = events.at(-1)!;
    const settleTime = duration - 0.13;
    if (settleTime - last.time > 0.22) {
      const eventSeed = (seed + paletteSeed(settings.sound.palette)) ^ 0x51f15e;
      const unit = hashUnit(eventSeed);
      const signedVariation = (
        unit * 2 - 1
      ) * settings.sound.variation;
      events.push({
        cue: "settle",
        sequence: 0,
        time: settleTime,
        gain: clamp(0.28 + intensity * 0.16, 0.22, 0.52),
        playbackRate: clamp(
          paletteRate(settings.sound.palette) * (1 + signedVariation * 0.05),
          0.82,
          1.15,
        ),
        pan: 0,
        variant: settings.sound.variation <= 0.01
          ? 0
          : variantSeed(eventSeed),
      });
    }
  }

  return events;
}
