import { describe, expect, it } from "vitest";
import { cloneSettings, DEFAULT_SETTINGS } from "../src/model";
import { applyTheme, getTheme, THEMES } from "../src/themes";
import { validateStudioSettings } from "../src/lib/settingsValidation";

describe("theme application", () => {
  it("ships twelve authored film worlds rather than palette swaps", () => {
    expect(THEMES).toHaveLength(12);
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((theme) => theme.name)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((theme) => JSON.stringify([
      theme.settings.motion.axis,
      theme.settings.motion.flow,
      theme.settings.motion.speed,
      theme.settings.motion.distortion,
      theme.settings.background.style,
      theme.settings.background.seed % 4,
    ]))).size).toBe(THEMES.length);
    for (const theme of THEMES) expect(validateStudioSettings(theme.settings)).toEqual(theme.settings);
  });

  it("clears stale transparent stage state when an opaque film world is applied", () => {
    const current = cloneSettings(DEFAULT_SETTINGS);
    current.stage = { width: 1200, height: 1500, transparent: true };
    current.background.style = "transparent";
    current.output.duration = 13;
    current.presenter.enabled = true;

    const themed = applyTheme(current, getTheme("road-memory"));

    expect(themed.themeId).toBe("road-memory");
    expect(themed.background.style).toBe("gradient");
    expect(themed.stage).toEqual({ width: 1200, height: 1500, transparent: false });
    expect(themed.output.duration).toBe(13);
    expect(themed.presenter.enabled).toBe(true);
  });
});
