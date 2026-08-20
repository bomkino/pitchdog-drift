import type { StudioSettings, ThemeId } from "./model";
import { applyTheme, getTheme } from "./themes";

export const DIRECTION_LEVELS = ["restrained", "directed", "fever"] as const;
export type DirectionLevel = (typeof DIRECTION_LEVELS)[number];
export type DirectionState = DirectionLevel | "custom";

export interface DirectionProfile {
  id: DirectionLevel;
  name: string;
  eyebrow: string;
  description: string;
}

export const DIRECTION_PROFILES: readonly DirectionProfile[] = [
  {
    id: "restrained",
    name: "Restrained",
    eyebrow: "Legibility first",
    description: "Longer breath, quieter optics, clearer slides. Still directed; never inert.",
  },
  {
    id: "directed",
    name: "Directed",
    eyebrow: "Authored baseline",
    description: "The film world as designed: movement, atmosphere, surface, and lens in balance.",
  },
  {
    id: "fever",
    name: "Fever",
    eyebrow: "Push the cut",
    description: "More depth, velocity, optical consequence, and atmospheric pressure—inside hard safety rails.",
  },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scale(value: number, multiplier: number, max = 1): number {
  return clamp(value * multiplier, 0, max);
}

function applyRestrained(base: StudioSettings): StudioSettings {
  return {
    ...base,
    motion: {
      ...base.motion,
      speed: scale(base.motion.speed, 0.72, 1.5),
      gap: clamp(base.motion.gap + 0.08, 0, 1.2),
      curvature: scale(base.motion.curvature, 0.7),
      depth: scale(base.motion.depth, 0.66, 0.8),
      tilt: scale(base.motion.tilt, 0.62, 18),
      distortion: scale(base.motion.distortion, 0.64),
      focusScale: scale(base.motion.focusScale, 0.78, 0.24),
      edgeFade: scale(base.motion.edgeFade, 0.82),
      dragSensitivity: clamp(base.motion.dragSensitivity * 0.86, 0, 4),
    },
    slide: {
      ...base.slide,
      scale: clamp(base.slide.scale + 0.025, 0.24, 1.1),
      shadowOpacity: scale(base.slide.shadowOpacity, 0.8, 0.8),
    },
    background: {
      ...base.background,
      intensity: scale(base.background.intensity, 0.84),
      motion: scale(base.background.motion, 0.62),
      complexity: scale(base.background.complexity, 0.78),
      parallax: scale(base.background.parallax, 0.64),
      grain: scale(base.background.grain, 0.78, 0.6),
      vignette: scale(base.background.vignette, 0.88),
    },
    optics: {
      ...base.optics,
      profile: "custom",
      softFocus: scale(base.optics.softFocus, 0.62),
      edgeSoftness: scale(base.optics.edgeSoftness, 0.62),
      motionBlur: scale(base.optics.motionBlur, 0.56),
      chromaticAberration: scale(base.optics.chromaticAberration, 0.52),
      bloom: scale(base.optics.bloom, 0.64),
      halation: scale(base.optics.halation, 0.64),
      flare: scale(base.optics.flare, 0.5),
      barrelDistortion: clamp(base.optics.barrelDistortion * 0.64, -1, 1),
      vignette: scale(base.optics.vignette, 0.84),
      grain: scale(base.optics.grain, 0.7, 0.5),
      gateWeave: scale(base.optics.gateWeave, 0.4),
      breathing: scale(base.optics.breathing, 0.52),
    },
  };
}

function applyFever(base: StudioSettings): StudioSettings {
  return {
    ...base,
    motion: {
      ...base.motion,
      speed: scale(base.motion.speed, 1.24, 1.5),
      gap: clamp(base.motion.gap - 0.045, 0, 1.2),
      curvature: scale(base.motion.curvature, 1.18),
      depth: scale(base.motion.depth, 1.22, 0.8),
      tilt: scale(base.motion.tilt, 1.2, 18),
      distortion: scale(base.motion.distortion, 1.2),
      focusScale: scale(base.motion.focusScale, 1.12, 0.24),
      edgeFade: scale(base.motion.edgeFade, 1.08),
      dragSensitivity: clamp(base.motion.dragSensitivity * 1.08, 0, 4),
    },
    slide: {
      ...base.slide,
      scale: clamp(base.slide.scale - 0.018, 0.24, 1.1),
      shadowOpacity: scale(base.slide.shadowOpacity, 1.08, 0.8),
      shadowSoftness: clamp(base.slide.shadowSoftness * 1.08, 4, 96),
    },
    background: {
      ...base.background,
      intensity: scale(base.background.intensity, 1.08),
      motion: scale(base.background.motion, 1.2),
      scale: clamp(base.background.scale * 0.94, 0.25, 2.5),
      softness: scale(base.background.softness, 1.04),
      complexity: scale(base.background.complexity, 1.14),
      parallax: scale(base.background.parallax, 1.18),
      grain: scale(base.background.grain, 1.06, 0.6),
      vignette: scale(base.background.vignette, 1.06),
    },
    optics: {
      ...base.optics,
      profile: "custom",
      softFocus: scale(base.optics.softFocus, 1.12),
      edgeSoftness: scale(base.optics.edgeSoftness, 1.18),
      motionBlur: scale(base.optics.motionBlur, 1.28),
      chromaticAberration: scale(base.optics.chromaticAberration, 1.2),
      bloom: scale(base.optics.bloom, 1.14),
      halation: scale(base.optics.halation, 1.18),
      flare: scale(base.optics.flare, 1.22),
      barrelDistortion: clamp(base.optics.barrelDistortion * 1.16, -1, 1),
      vignette: scale(base.optics.vignette, 1.08),
      grain: scale(base.optics.grain, 1.08, 0.5),
      gateWeave: scale(base.optics.gateWeave, 1.12),
      breathing: scale(base.optics.breathing, 1.18),
    },
  };
}

export function applyDirectionLevel(current: StudioSettings, level: DirectionLevel): StudioSettings {
  const baseline = applyTheme(current, getTheme(current.themeId));
  if (level === "restrained") return applyRestrained(baseline);
  if (level === "fever") return applyFever(baseline);
  return baseline;
}

function themeHash(themeId: ThemeId): number {
  let hash = 2_166_136_261;
  for (const character of themeId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function signed(random: () => number, reach: number): number {
  return (random() * 2 - 1) * reach;
}

export function recutSettings(current: StudioSettings): StudioSettings {
  const priorSeed = Math.round(current.background.seed);
  const random = createRandom((priorSeed ^ themeHash(current.themeId)) >>> 0);
  const nextSeed = (Math.floor(random() * 1_000_001) + priorSeed + 1) % 1_000_001;
  return {
    ...current,
    motion: {
      ...current.motion,
      speed: clamp(current.motion.speed * (0.91 + random() * 0.18), 0, 1.5),
      gap: clamp(current.motion.gap + signed(random, 0.055), 0, 1.2),
      curvature: clamp(current.motion.curvature + signed(random, 0.075), 0, 1),
      depth: clamp(current.motion.depth + signed(random, 0.045), 0, 0.8),
      tilt: clamp(current.motion.tilt + signed(random, 1.25), 0, 18),
      distortion: clamp(current.motion.distortion + signed(random, 0.065), 0, 1),
      focusScale: clamp(current.motion.focusScale + signed(random, 0.012), 0, 0.24),
    },
    slide: {
      ...current.slide,
      scale: clamp(current.slide.scale + signed(random, 0.02), 0.24, 1.1),
    },
    background: {
      ...current.background,
      intensity: clamp(current.background.intensity + signed(random, 0.05), 0, 1),
      motion: clamp(current.background.motion * (0.9 + random() * 0.2), 0, 1),
      scale: clamp(current.background.scale * (0.9 + random() * 0.2), 0.25, 2.5),
      softness: clamp(current.background.softness + signed(random, 0.075), 0, 1),
      complexity: clamp(current.background.complexity + signed(random, 0.09), 0, 1),
      parallax: clamp(current.background.parallax + signed(random, 0.09), 0, 1),
      seed: nextSeed,
    },
    optics: {
      ...current.optics,
      profile: "custom",
      softFocus: clamp(current.optics.softFocus + signed(random, 0.04), 0, 1),
      edgeSoftness: clamp(current.optics.edgeSoftness + signed(random, 0.055), 0, 1),
      motionBlur: clamp(current.optics.motionBlur + signed(random, 0.055), 0, 1),
      chromaticAberration: clamp(current.optics.chromaticAberration + signed(random, 0.04), 0, 1),
      bloom: clamp(current.optics.bloom + signed(random, 0.045), 0, 1),
      halation: clamp(current.optics.halation + signed(random, 0.045), 0, 1),
      flare: clamp(current.optics.flare + signed(random, 0.045), 0, 1),
      breathing: clamp(current.optics.breathing + signed(random, 0.035), 0, 1),
    },
  };
}

function signature(settings: StudioSettings): string {
  return JSON.stringify({
    motion: settings.motion,
    slide: settings.slide,
    background: settings.background,
    optics: settings.optics,
  });
}

export function inferDirectionState(settings: StudioSettings): DirectionState {
  for (const level of DIRECTION_LEVELS) {
    if (signature(settings) === signature(applyDirectionLevel(settings, level))) return level;
  }
  return "custom";
}
