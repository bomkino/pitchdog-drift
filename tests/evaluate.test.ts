import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, FLOW_IDS, cloneSettings } from "../src/model";
import {
  authoredSlideIndex,
  distanceAtTime,
  evaluateSlide,
  getLogicalSlotCount,
  getSlideGeometry,
  positiveModulo,
  slidesPerSecondForPreview,
  velocityAtTime,
  velocityForPreview,
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

  it("maps virtual padding copies back to stable authored slide identity", () => {
    expect(authoredSlideIndex(0, 3)).toBe(0);
    expect(authoredSlideIndex(3, 3)).toBe(0);
    expect(authoredSlideIndex(8, 3)).toBe(2);
    expect(authoredSlideIndex(-1, 3)).toBe(2);
    expect(authoredSlideIndex(2, 0)).toBe(0);
  });

  it("evaluates the same frame identically", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    const geometry = getSlideGeometry(settings);
    const sourceCount = 8;
    const slots = getLogicalSlotCount(sourceCount, geometry);
    const distance = distanceAtTime(settings, 2.125, sourceCount, geometry.stride, true);
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

  it("shares analytic free-run speed between preview and export", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.seamless = false;
    const geometry = getSlideGeometry(settings);
    const sourceCount = 8;
    expect(velocityForPreview(settings, sourceCount, geometry.stride)).toBe(
      velocityAtTime(settings, sourceCount, geometry.stride, true),
    );
    expect(slidesPerSecondForPreview(settings, sourceCount)).toBe(settings.motion.speed);
  });

  it("bases one seamless loop on authored slides, never renderer-padding copies", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.axis = "vertical";
    settings.slide.scale = 0.24;
    settings.slide.aspectWidth = 4;
    settings.slide.aspectHeight = 1;
    settings.motion.gap = 0;
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 2;
    settings.output.duration = 8;
    const geometry = getSlideGeometry(settings);
    const sourceCount = 3;
    const slots = getLogicalSlotCount(sourceCount, geometry);
    expect(slots).toBeGreaterThan(sourceCount);
    const start = distanceAtTime(settings, 0, sourceCount, geometry.stride, true);
    const end = distanceAtTime(settings, settings.output.duration, sourceCount, geometry.stride, true);
    expect(Math.abs(end - start)).toBe(sourceCount * geometry.stride * 2);
    expect(velocityAtTime(settings, sourceCount, geometry.stride, true) * settings.output.duration).toBe(end);
    expect(velocityForPreview(settings, sourceCount, geometry.stride)).toBe(
      velocityAtTime(settings, sourceCount, geometry.stride, true),
    );
  });

  it("freezes both distance and optical velocity for reduced-motion masters", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.reducedMotionOutput = true;
    const geometry = getSlideGeometry(settings);
    expect(distanceAtTime(settings, 4, 8, geometry.stride, true)).toBe(0);
    expect(velocityAtTime(settings, 8, geometry.stride, true)).toBe(0);
  });

  it("treats saved Autoplay as project intent while temporary pause stays runtime-only", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.autoplay = false;
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 3;
    const geometry = getSlideGeometry(settings);
    expect(distanceAtTime(settings, 4, 8, geometry.stride, false)).toBe(0);
    expect(distanceAtTime(settings, 4, 8, geometry.stride, true)).toBe(0);
    expect(velocityAtTime(settings, 8, geometry.stride, false)).toBe(0);
    expect(velocityAtTime(settings, 8, geometry.stride, true)).toBe(0);
    expect(velocityForPreview(settings, 8, geometry.stride)).toBe(0);
  });
});
