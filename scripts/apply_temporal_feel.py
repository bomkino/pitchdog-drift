from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    content = read(path)
    actual = content.count(old)
    if actual != count:
        raise RuntimeError(f"{path}: expected {count} occurrence(s), found {actual}: {old[:100]!r}")
    write(path, content.replace(old, new, count))


def append_once(path: str, marker: str, content: str) -> None:
    current = read(path)
    if marker in current:
        return
    write(path, current.rstrip() + "\n\n" + content.strip() + "\n")


TEMPORAL_DIRECTION = r'''import type {
  MotionCadence,
  MotionSettings,
  MotionSignatureId,
  StudioSettings,
} from "../model";

export type AuthoredMotionSignatureId = Exclude<MotionSignatureId, "custom">;

type SignatureFields = Pick<
  MotionSettings,
  | "cadence"
  | "speed"
  | "weight"
  | "linger"
  | "release"
  | "overlap"
  | "imperfection"
>;

export interface MotionSignature {
  id: AuthoredMotionSignatureId;
  name: string;
  eyebrow: string;
  description: string;
  bestFor: string;
  motion: SignatureFields;
}

export interface CadenceReport {
  headline: string;
  detail: string;
  exact: boolean;
  motionFps: number | null;
}

export interface ShapedTrackSample {
  distance: number;
  velocity: number;
  derivative: number;
  phase: number;
}

export const MOTION_SIGNATURES: readonly MotionSignature[] = [
  {
    id: "long-take",
    name: "Long Take",
    eyebrow: "Patient · weighted · observant",
    description: "A camera that waits. Gentle departure, a readable focal beat, and a soft return to momentum.",
    bestFor: "Narrative decks, emotional reveals, elegant vertical runs.",
    motion: { cadence: "continuous", speed: 0.24, weight: 0.72, linger: 0.48, release: 0.72, overlap: 0.22, imperfection: 0.04 },
  },
  {
    id: "cut-on-breath",
    name: "Cut on Breath",
    eyebrow: "Editorial · lucid · decisive",
    description: "Clear twenty-four-frame phrasing with small reading windows and clean exits instead of mechanical constant speed.",
    bestFor: "Case studies, documentary decks, information-dense slides.",
    motion: { cadence: "24fps", speed: 0.38, weight: 0.52, linger: 0.3, release: 0.36, overlap: 0.12, imperfection: 0.03 },
  },
  {
    id: "twelve-frame-hand",
    name: "Twelve-Frame Hand",
    eyebrow: "Held · tactile · handmade",
    description: "Deliberate twelve-frame poses carried inside a smooth master. The renderer stays responsive; the scene moves by authored holds.",
    bestFor: "Illustration, collage, process films, playful or analogue work.",
    motion: { cadence: "12fps", speed: 0.3, weight: 0.64, linger: 0.2, release: 0.58, overlap: 0.28, imperfection: 0.32 },
  },
  {
    id: "silk-dolly",
    name: "Silk Dolly",
    eyebrow: "Floating · close · continuous",
    description: "Light primary motion with generous secondary overlap. Frames seem to follow one another through the same air.",
    bestFor: "Romance, fashion, travel, music, luminous presentation work.",
    motion: { cadence: "continuous", speed: 0.2, weight: 0.34, linger: 0.16, release: 0.82, overlap: 0.48, imperfection: 0.08 },
  },
  {
    id: "held-nerve",
    name: "Held Nerve",
    eyebrow: "Tense · reluctant · watchful",
    description: "Eighteen-frame tension, longer focal hesitation, and restrained instability. Unease without random shaking.",
    bestFor: "Horror, thriller, investigative work, ominous reveals.",
    motion: { cadence: "18fps", speed: 0.18, weight: 0.78, linger: 0.56, release: 0.44, overlap: 0.2, imperfection: 0.24 },
  },
  {
    id: "forward-rush",
    name: "Forward Rush",
    eyebrow: "Propulsive · graphic · bright",
    description: "Fast twenty-four-frame movement with short focal beats and enough follow-through to feel physical rather than slick.",
    bestFor: "Trailers, music, sport, punchy horizontal sequences.",
    motion: { cadence: "24fps", speed: 0.64, weight: 0.42, linger: 0.08, release: 0.28, overlap: 0.34, imperfection: 0.12 },
  },
] as const;

export function getMotionSignature(id: MotionSignatureId): MotionSignature | null {
  if (id === "custom") return null;
  return MOTION_SIGNATURES.find((signature) => signature.id === id) ?? null;
}

export function applyMotionSignature(
  settings: StudioSettings,
  id: AuthoredMotionSignatureId,
): StudioSettings {
  const signature = getMotionSignature(id);
  if (!signature) return settings;
  return {
    ...settings,
    motion: {
      ...settings.motion,
      ...signature.motion,
      signature: id,
      // A take is a performance choice. Recasting the timing should not
      // silently replace the take the director already chose.
      take: settings.motion.take,
    },
  };
}

export function motionCadenceFps(cadence: MotionCadence): number | null {
  switch (cadence) {
    case "24fps": return 24;
    case "18fps": return 18;
    case "12fps": return 12;
    case "continuous":
    default:
      return null;
  }
}

export function motionCadenceLabel(cadence: MotionCadence): string {
  const fps = motionCadenceFps(cadence);
  return fps ? `${fps} fps motion` : "Continuous motion";
}

export function cadenceReport(cadence: MotionCadence, outputFps: number): CadenceReport {
  const motionFps = motionCadenceFps(cadence);
  if (!motionFps) {
    return {
      headline: `Continuous pose · ${outputFps} fps master`,
      detail: "Every master frame receives a newly evaluated scene pose.",
      exact: true,
      motionFps: null,
    };
  }

  const ratio = outputFps / motionFps;
  const rounded = Math.round(ratio);
  if (Math.abs(ratio - rounded) < 1e-9) {
    const hold = Math.max(1, rounded);
    return {
      headline: `${motionFps} fps motion · even ${hold}-frame ${hold === 1 ? "pose" : "holds"}`,
      detail: `Authored poses land evenly inside the ${outputFps} fps master.`,
      exact: true,
      motionFps,
    };
  }

  const lower = Math.max(1, Math.floor(ratio));
  const upper = Math.max(lower, Math.ceil(ratio));
  return {
    headline: `${motionFps} fps motion · mixed ${lower}–${upper}-frame holds`,
    detail: `The ${outputFps} fps master alternates hold lengths to preserve the authored cadence without changing delivery format.`,
    exact: false,
    motionFps,
  };
}

export function sampleMotionTime(
  time: number,
  cadence: MotionCadence,
  duration = Number.POSITIVE_INFINITY,
  preserveDurationEndpoint = false,
): number {
  const safeTime = Math.max(0, Number.isFinite(time) ? time : 0);
  if (preserveDurationEndpoint && Number.isFinite(duration) && safeTime >= duration - 1e-9) {
    return Math.max(0, duration);
  }
  const fps = motionCadenceFps(cadence);
  if (!fps) return safeTime;
  return Math.floor(safeTime * fps + 1e-9) / fps;
}

export function cadenceFrameAtTime(time: number, cadence: MotionCadence): number | null {
  const fps = motionCadenceFps(cadence);
  if (!fps) return null;
  return Math.floor(Math.max(0, time) * fps + 1e-9);
}

/**
 * Periodic, monotonic phase direction.
 *
 * - linger lowers velocity at every integer slide beat;
 * - release shifts energy toward departure or arrival;
 * - endpoints and first derivatives agree across cycles;
 * - the coefficient radius stays below one, so phase never reverses.
 */
export function warpUnitPhase(phase: number, motion: Pick<MotionSettings, "linger" | "release">): number {
  const t = Math.min(1, Math.max(0, phase));
  const linger = Math.min(1, Math.max(0, motion.linger));
  const release = Math.min(1, Math.max(0, motion.release));
  const a = -0.7 * linger;
  const b = (release - 0.5) * 0.42;
  const angle = t * Math.PI * 2;
  const warped = t
    + (a * Math.sin(angle)) / (Math.PI * 2)
    + (b * (1 - Math.cos(angle))) / (Math.PI * 2);
  return Math.min(1, Math.max(0, warped));
}

export function warpUnitPhaseDerivative(
  phase: number,
  motion: Pick<MotionSettings, "linger" | "release">,
): number {
  const t = Math.min(1, Math.max(0, phase));
  const linger = Math.min(1, Math.max(0, motion.linger));
  const release = Math.min(1, Math.max(0, motion.release));
  const a = -0.7 * linger;
  const b = (release - 0.5) * 0.42;
  const angle = t * Math.PI * 2;
  return 1 + a * Math.cos(angle) + b * Math.sin(angle);
}

export function shapeTrackDistance(
  rawDistance: number,
  stride: number,
  motion: Pick<MotionSettings, "linger" | "release">,
): number {
  if (!Number.isFinite(rawDistance) || !Number.isFinite(stride) || stride <= 0) return 0;
  const rawSlides = rawDistance / stride;
  const whole = Math.floor(rawSlides);
  const phase = rawSlides - whole;
  return (whole + warpUnitPhase(phase, motion)) * stride;
}

export function shapeTrackSample(
  rawDistance: number,
  rawVelocity: number,
  stride: number,
  motion: Pick<MotionSettings, "linger" | "release">,
): ShapedTrackSample {
  if (!Number.isFinite(stride) || stride <= 0) {
    return { distance: 0, velocity: 0, derivative: 1, phase: 0 };
  }
  const rawSlides = rawDistance / stride;
  const whole = Math.floor(rawSlides);
  const phase = rawSlides - whole;
  const derivative = warpUnitPhaseDerivative(phase, motion);
  return {
    distance: (whole + warpUnitPhase(phase, motion)) * stride,
    velocity: Number.isFinite(rawVelocity) ? rawVelocity * derivative : 0,
    derivative,
    phase,
  };
}

export function motionResponseRates(
  motion: Pick<MotionSettings, "weight" | "release">,
): { accelerate: number; decelerate: number } {
  const weight = Math.min(1, Math.max(0, motion.weight));
  const release = Math.min(1, Math.max(0, motion.release));
  return {
    // Legacy profile weight 0.6 reproduces the previous 4.8 response.
    accelerate: 8.4 - 6 * weight,
    // Neutral release 0.5 reproduces the previous 7.5 settling response.
    decelerate: 11.25 - 7.5 * release,
  };
}

function hash01(value: number): number {
  const raw = Math.sin(value * 12.9898 + 78.233) * 43_758.545_312_3;
  return raw - Math.floor(raw);
}

export function deterministicPerformance(
  logicalIndex: number,
  distance: number,
  loopLength: number,
  motion: Pick<MotionSettings, "imperfection" | "take">,
): { sway: number; roll: number; depth: number } {
  const amount = Math.min(1, Math.max(0, motion.imperfection));
  if (amount <= 0 || !Number.isFinite(loopLength) || loopLength <= 0) {
    return { sway: 0, roll: 0, depth: 0 };
  }
  const take = Math.max(1, Math.round(motion.take));
  const trackPhase = ((distance % loopLength) + loopLength) % loopLength / loopLength;
  const phase = trackPhase * Math.PI * 2;
  const offset = hash01(logicalIndex * 17 + take * 101) * Math.PI * 2;
  const harmonic = 2 + (take % 3);
  return {
    sway: Math.sin(phase * harmonic + offset) * amount,
    roll: Math.sin(phase * (harmonic + 1) - offset * 0.73) * amount,
    depth: Math.cos(phase * 2 + offset * 1.31) * amount,
  };
}
'''

EVALUATE = r'''import type { StudioSettings } from "../model";
import {
  deterministicPerformance,
  sampleMotionTime,
  shapeTrackDistance,
  shapeTrackSample,
} from "./temporalDirection";

export interface SlideGeometry {
  width: number;
  height: number;
  stride: number;
  axisExtent: number;
  crossExtent: number;
}

export interface EvaluatedSlide {
  primary: number;
  cross: number;
  z: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
  opacity: number;
  normalized: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function positiveModulo(value: number, modulus: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) return 0;
  return ((value % modulus) + modulus) % modulus;
}

export function getSlideGeometry(settings: StudioSettings): SlideGeometry {
  const aspect = settings.slide.aspectWidth / Math.max(0.01, settings.slide.aspectHeight);
  const width = settings.stage.width * clamp(settings.slide.scale, 0.2, 1.25);
  const height = width / aspect;
  const extent = settings.motion.axis === "horizontal" ? width : height;
  const stride = extent * (1 + clamp(settings.motion.gap, 0, 1.5));
  return {
    width,
    height,
    stride,
    axisExtent: settings.motion.axis === "horizontal" ? settings.stage.width : settings.stage.height,
    crossExtent: settings.motion.axis === "horizontal" ? settings.stage.height : settings.stage.width,
  };
}

export function getLogicalSlotCount(assetCount: number, geometry: SlideGeometry): number {
  if (assetCount <= 0) return 0;
  const minimum = Math.ceil(geometry.axisExtent / Math.max(1, geometry.stride)) + 5;
  // The virtual strip must end on a complete asset cycle. Otherwise a padded
  // strip of 9 slots for 8 assets produces ...7,0,0,1... at the wrap seam.
  return Math.max(assetCount, Math.ceil(minimum / assetCount) * assetCount);
}

function rawDistanceAtTime(
  settings: StudioSettings,
  time: number,
  slotCount: number,
  stride: number,
  exportMode: boolean,
): number {
  const direction = settings.motion.direction;
  if (exportMode && settings.motion.seamless && slotCount > 0) {
    const phase = time / Math.max(0.001, settings.output.duration);
    return direction * slotCount * stride * Math.max(1, Math.round(settings.motion.seamlessLoops)) * phase;
  }
  return direction * settings.motion.speed * stride * Math.max(0, time);
}

function rawVelocity(
  settings: StudioSettings,
  slotCount: number,
  stride: number,
  exportMode: boolean,
): number {
  if (exportMode && settings.motion.seamless && slotCount > 0) {
    return settings.motion.direction
      * slotCount
      * stride
      * Math.max(1, Math.round(settings.motion.seamlessLoops))
      / Math.max(0.001, settings.output.duration);
  }
  return settings.motion.direction * settings.motion.speed * stride;
}

export function distanceAtTime(
  settings: StudioSettings,
  time: number,
  slotCount: number,
  stride: number,
  exportMode: boolean,
): number {
  if (settings.motion.reducedMotionOutput && exportMode) return 0;
  const sampledTime = sampleMotionTime(
    time,
    settings.motion.cadence,
    settings.output.duration,
    exportMode && settings.motion.seamless,
  );
  return shapeTrackDistance(
    rawDistanceAtTime(settings, sampledTime, slotCount, stride, exportMode),
    stride,
    settings.motion,
  );
}

export function velocityAtTime(
  settings: StudioSettings,
  slotCount: number,
  stride: number,
  exportMode: boolean,
  time?: number,
): number {
  if (exportMode && settings.motion.reducedMotionOutput) return 0;
  const baseVelocity = rawVelocity(settings, slotCount, stride, exportMode);
  // Preserve the old average-velocity contract for callers that do not ask
  // for a particular pose. Render paths pass time and receive authored motion.
  if (time === undefined) return baseVelocity;

  if (settings.motion.cadence === "continuous") {
    const rawDistance = rawDistanceAtTime(settings, Math.max(0, time), slotCount, stride, exportMode);
    return shapeTrackSample(rawDistance, baseVelocity, stride, settings.motion).velocity;
  }

  const frameDuration = 1 / Math.max(1, settings.output.fps);
  if (time <= 0) return 0;
  const now = distanceAtTime(settings, time, slotCount, stride, exportMode);
  const previous = distanceAtTime(settings, Math.max(0, time - frameDuration), slotCount, stride, exportMode);
  return (now - previous) / frameDuration;
}

export function evaluateSlide(
  index: number,
  slotCount: number,
  distance: number,
  settings: StudioSettings,
  geometry: SlideGeometry,
  velocity = 0,
): EvaluatedSlide {
  if (slotCount <= 0) {
    return { primary: 0, cross: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scale: 1, opacity: 0, normalized: 0 };
  }

  const loopLength = slotCount * geometry.stride;
  let primary = positiveModulo(index * geometry.stride - distance + loopLength / 2, loopLength) - loopLength / 2;
  if (Object.is(primary, -0)) primary = 0;

  const visibleRadius = geometry.axisExtent / 2 + geometry.stride;
  const normalized = clamp(primary / Math.max(1, visibleRadius), -1.4, 1.4);
  const abs = Math.abs(normalized);
  const velocityInSlides = clamp(velocity / Math.max(1, geometry.stride), -1.5, 1.5);
  const overlapWorld = velocityInSlides
    * geometry.stride
    * settings.motion.overlap
    * (0.035 + settings.motion.weight * 0.065);
  const secondaryNormalized = clamp((primary + overlapWorld) / Math.max(1, visibleRadius), -1.4, 1.4);
  const secondaryAbs = Math.abs(secondaryNormalized);
  const depth = settings.motion.depth * geometry.crossExtent;
  const curve = settings.motion.curvature;
  const tilt = (settings.motion.tilt * Math.PI) / 180;
  let cross = 0;
  let z = 0;
  let rotationX = 0;
  let rotationY = 0;
  let rotationZ = 0;

  switch (settings.motion.flow) {
    case "arc":
      cross = -curve * geometry.crossExtent * 0.07 * secondaryNormalized * secondaryNormalized;
      z = -depth * secondaryNormalized * secondaryNormalized;
      rotationZ = -secondaryNormalized * tilt * 0.42;
      rotationY = settings.motion.axis === "horizontal" ? -secondaryNormalized * tilt : 0;
      rotationX = settings.motion.axis === "vertical" ? secondaryNormalized * tilt : 0;
      break;
    case "ribbon":
      cross = Math.sin(secondaryNormalized * Math.PI * 0.9) * curve * geometry.crossExtent * 0.1;
      z = -depth * (0.18 + 0.82 * secondaryNormalized * secondaryNormalized);
      rotationZ = Math.sin(secondaryNormalized * Math.PI) * tilt * 0.45;
      rotationY = settings.motion.axis === "horizontal" ? -secondaryNormalized * tilt * 0.65 : 0;
      rotationX = settings.motion.axis === "vertical" ? secondaryNormalized * tilt * 0.65 : 0;
      break;
    case "cylinder": {
      const angle = secondaryNormalized * curve * 1.45;
      cross = Math.sin(angle) * geometry.crossExtent * 0.08;
      z = -depth * (1 - Math.cos(angle));
      rotationY = settings.motion.axis === "horizontal" ? -angle * 0.62 : Math.sin(angle) * tilt * 0.25;
      rotationX = settings.motion.axis === "vertical" ? angle * 0.62 : 0;
      rotationZ = -secondaryNormalized * tilt * 0.22;
      break;
    }
    case "tunnel":
      cross = Math.sin(secondaryNormalized * Math.PI * 1.2) * curve * geometry.crossExtent * 0.045;
      z = -depth * Math.pow(secondaryAbs, 1.35);
      rotationY = settings.motion.axis === "horizontal" ? -secondaryNormalized * tilt : secondaryNormalized * tilt * 0.18;
      rotationX = settings.motion.axis === "vertical" ? secondaryNormalized * tilt : 0;
      rotationZ = Math.sign(secondaryNormalized) * tilt * Math.pow(secondaryAbs, 1.4) * 0.46;
      break;
    case "straight":
    default:
      z = -depth * secondaryNormalized * secondaryNormalized * 0.28;
      rotationZ = -secondaryNormalized * tilt * 0.12;
      break;
  }

  const performance = deterministicPerformance(index, distance, loopLength, settings.motion);
  cross += performance.sway * geometry.crossExtent * 0.006;
  z += performance.depth * geometry.crossExtent * 0.004;
  rotationZ += performance.roll * (Math.PI / 180) * 0.7;

  const focus = 1 - clamp(abs, 0, 1);
  const scale = (1 + settings.motion.focusScale * focus) * (1 + performance.depth * 0.003);
  const opacity = clamp(1 - settings.motion.edgeFade * Math.pow(abs, 1.6), 0.08, 1);
  return { primary, cross, z, rotationX, rotationY, rotationZ, scale, opacity, normalized };
}

export function isPotentiallyVisible(evaluated: EvaluatedSlide, geometry: SlideGeometry): boolean {
  return Math.abs(evaluated.primary) <= geometry.axisExtent / 2 + geometry.stride * 1.25;
}
'''

TEMPORAL_TEST = r'''import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import {
  cadenceReport,
  deterministicPerformance,
  motionResponseRates,
  sampleMotionTime,
  shapeTrackDistance,
  warpUnitPhase,
  warpUnitPhaseDerivative,
} from "../src/engine/temporalDirection";
import {
  distanceAtTime,
  getLogicalSlotCount,
  getSlideGeometry,
  velocityAtTime,
} from "../src/engine/evaluate";
import { validateStudioSettings } from "../src/lib/settingsValidation";

describe("cinematic temporal direction", () => {
  it("keeps every authored phase monotonic and cycle exact", () => {
    for (const linger of [0, 0.25, 0.5, 0.75, 1]) {
      for (const release of [0, 0.25, 0.5, 0.75, 1]) {
        let previous = -1;
        for (let step = 0; step <= 1_000; step += 1) {
          const phase = step / 1_000;
          const warped = warpUnitPhase(phase, { linger, release });
          expect(warped).toBeGreaterThanOrEqual(previous - 1e-12);
          expect(warpUnitPhaseDerivative(phase, { linger, release })).toBeGreaterThan(0);
          previous = warped;
        }
        expect(warpUnitPhase(0, { linger, release })).toBe(0);
        expect(warpUnitPhase(1, { linger, release })).toBe(1);
      }
    }
  });

  it("preserves exact whole-slide and negative-track boundaries", () => {
    const motion = { linger: 0.82, release: 0.76 };
    for (const slide of [-8, -2, -1, 0, 1, 3, 11]) {
      expect(shapeTrackDistance(slide * 640, 640, motion)).toBe(slide * 640);
    }
  });

  it("holds scene time without throttling the renderer", () => {
    expect(sampleMotionTime(0.081, "12fps")).toBe(0);
    expect(sampleMotionTime(0.084, "12fps")).toBeCloseTo(1 / 12);
    expect(sampleMotionTime(0.072, "18fps")).toBeCloseTo(1 / 18);
    expect(sampleMotionTime(0.072, "24fps")).toBeCloseTo(1 / 24);
    expect(sampleMotionTime(0.072, "continuous")).toBe(0.072);
  });

  it("preserves the seamless endpoint even under held cadence", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.cadence = "12fps";
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 2;
    const geometry = getSlideGeometry(settings);
    const slots = getLogicalSlotCount(8, geometry);
    const end = distanceAtTime(settings, settings.output.duration, slots, geometry.stride, true);
    expect(Math.abs(end)).toBe(slots * geometry.stride * 2);
  });

  it("reports honest even and mixed master holds", () => {
    expect(cadenceReport("12fps", 24)).toMatchObject({ exact: true, headline: expect.stringContaining("2-frame") });
    expect(cadenceReport("12fps", 30)).toMatchObject({ exact: false, headline: expect.stringContaining("2–3-frame") });
    expect(cadenceReport("continuous", 30)).toMatchObject({ exact: true, motionFps: null });
  });

  it("keeps weight and release as separate response controls", () => {
    expect(motionResponseRates({ weight: 0, release: 0.5 }).accelerate).toBeGreaterThan(
      motionResponseRates({ weight: 1, release: 0.5 }).accelerate,
    );
    expect(motionResponseRates({ weight: 0.5, release: 0 }).decelerate).toBeGreaterThan(
      motionResponseRates({ weight: 0.5, release: 1 }).decelerate,
    );
    expect(motionResponseRates({ weight: 0, release: 0.5 }).decelerate).toBe(
      motionResponseRates({ weight: 1, release: 0.5 }).decelerate,
    );
  });

  it("creates deterministic takes that close on track cycles", () => {
    const motion = { imperfection: 0.6, take: 7 };
    const start = deterministicPerformance(3, 0, 8_000, motion);
    expect(deterministicPerformance(3, 0, 8_000, motion)).toEqual(start);
    const end = deterministicPerformance(3, 8_000, 8_000, motion);
    expect(end.sway).toBeCloseTo(start.sway, 10);
    expect(end.roll).toBeCloseTo(start.roll, 10);
    expect(end.depth).toBeCloseTo(start.depth, 10);
    expect(deterministicPerformance(3, 0, 8_000, { ...motion, take: 8 })).not.toEqual(start);
  });

  it("fills temporal fields for legacy schema-v1 projects", () => {
    const legacy = cloneSettings(DEFAULT_SETTINGS) as unknown as Record<string, any>;
    for (const field of ["cadence", "signature", "weight", "linger", "release", "overlap", "imperfection", "take"]) {
      delete legacy.motion[field];
    }
    expect(validateStudioSettings(legacy).motion).toMatchObject({
      cadence: "continuous",
      signature: "custom",
      weight: 0.6,
      linger: 0,
      release: 0.5,
      overlap: 0,
      imperfection: 0,
      take: 1,
    });
  });

  it("pulses optical velocity only when held poses advance", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.cadence = "12fps";
    settings.output.fps = 30;
    const geometry = getSlideGeometry(settings);
    const slots = getLogicalSlotCount(8, geometry);
    const firstHold = velocityAtTime(settings, slots, geometry.stride, true, 1 / 30);
    const nextHold = velocityAtTime(settings, slots, geometry.stride, true, 2 / 30);
    const poseAdvance = velocityAtTime(settings, slots, geometry.stride, true, 3 / 30);
    expect([firstHold, nextHold].filter((value) => Math.abs(value) < 1e-9).length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(poseAdvance)).toBeGreaterThan(0);
  });
});
'''

DOC = r'''# Temporal Direction

Drift should not merely move. It should **perform**.

This branch isolates the temporal layer from the parallel optics, lighting, sound, and spatial-physics branches. It changes how movement gathers energy, arrives, waits, releases, overlaps, and repeats. It does not add another decorative effect stack.

## User contract

A director should be able to make a deck feel filmed in under a minute:

1. Choose a motion signature.
2. Choose how the scene samples time.
3. Adjust weight, focal linger, release, overlap, and imperfection only when the signature needs tailoring.
4. See whether the selected cadence divides cleanly into the delivery master.
5. Recast the performance take without introducing nondeterministic export.

The deck remains the subject. Temporal character should sharpen attention, not compete with the slides.

## Motion signatures

- **Long Take** — patient movement, clear focal breath, soft release.
- **Cut on Breath** — lucid editorial rhythm at 24 fps.
- **Twelve-Frame Hand** — held-animation tactility inside a normal delivery master.
- **Silk Dolly** — continuous primary movement with generous secondary overlap.
- **Held Nerve** — 18 fps tension and restrained deterministic instability.
- **Forward Rush** — fast graphic movement with physical follow-through.

Signatures compile into ordinary settings. They are starting directions, not locked templates. Any fine adjustment marks the current direction as custom.

## Controls that do one job

The first recovered design coupled too many consequences to two vague controls. This pass separates them:

- **Weight** controls acceleration response only. Heavy movement gathers speed slowly.
- **Focal linger** controls how much velocity falls at each slide beat.
- **Release** controls arrival/deceleration character and the asymmetry of each beat.
- **Overlap** delays secondary depth and rotation relative to primary travel.
- **Imperfection** adds bounded, seeded performance variation.
- **Performance take** changes the deterministic phase casting without changing the composition.

This makes direction learnable. A user can predict what each control will do before touching it.

## Twelve-frame motion without a broken twelve-frame app

The WebGL renderer is never throttled to 12 fps. Controls, video compositing, pointer input, and delivery encoding continue at the available frame rate. Only the authored scene pose is sampled and held at the requested temporal cadence.

That distinction matters:

- a 30 fps master carrying 12 fps motion alternates two- and three-frame holds;
- a 24 fps master carrying 12 fps motion uses exact two-frame holds;
- the pinned speaking frame remains clean and temporally independent;
- the background and moving slide materials share the held scene clock;
- export evaluates the same cadence deterministically from fixed frame time.

## Phase direction

Each slide interval is remapped with a periodic monotonic function:

- integer slide boundaries stay exact;
- the first derivative matches across loops;
- focal linger lowers velocity at the beat;
- release shifts energy toward departure or arrival;
- the coefficient radius stays below one, so motion cannot reverse accidentally.

This avoids the common carousel failure where every slide moves at identical velocity and therefore never truly arrives.

## Deterministic imperfection

Imperfection is not `Math.random()` and not frame-to-frame noise. Each take is built from seeded harmonics tied to logical slide index and whole-track phase. The result:

- identical settings produce identical frames;
- seamless exports close exactly;
- reduced-motion output freezes cleanly;
- a recast take is different but repeatable;
- text does not shimmer at rest.

## Interaction rules

- Direct manipulation bypasses held cadence while the pointer is active, so editing never feels defective.
- Autoplay and release use frame-rate-independent exponential response.
- Weight affects acceleration; release affects settling. They no longer secretly modify focal scale or each other.
- Reduced-motion preview and masters suppress travel and temporal variation without destroying the useful composition.

## Gauntlet gates

The branch must hold all of these:

- temporal phase is monotonic across the complete control domain;
- whole-slide boundaries and seamless endpoints remain exact;
- cadence never throttles the browser render loop;
- 12, 18, and 24 fps poses are deterministic in 24, 25, 30, 50, and 60 fps masters;
- mixed hold patterns are disclosed rather than disguised;
- legacy schema-v1 projects receive a neutral temporal profile;
- zero imperfection reproduces stable, non-wobbling slides;
- performance takes close at whole-track cycles;
- manual controls remain responsive;
- pinned presenter media is not quantized with the carousel;
- `npm run check` and the Chromium gauntlet pass from a clean checkout.
'''

write("src/engine/temporalDirection.ts", TEMPORAL_DIRECTION)
write("src/engine/evaluate.ts", EVALUATE)
write("tests/temporalDirection.test.ts", TEMPORAL_TEST)
write("docs/TEMPORAL_DIRECTION.md", DOC)

# Schema-compatible temporal fields. Missing fields in an old schema-v1 project
# are filled at the validation boundary with LEGACY_MOTION_FEEL.
replace(
    "src/model.ts",
    'export type Direction = 1 | -1;\nexport type Flow = "straight" | "arc" | "ribbon" | "cylinder" | "tunnel";',
    'export type Direction = 1 | -1;\nexport type MotionCadence = "continuous" | "24fps" | "18fps" | "12fps";\nexport type MotionSignatureId = "long-take" | "cut-on-breath" | "twelve-frame-hand" | "silk-dolly" | "held-nerve" | "forward-rush" | "custom";\nexport type Flow = "straight" | "arc" | "ribbon" | "cylinder" | "tunnel";',
)
replace(
    "src/model.ts",
    '  speed: number;\n  flow: Flow;',
    '  speed: number;\n  cadence: MotionCadence;\n  signature: MotionSignatureId;\n  weight: number;\n  linger: number;\n  release: number;\n  overlap: number;\n  imperfection: number;\n  take: number;\n  flow: Flow;',
)
replace(
    "src/model.ts",
    'export const DEFAULT_SETTINGS: StudioSettings = {',
    'export const LEGACY_MOTION_FEEL = Object.freeze({\n  cadence: "continuous" as const,\n  signature: "custom" as const,\n  weight: 0.6,\n  linger: 0,\n  release: 0.5,\n  overlap: 0,\n  imperfection: 0,\n  take: 1,\n});\n\nexport const DEFAULT_SETTINGS: StudioSettings = {',
)
replace(
    "src/model.ts",
    '    speed: 0.34,\n    flow: "ribbon",',
    '    speed: 0.24,\n    cadence: "continuous",\n    signature: "long-take",\n    weight: 0.72,\n    linger: 0.48,\n    release: 0.72,\n    overlap: 0.22,\n    imperfection: 0.04,\n    take: 1,\n    flow: "ribbon",',
)

# Validation accepts the complete new settings and upgrades old schema-v1
# payloads at the trust boundary without silently clamping supplied bad values.
replace(
    "src/lib/settingsValidation.ts",
    '  ENGINE_VERSION,\n  SCHEMA_VERSION,\n  SHADER_VERSION,\n  type StudioSettings,',
    '  ENGINE_VERSION,\n  LEGACY_MOTION_FEEL,\n  SCHEMA_VERSION,\n  SHADER_VERSION,\n  type StudioSettings,',
)
replace(
    "src/lib/settingsValidation.ts",
    'const DIRECTIONS = [-1, 1] as const;\nconst FLOWS = ["straight", "arc", "ribbon", "cylinder", "tunnel"] as const;',
    'const DIRECTIONS = [-1, 1] as const;\nconst MOTION_CADENCES = ["continuous", "24fps", "18fps", "12fps"] as const;\nconst MOTION_SIGNATURES = ["long-take", "cut-on-breath", "twelve-frame-hand", "silk-dolly", "held-nerve", "forward-rush", "custom"] as const;\nconst FLOWS = ["straight", "arc", "ribbon", "cylinder", "tunnel"] as const;',
)
replace(
    "src/lib/settingsValidation.ts",
    'function hexColour(value: unknown, path: string): string {',
    'function optionalNumber(value: unknown, path: string, rule: NumberRule, fallback: number): number {\n  return value === undefined ? fallback : number(value, path, rule);\n}\n\nfunction optionalOneOf<const T extends readonly (string | number)[]>(\n  value: unknown,\n  path: string,\n  choices: T,\n  fallback: T[number],\n): T[number] {\n  return value === undefined ? fallback : oneOf(value, path, choices);\n}\n\nfunction hexColour(value: unknown, path: string): string {',
)
replace(
    "src/lib/settingsValidation.ts",
    '      speed: number(motion.speed, "settings.motion.speed", { min: 0, max: 1.5 }),\n      flow: oneOf(motion.flow, "settings.motion.flow", FLOWS),',
    '      speed: number(motion.speed, "settings.motion.speed", { min: 0, max: 1.5 }),\n      cadence: optionalOneOf(motion.cadence, "settings.motion.cadence", MOTION_CADENCES, LEGACY_MOTION_FEEL.cadence),\n      signature: optionalOneOf(motion.signature, "settings.motion.signature", MOTION_SIGNATURES, LEGACY_MOTION_FEEL.signature),\n      weight: optionalNumber(motion.weight, "settings.motion.weight", { min: 0, max: 1 }, LEGACY_MOTION_FEEL.weight),\n      linger: optionalNumber(motion.linger, "settings.motion.linger", { min: 0, max: 1 }, LEGACY_MOTION_FEEL.linger),\n      release: optionalNumber(motion.release, "settings.motion.release", { min: 0, max: 1 }, LEGACY_MOTION_FEEL.release),\n      overlap: optionalNumber(motion.overlap, "settings.motion.overlap", { min: 0, max: 1 }, LEGACY_MOTION_FEEL.overlap),\n      imperfection: optionalNumber(motion.imperfection, "settings.motion.imperfection", { min: 0, max: 1 }, LEGACY_MOTION_FEEL.imperfection),\n      take: optionalNumber(motion.take, "settings.motion.take", { min: 1, max: 999, integer: true }, LEGACY_MOTION_FEEL.take),\n      flow: oneOf(motion.flow, "settings.motion.flow", FLOWS),',
)

# Theme worlds now carry temporal direction, while remaining composable with
# the optics/background branches because only motion fields are touched.
theme_replacements = {
    'motion: { axis: "vertical", direction: -1, speed: 0.34, flow: "ribbon", curvature: 0.36, depth: 0.18, tilt: 4.5 },':
    'motion: { axis: "vertical", direction: -1, speed: 0.24, cadence: "continuous", signature: "long-take", weight: 0.72, linger: 0.48, release: 0.72, overlap: 0.22, imperfection: 0.04, flow: "ribbon", curvature: 0.36, depth: 0.18, tilt: 4.5 },',
    'motion: { axis: "horizontal", direction: -1, speed: 0.28, flow: "arc", gap: 0.3, curvature: 0.46, depth: 0.28, tilt: 2.2, distortion: 0.22 },':
    'motion: { axis: "horizontal", direction: -1, speed: 0.2, cadence: "continuous", signature: "silk-dolly", weight: 0.34, linger: 0.16, release: 0.82, overlap: 0.48, imperfection: 0.08, flow: "arc", gap: 0.3, curvature: 0.46, depth: 0.28, tilt: 2.2, distortion: 0.22 },',
    'motion: { axis: "vertical", direction: -1, speed: 0.17, flow: "tunnel", gap: 0.44, curvature: 0.72, depth: 0.56, tilt: 8.5, distortion: 0.48, focusScale: 0.04, edgeFade: 0.46 },':
    'motion: { axis: "vertical", direction: -1, speed: 0.18, cadence: "18fps", signature: "held-nerve", weight: 0.78, linger: 0.56, release: 0.44, overlap: 0.2, imperfection: 0.24, flow: "tunnel", gap: 0.44, curvature: 0.72, depth: 0.56, tilt: 8.5, distortion: 0.48, focusScale: 0.04, edgeFade: 0.46 },',
    'motion: { axis: "horizontal", direction: 1, speed: 0.42, flow: "straight", gap: 0.16, curvature: 0, depth: 0.08, tilt: 0.8, distortion: 0.12, focusScale: 0.02 },':
    'motion: { axis: "horizontal", direction: 1, speed: 0.38, cadence: "24fps", signature: "cut-on-breath", weight: 0.52, linger: 0.3, release: 0.36, overlap: 0.12, imperfection: 0.03, flow: "straight", gap: 0.16, curvature: 0, depth: 0.08, tilt: 0.8, distortion: 0.12, focusScale: 0.02 },',
    'motion: { axis: "horizontal", direction: -1, speed: 0.2, flow: "ribbon", gap: 0.08, curvature: 0.28, depth: 0.14, tilt: 2.8, distortion: 0.16, focusScale: 0.11, edgeFade: 0.2 },':
    'motion: { axis: "horizontal", direction: -1, speed: 0.18, cadence: "continuous", signature: "silk-dolly", weight: 0.3, linger: 0.22, release: 0.86, overlap: 0.52, imperfection: 0.05, flow: "ribbon", gap: 0.08, curvature: 0.28, depth: 0.14, tilt: 2.8, distortion: 0.16, focusScale: 0.11, edgeFade: 0.2 },',
    'motion: { axis: "horizontal", direction: -1, speed: 0.58, flow: "cylinder", gap: 0.26, curvature: 0.68, depth: 0.48, tilt: 9, distortion: 0.58, focusScale: 0.14, edgeFade: 0.32 },':
    'motion: { axis: "horizontal", direction: -1, speed: 0.64, cadence: "24fps", signature: "forward-rush", weight: 0.42, linger: 0.08, release: 0.28, overlap: 0.34, imperfection: 0.12, flow: "cylinder", gap: 0.26, curvature: 0.68, depth: 0.48, tilt: 9, distortion: 0.58, focusScale: 0.14, edgeFade: 0.32 },',
}
for old, new in theme_replacements.items():
    replace("src/themes.ts", old, new)

# The inspector begins with fast authored choices, then exposes independent
# expert controls and tells the truth about cadence/master compatibility.
replace(
    "src/components/ControlPanel.tsx",
    'import { THEMES } from "../themes";',
    'import { THEMES } from "../themes";\nimport { MOTION_SIGNATURES, applyMotionSignature, cadenceReport, getMotionSignature } from "../engine/temporalDirection";',
)
control = read("src/components/ControlPanel.tsx")
control = control.replace('patch("motion", {', 'patchMotion({')
write("src/components/ControlPanel.tsx", control)
replace(
    "src/components/ControlPanel.tsx",
    '  const setStagePreset = (width: number, height: number) => {',
    '  const patchMotion = (values: Partial<StudioSettings["motion"]>, preserveSignature = false) => {\n    patch("motion", { ...values, ...(preserveSignature ? {} : { signature: "custom" as const }) });\n  };\n  const setStagePreset = (width: number, height: number) => {',
)
replace(
    "src/components/ControlPanel.tsx",
    '  const stageLabel = `${settings.stage.width}:${settings.stage.height}`;',
    '  const stageLabel = `${settings.stage.width}:${settings.stage.height}`;\n  const activeSignature = getMotionSignature(settings.motion.signature);\n  const cadence = cadenceReport(settings.motion.cadence, settings.output.fps);',
)
replace("src/components/ControlPanel.tsx", '<span>6</span>', '<span>{THEMES.length}</span>')
replace(
    "src/components/ControlPanel.tsx",
    '      <InspectorGroup title="Motion" eyebrow={`${settings.motion.speed.toFixed(2)} slides/s`} open>\n        <Segmented label="Flow axis"',
    '''      <InspectorGroup title="Motion" eyebrow={`${settings.motion.speed.toFixed(2)} slides/s`} open>
        <SelectField
          label="Motion signature"
          value={settings.motion.signature}
          options={[
            ...MOTION_SIGNATURES.map((signature) => ({ value: signature.id, label: signature.name })),
            { value: "custom" as const, label: "Custom direction" },
          ]}
          onChange={(signature) => {
            if (signature === "custom") {
              patchMotion({ signature }, true);
              return;
            }
            onSettings(applyMotionSignature(settings, signature));
          }}
        />
        <div className="motion-signature-note" data-custom={!activeSignature}>
          <strong>{activeSignature?.eyebrow ?? "Director-tuned"}</strong>
          <span>{activeSignature?.description ?? "The authored signature has been adjusted. Every control remains deterministic and export-safe."}</span>
          {activeSignature ? <small>{activeSignature.bestFor}</small> : null}
        </div>
        <Segmented
          label="Motion cadence"
          value={settings.motion.cadence}
          options={[
            { value: "continuous" as const, label: "Continuous" },
            { value: "24fps" as const, label: "24" },
            { value: "18fps" as const, label: "18" },
            { value: "12fps" as const, label: "12" },
          ]}
          onChange={(cadence) => patchMotion({ cadence })}
        />
        <div className="cadence-readout" data-exact={cadence.exact}>
          <strong>{cadence.headline}</strong>
          <small>{cadence.detail}</small>
        </div>
        <Segmented label="Flow axis"''',
)
replace(
    "src/components/ControlPanel.tsx",
    '        <RangeField label="Speed" value={settings.motion.speed} min={0} max={1.5} step={0.01} decimals={2} unit="×" onChange={(speed) => patchMotion({ speed })} />\n        <RangeField label="Curve"',
    '''        <RangeField label="Speed" value={settings.motion.speed} min={0} max={1.5} step={0.01} decimals={2} unit="×" onChange={(speed) => patchMotion({ speed })} />
        <RangeField label="Weight" value={settings.motion.weight * 100} min={0} max={100} step={1} unit="%" hint="Mass only: heavier movement gathers speed more slowly." onChange={(value) => patchMotion({ weight: value / 100 })} />
        <RangeField label="Focal linger" value={settings.motion.linger * 100} min={0} max={100} step={1} unit="%" hint="Creates a readable beat as each slide arrives; never reverses the track." onChange={(value) => patchMotion({ linger: value / 100 })} />
        <RangeField label="Release" value={settings.motion.release * 100} min={0} max={100} step={1} unit="%" hint="Controls how momentum carries into the landing and how slowly it settles." onChange={(value) => patchMotion({ release: value / 100 })} />
        <RangeField label="Overlap" value={settings.motion.overlap * 100} min={0} max={100} step={1} unit="%" hint="Lets depth and rotation arrive after primary travel." onChange={(value) => patchMotion({ overlap: value / 100 })} />
        <RangeField label="Imperfection" value={settings.motion.imperfection * 100} min={0} max={100} step={1} unit="%" hint="Bounded, seeded performance variation. No random frame shimmer." onChange={(value) => patchMotion({ imperfection: value / 100 })} />
        <RangeField label="Performance take" value={settings.motion.take} min={1} max={24} step={1} hint="A different deterministic casting of the same movement." onChange={(take) => patchMotion({ take })} />
        <button type="button" className="recast-action" onClick={() => patchMotion({ take: (settings.motion.take % 24) + 1 })}>Recast performance take</button>
        <RangeField label="Curve"''',
)

# Stage communicates authored cadence separately from renderer health and master fps.
replace(
    "src/components/Stage.tsx",
    'import type { ExportProgress, StudioAsset, StudioSettings } from "../model";',
    'import type { ExportProgress, StudioAsset, StudioSettings } from "../model";\nimport { motionCadenceLabel } from "../engine/temporalDirection";',
)
replace(
    "src/components/Stage.tsx",
    '<span>{settings.motion.axis} · {settings.motion.flow}</span>',
    '<span>{settings.motion.axis} · {settings.motion.flow} · {motionCadenceLabel(settings.motion.cadence)}</span>',
)
replace(
    "src/components/Stage.tsx",
    '            <span>{settings.stage.width} × {settings.stage.height}</span>\n            <span>{fps > 0 ? `${fps} FPS` : "GPU"}</span>',
    '            <span>{settings.stage.width} × {settings.stage.height}</span>\n            <span>{motionCadenceLabel(settings.motion.cadence)} · {settings.output.fps} fps master</span>\n            <span>{fps > 0 ? `${fps} FPS GPU` : "GPU"}</span>',
)

# Shared engine: continuous interaction, held authored poses, deterministic
# scene time, independent presenter video, and separated acceleration/release.
replace(
    "src/engine/CinematicCarousel.ts",
    '} from "./evaluate";\nimport {',
    '} from "./evaluate";\nimport { cadenceFrameAtTime, motionResponseRates, sampleMotionTime, shapeTrackSample } from "./temporalDirection";\nimport {',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '  private presenterRequestGeneration = 0;',
    '  private presenterRequestGeneration = 0;\n  private cadenceFrame: number | null = null;\n  private cadenceDistance = 0;\n  private cadenceVelocity = 0;\n  private cadenceSampleTime = 0;',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '''  setSettings(settings: StudioSettings): void {
    this.settings = settings;
    this.updateCamera();''',
    '''  setSettings(settings: StudioSettings): void {
    const cadenceChanged = this.settings.motion.cadence !== settings.motion.cadence;
    this.settings = settings;
    if (cadenceChanged) this.resetCadencePreview();
    this.updateCamera();''',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '    if (paused) this.motionVelocity *= 0.7;',
    '    if (paused) this.motionVelocity *= 0.35 + this.settings.motion.release * 0.55;',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '''  setReducedMotionPreview(reduced: boolean): void {
    this.reducedMotionPreview = reduced;
    if (reduced) this.motionVelocity = 0;
  }''',
    '''  setReducedMotionPreview(reduced: boolean): void {
    this.reducedMotionPreview = reduced;
    if (reduced) this.motionVelocity = 0;
    this.resetCadencePreview();
  }''',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '''  stepSlides(amount: number): void {
    const geometry = getSlideGeometry(this.settings);
    this.motionPosition += geometry.stride * amount * this.settings.motion.direction;
    this.motionVelocity = 0;
    this.renderPreview();
  }''',
    '''  stepSlides(amount: number): void {
    const geometry = getSlideGeometry(this.settings);
    this.motionPosition += geometry.stride * amount * this.settings.motion.direction;
    this.motionVelocity = 0;
    this.resetCadencePreview();
    this.renderPreview();
  }''',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '    const velocity = velocityAtTime(this.settings, slotCount, geometry.stride, true);',
    '    const velocity = velocityAtTime(this.settings, slotCount, geometry.stride, true, time);',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '''    const distance = distanceAtTime(this.settings, time, slotCount, geometry.stride, true);
    const visible: VisibleItem[] = [];''',
    '''    const distance = distanceAtTime(this.settings, time, slotCount, geometry.stride, true);
    const velocity = velocityAtTime(this.settings, slotCount, geometry.stride, true, time);
    const visible: VisibleItem[] = [];''',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '      const evaluated = evaluateSlide(logicalIndex, slotCount, distance, this.settings, geometry);',
    '      const evaluated = evaluateSlide(logicalIndex, slotCount, distance, this.settings, geometry, velocity);',
    count=2,
)
replace(
    "src/engine/CinematicCarousel.ts",
    '''  private advanceMotion(delta: number): void {
    const geometry = getSlideGeometry(this.settings);
    const autoplay = this.settings.motion.autoplay && !this.paused && !this.reducedMotionPreview;
    const desiredVelocity = autoplay ? this.settings.motion.direction * this.settings.motion.speed * geometry.stride : 0;
    if (!this.dragging) {
      const response = 1 - Math.exp(-delta * (autoplay ? 4.8 : 7.5));
      this.motionVelocity += (desiredVelocity - this.motionVelocity) * response;
      this.motionPosition += this.motionVelocity * delta;
    }
  }

  private renderPreview(): void {
    if (this.contextLost || this.disposed || this.exportActive) return;
    this.renderInternal(this.elapsed, this.motionPosition, this.motionVelocity, false);
  }''',
    '''  private advanceMotion(delta: number): void {
    const geometry = getSlideGeometry(this.settings);
    const autoplay = this.settings.motion.autoplay && !this.paused && !this.reducedMotionPreview;
    const desiredVelocity = autoplay ? this.settings.motion.direction * this.settings.motion.speed * geometry.stride : 0;
    if (!this.dragging) {
      const rates = motionResponseRates(this.settings.motion);
      const response = 1 - Math.exp(-delta * (autoplay ? rates.accelerate : rates.decelerate));
      this.motionVelocity += (desiredVelocity - this.motionVelocity) * response;
      this.motionPosition += this.motionVelocity * delta;
    }
  }

  private resetCadencePreview(): void {
    this.cadenceFrame = null;
    this.cadenceDistance = this.motionPosition;
    this.cadenceVelocity = this.motionVelocity;
    this.cadenceSampleTime = this.elapsed;
  }

  private previewTrackSample(stride: number): { distance: number; velocity: number } {
    if (this.reducedMotionPreview) return { distance: 0, velocity: 0 };
    const frame = cadenceFrameAtTime(this.elapsed, this.settings.motion.cadence);
    if (frame === null || this.dragging) {
      this.resetCadencePreview();
      return shapeTrackSample(this.motionPosition, this.motionVelocity, stride, this.settings.motion);
    }
    if (frame !== this.cadenceFrame) {
      const elapsed = Math.max(1 / 240, this.elapsed - this.cadenceSampleTime);
      const previous = this.cadenceDistance;
      this.cadenceFrame = frame;
      this.cadenceDistance = this.motionPosition;
      this.cadenceVelocity = (this.cadenceDistance - previous) / elapsed;
      this.cadenceSampleTime = this.elapsed;
    }
    return shapeTrackSample(this.cadenceDistance, this.cadenceVelocity, stride, this.settings.motion);
  }

  private renderPreview(): void {
    if (this.contextLost || this.disposed || this.exportActive) return;
    const geometry = getSlideGeometry(this.settings);
    const sample = this.previewTrackSample(geometry.stride);
    this.renderInternal(this.elapsed, sample.distance, sample.velocity, false);
  }''',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '''    const renderable = selectRenderableItems(visible, this.pool.length);

    const keepTextureKeys = new Set<string>();''',
    '''    const renderable = selectRenderableItems(visible, this.pool.length);
    const sceneTime = sampleMotionTime(
      time,
      this.settings.motion.cadence,
      this.settings.output.duration,
      exportMode && this.settings.motion.seamless,
    );

    const keepTextureKeys = new Set<string>();''',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '      this.updatePoolItem(item, visibleItem, geometry.width, geometry.height, time, normalizedVelocity);',
    '      this.updatePoolItem(item, visibleItem, geometry.width, geometry.height, sceneTime, normalizedVelocity);',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '''  private updateBackground(time: number, exportMode: boolean): void {
    const reduced = exportMode ? this.settings.motion.reducedMotionOutput : this.reducedMotionPreview;
    let phase = reduced ? 0 : time * this.settings.background.motion * 0.72;''',
    '''  private updateBackground(time: number, exportMode: boolean): void {
    const reduced = exportMode ? this.settings.motion.reducedMotionOutput : this.reducedMotionPreview;
    const sceneTime = sampleMotionTime(
      time,
      this.settings.motion.cadence,
      this.settings.output.duration,
      exportMode && this.settings.motion.seamless,
    );
    let phase = reduced ? 0 : sceneTime * this.settings.background.motion * 0.72;''',
)

# Inspector polish: these are explanatory surfaces, not decoration.
append_once(
    "src/styles.css",
    ".motion-signature-note {",
    r'''.motion-signature-note {
  display: grid;
  gap: 5px;
  padding: 12px 13px;
  border: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel-raised) 76%, transparent);
}

.motion-signature-note strong,
.cadence-readout strong {
  font-size: 11px;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.motion-signature-note span,
.motion-signature-note small,
.cadence-readout small {
  color: var(--text-dim);
  font-size: 11px;
  line-height: 1.45;
}

.motion-signature-note[data-custom="true"] {
  border-style: dashed;
}

.cadence-readout {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-left: 2px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.cadence-readout[data-exact="false"] {
  border-left-color: var(--warning, #d19a66);
}

.recast-action {
  width: 100%;
  min-height: 34px;
  border-style: dashed;
  font-size: 11px;
  letter-spacing: 0.04em;
}''',
)

# Browser-level user journey. Existing file already imports Playwright's test.
append_once(
    "e2e/studio.e2e.ts",
    'test("directs temporal feel without confusing motion cadence with master fps"',
    r'''test("directs temporal feel without confusing motion cadence with master fps", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Director" }).click().catch(() => undefined);

  const signature = page.getByLabel("Motion signature");
  await signature.selectOption("twelve-frame-hand");
  await expect(page.getByText("Twelve-Frame Hand", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/12 fps motion/i).first()).toBeVisible();
  await expect(page.getByText(/master/i).first()).toBeVisible();

  await page.getByLabel("Focal linger").fill("64");
  await page.getByLabel("Release").fill("71");
  await expect(signature).toHaveValue("custom");

  const take = page.getByLabel("Performance take");
  const before = await take.inputValue();
  await page.getByRole("button", { name: "Recast performance take" }).click();
  await expect(take).not.toHaveValue(before);

  await page.getByLabel("12").check();
  await page.getByLabel("Frame rate").getByLabel("24").check().catch(() => undefined);
  await expect(page.getByText(/even 2-frame holds/i)).toBeVisible();

  await page.getByLabel("Frame rate").getByLabel("30").check().catch(() => undefined);
  await expect(page.getByText(/mixed 2–3-frame holds/i)).toBeVisible();
});''',
)

append_once(
    "README.md",
    "### Temporal direction",
    r'''### Temporal direction

Motion is directed through authored signatures, independent weight/linger/release/overlap controls, deterministic performance takes, and continuous/24/18/12 fps scene cadence. Held-animation modes sample the WebGL scene pose without throttling the app or changing the delivery master. See [`docs/TEMPORAL_DIRECTION.md`](docs/TEMPORAL_DIRECTION.md).''',
)

print("Temporal feel source applied successfully.")
