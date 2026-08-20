import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import {
  distanceAtTime,
  deliverySlidesPerSecond,
  editorialDeckPhase,
  evaluateSlide,
  getLogicalSlotCount,
  getLoopStrideCount,
  getSlideGeometry,
  positiveModulo,
  velocityAtTime,
} from "../src/engine/evaluate";

describe("deterministic carousel evaluation", () => {

  it("locks editorial atmosphere to source-deck holds and source-deck closure", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    Object.assign(settings.motion, { flow: "editorial", curvature: 0.72, edgeFade: 0.7 });
    const geometry = getSlideGeometry(settings);
    const sourceCount = 8;
    const holdA = editorialDeckPhase(settings, 0, geometry.stride, sourceCount);
    const holdB = editorialDeckPhase(settings, geometry.stride * 0.1, geometry.stride, sourceCount);
    expect(holdB).toBeCloseTo(holdA, 9);
    expect(editorialDeckPhase(settings, sourceCount * geometry.stride, geometry.stride, sourceCount)).toBeCloseTo(0, 9);
    expect(editorialDeckPhase(settings, -sourceCount * geometry.stride, geometry.stride, sourceCount)).toBeCloseTo(0, 9);
  });

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


  it("uses the source deck rather than renderer padding for editorial seamless loops", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.flow = "editorial";
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 1;
    settings.output.duration = 8;
    const geometry = getSlideGeometry(settings);
    const sourceCount = 2;
    const slots = getLogicalSlotCount(sourceCount, geometry);
    expect(slots).toBeGreaterThan(sourceCount);
    const loopStrides = getLoopStrideCount(settings, sourceCount, slots);
    expect(loopStrides).toBe(sourceCount);
    expect(Math.abs(distanceAtTime(settings, 8, loopStrides, geometry.stride, true))).toBe(
      sourceCount * geometry.stride,
    );
  });

  it("shares the seamless editorial delivery pace between preview and export", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.flow = "editorial";
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 2;
    settings.output.duration = 16;
    const sourceCount = 8;
    expect(deliverySlidesPerSecond(settings, sourceCount, false)).toBe(1);
    expect(deliverySlidesPerSecond(settings, sourceCount, true)).toBe(1);
  });

  it("keeps repeated virtual copies of one source slide materially identical", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.flow = "editorial";
    const geometry = getSlideGeometry(settings);
    const slots = getLogicalSlotCount(2, geometry);
    const first = evaluateSlide(0, slots, 0, settings, geometry, 0);
    const repeated = evaluateSlide(2, slots, 0, settings, geometry, 0);
    expect(first.cross - Math.sin(first.normalized * Math.PI) * (settings.motion.tilt / 9) * geometry.crossExtent * 0.018)
      .toBeCloseTo(
        repeated.cross - Math.sin(repeated.normalized * Math.PI) * (settings.motion.tilt / 9) * geometry.crossExtent * 0.018,
        9,
      );
  });


  it("fails closed for malformed loop and timeline inputs", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.flow = "editorial";
    settings.motion.seamless = true;
    expect(getLoopStrideCount(settings, Number.NaN, 8)).toBe(0);
    expect(getLoopStrideCount(settings, -1, 8)).toBe(0);
    expect(distanceAtTime(settings, Number.NaN, 8, 900, true)).toBe(0);
    expect(distanceAtTime(settings, 1, 8, Number.NaN, true)).toBe(0);
    expect(velocityAtTime(settings, 8, Number.NaN, true)).toBe(0);
  });

  it("keeps editorial cadence deterministic and finite across both axes", () => {
    for (const axis of ["horizontal", "vertical"] as const) {
      for (const direction of [-1, 1] as const) {
        const settings = cloneSettings(DEFAULT_SETTINGS);
        Object.assign(settings.motion, {
          axis,
          direction,
          flow: "editorial",
          speed: 1.5,
          curvature: 1,
          edgeFade: 1,
          depth: 0.8,
          tilt: 18,
        });
        const geometry = getSlideGeometry(settings);
        const slots = getLogicalSlotCount(13, geometry);
        for (let sample = -200; sample <= 200; sample += 1) {
          const distance = sample * geometry.stride * 0.037;
          const evaluated = evaluateSlide(sample % slots, slots, distance, settings, geometry);
          expect(Object.values(evaluated).every(Number.isFinite)).toBe(true);
          expect(evaluated.opacity).toBeGreaterThanOrEqual(0.08);
          expect(evaluated.opacity).toBeLessThanOrEqual(1);
          expect(evaluated.scale).toBeLessThanOrEqual(1 + settings.motion.focusScale * 1.2 + 1e-9);
        }
      }
    }
  });

  it("closes editorial cadence on the same complete-track pose", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    Object.assign(settings.motion, {
      flow: "editorial",
      curvature: 0.82,
      edgeFade: 0.68,
      depth: 0.24,
      tilt: 5.5,
    });
    const geometry = getSlideGeometry(settings);
    const slots = getLogicalSlotCount(8, geometry);
    const loopLength = slots * geometry.stride;

    for (let index = 0; index < slots; index += 1) {
      expect(evaluateSlide(index, slots, loopLength, settings, geometry)).toEqual(
        evaluateSlide(index, slots, 0, settings, geometry),
      );
      expect(evaluateSlide(index, slots, -loopLength, settings, geometry)).toEqual(
        evaluateSlide(index, slots, 0, settings, geometry),
      );
    }
  });

  it("turns editorial cadence back into continuous travel at its zero state", () => {
    const editorial = cloneSettings(DEFAULT_SETTINGS);
    Object.assign(editorial.motion, {
      flow: "editorial",
      curvature: 0,
      edgeFade: 0,
      depth: 0,
      tilt: 0,
    });
    const straight = cloneSettings(editorial);
    straight.motion.flow = "straight";
    const geometry = getSlideGeometry(editorial);
    const slots = getLogicalSlotCount(8, geometry);

    for (let sample = -80; sample <= 80; sample += 1) {
      const distance = sample * geometry.stride * 0.03125;
      const editorialPose = evaluateSlide(3, slots, distance, editorial, geometry);
      const straightPose = evaluateSlide(3, slots, distance, straight, geometry);
      expect(editorialPose.primary).toBeCloseTo(straightPose.primary, 9);
      expect(editorialPose.cross).toBeCloseTo(0, 9);
      expect(editorialPose.z).toBeCloseTo(0, 9);
      expect(editorialPose.rotationX).toBeCloseTo(0, 9);
      expect(editorialPose.rotationY).toBeCloseTo(0, 9);
      expect(editorialPose.rotationZ).toBeCloseTo(0, 9);
    }
  });
});
