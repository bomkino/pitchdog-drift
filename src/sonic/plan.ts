import type { SonicPalette, StudioSettings } from "../model";
import { getBalancedSonicVariant } from "./grammar";
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
  /** Absolute semantic crossing index. Settles use a terminal sequence. */
  sequence: number;
  time: number;
  gain: number;
  /** Physical speed/energy used by the shared preview/export foley grammar. */
  intensity: number;
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
    case "studio":
    default: return 0x1c87;
  }
}

function paletteRate(palette: SonicPalette): number {
  switch (palette) {
    case "cinematic": return 0.94;
    case "paper": return 1.04;
    case "studio":
    default: return 1;
  }
}

function normalizeSequence(sequence: number): number {
  if (!Number.isFinite(sequence)) return 1;
  return Math.max(1, Math.abs(Math.trunc(sequence)));
}

/**
 * Maps physical carousel travel to the logical focus hand-off used by live
 * preview. A passage changes when the incoming slide becomes closer to centre
 * than the outgoing slide: exactly half a stride in either direction.
 */
export function getSonicPassageStep(distance: number, stride: number): number {
  if (!Number.isFinite(distance) || !Number.isFinite(stride) || stride <= 0) {
    return 0;
  }
  const magnitude = Math.floor(Math.abs(distance) / stride + 0.5);
  if (magnitude <= 0) return 0;
  return distance < 0 ? -magnitude : magnitude;
}

/** Exact physical travel at which a one-based passage sequence changes focus. */
export function getSonicPassageDistance(
  sequence: number,
  stride: number,
): number {
  if (!Number.isFinite(stride) || stride <= 0) return 0;
  return (normalizeSequence(sequence) - 0.5) * stride;
}

/**
 * Continuous, deterministic and monotonic passage thinning. Raising density
 * can only add cues; it never replaces an already accepted crossing.
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
 * Shared body-take and pitch decision for live preview and export. Inclusion
 * ignores palette so material changes do not rewrite the composition's rhythm.
 * The persisted `variation` field now controls secondary texture; the body
 * remains stable while air/contact/landing are added around it.
 */
export function getSonicPassageDecision(
  palette: SonicPalette,
  density: number,
  variation: number,
  seed: number,
  sequence: number,
): SonicPassageDecision {
  void variation;
  const normalizedSequence = normalizeSequence(sequence);
  const eventSeed = (
    (Number.isFinite(seed) ? Math.trunc(seed) : 0)
    + paletteSeed(palette)
    + Math.imul(normalizedSequence, 977)
  ) | 0;
  const unit = hashUnit(eventSeed);
  const signedVariation = (unit * 2 - 1) * 0.18;

  return {
    included: shouldIncludeSonicPassage(normalizedSequence, density, seed),
    signedVariation,
    playbackRate: clamp(
      paletteRate(palette) * (1 + signedVariation * 0.09),
      0.78,
      1.2,
    ),
    variant: getBalancedSonicVariant(
      palette,
      "passage",
      seed,
      normalizedSequence,
    ),
  };
}

/**
 * Builds semantic edit events from the same pure motion evaluators as picture.
 * The shared orchestrator expands each event into body, air, contact and
 * selective landing layers at render time.
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
  const crossingCount = Math.abs(
    getSonicPassageStep(travel, geometry.stride),
  );
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

    const time = getSonicPassageDistance(crossing, geometry.stride) / speed;
    // A cue on the loop seam is heard twice by repeating social players.
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
      intensity,
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
      const signedVariation = (unit * 2 - 1) * 0.12;
      const settleSequence = Math.max(1, crossingCount + 1);
      events.push({
        cue: "settle",
        sequence: settleSequence,
        time: settleTime,
        gain: clamp(0.28 + intensity * 0.16, 0.22, 0.52),
        intensity,
        playbackRate: clamp(
          paletteRate(settings.sound.palette) * (1 + signedVariation * 0.05),
          0.82,
          1.15,
        ),
        pan: 0,
        variant: getBalancedSonicVariant(
          settings.sound.palette,
          "settle",
          seed,
          settleSequence,
        ),
      });
    }
  }

  return events;
}
