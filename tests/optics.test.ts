import { describe, expect, it } from "vitest";
import {
  OPTICS_PRESETS,
  activeOpticsPresetId,
  applyOpticsPreset,
  getOpticsPreset,
} from "../src/optics";
import { cloneSettings, DEFAULT_SETTINGS } from "../src/model";
import { validateStudioSettings } from "../src/lib/settingsValidation";

describe("cinematic optics presets", () => {
  it("ships five materially different lens characters", () => {
    expect(OPTICS_PRESETS).toHaveLength(5);
    expect(new Set(OPTICS_PRESETS.map((preset) => preset.id)).size).toBe(OPTICS_PRESETS.length);
    expect(new Set(OPTICS_PRESETS.map((preset) => JSON.stringify([preset.motion, preset.slide]))).size).toBe(OPTICS_PRESETS.length);
  });

  it("changes only optical and shadow fields", () => {
    const current = cloneSettings(DEFAULT_SETTINGS);
    current.output.duration = 19;
    current.motion.speed = 0.83;
    current.motion.flow = "cylinder";
    current.slide.radius = 91;
    current.background.seed = 888;
    const preset = getOpticsPreset("ghost-focus");

    const next = applyOpticsPreset(current, preset);

    expect(next.motion).toEqual({ ...current.motion, ...preset.motion });
    expect(next.slide).toEqual({ ...current.slide, ...preset.slide });
    expect(next.background).toEqual(current.background);
    expect(next.output).toEqual(current.output);
    expect(next.presenter).toEqual(current.presenter);
    expect(activeOpticsPresetId(next)).toBe("ghost-focus");
    expect(validateStudioSettings(next)).toEqual(next);
  });

  it("becomes custom after a manual optical adjustment", () => {
    const next = applyOpticsPreset(cloneSettings(DEFAULT_SETTINGS), getOpticsPreset("dream-glass"));
    next.motion.distortion += 0.01;
    expect(activeOpticsPresetId(next)).toBeNull();
  });
});
