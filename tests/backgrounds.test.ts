import { describe, expect, it } from "vitest";
import {
  BACKGROUND_SCENES,
  activeBackgroundSceneId,
  applyBackgroundScene,
  getBackgroundScene,
  recutBackgroundSeed,
} from "../src/backgrounds";
import { cloneSettings, DEFAULT_SETTINGS } from "../src/model";
import { validateStudioSettings } from "../src/lib/settingsValidation";

describe("authored background scenes", () => {
  it("ships a deep, unique scene library across every existing shader family", () => {
    expect(BACKGROUND_SCENES).toHaveLength(21);
    expect(new Set(BACKGROUND_SCENES.map((scene) => scene.id)).size).toBe(BACKGROUND_SCENES.length);
    expect(new Set(BACKGROUND_SCENES.map((scene) => scene.name)).size).toBe(BACKGROUND_SCENES.length);
    expect(new Set(BACKGROUND_SCENES.map((scene) => scene.settings.style))).toEqual(
      new Set(["transparent", "solid", "gradient", "aura", "paper", "void"]),
    );

    for (const style of ["solid", "gradient", "aura", "paper", "void"] as const) {
      const family = BACKGROUND_SCENES.filter((scene) => scene.settings.style === style);
      expect(family).toHaveLength(4);
      expect(new Set(family.map((scene) => scene.settings.seed % 4))).toEqual(new Set([0, 1, 2, 3]));
    }
  });

  it("applies scenes without disturbing output, motion, slide, or presenter settings", () => {
    const current = cloneSettings(DEFAULT_SETTINGS);
    current.output.duration = 17;
    current.motion.speed = 0.91;
    current.slide.radius = 77;
    current.presenter.width = 0.51;

    const next = applyBackgroundScene(current, getBackgroundScene("deep-sea"));

    expect(next.background).toEqual(getBackgroundScene("deep-sea").settings);
    expect(next.stage.transparent).toBe(false);
    expect(next.output).toEqual(current.output);
    expect(next.motion).toEqual(current.motion);
    expect(next.slide).toEqual(current.slide);
    expect(next.presenter).toEqual(current.presenter);
    expect(validateStudioSettings(next)).toEqual(next);
  });

  it("keeps transparent state and background style in lockstep", () => {
    const next = applyBackgroundScene(cloneSettings(DEFAULT_SETTINGS), getBackgroundScene("clear-stage"));
    expect(next.stage.transparent).toBe(true);
    expect(next.background.style).toBe("transparent");
    expect(validateStudioSettings(next)).toEqual(next);
  });

  it("re-cuts deterministic detail while preserving the authored recipe", () => {
    for (const scene of BACKGROUND_SCENES.filter((entry) => entry.settings.style !== "transparent")) {
      const nextSeed = recutBackgroundSeed(scene.settings.seed);
      expect(nextSeed).not.toBe(scene.settings.seed);
      expect(nextSeed).toBeGreaterThanOrEqual(0);
      expect(nextSeed).toBeLessThanOrEqual(1_000_000);
      expect(nextSeed % 4).toBe(scene.settings.seed % 4);
      expect(activeBackgroundSceneId({ ...scene.settings, seed: nextSeed })).toBe(scene.id);
    }
  });
});
