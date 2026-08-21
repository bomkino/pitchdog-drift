export const TAU = Math.PI * 2;
export const TIMELINE_EPSILON = 1e-9;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function positiveModulo(value: number, modulus: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) return 0;
  const result = ((value % modulus) + modulus) % modulus;
  return Object.is(result, -0) ? 0 : result;
}

export function smootherstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function smootherstepDerivative(value: number): number {
  const t = clamp(value, 0, 1);
  return 30 * t * t * (t - 1) * (t - 1);
}

export function smootherstepSecondDerivative(value: number): number {
  const t = clamp(value, 0, 1);
  return 60 * t * (2 * t * t - 3 * t + 1);
}

export function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function smoothstepDerivative(value: number): number {
  const t = clamp(value, 0, 1);
  return 6 * t * (1 - t);
}

export function stableEventTime(value: number): number {
  return Math.round(Math.max(0, finite(value)) * 1_000_000) / 1_000_000;
}
