import type { DynamicsMode, SurfaceMode } from "../model";

const TAU = Math.PI * 2;
const MAX_FRAME_DELTA = 0.05;
const MAX_SUBSTEP = 1 / 120;

export const FABRIC_TURNS_PER_TRACK = 2;

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
  releaseBlend: number;
  maximumVelocity: number;
  maximumAcceleration: number;
}

export const DYNAMICS_PROFILES: Readonly<Record<DynamicsMode, DynamicsProfile>> = Object.freeze({
  direct: Object.freeze({
    response: 26,
    accelerationDamping: 34,
    coastDrag: 24,
    impulseGain: 0.58,
    releaseBlend: 0.5,
    maximumVelocity: 3,
    maximumAcceleration: 36,
  }),
  weighted: Object.freeze({
    response: 9.5,
    accelerationDamping: 12,
    coastDrag: 4.2,
    impulseGain: 0.92,
    releaseBlend: 0.72,
    maximumVelocity: 4.1,
    maximumAcceleration: 24,
  }),
  spring: Object.freeze({
    response: 13.8,
    accelerationDamping: 6.8,
    coastDrag: 2.2,
    impulseGain: 1.1,
    releaseBlend: 0.82,
    maximumVelocity: 4.7,
    maximumAcceleration: 32,
  }),
  drift: Object.freeze({
    response: 4,
    accelerationDamping: 5.5,
    coastDrag: 0.65,
    impulseGain: 1.05,
    releaseBlend: 0.9,
    maximumVelocity: 5.1,
    maximumAcceleration: 18,
  }),
});

export interface SurfaceProfile {
  index: number;
  edgeTone: number;
  edgeOpacity: number;
  roughness: number;
  metalness: number;
  emissiveIntensity: number;
}

export const SURFACE_PROFILES: Readonly<Record<SurfaceMode, SurfaceProfile>> = Object.freeze({
  card: Object.freeze({
    index: 0,
    edgeTone: 0.62,
    edgeOpacity: 0.92,
    roughness: 0.76,
    metalness: 0.01,
    emissiveIntensity: 0.025,
  }),
  paper: Object.freeze({
    index: 1,
    edgeTone: 0.54,
    edgeOpacity: 0.88,
    roughness: 0.94,
    metalness: 0,
    emissiveIntensity: 0.02,
  }),
  silk: Object.freeze({
    index: 2,
    edgeTone: 0.5,
    edgeOpacity: 0.82,
    roughness: 0.68,
    metalness: 0,
    emissiveIntensity: 0.028,
  }),
  gel: Object.freeze({
    index: 3,
    edgeTone: 0.72,
    edgeOpacity: 0.94,
    roughness: 0.36,
    metalness: 0.08,
    emissiveIntensity: 0.045,
  }),
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function sanitizeMotionState(
  state: MotionState,
  maximumVelocity: number,
  maximumAcceleration: number,
): MotionState {
  return {
    position: finite(state.position),
    velocity: clamp(finite(state.velocity), -maximumVelocity, maximumVelocity),
    acceleration: clamp(finite(state.acceleration), -maximumAcceleration, maximumAcceleration),
  };
}

/**
 * Keeps long-running preview state close to the origin without changing the
 * carousel arrangement. Surface phase also closes on a whole track, so the
 * rebase is visually invisible.
 */
export function rebaseLoopPosition(position: number, loopLength: number): number {
  const length = Math.abs(finite(loopLength));
  const safePosition = finite(position);
  if (length <= 0.000_001) return safePosition;
  const half = length / 2;
  const wrapped = ((safePosition + half) % length + length) % length - half;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/**
 * Semi-implicit, bounded, fixed-substep integration for interactive preview.
 * Export never depends on this state; exported distance remains analytic.
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
  const maximumVelocity = profile.maximumVelocity * safeStride;
  const maximumAcceleration = profile.maximumAcceleration * safeStride;
  const sanitized = sanitizeMotionState(state, maximumVelocity, maximumAcceleration);
  const duration = clamp(finite(deltaSeconds), 0, MAX_FRAME_DELTA);
  if (duration <= 0) return sanitized;

  const steps = Math.max(1, Math.ceil(duration / MAX_SUBSTEP));
  const step = duration / steps;
  const target = clamp(finite(targetVelocity), -maximumVelocity, maximumVelocity);
  const targetIsStill = Math.abs(target) < safeStride * 0.000_001;
  let { position, velocity, acceleration } = sanitized;

  for (let index = 0; index < steps; index += 1) {
    const accelerationTarget = clamp(
      (target - velocity) * profile.response,
      -maximumAcceleration,
      maximumAcceleration,
    );
    const accelerationResponse = 1 - Math.exp(-profile.accelerationDamping * step);
    acceleration += (accelerationTarget - acceleration) * accelerationResponse;
    velocity += acceleration * step;

    if (targetIsStill) {
      const drag = Math.exp(-profile.coastDrag * step);
      velocity *= drag;
      acceleration *= Math.sqrt(drag);
    }

    velocity = clamp(velocity, -maximumVelocity, maximumVelocity);
    acceleration = clamp(acceleration, -maximumAcceleration, maximumAcceleration);
    position += velocity * step;
  }

  if (targetIsStill && Math.abs(velocity) < safeStride * 0.000_002) {
    velocity = 0;
    acceleration = 0;
  }

  return {
    position: finite(position),
    velocity: finite(velocity),
    acceleration: finite(acceleration),
  };
}

/**
 * Applies direct manipulation immediately, then derives a bounded release
 * velocity and acceleration from the same gesture. The selected physics
 * character therefore governs drag and wheel input—not only autoplay.
 */
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
  const previous = sanitizeMotionState(state, maximumVelocity, maximumAcceleration);
  const gestureVelocity = clamp(
    (movement / duration) * profile.impulseGain,
    -maximumVelocity,
    maximumVelocity,
  );
  const velocity = clamp(
    previous.velocity * (1 - profile.releaseBlend) + gestureVelocity * profile.releaseBlend,
    -maximumVelocity,
    maximumVelocity,
  );
  const acceleration = clamp(
    (velocity - previous.velocity) / duration,
    -maximumAcceleration,
    maximumAcceleration,
  );

  return {
    position: previous.position + movement,
    velocity,
    acceleration,
  };
}

export function surfaceModeIndex(surface: SurfaceMode): number {
  return SURFACE_PROFILES[surface].index;
}

/**
 * Locks fabric travel to carousel travel. Pausing freezes the cloth without a
 * phase snap; dragging advances it; whole-track seamless exports close exactly.
 */
export function surfacePhaseAtDistance(distance: number, trackLength: number): number {
  const length = Math.abs(finite(trackLength));
  if (length <= 0.000_001) return 0;
  const cycles = (finite(distance) / length) * FABRIC_TURNS_PER_TRACK;
  const wrapped = ((cycles % 1) + 1) % 1;
  return wrapped * TAU;
}
