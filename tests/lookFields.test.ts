import { describe, expect, it } from "vitest";
import { cloneSettings, DEFAULT_SETTINGS } from "../src/model";
import {
  applyMotionLook,
  applyMotionSession,
  captureMotionLook,
  captureMotionSession,
  LOOK_MOTION_KEYS,
  SESSION_MOTION_KEYS,
} from "../src/lookFields";

describe("look and delivery motion boundaries", () => {
  it("partitions every motion field exactly once", () => {
    const all = [...LOOK_MOTION_KEYS, ...SESSION_MOTION_KEYS];
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(Object.keys(DEFAULT_SETTINGS.motion)));
  });

  it("recalls a look without rewriting saved delivery or interaction intent", () => {
    const source = cloneSettings(DEFAULT_SETTINGS);
    source.motion.flow = "orbit";
    source.motion.distortion = 0.77;
    const current = cloneSettings(DEFAULT_SETTINGS);
    Object.assign(current.motion, {
      autoplay: false,
      dragSensitivity: 2.5,
      seamless: true,
      seamlessLoops: 4,
      reducedMotionOutput: true,
    });
    const result = applyMotionLook(current.motion, captureMotionLook(source.motion));
    expect(result.flow).toBe("orbit");
    expect(result.distortion).toBe(0.77);
    expect(captureMotionSession(result)).toEqual(captureMotionSession(current.motion));
  });

  it("can apply session intent without disturbing optical/spatial look", () => {
    const current = cloneSettings(DEFAULT_SETTINGS);
    current.motion.flow = "helix";
    current.motion.distortion = 0.61;
    const sessionSource = cloneSettings(DEFAULT_SETTINGS);
    sessionSource.motion.autoplay = false;
    sessionSource.motion.seamless = true;
    const result = applyMotionSession(current.motion, captureMotionSession(sessionSource.motion));
    expect(captureMotionLook(result)).toEqual(captureMotionLook(current.motion));
    expect(result.autoplay).toBe(false);
    expect(result.seamless).toBe(true);
  });
});
