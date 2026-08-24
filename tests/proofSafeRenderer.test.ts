import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { DRIFT_V2_RENDER_CONTRACT } from "../src/core/project/schema";
import { LIGHTING_RECIPES, applyLightingRecipe } from "../src/core/recipes/lighting";
import { AUTHORED_WORLDS, applyAuthoredWorld } from "../src/core/worlds/authoredWorlds";
import { PUBLIC_WORLD_VARIANTS, WORLD_RATIO_IDS } from "../src/core/worlds/worldRegistry";

describe("proof-safe renderer authority", () => {
  it("starts from a source-faithful face while retaining physical shell and shadow authority", () => {
    const project = createDefaultDriftProjectV4(
      "proof-safe-default",
      "2026-08-24T00:00:00.000Z",
      17,
      DRIFT_V2_RENDER_CONTRACT,
    );

    expect(project.card).toMatchObject({ borderWidth: 0, borderOpacity: 0 });
    expect(project.material.thickness).toBeGreaterThan(0);
    expect(project.material.finish.microtexture).toBe(0);
    expect(project.lighting).toMatchObject({
      enabled: true,
      artworkProtection: 1,
      heroProtection: 1,
    });
    expect(project.lighting.shadowOpacity).toBeGreaterThan(0);
    expect(project.atmosphere.grain).toBeLessThanOrEqual(0.04);
    expect(project.lens.enabled).toBe(false);
  });

  it("never makes a lighting recipe an implicit artwork-treatment opt in", () => {
    expect(LIGHTING_RECIPES).toHaveLength(12);
    for (const recipe of LIGHTING_RECIPES) {
      expect(recipe.lighting.artworkProtection).toBe(1);
      expect(recipe.lighting.heroProtection).toBe(1);
      const project = createDefaultDriftProjectV4(`lighting-${recipe.id}`, "2026-08-24T00:00:00.000Z");
      project.lighting.artworkProtection = 0.25;
      project.lighting.heroProtection = 0.25;
      applyLightingRecipe(project, recipe.id);
      expect(project.lighting.artworkProtection).toBe(1);
      expect(project.lighting.heroProtection).toBe(1);
    }
  });

  it("keeps every shipped World and ratio proof-safe at every pressure", () => {
    for (const world of AUTHORED_WORLDS) {
      for (const variant of PUBLIC_WORLD_VARIANTS) {
        for (const ratio of WORLD_RATIO_IDS) {
          const project = createDefaultDriftProjectV4(
            `world-${world.id}-${variant}-${ratio}`,
            "2026-08-24T00:00:00.000Z",
          );
          project.lighting.artworkProtection = 0;
          project.lighting.heroProtection = 0;
          applyAuthoredWorld(project, world.id, variant, ratio, 1, 3);
          expect(project.lighting.artworkProtection).toBe(1);
          expect(project.lighting.heroProtection).toBe(1);
        }
      }
    }
  });
});
