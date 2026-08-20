import type { DynamicsMode, StudioSettings } from "../model";

const TAU = Math.PI * 2;

export interface ExportMotion {
  distance: number;
  velocity: number;
  acceleration: number;
}

interface MotionCharacterSample {
  offset: number;
  velocityDelta: number;
  accelerationDelta: number;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Periodic displacement curves with zero offset at every whole master. Their
 * first and second derivatives also agree across the cut, so speed, material
 * acceleration, and surface lighting close with the carousel position.
 */
function sampleMotionCharacter(mode: DynamicsMode, phase: number): MotionCharacterSample {
  const p = finite(phase);
  switch (mode) {
    case "weighted": {
      const amplitude = 0.18;
      const angle = TAU * p;
      return {
        offset: -(amplitude / TAU) * Math.sin(angle),
        velocityDelta: -amplitude * Math.cos(angle),
        accelerationDelta: amplitude * TAU * Math.sin(angle),
      };
    }
    case "spring": {
      const amplitude = 0.24;
      const frequency = TAU * 2;
      const angle = frequency * p;
      return {
        offset: (amplitude / frequency) * (1 - Math.cos(angle)),
        velocityDelta: amplitude * Math.sin(angle),
        accelerationDelta: amplitude * frequency * Math.cos(angle),
      };
    }
    case "drift": {
      const amplitude = 0.28;
      const angle = TAU * p;
      return {
        offset: (amplitude / TAU) * Math.sin(angle),
        velocityDelta: amplitude * Math.cos(angle),
        accelerationDelta: -amplitude * TAU * Math.sin(angle),
      };
    }
    case "direct":
    default:
      return { offset: 0, velocityDelta: 0, accelerationDelta: 0 };
  }
}

/**
 * Analytic authored motion for stills, frame sequences, and video export.
 * Preview inertia remains a separate stateful system; export is a pure function
 * of settings and timestamp. Every character preserves average pace and exact
 * end distance, but changes how that pace gathers, releases, or pulses.
 */
export function evaluateExportMotion(
  settings: StudioSettings,
  time: number,
  slotCount: number,
  stride: number,
): ExportMotion {
  if (settings.motion.reducedMotionOutput) {
    return { distance: 0, velocity: 0, acceleration: 0 };
  }

  const safeTime = Math.max(0, finite(time));
  const duration = Math.max(0.001, finite(settings.output.duration, 1));
  const safeStride = Math.max(0, Math.abs(finite(stride)));
  const slots = Math.max(0, Math.floor(finite(slotCount)));
  const loops = Math.max(1, Math.round(finite(settings.motion.seamlessLoops, 1)));
  const speed = Math.max(0, finite(settings.motion.speed));
  const direction = settings.motion.direction === -1 ? -1 : 1;
  const baseVelocity = direction * (
    settings.motion.seamless && slots > 0
      ? (slots * safeStride * loops) / duration
      : speed * safeStride
  );
  const phase = safeTime / duration;
  const character = sampleMotionCharacter(settings.motion.dynamics, phase);
  const distance = baseVelocity * safeTime
    + baseVelocity * duration * character.offset;
  const velocity = baseVelocity * (1 + character.velocityDelta);
  const acceleration = (baseVelocity / duration) * character.accelerationDelta;

  return {
    distance: finite(distance),
    velocity: finite(velocity),
    acceleration: finite(acceleration),
  };
}
