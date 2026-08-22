/**
 * A tempo curve remaps normalized clock time to normalized travel distance.
 *
 * The curve is deliberately analytical: it never depends on frame rate, elapsed
 * wall-clock time, or spring integration. Start, middle, and finish describe
 * relative (not absolute) speeds. Their common scale is removed before the
 * curve is normalized to unit area.
 */

export type TempoCurvePresetId =
  | "even"
  | "fast-slow-fast"
  | "slow-build"
  | "rush-and-settle"
  | "read-and-go";

export interface TempoEnvelope {
  readonly start: number;
  readonly middle: number;
  readonly finish: number;
}

export interface TempoCurvePreset {
  readonly id: TempoCurvePresetId;
  readonly label: string;
  readonly description: string;
  readonly envelope: TempoEnvelope;
}

export type TempoCurveAuthoring =
  | { readonly kind: "preset"; readonly preset: TempoCurvePresetId }
  | { readonly kind: "custom"; readonly envelope: TempoEnvelope };

export interface TempoCurve {
  /** Exact author input, retained for UI round-tripping. */
  readonly authoredEnvelope: TempoEnvelope;
  /** Scale-free envelope used by the evaluator. */
  readonly shape: TempoEnvelope;
  /** Analytical area under `shape` before unit-area normalization. */
  readonly shapeArea: number;
  /** True only when an all-zero author envelope was safely resolved to Even. */
  readonly usedEvenFallback: boolean;
}

export interface TempoCurveSample {
  /** Finite input clamped to [0, 1]. NaN resolves to 0. */
  readonly time: number;
  /** Integrated distance, normalized to exact [0, 1] endpoints. */
  readonly progress: number;
  /** d(progress) / d(normalized time). */
  readonly velocity: number;
  /** d(velocity) / d(normalized time). */
  readonly acceleration: number;
}

function freezeEnvelope(envelope: TempoEnvelope): TempoEnvelope {
  return Object.freeze({
    start: envelope.start,
    middle: envelope.middle,
    finish: envelope.finish,
  });
}

function preset(
  id: TempoCurvePresetId,
  label: string,
  description: string,
  envelope: TempoEnvelope,
): TempoCurvePreset {
  return Object.freeze({ id, label, description, envelope: freezeEnvelope(envelope) });
}

/**
 * Authored defaults. Values are relative weights; multiplying every value by
 * the same positive number produces the same normalized motion.
 */
export const TEMPO_CURVE_PRESETS: Readonly<Record<TempoCurvePresetId, TempoCurvePreset>> = Object.freeze({
  even: preset("even", "Even", "One unbroken reading pace.", { start: 1, middle: 1, finish: 1 }),
  "fast-slow-fast": preset(
    "fast-slow-fast",
    "Fast · Slow · Fast",
    "Arrive quickly, open a reading pocket, then leave with intent.",
    { start: 1.75, middle: 0.35, finish: 1.75 },
  ),
  "slow-build": preset(
    "slow-build",
    "Slow Build",
    "Gather momentum progressively across the performance.",
    { start: 0.28, middle: 0.82, finish: 1.68 },
  ),
  "rush-and-settle": preset(
    "rush-and-settle",
    "Rush & Settle",
    "Open decisively, then ease into a quieter landing.",
    { start: 1.9, middle: 0.9, finish: 0.25 },
  ),
  "read-and-go": preset(
    "read-and-go",
    "Read & Go",
    "Protect the opening read, then accelerate late.",
    { start: 0.08, middle: 0.24, finish: 2.3 },
  ),
});

export const TEMPO_CURVE_PRESET_ORDER: readonly TempoCurvePresetId[] = Object.freeze([
  "even",
  "fast-slow-fast",
  "slow-build",
  "rush-and-settle",
  "read-and-go",
]);

export class TempoCurveAuthoringError extends TypeError {
  readonly field: keyof TempoEnvelope;

  constructor(field: keyof TempoEnvelope, value: unknown) {
    super(`Tempo envelope ${field} must be a finite number at or above zero; received ${String(value)}.`);
    this.name = "TempoCurveAuthoringError";
    this.field = field;
  }
}

function validateWeight(field: keyof TempoEnvelope, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TempoCurveAuthoringError(field, value);
  }
  return Object.is(value, -0) ? 0 : value;
}

/**
 * Validates author input once, then creates a stable, scale-free evaluator.
 * Individual zero handles are intentional holds. The degenerate all-zero case
 * resolves to Even instead of producing NaN or infinite normalization.
 */
export function createTempoCurve(envelope: TempoEnvelope): TempoCurve {
  const authoredEnvelope = freezeEnvelope({
    start: validateWeight("start", envelope.start),
    middle: validateWeight("middle", envelope.middle),
    finish: validateWeight("finish", envelope.finish),
  });
  const maximum = Math.max(authoredEnvelope.start, authoredEnvelope.middle, authoredEnvelope.finish);
  const usedEvenFallback = maximum === 0;
  const shape = usedEvenFallback
    ? freezeEnvelope({ start: 1, middle: 1, finish: 1 })
    : freezeEnvelope({
        start: authoredEnvelope.start / maximum,
        middle: authoredEnvelope.middle / maximum,
        finish: authoredEnvelope.finish / maximum,
      });

  // Each half uses smoothstep interpolation, whose average over [0, 1]
  // is exactly 1/2. Therefore the complete analytical area is this weighted sum.
  const shapeArea = (shape.start + 2 * shape.middle + shape.finish) / 4;

  return Object.freeze({ authoredEnvelope, shape, shapeArea, usedEvenFallback });
}

export function createTempoCurveFromPreset(id: TempoCurvePresetId): TempoCurve {
  const definition: TempoCurvePreset | undefined = TEMPO_CURVE_PRESETS[id];
  if (!definition) throw new TypeError(`Unknown tempo curve preset: ${String(id)}.`);
  return createTempoCurve(definition.envelope);
}

export function resolveTempoCurve(authoring: TempoCurveAuthoring): TempoCurve {
  return authoring.kind === "preset"
    ? createTempoCurveFromPreset(authoring.preset)
    : createTempoCurve(authoring.envelope);
}

function clampTime(value: number): number {
  if (Number.isNaN(value) || value === -Infinity) return 0;
  if (value === Infinity) return 1;
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function smoothstepDerivative(value: number): number {
  return 6 * value * (1 - value);
}

function smoothstepIntegral(value: number): number {
  return value ** 3 - 0.5 * value ** 4;
}

/**
 * Evaluates position and its first two derivatives with respect to normalized
 * time. The two cubic-speed segments meet with zero acceleration at the middle,
 * so the result is C2 in progress (continuous velocity and acceleration).
 */
export function evaluateTempoCurve(curve: TempoCurve, normalizedTime: number): TempoCurveSample {
  const time = clampTime(normalizedTime);
  const { start, middle, finish } = curve.shape;
  const inverseArea = 1 / curve.shapeArea;

  if (time === 0) {
    return { time, progress: 0, velocity: start * inverseArea, acceleration: 0 };
  }
  if (time === 1) {
    return { time, progress: 1, velocity: finish * inverseArea, acceleration: 0 };
  }

  let rawProgress: number;
  let rawVelocity: number;
  let rawAcceleration: number;

  if (time < 0.5) {
    const localTime = time * 2;
    const difference = middle - start;
    rawProgress = 0.5 * (start * localTime + difference * smoothstepIntegral(localTime));
    rawVelocity = start + difference * smoothstep(localTime);
    rawAcceleration = difference * smoothstepDerivative(localTime) * 2;
  } else {
    const localTime = (time - 0.5) * 2;
    const difference = finish - middle;
    const firstHalfArea = (start + middle) / 4;
    rawProgress = firstHalfArea
      + 0.5 * (middle * localTime + difference * smoothstepIntegral(localTime));
    rawVelocity = middle + difference * smoothstep(localTime);
    rawAcceleration = difference * smoothstepDerivative(localTime) * 2;
  }

  const acceleration = rawAcceleration * inverseArea;
  return {
    time,
    progress: Math.min(1, Math.max(0, rawProgress * inverseArea)),
    velocity: rawVelocity * inverseArea,
    acceleration: acceleration === 0 ? 0 : acceleration,
  };
}
