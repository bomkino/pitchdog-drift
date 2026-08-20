import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import {
  distanceAtTime,
  evaluateSlide,
  getLogicalSlotCount,
  getSlideGeometry,
  isPotentiallyVisible,
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

  it("evaluates the same frame identically", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    const geometry = getSlideGeometry(settings);
    const slots = getLogicalSlotCount(8, geometry);
    const distance = distanceAtTime(settings, 2.125, 8, geometry.stride, true);
    expect(evaluateSlide(3, slots, distance, settings, geometry)).toEqual(
      evaluateSlide(3, slots, distance, settings, geometry),
    );
  });

  it("shares analytic preview speed with ordinary export", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.seamless = false;
    const geometry = getSlideGeometry(settings);
    expect(velocityAtTime(settings, 8, geometry.stride, true)).toBe(
      velocityForPreview(settings, 8, geometry.stride),
    );
    expect(slidesPerSecondForPreview(settings, 8)).toBe(settings.motion.speed);
  });

  it("derives complete-loop preview and export cadence from source slides, not render padding", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 2;
    settings.output.duration = 8;
    const geometry = getSlideGeometry(settings);
    const sourceSlides = 8;
    const virtualSlots = getLogicalSlotCount(sourceSlides, geometry);
    expect(virtualSlots).toBeGreaterThan(sourceSlides);

    const start = distanceAtTime(settings, 0, sourceSlides, geometry.stride, true);
    const end = distanceAtTime(settings, settings.output.duration, sourceSlides, geometry.stride, true);
    expect(Math.abs(end - start)).toBe(sourceSlides * geometry.stride * 2);
    expect(velocityAtTime(settings, sourceSlides, geometry.stride, true) * settings.output.duration).toBe(end);
    expect(velocityForPreview(settings, sourceSlides, geometry.stride)).toBe(
      velocityAtTime(settings, sourceSlides, geometry.stride, true),
    );
    expect(slidesPerSecondForPreview(settings, sourceSlides)).toBe(2);
  });

  it("returns the same visible source composition after one source-slide cycle", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    const geometry = getSlideGeometry(settings);
    const sourceSlides = 8;
    const virtualSlots = getLogicalSlotCount(sourceSlides, geometry);

    const composition = (distance: number) => Array.from({ length: virtualSlots }, (_, logicalIndex) => ({
      assetIndex: logicalIndex % sourceSlides,
      evaluated: evaluateSlide(logicalIndex, virtualSlots, distance, settings, geometry),
    }))
      .filter((entry) => isPotentiallyVisible(entry.evaluated, geometry))
      .sort((a, b) => a.evaluated.primary - b.evaluated.primary)
      .map((entry) => ({
        assetIndex: entry.assetIndex,
        primary: Number(entry.evaluated.primary.toFixed(8)),
        cross: Number(entry.evaluated.cross.toFixed(8)),
        z: Number(entry.evaluated.z.toFixed(8)),
        rotationX: Number(entry.evaluated.rotationX.toFixed(8)),
        rotationY: Number(entry.evaluated.rotationY.toFixed(8)),
        rotationZ: Number(entry.evaluated.rotationZ.toFixed(8)),
        scale: Number(entry.evaluated.scale.toFixed(8)),
        opacity: Number(entry.evaluated.opacity.toFixed(8)),
      }));

    expect(composition(sourceSlides * geometry.stride)).toEqual(composition(0));
  });

  it("freezes both distance and optical velocity for reduced-motion masters without changing preview intent", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.reducedMotionOutput = true;
    const geometry = getSlideGeometry(settings);
    expect(distanceAtTime(settings, 4, 8, geometry.stride, true)).toBe(0);
    expect(velocityAtTime(settings, 8, geometry.stride, true)).toBe(0);
    expect(velocityForPreview(settings, 8, geometry.stride)).not.toBe(0);
  });
});
