import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import {
  LENS_RECIPES,
  applyLensRecipe,
  detectLensRecipe,
} from "../src/core/recipes/lens";
import { lensFragmentShader } from "../src/engine/lensShader";

describe("global lens recipes", () => {
  it("ships eight materially distinct bounded lens characters", () => {
    expect(LENS_RECIPES).toHaveLength(8);
    expect(new Set(LENS_RECIPES.map((recipe) => recipe.id)).size).toBe(8);
    expect(new Set(LENS_RECIPES.map((recipe) => JSON.stringify(recipe.lens))).size).toBe(8);
    for (const recipe of LENS_RECIPES) {
      const project = createDefaultDriftProjectV4(recipe.id, "2026-08-23T00:00:00.000Z");
      const treatment = project.lens.presenterTreatment;
      applyLensRecipe(project, recipe.id);
      expect(() => validateDriftProjectV4(project)).not.toThrow();
      expect(project.lens.presenterTreatment).toBe(treatment);
      expect(detectLensRecipe(project)?.id).toBe(recipe.id);
    }
  });

  it("keeps chromatic separation centred and smear velocity-linked without overlaying grain on source pixels", () => {
    expect(lensFragmentShader).toContain("vec2 chromaOffset = radial * pixel * uChromatic");
    expect(lensFragmentShader).toContain("vec2 smearOffset = uVelocity * pixel * uSmear");
    expect(lensFragmentShader).not.toContain("uCameraGrain");
    expect(lensFragmentShader).not.toContain("filmGrain");
    expect(lensFragmentShader).toContain("#include <colorspace_fragment>");
    expect(lensFragmentShader).not.toContain("for (");
  });
});
