import { describe, expect, it } from "vitest";
import { FLOW_IDS, THEME_IDS, cloneSettings, DEFAULT_SETTINGS } from "../src/model";
import { applyTheme, getTheme, THEMES } from "../src/themes";

const opaqueThemes = THEMES.filter((theme) => theme.settings.background.style !== "transparent");

describe("theme application", () => {
  it("clears stale transparent stage state when an opaque film world is applied", () => {
    const current = cloneSettings(DEFAULT_SETTINGS);
    current.stage = { width: 1200, height: 1500, transparent: true };
    current.background.style = "transparent";
    current.output.duration = 13;
    Object.assign(current.motion, { autoplay: false, dragSensitivity: 2.6, seamless: true, seamlessLoops: 4, reducedMotionOutput: true });
    current.presenter.enabled = true;

    const themed = applyTheme(current, getTheme("road-memory"));

    expect(themed.themeId).toBe("road-memory");
    expect(themed.background.style).toBe("gradient");
    expect(themed.stage).toEqual({ width: 1200, height: 1500, transparent: false });
    expect(themed.output.duration).toBe(13);
    expect(themed.motion).toMatchObject({ autoplay: false, dragSensitivity: 2.6, seamless: true, seamlessLoops: 4, reducedMotionOutput: true });
    expect(themed.presenter.enabled).toBe(true);
  });

  it("ships one authored preset for every declared film-world id", () => {
    expect(THEMES).toHaveLength(18);
    expect(THEMES.map((theme) => theme.id)).toEqual(THEME_IDS);
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEME_IDS.length);
  });

  it("uses the complete motion-path vocabulary across the corpus", () => {
    const usedFlows = new Set(THEMES.map((theme) => theme.settings.motion.flow));
    for (const flow of FLOW_IDS) expect(usedFlows).toContain(flow);
  });

  it("keeps the expanded worlds materially distinct instead of palette-swapping", () => {
    expect(new Set(THEMES.map((theme) => theme.settings.background.seed)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((theme) => theme.settings.background.style)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(THEMES.map((theme) => theme.settings.motion.axis)).size).toBe(2);
    expect(new Set(THEMES.map((theme) => theme.settings.motion.direction)).size).toBe(2);
    expect(Math.min(...THEMES.map((theme) => theme.settings.motion.speed))).toBeLessThanOrEqual(0.13);
    expect(Math.max(...THEMES.map((theme) => theme.settings.motion.speed))).toBeGreaterThanOrEqual(0.58);
    expect(Math.min(...THEMES.map((theme) => theme.settings.motion.distortion))).toBeLessThanOrEqual(0.12);
    expect(Math.max(...THEMES.map((theme) => theme.settings.motion.distortion))).toBeGreaterThanOrEqual(0.78);
  });

  it("keeps every opaque theme internally coherent", () => {
    for (const theme of opaqueThemes) {
      expect(theme.settings.stage.transparent).toBe(false);
      expect(theme.name.trim().length).toBeGreaterThan(0);
      expect(theme.eyebrow.trim().length).toBeGreaterThan(0);
      expect(theme.description.trim().length).toBeGreaterThan(24);
    }
  });
});
