import type { DriftProjectV4, LensSettings } from "../project/schema";
import { recipeReference } from "./fingerprint";

export const LENS_RECIPE_VERSION = 1 as const;

export interface LensRecipe {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  lens: Omit<LensSettings, "enabled" | "characterId" | "presenterTreatment">;
}

function lens(
  id: string,
  name: string,
  eyebrow: string,
  description: string,
  values: LensRecipe["lens"],
): LensRecipe {
  return { id, name, eyebrow, description, lens: values };
}

export const LENS_RECIPES: readonly LensRecipe[] = [
  lens("clean-gate", "Clean Gate", "SHARP · RESTRAINED", "Minute camera texture and a gentle gate; the deck remains the subject.", {
    presence: 0.16, focus: 0.02, directionalSmear: 0.05, chromaticSeparation: 0.015,
    bloom: 0.015, halation: 0.01, flare: 0, curvature: 0, gateWeave: 0,
    cameraGrain: 0.035, vignette: 0.04,
  }),
  lens("soft-print", "Soft Print", "CELLULOID · FORGIVING", "Low-contrast softness, warm highlight bleed and a quiet printed edge.", {
    presence: 0.46, focus: 0.18, directionalSmear: 0.14, chromaticSeparation: 0.1,
    bloom: 0.1, halation: 0.12, flare: 0.03, curvature: 0.02, gateWeave: 0.02,
    cameraGrain: 0.08, vignette: 0.08,
  }),
  lens("dream-glass", "Dream Glass", "BLOOM · CLOSE", "A held centre and soft luminous edge for tenderness, memory and faces.", {
    presence: 0.58, focus: 0.42, directionalSmear: 0.12, chromaticSeparation: 0.14,
    bloom: 0.34, halation: 0.32, flare: 0.08, curvature: -0.05, gateWeave: 0.025,
    cameraGrain: 0.055, vignette: 0.12,
  }),
  lens("anamorphic-night", "Anamorphic Night", "WIDE GLASS · ELECTRIC", "Directional night smear, bounded channel split and a thin highlight flare.", {
    presence: 0.62, focus: 0.12, directionalSmear: 0.28, chromaticSeparation: 0.34,
    bloom: 0.22, halation: 0.12, flare: 0.42, curvature: 0.18, gateWeave: 0.015,
    cameraGrain: 0.07, vignette: 0.2,
  }),
  lens("bleach-bypass", "Bleach Bypass", "HARD SILVER", "Crisp centre, dirty gate and nervous monochrome pressure without fake damage.", {
    presence: 0.54, focus: 0.035, directionalSmear: 0.09, chromaticSeparation: 0.12,
    bloom: 0.015, halation: 0.025, flare: 0.015, curvature: 0.04, gateWeave: 0.08,
    cameraGrain: 0.2, vignette: 0.34,
  }),
  lens("night-terror", "Night Terror", "PREDATORY · UNSTABLE", "Peripheral defocus, breathing separation and a moving gate bounded around a readable hero.", {
    presence: 0.72, focus: 0.22, directionalSmear: 0.38, chromaticSeparation: 0.54,
    bloom: 0.08, halation: 0.28, flare: 0.05, curvature: 0.3, gateWeave: 0.18,
    cameraGrain: 0.18, vignette: 0.48,
  }),
  lens("panic-lens", "Panic Lens", "FAST · NERVOUS", "Hard velocity-linked smear and short optical panic that returns to zero at rest.", {
    presence: 0.68, focus: 0.08, directionalSmear: 0.58, chromaticSeparation: 0.3,
    bloom: 0.1, halation: 0.14, flare: 0.08, curvature: 0.14, gateWeave: 0.1,
    cameraGrain: 0.12, vignette: 0.3,
  }),
  lens("ghost-focus", "Ghost Focus", "PERIPHERAL · UNCERTAIN", "A stable focal corridor surrounded by displaced, quiet uncertainty.", {
    presence: 0.6, focus: 0.5, directionalSmear: 0.09, chromaticSeparation: 0.2,
    bloom: 0.14, halation: 0.18, flare: 0.02, curvature: -0.08, gateWeave: 0.05,
    cameraGrain: 0.1, vignette: 0.34,
  }),
] as const;

export function lensRecipe(id: string): LensRecipe {
  const recipe = LENS_RECIPES.find((entry) => entry.id === id);
  if (!recipe) throw new Error(`Unknown lens recipe: ${id}`);
  return recipe;
}

export function applyLensRecipe(project: DriftProjectV4, id: string): DriftProjectV4 {
  const recipe = lensRecipe(id);
  const presenterTreatment = project.lens.presenterTreatment;
  project.lens = {
    enabled: true,
    characterId: recipe.id,
    presenterTreatment,
    ...recipe.lens,
  };
  project.provenance.recipes.lens = recipeReference(`lens/${recipe.id}`, LENS_RECIPE_VERSION, recipe.lens);
  return project;
}

export function detectLensRecipe(project: DriftProjectV4): LensRecipe | null {
  return LENS_RECIPES.find((recipe) => (
    project.lens.characterId === recipe.id
    && Object.entries(recipe.lens).every(([key, value]) => (
      project.lens[key as keyof LensSettings] === value
    ))
  )) ?? null;
}
