import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import { distanceAtTime, velocityAtTime } from "../src/engine/evaluate";

describe("authored deck pass semantics", () => {
  it("moves one actual deck pass rather than one padded render strip", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.output.duration = 8;
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 1;
    settings.motion.direction = 1;
    const paddedSlotCount = 12;
    const authoredSlideCount = 4;
    const stride = 100;
    expect(distanceAtTime(settings, 8, paddedSlotCount, stride, true, authoredSlideCount)).toBe(400);
    expect(velocityAtTime(settings, paddedSlotCount, stride, true, authoredSlideCount)).toBe(50);
  });

  it("preserves the old call contract for existing evaluators", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.output.duration = 6;
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 1;
    settings.motion.direction = 1;
    expect(distanceAtTime(settings, 6, 5, 80, true)).toBe(400);
  });
});
