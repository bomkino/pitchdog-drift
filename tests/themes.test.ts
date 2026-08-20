describe("film world registry", () => {
  it("covers the public theme contract with twelve complete, valid worlds", () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(THEME_IDS);
    expect(THEMES).toHaveLength(12);
    for (const theme of THEMES) expect(validateStudioSettings(theme.settings)).toEqual(theme.settings);
  });
});

import { describe, expect, it } from "vitest";
import { cloneSettings, DEFAULT_SETTINGS, THEME_IDS } from "../src/model";
import { applyTheme, getTheme, THEMES } from "../src/themes";
import { validateStudioSettings } from "../src/lib/settingsValidation";

describe("theme application", () => {
  it("clears stale transparent stage state when an opaque film world is applied", () => {
    const current = cloneSettings(DEFAULT_SETTINGS);
    current.stage = { width: 1200, height: 1500, transparent: true };
    current.background.style = "transparent";
    current.output.duration = 13;
    current.presenter.enabled = true;
    current.optics.protectPresenter = false;

    const themed = applyTheme(current, getTheme("road-memory"));

    expect(themed.themeId).toBe("road-memory");
    expect(themed.background.style).toBe("horizon");
    expect(themed.stage).toEqual({ width: 1200, height: 1500, transparent: false });
    expect(themed.output.duration).toBe(13);
    expect(themed.presenter.enabled).toBe(true);
    expect(themed.optics.profile).toBe("soft-print");
    expect(themed.optics.protectPresenter).toBe(false);
  });
});
