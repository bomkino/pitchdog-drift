import { describe, expect, it } from "vitest";
import { distanceAtTime, getLogicalSlotCount, getSlideGeometry, velocityAtTime } from "../src/engine/evaluate";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";

describe("saved autoplay intent", () => {
  it("keeps deterministic preview evaluation and export genuinely still when autoplay is disabled", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    const geometry = getSlideGeometry(settings);
    const slotCount = getLogicalSlotCount(8, geometry);
    settings.motion.autoplay = false;
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 3;

    expect(distanceAtTime(settings, 4, slotCount, geometry.stride, false)).toBe(0);
    expect(distanceAtTime(settings, 4, slotCount, geometry.stride, true)).toBe(0);
    expect(velocityAtTime(settings, slotCount, geometry.stride, false)).toBe(0);
    expect(velocityAtTime(settings, slotCount, geometry.stride, true)).toBe(0);
  });

  it("restores authored motion as soon as autoplay is explicitly enabled", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    const geometry = getSlideGeometry(settings);
    const slotCount = getLogicalSlotCount(8, geometry);
    settings.motion.autoplay = true;
    settings.motion.seamless = true;

    expect(Math.abs(distanceAtTime(settings, 2, slotCount, geometry.stride, false))).toBeGreaterThan(0);
    expect(Math.abs(distanceAtTime(settings, 2, slotCount, geometry.stride, true))).toBeGreaterThan(0);
    expect(Math.abs(velocityAtTime(settings, slotCount, geometry.stride, false))).toBeGreaterThan(0);
    expect(Math.abs(velocityAtTime(settings, slotCount, geometry.stride, true))).toBeGreaterThan(0);
  });
});
