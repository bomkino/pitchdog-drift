import { describe, expect, it } from "vitest";
import {
  editorialRegistration,
  evaluateEditorialCadence,
  invertEditorialDistance,
  remapEditorialDistance,
  smootherstep,
} from "../src/engine/editorialCadence";

const STRIDE = 813.7;

function sampleCycle(hold: number, cut: number, samples = 1_000): number[] {
  return Array.from({ length: samples + 1 }, (_, index) => (
    remapEditorialDistance((index / samples) * STRIDE, STRIDE, 0.5, hold, cut) / STRIDE
  ));
}

describe("editorial cadence grammar", () => {
  it("has a true continuous zero state", () => {
    for (const distance of [-4.75, -1, -0.2, 0, 0.1, 1, 7.4].map((value) => value * STRIDE)) {
      expect(remapEditorialDistance(distance, STRIDE, 0.5, 0, 0)).toBeCloseTo(distance, 9);
    }
  });

  it("preserves every positive and negative stride endpoint exactly", () => {
    for (const hold of [0, 0.25, 0.6, 1]) {
      for (const cut of [0, 0.25, 0.6, 1]) {
        for (let cycle = -24; cycle <= 24; cycle += 1) {
          const distance = cycle * STRIDE;
          expect(remapEditorialDistance(distance, STRIDE, 0.5, hold, cut)).toBeCloseTo(distance, 9);
        }
      }
    }
  });

  it("never reverses or reorders the strip", () => {
    for (const hold of [0, 0.35, 0.72, 1]) {
      for (const cut of [0, 0.35, 0.72, 1]) {
        let previous = Number.NEGATIVE_INFINITY;
        for (let index = -8_000; index <= 8_000; index += 1) {
          const distance = (index / 1_000) * STRIDE;
          const remapped = remapEditorialDistance(distance, STRIDE, 0.48, hold, cut);
          expect(remapped).toBeGreaterThanOrEqual(previous - 1e-9);
          previous = remapped;
        }
      }
    }
  });

  it("creates authored rests without changing cycle length", () => {
    const linear = sampleCycle(0, 0);
    const held = sampleCycle(0.85, 0);
    const nearStart = (values: number[]) => values.filter((value) => value <= 0.02).length;
    const nearEnd = (values: number[]) => values.filter((value) => value >= 0.98).length;

    expect(nearStart(held)).toBeGreaterThan(nearStart(linear) * 4);
    expect(nearEnd(held)).toBeGreaterThan(nearEnd(linear) * 4);
    expect(held.at(-1)).toBe(1);
  });

  it("adds stepped poses while leaving the master frame rate untouched", () => {
    const smooth = sampleCycle(0.72, 0, 2_000);
    const stepped = sampleCycle(0.72, 1, 2_000);
    const unique = (values: number[]) => new Set(values.map((value) => value.toFixed(9))).size;

    expect(unique(stepped)).toBeLessThan(unique(smooth) / 20);
    const smoothPoseStates = Array.from({ length: 2_001 }, (_, index) =>
      evaluateEditorialCadence((index / 2_000) * STRIDE, STRIDE, 0.5, 0.72, 0).transitionProgress,
    );
    const steppedPoseStates = Array.from({ length: 2_001 }, (_, index) =>
      evaluateEditorialCadence((index / 2_000) * STRIDE, STRIDE, 0.5, 0.72, 1).transitionProgress,
    );
    expect(unique(steppedPoseStates)).toBeLessThan(unique(smoothPoseStates) / 20);
    expect(evaluateEditorialCadence(STRIDE / 2, STRIDE, 0.5, 0.72, 1).stepsPerStride).toBe(24);
    expect(stepped[0]).toBe(0);
    expect(stepped.at(-1)).toBe(1);
  });


  it("inverts authored poses without losing exact holds or negative cycles", () => {
    for (const hold of [0, 0.35, 0.72, 1]) {
      for (const cut of [0, 0.35, 0.72, 1]) {
        for (let sample = -2_000; sample <= 2_000; sample += 7) {
          const raw = sample * STRIDE * 0.001;
          const visible = remapEditorialDistance(raw, STRIDE, 0.5, hold, cut);
          const restored = invertEditorialDistance(visible, STRIDE, 0.5, hold, cut);
          expect(remapEditorialDistance(restored, STRIDE, 0.5, hold, cut)).toBeCloseTo(visible, 7);
        }
      }
    }
  });

  it("moves direct-manipulation targets out of the authored landing plateau", () => {
    const held = remapEditorialDistance(0.01 * STRIDE, STRIDE, 0.5, 1, 1);
    const target = held + 0.12 * STRIDE;
    const raw = invertEditorialDistance(target, STRIDE, 0.5, 1, 1);
    const visible = remapEditorialDistance(raw, STRIDE, 0.5, 1, 1);
    expect(visible).toBeGreaterThan(held + 0.08 * STRIDE);
  });

  it("returns the same authored pose for the same distance", () => {
    const first = evaluateEditorialCadence(-2.375 * STRIDE, STRIDE, 0.42, 0.78, 0.64);
    const second = evaluateEditorialCadence(-2.375 * STRIDE, STRIDE, 0.42, 0.78, 0.64);
    expect(second).toEqual(first);
  });

  it("keeps the transition and settle envelopes bounded", () => {
    for (let index = -4_000; index <= 4_000; index += 1) {
      const state = evaluateEditorialCadence(index * 0.001 * STRIDE, STRIDE, 1.5, 1, 1);
      expect(state.progress).toBeGreaterThanOrEqual(0);
      expect(state.progress).toBeLessThanOrEqual(1);
      expect(state.transitionPulse).toBeGreaterThanOrEqual(0);
      expect(state.transitionPulse).toBeLessThanOrEqual(1);
      expect(state.anticipation).toBeGreaterThanOrEqual(0);
      expect(state.anticipation).toBeLessThanOrEqual(1);
      expect(state.landingImpact).toBeGreaterThanOrEqual(0);
      expect(state.landingImpact).toBeLessThanOrEqual(1);
      expect(Math.abs(state.settle)).toBeLessThanOrEqual(1);
    }
  });



  it("gives every shipped cut a true dead-still read and landing plateau", () => {
    for (const hold of [0.54, 0.72, 0.78, 0.84]) {
      const holdFraction = hold * 0.22;
      const read = evaluateEditorialCadence(holdFraction * 0.5 * STRIDE, STRIDE, 0.5, hold, 0.4);
      const land = evaluateEditorialCadence((1 - holdFraction * 0.5) * STRIDE, STRIDE, 0.5, hold, 0.4);
      expect(read.progress).toBe(0);
      expect(read.transitionPulse).toBe(0);
      expect(read.anticipation).toBe(0);
      expect(land.progress).toBe(1);
      expect(land.transitionPulse).toBeCloseTo(0, 12);
      expect(land.landingImpact).toBeCloseTo(0, 12);
    }
  });

  it("separates anticipation from landing while returning both to exact rest", () => {
    const start = evaluateEditorialCadence(0, STRIDE, 0.5, 0.72, 0.62);
    const anticipation = evaluateEditorialCadence(0.24 * STRIDE, STRIDE, 0.5, 0.72, 0.62);
    const landing = evaluateEditorialCadence(0.76 * STRIDE, STRIDE, 0.5, 0.72, 0.62);
    const end = evaluateEditorialCadence(STRIDE, STRIDE, 0.5, 0.72, 0.62);

    expect(start.anticipation).toBe(0);
    expect(start.landingImpact).toBe(0);
    expect(anticipation.anticipation).toBeGreaterThan(0);
    expect(landing.landingImpact).toBeGreaterThan(0);
    expect(end.anticipation).toBe(0);
    expect(end.landingImpact).toBe(0);
  });

  it("owns registration per slide rather than per frame", () => {
    const registrations = Array.from({ length: 32 }, (_, index) => editorialRegistration(index));
    expect(registrations.every((value) => value >= -1 && value < 1)).toBe(true);
    expect(new Set(registrations.map((value) => value.toFixed(6))).size).toBeGreaterThan(28);
    expect(editorialRegistration(12)).toBe(editorialRegistration(12));
  });

  it("fails closed for impossible numeric input", () => {
    expect(evaluateEditorialCadence(Number.NaN, STRIDE, 0.5, 1, 1)).toMatchObject({
      cycle: 0,
      progress: 0,
      transitionPulse: 0,
      settle: 0,
    });
    expect(remapEditorialDistance(100, 0, 0.5, 1, 1)).toBe(0);
    expect(editorialRegistration(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("uses a bounded zero-slope easing primitive", () => {
    expect(smootherstep(-1)).toBe(0);
    expect(smootherstep(0)).toBe(0);
    expect(smootherstep(0.5)).toBe(0.5);
    expect(smootherstep(1)).toBe(1);
    expect(smootherstep(2)).toBe(1);
  });
});
