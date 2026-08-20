import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, FLOW_IDS, cloneSettings } from "../src/model";
import {
  distanceAtTime,
  evaluateSlide,
  getLogicalSlotCount,
  getSlideGeometry,
  positiveModulo,
  velocityAtTime,
} from "../src/engine/evaluate";

describe("deterministic carousel evaluation", () => {
  it("keeps virtual strip lengths on complete asset cycles", () => {
    const geometry = getSlideGeometry(DEFAULT_SETTINGS);
    for (const count of [1, 2, 3, 7, 8, 12, 25]) {
      const slots = getLogicalSlotCount(count, geometry);
      expect(slots).toBeGreaterThanOrEqual(count);
      expect(slots % count).toBe(0);
    }
    expect(getLogicalSlotCount(0, geometry)).toBe(0);
  });

  it("wraps negative distance without a discontinuity", () => {
    expect(positiveModulo(-1, 8)).toBe(7);
    expect(positiveModulo(8, 8)).toBe(0);
    expect(positiveModulo(Number.NaN, 8)).toBe(0);
  });

  it("evaluates the same frame identically", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    const geometry = getSlideGeometry(settings);
    const slots = getLogicalSlotCount(8, geometry);
    const distance = distanceAtTime(settings, 2.125, slots, geometry.stride, true);
    expect(evaluateSlide(3, slots, distance, settings, geometry)).toEqual(
      evaluateSlide(3, slots, distance, settings, geometry),
    );
  });

  it("keeps every authored path finite across horizontal and vertical stages", () => {
    for (const axis of ["horizontal", "vertical"] as const) {
      for (const flow of FLOW_IDS) {
        const settings = cloneSettings(DEFAULT_SETTINGS);
        settings.motion.axis = axis;
        settings.motion.flow = flow;
        settings.motion.curvature = 0.73;
        settings.motion.depth = 0.68;
        settings.motion.tilt = 18;
        const geometry = getSlideGeometry(settings);
        const slots = getLogicalSlotCount(11, geometry);
        for (let index = 0; index < slots; index += 1) {
          const evaluated = evaluateSlide(index, slots, geometry.stride * 1.731, settings, geometry);
          expect(Object.values(evaluated).every(Number.isFinite)).toBe(true);
          expect(evaluated.opacity).toBeGreaterThanOrEqual(0.08);
          expect(evaluated.opacity).toBeLessThanOrEqual(1);
          expect(evaluated.scale).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("shares analytic preview speed with ordinary export", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.seamless = false;
    const geometry = getSlideGeometry(settings);
    const slots = getLogicalSlotCount(8, geometry);
    expect(velocityAtTime(settings, slots, geometry.stride, true)).toBe(
      velocityAtTime(settings, slots, geometry.stride, false),
    );
  });

  it("lands seamless output on an exact whole-track cycle", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 2;
    settings.output.duration = 8;
    const geometry = getSlideGeometry(settings);
    const slots = getLogicalSlotCount(8, geometry);
    const start = distanceAtTime(settings, 0, slots, geometry.stride, true);
    const end = distanceAtTime(settings, settings.output.duration, slots, geometry.stride, true);
    expect(Math.abs(end - start)).toBe(slots * geometry.stride * 2);
    expect(velocityAtTime(settings, slots, geometry.stride, true) * settings.output.duration).toBe(end);
  });

  it("freezes both distance and optical velocity for reduced-motion masters", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.reducedMotionOutput = true;
    const geometry = getSlideGeometry(settings);
    const slots = getLogicalSlotCount(8, geometry);
    expect(distanceAtTime(settings, 4, slots, geometry.stride, true)).toBe(0);
    expect(velocityAtTime(settings, slots, geometry.stride, true)).toBe(0);
  });
});
