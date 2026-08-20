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
  time: number;
  gain: number;
  playbackRate: number;
  pan: number;
  variant: number;
}

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

function variantSeed(seed: number): number {
  return Math.floor(hashUnit(seed ^ 0x63a9b71d) * 2_147_483_647);
}

export function getSonicDensityStep(density: number): number {
  if (!Number.isFinite(density) || density <= 0.01) {
    return Number.POSITIVE_INFINITY;
  }
  if (density >= 0.67) return 1;
  if (density >= 0.34) return 2;
  return 3;
}

/**
 * Builds exact editorial sound events from the same pure motion evaluators as
 * picture export. The timeline is independent of preview frame rate and wall
 * clock timing, including its sample choices.
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
  const densityStep = getSonicDensityStep(settings.sound.density);
  if (!Number.isFinite(densityStep) || crossingCount <= 0) return [];

  const slidesPerSecond = speed / geometry.stride;
  const intensity = clamp(slidesPerSecond / 0.78, 0.34, 1);
  const baseRate = paletteRate(settings.sound.palette);
  const baseSeed = settings.background.seed + paletteSeed(settings.sound.palette);
  const panDirection = settings.motion.axis === "horizontal"
    ? clamp(-settings.motion.direction * 0.44, -0.7, 0.7)
    : 0;
  const events: SonicTimelineEvent[] = [];

  for (let crossing = 1; crossing <= crossingCount; crossing += 1) {
    if ((crossing - 1) % densityStep !== 0) continue;
    const crossingTime = (crossing * geometry.stride) / speed;
    const lead = clamp(
      0.08 / Math.max(slidesPerSecond, 0.18),
      0.024,
      0.105,
    );
    const time = crossingTime - lead;
    // A cue exactly on the loop seam is heard twice by repeating social players.
    if (time < 0 || time >= duration - 0.045) continue;

    const eventSeed = baseSeed + crossing * 977;
    const unit = hashUnit(eventSeed);
    const signedVariation = (unit * 2 - 1) * settings.sound.variation;
    events.push({
      cue: "passage",
      time,
      gain: clamp(
        0.42 + intensity * 0.43 + signedVariation * 0.05,
        0.26,
        0.92,
      ),
      playbackRate: clamp(
        baseRate * (1 + signedVariation * 0.09),
        0.78,
        1.2,
      ),
      pan: settings.motion.axis === "horizontal"
        ? clamp(panDirection + signedVariation * 0.09, -0.78, 0.78)
        : 0,
      variant: settings.sound.variation <= 0.01 ? 0 : variantSeed(eventSeed),
    });
  }

  if (!settings.motion.seamless && events.length > 0) {
    const last = events.at(-1)!;
    const settleTime = duration - 0.13;
    if (settleTime - last.time > 0.22) {
      const eventSeed = baseSeed ^ 0x51f15e;
      const unit = hashUnit(eventSeed);
      const signedVariation = (unit * 2 - 1) * settings.sound.variation;
      events.push({
        cue: "settle",
        time: settleTime,
        gain: clamp(0.28 + intensity * 0.16, 0.22, 0.52),
        playbackRate: clamp(
          baseRate * (1 + signedVariation * 0.05),
          0.82,
          1.15,
        ),
        pan: 0,
        variant: settings.sound.variation <= 0.01 ? 0 : variantSeed(eventSeed),
      });
    }
  }

  return events;
}
