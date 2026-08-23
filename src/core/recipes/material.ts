import type { ProjectCommand } from "../commands/projectCommand";
import type { DriftProjectV3, DriftProjectV4, MaterialSettings, SurfaceId } from "../project/schema";
import { recipeReference } from "./fingerprint";

export const MATERIAL_RECIPE_VERSION = 1 as const;

export interface MaterialRecipe {
  id: SurfaceId;
  version: typeof MATERIAL_RECIPE_VERSION;
  name: string;
  description: string;
  bestFor: string;
  avoidWhen: string;
  tags: readonly string[];
  suggestedFinishId: string;
  material: Pick<MaterialSettings, "surface" | "flex" | "thickness" | "roughness" | "sheen">;
}

export interface FinishRecipe {
  id: string;
  version: typeof MATERIAL_RECIPE_VERSION;
  name: string;
  eyebrow: string;
  description: string;
  bestFor: string;
  avoidWhen: string;
  finish: MaterialSettings["finish"];
}

export const MATERIAL_RECIPES: readonly MaterialRecipe[] = [
  {
    id: "card",
    version: 1,
    name: "Card",
    description: "Rigid stock. Acceleration creates a restrained bow and torsional edge; constant movement stays disciplined.",
    bestFor: "Evidence, clean editorial, charts, and decks that must remain recognisably planar.",
    avoidWhen: "The sequence needs soft folds or visibly elastic matter.",
    tags: ["rigid", "clean", "editorial", "evidence"],
    suggestedFinishId: "clean-glass",
    material: { surface: "card", flex: 0.14, thickness: 0.045, roughness: 0.76, sheen: 0.06 },
  },
  {
    id: "paper",
    version: 1,
    name: "Paper",
    description: "Cylindrical curl, one broad buckle, and a small memory of path curvature without rubber wobble.",
    bestFor: "Treatments, archive, literary work, essays, collage, and handled documents.",
    avoidWhen: "The deck should feel glossy, liquid, or mechanically rigid.",
    tags: ["paper", "archive", "essay", "tactile"],
    suggestedFinishId: "16mm-breath",
    material: { surface: "paper", flex: 0.38, thickness: 0.028, roughness: 0.94, sheen: 0.035 },
  },
  {
    id: "silk",
    version: 1,
    name: "Silk",
    description: "Broad travelling folds, diagonal bias, quiet pinned edges, and a restrained grazing sheen.",
    bestFor: "Fashion, romance, music, tenderness, luminous and image-led work.",
    avoidWhen: "Small typography or hard diagrams need an unwavering plane.",
    tags: ["silk", "fashion", "romance", "luminous"],
    suggestedFinishId: "dream-glass",
    material: { surface: "silk", flex: 0.56, thickness: 0.022, roughness: 0.68, sheen: 0.34 },
  },
  {
    id: "gel",
    version: 1,
    name: "Gel",
    description: "One coherent elastic mass. Acceleration shifts the bulge behind the hand; speed contributes a smaller lag.",
    bestFor: "Music, speculative work, objects, graphic impact, and controlled elastic energy.",
    avoidWhen: "The result must read as paper, archive, or sober documentary evidence.",
    tags: ["gel", "elastic", "music", "speculative"],
    suggestedFinishId: "panic-lens",
    material: { surface: "gel", flex: 0.62, thickness: 0.075, roughness: 0.36, sheen: 0.48 },
  },
] as const;

export const FINISH_RECIPES: readonly FinishRecipe[] = [
  {
    id: "clean-glass",
    version: 1,
    name: "Clean Glass",
    eyebrow: "SHARP · NEUTRAL",
    description: "Almost invisible local finish: no registration drift, no smear, and only enough microtexture to avoid sterile flatness.",
    bestFor: "Data, evidence, small typography, and any scene already carrying global lens treatment.",
    avoidWhen: "A handled print or unstable local material response is central to the direction.",
    finish: { id: "clean-glass", registration: 0, localSoftness: 0.01, localSmear: 0.015, microtexture: 0.035 },
  },
  {
    id: "16mm-breath",
    version: 1,
    name: "16mm Breath",
    eyebrow: "PRINT · REGISTRATION · TOOTH",
    description: "Small slide-owned registration, soft local response, and stable print texture without a crawling film overlay.",
    bestFor: "Archive, documentary, paper, memory, and editorial tactility.",
    avoidWhen: "The slide contains fine charts or already uses strong atmosphere and camera grain.",
    finish: { id: "16mm-breath", registration: 0.16, localSoftness: 0.055, localSmear: 0.07, microtexture: 0.22 },
  },
  {
    id: "dream-glass",
    version: 1,
    name: "Dream Glass",
    eyebrow: "SOFT · CLOSE · FORGIVING",
    description: "Local softness and gentle velocity response that lets luminous material breathe while borders remain geometrically clean.",
    bestFor: "Silk, tenderness, fashion, faces, and romantic imagery.",
    avoidWhen: "Dense text must remain maximally crisp.",
    finish: { id: "dream-glass", registration: 0.04, localSoftness: 0.16, localSmear: 0.13, microtexture: 0.07 },
  },
  {
    id: "panic-lens",
    version: 1,
    name: "Panic Lens",
    eyebrow: "FAST · NERVOUS · LOCAL",
    description: "A bounded local smear and registration response for hard movement; it does not replace the global camera lens.",
    bestFor: "Thriller, music, graphic rush, and elastic Gel movement.",
    avoidWhen: "The scene is already using high global smear or chromatic pressure.",
    finish: { id: "panic-lens", registration: 0.24, localSoftness: 0.08, localSmear: 0.3, microtexture: 0.11 },
  },
  {
    id: "ghost-focus",
    version: 1,
    name: "Ghost Focus",
    eyebrow: "PERIPHERAL · UNCERTAIN",
    description: "A quiet local softness with displaced registration that makes neighbouring cards feel optically uncertain, not uniformly blurred.",
    bestFor: "Mystery, dread, dream logic, and selective peripheral unease.",
    avoidWhen: "Every frame needs equal authority or the camera lens already carries strong defocus.",
    finish: { id: "ghost-focus", registration: 0.2, localSoftness: 0.24, localSmear: 0.09, microtexture: 0.12 },
  },
] as const;

export function materialRecipe(id: string): MaterialRecipe {
  const recipe = MATERIAL_RECIPES.find((entry) => entry.id === id);
  if (!recipe) throw new Error(`Unknown material recipe: ${id}`);
  return recipe;
}

export function finishRecipe(id: string): FinishRecipe {
  const recipe = FINISH_RECIPES.find((entry) => entry.id === id);
  if (!recipe) throw new Error(`Unknown local finish: ${id}`);
  return recipe;
}

type MaterialRecipeProject = DriftProjectV3 | DriftProjectV4;

function refreshMaterialProvenance<T extends MaterialRecipeProject>(project: T): T {
  project.provenance.recipes.material = recipeReference(
    "material-stack",
    MATERIAL_RECIPE_VERSION,
    project.material,
  );
  return project;
}

export function applyMaterialRecipe<T extends MaterialRecipeProject>(project: T, id: string): T {
  const recipe = materialRecipe(id);
  project.material = {
    ...project.material,
    ...recipe.material,
  };
  return refreshMaterialProvenance(project);
}

export function applyFinishRecipe<T extends MaterialRecipeProject>(project: T, id: string): T {
  project.material.finish = { ...finishRecipe(id).finish };
  return refreshMaterialProvenance(project);
}

export function detectMaterialRecipe(project: MaterialRecipeProject): MaterialRecipe | null {
  return MATERIAL_RECIPES.find((recipe) => (
    JSON.stringify({
      surface: project.material.surface,
      flex: project.material.flex,
      thickness: project.material.thickness,
      roughness: project.material.roughness,
      sheen: project.material.sheen,
    }) === JSON.stringify(recipe.material)
  )) ?? null;
}

export function detectFinishRecipe(project: MaterialRecipeProject): FinishRecipe | null {
  return FINISH_RECIPES.find((recipe) => JSON.stringify(project.material.finish) === JSON.stringify(recipe.finish)) ?? null;
}

export function applyMaterialCommand(id: string): ProjectCommand {
  return {
    id: `apply-material:${id}`,
    source: "material-recipe",
    ownedDomains: ["material", "provenance"],
    apply: (project) => applyMaterialRecipe(project, id),
  };
}

export function applyFinishCommand(id: string): ProjectCommand {
  return {
    id: `apply-finish:${id}`,
    source: "local-finish",
    ownedDomains: ["material", "provenance"],
    apply: (project) => applyFinishRecipe(project, id),
  };
}
