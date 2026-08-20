import type { DynamicsMode, StudioSettings, SurfaceMode } from "../model";

const TAU = Math.PI * 2;
const MAX_STEP = 1 / 120;

export interface MotionState {
  position: number;
  velocity: number;
  acceleration: number;
}

export interface DynamicsProfile {
  response: number;
  accelerationDamping: number;
  coastDrag: number;
  impulseGain: number;
  maximumVelocity: number;
  maximumAcceleration: number;
}

export const DYNAMICS_PROFILES: Readonly<Record<DynamicsMode, DynamicsProfile>> = Object.freeze({
  direct: Object.freeze({
    response: 22,
    accelerationDamping: 28,
    coastDrag: 18,
    impulseGain: 0.72,
    maximumVelocity: 3.2,
    maximumAcceleration: 28,
  }),
  weighted: Object.freeze({
    response: 8.4,
    accelerationDamping: 10.5,
    coastDrag: 3.2,
    impulseGain: 0.94,
    maximumVelocity: 4.2,
    maximumAcceleration: 22,
  }),
  spring: Object.freeze({
    response: 12.8,
    accelerationDamping: 6.2,
    coastDrag: 1.8,
    impulseGain: 1.12,
    maximumVelocity: 4.8,
    maximumAcceleration: 30,
  }),
  drift: Object.freeze({
    response: 3.6,
    accelerationDamping: 5.4,
    coastDrag: 0.72,
    impulseGain: 1.04,
    maximumVelocity: 5.2,
    maximumAcceleration: 16,
  }),
});

export interface SurfaceProfile {
  index: number;
  edgeTone: number;
  edgeOpacity: number;
}

export const SURFACE_PROFILES: Readonly<Record<SurfaceMode, SurfaceProfile>> = Object.freeze({
  card: Object.freeze({ index: 0, edgeTone: 0.62, edgeOpacity: 0.72 }),
  paper: Object.freeze({ index: 1, edgeTone: 0.5, edgeOpacity: 0.62 }),
  silk: Object.freeze({ index: 2, edgeTone: 0.42, edgeOpacity: 0.48 }),
  gel: Object.freeze({ index: 3, edgeTone: 0.7, edgeOpacity: 0.78 }),
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Semi-implicit, bounded, fixed-substep integration for interactive preview.
 * Export never depends on this state; export distance stays analytic.
 */
export function integrateMotionState(
  state: MotionState,
  targetVelocity: number,
  deltaSeconds: number,
  mode: DynamicsMode,
  stride: number,
): MotionState {
  const profile = DYNAMICS_PROFILES[mode];
  const safeStride = Math.max(1, Math.abs(finite(stride, 1)));
  const duration = clamp(finite(deltaSeconds), 0, 0.05);
  if (duration <= 0) return { ...state };

  const steps = Math.max(1, Math.ceil(duration / MAX_STEP));
  const step = duration / steps;
  const maximumVelocity = profile.maximumVelocity * safeStride;
  const maximumAcceleration = profile.maximumAcceleration * safeStride;
  let position = finite(state.position);
  let velocity = clamp(finite(state.velocity), -maximumVelocity, maximumVelocity);
  let acceleration = clamp(finite(state.acceleration), -maximumAcceleration, maximumAcceleration);
  const target = clamp(finite(targetVelocity), -maximumVelocity, maximumVelocity);

  for (let index = 0; index < steps; index += 1) {
    const accelerationTarget = clamp((target - velocity) * profile.response, -maximumAcceleration, maximumAcceleration);
    const accelerationResponse = 1 - Math.exp(-profile.accelerationDamping * step);
    acceleration += (accelerationTarget - acceleration) * accelerationResponse;
    velocity += acceleration * step;
    if (Math.abs(target) < safeStride * 0.000_001) {
      velocity *= Math.exp(-profile.coastDrag * step);
    }
    velocity = clamp(velocity, -maximumVelocity, maximumVelocity);
    position += velocity * step;
  }

  return { position, velocity, acceleration };
}

/** Applies a direct-manipulation displacement plus a bounded release impulse. */
export function applyMotionImpulse(
  state: MotionState,
  displacement: number,
  deltaSeconds: number,
  mode: DynamicsMode,
  stride: number,
): MotionState {
  const profile = DYNAMICS_PROFILES[mode];
  const safeStride = Math.max(1, Math.abs(finite(stride, 1)));
  const duration = clamp(finite(deltaSeconds), 1 / 240, 0.08);
  const movement = clamp(finite(displacement), -safeStride * 2.5, safeStride * 2.5);
  const maximumVelocity = profile.maximumVelocity * safeStride;
  const maximumAcceleration = profile.maximumAcceleration * safeStride;
  const priorVelocity = clamp(finite(state.velocity), -maximumVelocity, maximumVelocity);
  const releaseVelocity = clamp((movement / duration) * profile.impulseGain, -maximumVelocity, maximumVelocity);
  const velocity = clamp(priorVelocity * 0.28 + releaseVelocity * 0.72, -maximumVelocity, maximumVelocity);
  const acceleration = clamp((velocity - priorVelocity) / duration, -maximumAcceleration, maximumAcceleration);
  return {
    position: finite(state.position) + movement,
    velocity,
    acceleration,
  };
}

export function surfaceModeIndex(surface: SurfaceMode): number {
  return SURFACE_PROFILES[surface].index;
}

/**
 * Surface motion is periodic in seamless export and frozen for reduced motion.
 * Ordinary preview may breathe in wall-clock time without entering export math.
 */
export function surfacePhaseAtTime(
  settings: Pick<StudioSettings, "motion" | "output">,
  time: number,
  exportMode: boolean,
  reducedPreview: boolean,
): number {
  const reduced = exportMode ? settings.motion.reducedMotionOutput : reducedPreview;
  if (reduced) return 0;
  if (exportMode && settings.motion.seamless) {
    const loops = Math.max(1, Math.round(settings.motion.seamlessLoops));
    return (finite(time) / Math.max(0.001, settings.output.duration)) * TAU * loops;
  }
  return finite(time) * 0.82;
}
