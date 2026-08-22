import { describe, expect, it } from "vitest";
import {
  createTempoCurve,
  createTempoCurveFromPreset,
  evaluateTempoCurve,
  resolveTempoCurve,
  TEMPO_CURVE_PRESET_ORDER,
  TEMPO_CURVE_PRESETS,
  TempoCurveAuthoringError,
  type TempoCurve,
} from "../src/core/timeline/tempoCurve";

const SAMPLE_COUNT = 12_000;

function sample(curve: TempoCurve, step: number, count = SAMPLE_COUNT) {
  return evaluateTempoCurve(curve, step / count);
}

function trapezoidVelocityArea(curve: TempoCurve, count = SAMPLE_COUNT): number {
  let total = 0;
  let previous = evaluateTempoCurve(curve, 0).velocity;
  for (let step = 1; step <= count; step += 1) {
    const current = evaluateTempoCurve(curve, step / count).velocity;
    total += (previous + current) * 0.5 / count;
    previous = current;
  }
  return total;
}

describe("analytical tempo curves", () => {
  it("keeps every authored preset finite, monotonic, continuous, and unit-area", () => {
    for (const id of TEMPO_CURVE_PRESET_ORDER) {
      const curve = createTempoCurveFromPreset(id);
      let previousProgress = -1;
      let allFinite = true;
      let minimumProgressDelta = Number.POSITIVE_INFINITY;
      let minimumVelocity = Number.POSITIVE_INFINITY;

      for (let step = 0; step <= SAMPLE_COUNT; step += 1) {
        const current = sample(curve, step);
        allFinite &&= Number.isFinite(current.progress)
          && Number.isFinite(current.velocity)
          && Number.isFinite(current.acceleration);
        minimumProgressDelta = Math.min(minimumProgressDelta, current.progress - previousProgress);
        minimumVelocity = Math.min(minimumVelocity, current.velocity);
        previousProgress = current.progress;
      }

      // Keep the dense 60,005-sample stress pass; aggregate its invariants so
      // Vitest's assertion machinery does not dominate the curve itself.
      expect(allFinite, `${id} emitted a non-finite sample`).toBe(true);
      expect(minimumProgressDelta, `${id} travelled backwards`).toBeGreaterThanOrEqual(-1e-14);
      expect(minimumVelocity, `${id} emitted negative velocity`).toBeGreaterThanOrEqual(-1e-14);
      expect(evaluateTempoCurve(curve, 0).progress).toBe(0);
      expect(evaluateTempoCurve(curve, 1).progress).toBe(1);
      expect(trapezoidVelocityArea(curve)).toBeCloseTo(1, 8);

      const beforeJoin = evaluateTempoCurve(curve, 0.5 - 1e-8);
      const atJoin = evaluateTempoCurve(curve, 0.5);
      const afterJoin = evaluateTempoCurve(curve, 0.5 + 1e-8);
      expect(beforeJoin.progress).toBeCloseTo(atJoin.progress, 7);
      expect(afterJoin.progress).toBeCloseTo(atJoin.progress, 7);
      expect(beforeJoin.velocity).toBeCloseTo(atJoin.velocity, 7);
      expect(afterJoin.velocity).toBeCloseTo(atJoin.velocity, 7);
      expect(beforeJoin.acceleration).toBeCloseTo(0, 5);
      expect(atJoin.acceleration).toBe(0);
      expect(afterJoin.acceleration).toBeCloseTo(0, 5);
    }
  });

  it("makes Pulse fast, slow, fast with a symmetric reading pocket", () => {
    const curve = createTempoCurveFromPreset("fast-slow-fast");
    const opening = evaluateTempoCurve(curve, 0);
    const middle = evaluateTempoCurve(curve, 0.5);
    const finish = evaluateTempoCurve(curve, 1);

    expect(opening.velocity).toBeGreaterThan(middle.velocity * 4);
    expect(finish.velocity).toBeCloseTo(opening.velocity, 14);
    expect(middle.progress).toBeCloseTo(0.5, 14);

    for (let step = 0; step <= 2_000; step += 1) {
      const time = step / 2_000;
      const forward = evaluateTempoCurve(curve, time);
      const reverse = evaluateTempoCurve(curve, 1 - time);
      expect(forward.progress).toBeCloseTo(1 - reverse.progress, 12);
      expect(forward.velocity).toBeCloseTo(reverse.velocity, 12);
      expect(forward.acceleration).toBeCloseTo(-reverse.acceleration, 10);
    }
  });

  it("keeps each preset materially distinct", () => {
    const signatures = TEMPO_CURVE_PRESET_ORDER.map((id) => {
      const curve = createTempoCurveFromPreset(id);
      return [0.1, 0.25, 0.5, 0.75, 0.9]
        .map((time) => evaluateTempoCurve(curve, time).progress.toFixed(8))
        .join(":");
    });
    expect(new Set(signatures).size).toBe(TEMPO_CURVE_PRESET_ORDER.length);
  });

  it("supports deterministic custom Start/Middle/Finish authoring", () => {
    const authoring = { kind: "custom", envelope: { start: 4, middle: 1, finish: 2 } } as const;
    const first = resolveTempoCurve(authoring);
    const second = resolveTempoCurve(authoring);
    const scaleEquivalent = createTempoCurve({ start: 40, middle: 10, finish: 20 });

    for (let step = 0; step <= SAMPLE_COUNT; step += 1) {
      const time = step / SAMPLE_COUNT;
      expect(evaluateTempoCurve(first, time)).toEqual(evaluateTempoCurve(second, time));
      expect(evaluateTempoCurve(first, time)).toEqual(evaluateTempoCurve(scaleEquivalent, time));
    }
  });

  it("makes each directional preset tell the promised temporal story", () => {
    const slowBuild = createTempoCurveFromPreset("slow-build");
    expect(evaluateTempoCurve(slowBuild, 0).velocity)
      .toBeLessThan(evaluateTempoCurve(slowBuild, 0.5).velocity);
    expect(evaluateTempoCurve(slowBuild, 0.5).velocity)
      .toBeLessThan(evaluateTempoCurve(slowBuild, 1).velocity);

    const settle = createTempoCurveFromPreset("rush-and-settle");
    expect(evaluateTempoCurve(settle, 0).velocity)
      .toBeGreaterThan(evaluateTempoCurve(settle, 0.5).velocity);
    expect(evaluateTempoCurve(settle, 0.5).velocity)
      .toBeGreaterThan(evaluateTempoCurve(settle, 1).velocity);

    const readAndGo = createTempoCurveFromPreset("read-and-go");
    expect(evaluateTempoCurve(readAndGo, 0.5).progress).toBeLessThan(0.15);
    expect(evaluateTempoCurve(readAndGo, 1).velocity)
      .toBeGreaterThan(evaluateTempoCurve(readAndGo, 0).velocity * 20);
  });

  it("allows intentional zero-speed handles and safely resolves all-zero authoring", () => {
    const held = createTempoCurve({ start: 0, middle: 0, finish: 1 });
    expect(evaluateTempoCurve(held, 0.4)).toMatchObject({ progress: 0, velocity: 0, acceleration: 0 });
    expect(evaluateTempoCurve(held, 1).progress).toBe(1);
    expect(trapezoidVelocityArea(held)).toBeCloseTo(1, 8);

    const degenerate = createTempoCurve({ start: 0, middle: 0, finish: 0 });
    expect(degenerate.usedEvenFallback).toBe(true);
    for (const time of [0, 0.125, 0.5, 0.875, 1]) {
      expect(evaluateTempoCurve(degenerate, time)).toEqual({
        time,
        progress: time,
        velocity: 1,
        acceleration: 0,
      });
    }
  });

  it("normalizes very small and very large finite weights without overflow", () => {
    const tiny = createTempoCurve({ start: Number.MIN_VALUE, middle: Number.MIN_VALUE, finish: Number.MIN_VALUE });
    const huge = createTempoCurve({ start: Number.MAX_VALUE, middle: Number.MAX_VALUE, finish: Number.MAX_VALUE });

    for (let step = 0; step <= 2_000; step += 1) {
      const time = step / 2_000;
      expect(evaluateTempoCurve(tiny, time)).toEqual(evaluateTempoCurve(huge, time));
    }
    expect(trapezoidVelocityArea(tiny)).toBeCloseTo(1, 12);
    expect(trapezoidVelocityArea(huge)).toBeCloseTo(1, 12);
  });

  it("rejects negative and non-finite authoring at the boundary", () => {
    for (const field of ["start", "middle", "finish"] as const) {
      for (const invalid of [-0.0001, NaN, Infinity, -Infinity]) {
        const envelope = { start: 1, middle: 1, finish: 1 };
        envelope[field] = invalid;
        expect(() => createTempoCurve(envelope)).toThrow(TempoCurveAuthoringError);
        try {
          createTempoCurve(envelope);
        } catch (error) {
          expect(error).toMatchObject({ field });
        }
      }
    }
  });

  it("keeps evaluation finite when callers scrub outside normalized time", () => {
    const curve = createTempoCurveFromPreset("fast-slow-fast");
    expect(evaluateTempoCurve(curve, -10)).toEqual(evaluateTempoCurve(curve, 0));
    expect(evaluateTempoCurve(curve, Infinity)).toEqual(evaluateTempoCurve(curve, 1));
    expect(evaluateTempoCurve(curve, NaN)).toEqual(evaluateTempoCurve(curve, 0));
  });

  it("exports frozen preset data instead of mutable shared defaults", () => {
    expect(Object.isFrozen(TEMPO_CURVE_PRESETS)).toBe(true);
    expect(Object.isFrozen(TEMPO_CURVE_PRESETS["fast-slow-fast"])).toBe(true);
    expect(Object.isFrozen(TEMPO_CURVE_PRESETS["fast-slow-fast"].envelope)).toBe(true);
  });
});
