import type { DriftCreativeState, PoseCadence } from "../project/schema";
import { clamp, finite, smoothstep, smoothstepDerivative, TIMELINE_EPSILON } from "./math";

export interface MasterTimelineSample {
  time: number;
  progress: number;
  velocityPerSecond: number;
  accelerationPerSecondSquared: number;
  handleSeconds: number;
  active: boolean;
}

interface RunwayShape {
  progress: number;
  derivative: number;
  secondDerivative: number;
}

function smoothstepIntegral(value: number): number {
  const t = clamp(value, 0, 1);
  return t ** 3 - 0.5 * t ** 4;
}

function inverseSmoothstepIntegral(value: number): number {
  const t = clamp(value, 0, 1);
  return t - t ** 3 + 0.5 * t ** 4;
}

function runwayFractions(weight: number, release: number, runway: number): { entry: number; exit: number; area: number } {
  const strength = clamp(finite(runway), 0, 1);
  let entry = strength * (0.035 + clamp(finite(weight), 0, 1) * 0.18);
  let exit = strength * (0.035 + clamp(finite(release), 0, 1) * 0.22);
  const occupied = entry + exit;
  if (occupied > 0.82) {
    const scale = 0.82 / occupied;
    entry *= scale;
    exit *= scale;
  }
  return { entry, exit, area: 1 - 0.5 * (entry + exit) };
}

export function evaluateRunwayShape(
  progress: number,
  performance: Pick<DriftCreativeState["motion"]["performance"], "weight" | "release" | "runway">,
): RunwayShape {
  const p = clamp(finite(progress), 0, 1);
  if (performance.runway <= TIMELINE_EPSILON) {
    return { progress: p, derivative: 1, secondDerivative: 0 };
  }

  const { entry, exit, area } = runwayFractions(performance.weight, performance.release, performance.runway);
  if (entry > 0 && p < entry) {
    const u = p / entry;
    return {
      progress: entry * smoothstepIntegral(u) / area,
      derivative: smoothstep(u) / area,
      secondDerivative: smoothstepDerivative(u) / (entry * area),
    };
  }
  if (exit > 0 && p > 1 - exit) {
    const u = (p - (1 - exit)) / exit;
    const before = 0.5 * entry + (1 - entry - exit);
    return {
      progress: (before + exit * inverseSmoothstepIntegral(u)) / area,
      derivative: (1 - smoothstep(u)) / area,
      secondDerivative: -smoothstepDerivative(u) / (exit * area),
    };
  }
  return {
    progress: (0.5 * entry + (p - entry)) / area,
    derivative: 1 / area,
    secondDerivative: 0,
  };
}

export function poseCadenceFps(cadence: PoseCadence): number | null {
  switch (cadence) {
    case "24fps": return 24;
    case "18fps": return 18;
    case "12fps": return 12;
    case "continuous":
    default: return null;
  }
}

export function samplePoseTime(
  time: number,
  cadence: PoseCadence,
  duration: number,
  preserveDurationEndpoint = true,
): number {
  const safeDuration = Math.max(0.001, finite(duration, 1));
  const safeTime = clamp(finite(time), 0, safeDuration);
  if (preserveDurationEndpoint && safeTime >= safeDuration - TIMELINE_EPSILON) return safeDuration;
  const fps = poseCadenceFps(cadence);
  if (!fps) return safeTime;
  return Math.floor(safeTime * fps + TIMELINE_EPSILON) / fps;
}

export function quantizeEventTimeToPose(time: number, cadence: PoseCadence, duration: number): number {
  const fps = poseCadenceFps(cadence);
  if (!fps) return clamp(finite(time), 0, duration);
  const quantized = Math.ceil(Math.max(0, finite(time)) * fps - TIMELINE_EPSILON) / fps;
  return clamp(quantized, 0, duration);
}

export function evaluateMasterTimeline(project: DriftCreativeState, time: number): MasterTimelineSample {
  const duration = Math.max(0.001, project.master.duration);
  const clampedTime = clamp(finite(time), 0, duration);
  if (project.master.reducedMotion) {
    return {
      time: clampedTime,
      progress: 0,
      velocityPerSecond: 0,
      accelerationPerSecondSquared: 0,
      handleSeconds: 0,
      active: false,
    };
  }

  if (project.motion.seamless.enabled) {
    return {
      time: clampedTime,
      progress: clampedTime / duration,
      velocityPerSecond: 1 / duration,
      accelerationPerSecondSquared: 0,
      handleSeconds: 0,
      active: true,
    };
  }

  const runway = project.motion.performance.runway;
  if (runway <= TIMELINE_EPSILON) {
    return {
      time: clampedTime,
      progress: clampedTime / duration,
      velocityPerSecond: 1 / duration,
      accelerationPerSecondSquared: 0,
      handleSeconds: 0,
      active: clampedTime > 0 && clampedTime < duration,
    };
  }

  const handleSeconds = runway * Math.min(duration * 0.04, 2 / Math.max(1, project.master.fps));
  const activeDuration = Math.max(0.001, duration - handleSeconds * 2);
  if (clampedTime <= handleSeconds) {
    return {
      time: clampedTime,
      progress: 0,
      velocityPerSecond: 0,
      accelerationPerSecondSquared: 0,
      handleSeconds,
      active: false,
    };
  }
  if (clampedTime >= duration - handleSeconds) {
    return {
      time: clampedTime,
      progress: 1,
      velocityPerSecond: 0,
      accelerationPerSecondSquared: 0,
      handleSeconds,
      active: false,
    };
  }

  const activeProgress = (clampedTime - handleSeconds) / activeDuration;
  const shape = evaluateRunwayShape(activeProgress, project.motion.performance);
  return {
    time: clampedTime,
    progress: shape.progress,
    velocityPerSecond: shape.derivative / activeDuration,
    accelerationPerSecondSquared: shape.secondDerivative / (activeDuration * activeDuration),
    handleSeconds,
    active: true,
  };
}
