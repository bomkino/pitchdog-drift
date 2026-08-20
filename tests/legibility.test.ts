import { describe, expect, it } from "vitest";
import { assessLegibility } from "../src/legibility";
import { cloneSettings, DEFAULT_SETTINGS } from "../src/model";

describe("readability pressure", () => {
  it("keeps the default authored direction inside a clear envelope", () => {
    const result = assessLegibility(DEFAULT_SETTINGS);
    expect(result.status).toBe("clear");
    expect(result.score).toBeGreaterThan(0);
  });

  it("warns when several optical and motion pressures accumulate", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.speed = 1.5;
    settings.motion.distortion = 1;
    settings.slide.scale = 0.3;
    Object.assign(settings.optics, {
      enabled: true,
      motionBlur: 1,
      chromaticAberration: 1,
      softFocus: 1,
      edgeSoftness: 1,
      barrelDistortion: 1,
    });
    const result = assessLegibility(settings);
    expect(result.status).toBe("intense");
    expect(result.factors[0]?.pressure).toBeGreaterThan(0);
    expect(result.detail).toContain("aggressive");
  });

  it("removes speed, smear, and bend pressure from reduced-motion output", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.speed = 1.5;
    settings.motion.distortion = 1;
    settings.optics.motionBlur = 1;
    const moving = assessLegibility(settings);
    settings.motion.reducedMotionOutput = true;
    const reduced = assessLegibility(settings);
    expect(reduced.score).toBeLessThan(moving.score);
    expect(reduced.factors.map((factor) => factor.id)).not.toContain("speed");
    expect(reduced.factors.map((factor) => factor.id)).not.toContain("motion-blur");
    expect(reduced.factors.map((factor) => factor.id)).not.toContain("bend");
  });
});
