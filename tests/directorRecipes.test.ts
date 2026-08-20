import { describe, expect, it } from "vitest";
import {
  DIRECTOR_RECIPES,
  MASTER_PRESETS,
  PACE_RECIPES,
  deriveDirectorAudit,
} from "../src/directorRecipes";
import { THEMES } from "../src/themes";

describe("intent-first director recipes", () => {
  it("uses existing coherent film worlds and stays inside the editor's bounded control surface", () => {
    const themeIds = new Set(THEMES.map((theme) => theme.id));
    const recipeIds = new Set<string>();
    const recipeNames = new Set<string>();

    expect(DIRECTOR_RECIPES.length).toBeGreaterThanOrEqual(10);
    for (const recipe of DIRECTOR_RECIPES) {
      expect(themeIds.has(recipe.themeId)).toBe(true);
      expect(THEMES.find((theme) => theme.id === recipe.themeId)?.name).toBe(recipe.themeName);
      expect(recipeIds.has(recipe.id)).toBe(false);
      expect(recipeNames.has(recipe.name)).toBe(false);
      recipeIds.add(recipe.id);
      recipeNames.add(recipe.name);

      expect(recipe.speed).toBeGreaterThanOrEqual(0);
      expect(recipe.speed).toBeLessThanOrEqual(1.5);
      expect(recipe.gap).toBeGreaterThanOrEqual(0);
      expect(recipe.gap).toBeLessThanOrEqual(120);
      expect(recipe.lensEnergy).toBeGreaterThanOrEqual(0);
      expect(recipe.lensEnergy).toBeLessThanOrEqual(100);
      expect(recipe.peripheralSoftness).toBeGreaterThanOrEqual(0);
      expect(recipe.peripheralSoftness).toBeLessThanOrEqual(100);
      expect(recipe.focusLift).toBeGreaterThanOrEqual(0);
      expect(recipe.focusLift).toBeLessThanOrEqual(24);
      expect(recipe.slideSize).toBeGreaterThanOrEqual(24);
      expect(recipe.slideSize).toBeLessThanOrEqual(110);
    }
  });

  it("keeps pace moves legible rather than treating maximum velocity as quality", () => {
    expect(PACE_RECIPES.map((pace) => pace.speed)).toEqual([0.14, 0.26, 0.42, 0.68]);
    expect(Math.max(...PACE_RECIPES.map((pace) => pace.speed))).toBeLessThan(0.72);
    expect(new Set(PACE_RECIPES.map((pace) => pace.id)).size).toBe(PACE_RECIPES.length);
  });

  it("defines useful social and screen masters with encoder-safe dimensions", () => {
    expect(MASTER_PRESETS.map((master) => master.id)).toEqual(["reel", "feed", "square", "screen"]);
    for (const master of MASTER_PRESETS) {
      expect(master.width % 2).toBe(0);
      expect(master.height % 2).toBe(0);
      expect(master.duration).toBeGreaterThanOrEqual(3);
      expect(master.duration).toBeLessThanOrEqual(30);
      expect([24, 25, 30, 50, 60]).toContain(master.fps);
    }
  });
});

describe("master check", () => {
  it("flags the costly false wins and supplies bounded fixes", () => {
    const audit = deriveDirectorAudit({
      slideCount: 0,
      speed: 1.1,
      lensEnergy: 92,
      slideSize: 38,
      background: "transparent",
      seamless: false,
      presenterSelected: false,
      webglReady: false,
    });

    expect(audit.find((item) => item.id === "webgl")?.tone).toBe("error");
    expect(audit.find((item) => item.id === "slides")?.tone).toBe("error");
    expect(audit.find((item) => item.id === "speed")).toMatchObject({ tone: "warning", fix: "speed" });
    expect(audit.find((item) => item.id === "lens")).toMatchObject({ tone: "warning", fix: "lens" });
    expect(audit.find((item) => item.id === "size")).toMatchObject({ tone: "warning", fix: "size" });
    expect(audit.find((item) => item.id === "alpha")?.tone).toBe("note");
    expect(audit.find((item) => item.id === "seamless")).toMatchObject({ tone: "note", fix: "seamless" });
  });

  it("does not manufacture warnings for a restrained, loop-safe deck", () => {
    const audit = deriveDirectorAudit({
      slideCount: 8,
      speed: 0.34,
      lensEnergy: 32,
      slideSize: 72,
      background: "aura",
      seamless: true,
      presenterSelected: true,
      webglReady: true,
    });

    expect(audit.some((item) => item.tone === "error" || item.tone === "warning")).toBe(false);
    expect(audit.find((item) => item.id === "seamless")?.tone).toBe("pass");
    expect(audit.find((item) => item.id === "presenter")?.tone).toBe("pass");
  });
});
