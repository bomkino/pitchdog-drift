import { describe, expect, it } from "vitest";
import { cloneSettings, DEFAULT_SETTINGS } from "../src/model";
import { applyTheme, getTheme } from "../src/themes";

describe("theme application", () => {
  it("clears stale transparent stage state when an opaque film world is applied", () => {
    const current = cloneSettings(DEFAULT_SETTINGS);
    current.stage = { width: 1200, height: 1500, transparent: true };
    current.background.style = "transparent";
    current.output.duration = 13;
    current.presenter.enabled = true;
    current.motion.reducedMotionOutput = true;
    current.performance = { ...current.performance, reducedMotion: true };

    const themed = applyTheme(current, getTheme("road-memory"));

    expect(themed.themeId).toBe("road-memory");
    expect(themed.background.style).toBe("gradient");
    expect(themed.stage).toEqual({ width: 1200, height: 1500, transparent: false });
    expect(themed.output.duration).toBe(13);
    expect(themed.presenter.enabled).toBe(true);
    expect(themed.motion.reducedMotionOutput).toBe(true);
    expect(themed.performance.reducedMotion).toBe(true);
  });
});
