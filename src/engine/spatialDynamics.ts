import type { DynamicsMode, SurfaceMode } from "../model";

const TAU = Math.PI * 2;
const MAX_FRAME_DELTA = 0.05;
const MATRIX_EPSILON = 1e-10;

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

interface Matrix2 {
  m00: number;
  m01: number;
  m10: number;
  m11: number;
}

interface LinearMotionReceipt {
  velocity: number;
  acceleration: number;
  displacement: number;
}

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
 * Exact exponential of a real 2 × 2 matrix. The closed form avoids a hidden
 * dependency on display refresh rate while keeping the solver allocation-free.
 */
function exponential2x2(
  a00: number,
  a01: number,
  a10: number,
  a11: number,
  duration: number,
): Matrix2 {
  const halfTrace = (a00 + a11) * 0.5;
  const centered00 = a00 - halfTrace;
  const centered11 = a11 - halfTrace;
  const discriminant = centered00 * centered00 + a01 * a10;
  const envelope = Math.exp(halfTrace * duration);

  let cosineLike: number;
  let sineLike: number;
  if (discriminant > MATRIX_EPSILON) {
    const root = Math.sqrt(discriminant);
    cosineLike = Math.cosh(root * duration);
    sineLike = Math.sinh(root * duration) / root;
  } else if (discriminant < -MATRIX_EPSILON) {
    const root = Math.sqrt(-discriminant);
    cosineLike = Math.cos(root * duration);
    sineLike = Math.sin(root * duration) / root;
  } else {
    cosineLike = 1;
    sineLike = duration;
  }

  return {
    m00: envelope * (cosineLike + sineLike * centered00),
    m01: envelope * sineLike * a01,
    m10: envelope * sineLike * a10,
    m11: envelope * (cosineLike + sineLike * centered11),
  };
}

/**
 * Evolves velocity and acceleration exactly for one constant-target interval.
 * The displacement integral comes from A⁻¹(exp(AΔt) − I), so position and
 * velocity share the same continuous solution instead of accumulating Euler
 * error at different monitor refresh rates.
 */
function evolveLinearMotion(
  velocity: number,
  acceleration: number,
  duration: number,
  a00: number,
  a01: number,
  a10: number,
  a11: number,
): LinearMotionReceipt {
  const matrix = exponential2x2(a00, a01, a10, a11, duration);
  const nextVelocity = matrix.m00 * velocity + matrix.m01 * acceleration;
  const nextAcceleration = matrix.m10 * velocity + matrix.m11 * acceleration;
  const deltaVelocity = nextVelocity - velocity;
  const deltaAcceleration = nextAcceleration - acceleration;
  const determinant = a00 * a11 - a01 * a10;
  const displacement = Math.abs(determinant) > MATRIX_EPSILON
    ? (a11 * deltaVelocity - a01 * deltaAcceleration) / determinant
    : (velocity + nextVelocity) * duration * 0.5;

  return {
    velocity: finite(nextVelocity),
    acceleration: finite(nextAcceleration),
    displacement: finite(displacement),
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
 * Bounded exact second-order integration for interactive preview. The same
 * gesture therefore has the same physical character at 60, 120, or 240 Hz.
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

  const requestedTarget = clamp(finite(targetVelocity), -maximumVelocity, maximumVelocity);
  const targetIsStill = Math.abs(requestedTarget) < safeStride * 0.000_001;
  const spring = profile.response * profile.accelerationDamping;
  let receipt: LinearMotionReceipt;
  let target = requestedTarget;

  if (targetIsStill) {
    // Coast drag is part of the continuous system rather than a second
    // per-frame multiplier, preserving the semigroup property of the update.
    receipt = evolveLinearMotion(
      sanitized.velocity,
      sanitized.acceleration,
      duration,
      -profile.coastDrag,
      1,
      -spring,
      -(profile.accelerationDamping + profile.coastDrag * 0.5),
    );
  } else {
    // Bound the initial restoring force without clipping the authored target.
    const maximumError = maximumAcceleration / Math.max(profile.response, 0.000_001);
    const error = clamp(sanitized.velocity - requestedTarget, -maximumError, maximumError);
    target = sanitized.velocity - error;
    receipt = evolveLinearMotion(
      sanitized.velocity - target,
      sanitized.acceleration,
      duration,
      0,
      1,
      -spring,
      -profile.accelerationDamping,
    );
    receipt.velocity += target;
    receipt.displacement += target * duration;
  }

  const velocity = clamp(receipt.velocity, -maximumVelocity, maximumVelocity);
  const acceleration = clamp(receipt.acceleration, -maximumAcceleration, maximumAcceleration);
  const maximumDisplacement = maximumVelocity * duration;
  const displacement = clamp(receipt.displacement, -maximumDisplacement, maximumDisplacement);

  if (targetIsStill && Math.abs(velocity) < safeStride * 0.000_002) {
    return {
      position: finite(sanitized.position + displacement),
      velocity: 0,
      acceleration: 0,
    };
  }

  return {
    position: finite(sanitized.position + displacement),
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
