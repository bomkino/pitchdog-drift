import { describe, expect, it } from "vitest";
import { applyDirectionLevel, inferDirectionState, recutSettings } from "../src/direction";
import { cloneSettings, DEFAULT_SETTINGS } from "../src/model";
import { applyTheme, getTheme } from "../src/themes";
import { validateStudioSettings } from "../src/lib/settingsValidation";

describe("director pressure macros", () => {
  it("produces three valid, materially ordered takes", () => {
    const restrained = applyDirectionLevel(DEFAULT_SETTINGS, "restrained");
    const directed = applyDirectionLevel(DEFAULT_SETTINGS, "directed");
    const fever = applyDirectionLevel(DEFAULT_SETTINGS, "fever");

    expect(validateStudioSettings(restrained)).toEqual(restrained);
    expect(validateStudioSettings(directed)).toEqual(directed);
    expect(validateStudioSettings(fever)).toEqual(fever);
    expect(restrained.motion.speed).toBeLessThan(directed.motion.speed);
    expect(fever.motion.speed).toBeGreaterThan(directed.motion.speed);
    expect(restrained.optics.motionBlur).toBeLessThan(directed.optics.motionBlur);
    expect(fever.optics.motionBlur).toBeGreaterThan(directed.optics.motionBlur);
  });

  it("rebuilds from the authored world instead of compounding repeated clicks", () => {
    const once = applyDirectionLevel(DEFAULT_SETTINGS, "fever");
    const twice = applyDirectionLevel(once, "fever");
    expect(twice).toEqual(once);
  });

  it("preserves canvas, output, presenter, and presenter protection", () => {
    const current = cloneSettings(DEFAULT_SETTINGS);
    current.stage = { width: 1200, height: 1500, transparent: false };
    current.output.width = 2048;
    current.output.height = 2048;
    current.output.duration = 17;
    current.presenter.enabled = true;
    current.presenter.assetId = "presenter";
    current.optics.protectPresenter = false;

    const next = applyDirectionLevel(current, "restrained");
    expect(next.stage).toEqual(current.stage);
    expect(next.output).toEqual(current.output);
    expect(next.presenter).toEqual(current.presenter);
    expect(next.optics.protectPresenter).toBe(false);
  });

  it("creates deterministic new takes without changing the world contract", () => {
    const current = applyTheme(DEFAULT_SETTINGS, getTheme("night-run"));
    const first = recutSettings(current);
    const repeated = recutSettings(current);

    expect(first).toEqual(repeated);
    expect(first.background.seed).not.toBe(current.background.seed);
    expect(first.themeId).toBe(current.themeId);
    expect(first.motion.axis).toBe(current.motion.axis);
    expect(first.motion.flow).toBe(current.motion.flow);
    expect(first.stage).toEqual(current.stage);
    expect(first.output).toEqual(current.output);
    expect(first.presenter).toEqual(current.presenter);
    expect(validateStudioSettings(first)).toEqual(first);
  });

  it("recognises authored pressure levels and labels recuts as custom", () => {
    expect(inferDirectionState(applyDirectionLevel(DEFAULT_SETTINGS, "restrained"))).toBe("restrained");
    expect(inferDirectionState(applyDirectionLevel(DEFAULT_SETTINGS, "directed"))).toBe("directed");
    expect(inferDirectionState(applyDirectionLevel(DEFAULT_SETTINGS, "fever"))).toBe("fever");
    expect(inferDirectionState(recutSettings(DEFAULT_SETTINGS))).toBe("custom");
  });
});
