import { createDefaultDriftProjectV4 } from "../project/defaults";
import { validateDriftProjectV4 } from "../project/validation";
import {
  ATMOSPHERE_COMPOSITION_COUNT,
  ATMOSPHERE_COMPOSITIONS_PER_FAMILY,
  ATMOSPHERE_FAMILIES,
  ATMOSPHERE_FAMILY_COUNT,
  ATMOSPHERE_HERO_COUNT,
  ATMOSPHERE_HERO_STUDIES,
  atmosphereCompositions,
} from "./atmosphereAtlas";
import {
  EDITORIAL_DRIFT_9_16_RECIPE,
  EDITORIAL_DRIFT_RATIO_OVERRIDES,
  PUBLIC_WORLD_VARIANTS,
  WORLD_IDENTITIES,
  WORLD_IDS,
  WORLD_RATIO_DIMENSIONS,
  WORLD_RATIO_IDS,
  WORLD_REGISTRY_IMPLEMENTATION_STATUS,
  WORLD_RECIPE_DOMAINS,
  editorialDriftRecipe,
  type WorldRatioId,
  type WorldRecipe,
} from "./worldRegistry";

export const EDITORIAL_DRIFT_GRAIN_BUDGET = 0.08 as const;
export const EDITORIAL_DRIFT_LENS_PRESENCE_BUDGET = 0.2 as const;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`World registry invariant failed: ${message}`);
}

function unique(values: readonly string[], label: string): void {
  invariant(new Set(values).size === values.length, `${label} must be unique`);
}

function validateRecipeWithV4(recipe: WorldRecipe, ratio: WorldRatioId): void {
  const project = createDefaultDriftProjectV4(`world-proof-${ratio.replace(":", "-")}`, "2026-08-22T00:00:00.000Z", 17);
  const dimensions = WORLD_RATIO_DIMENSIONS[ratio];
  project.composition = {
    ...project.composition,
    width: dimensions.width,
    height: dimensions.height,
  };
  invariant(project.composition.width === dimensions.width, `${ratio} proof width must be exact`);
  invariant(project.composition.height === dimensions.height, `${ratio} proof height must be exact`);
  Object.assign(project, structuredClone(recipe));
  const validated = validateDriftProjectV4(project);
  invariant(validated.composition.width === dimensions.width, `${ratio} validated width must remain exact`);
  invariant(validated.composition.height === dimensions.height, `${ratio} validated height must remain exact`);
}

export function assertAtmosphereAtlasIntegrity(): void {
  invariant(ATMOSPHERE_FAMILIES.length === ATMOSPHERE_FAMILY_COUNT, "atlas must contain eight families");
  unique(ATMOSPHERE_FAMILIES.map((family) => family.id), "atmosphere family IDs");

  for (const family of ATMOSPHERE_FAMILIES) {
    invariant(
      family.compositions.length === ATMOSPHERE_COMPOSITIONS_PER_FAMILY,
      `${family.id} must contain eight compositions`,
    );
    unique(family.compositions.map((composition) => composition.id), `${family.id} composition IDs`);
  }

  const compositions = atmosphereCompositions();
  invariant(compositions.length === ATMOSPHERE_COMPOSITION_COUNT, "atlas must contain sixty-four compositions");
  unique(compositions.map((composition) => composition.id), "global atmosphere composition IDs");

  invariant(ATMOSPHERE_HERO_STUDIES.length === ATMOSPHERE_HERO_COUNT, "hero shelf must contain twelve studies");
  unique(ATMOSPHERE_HERO_STUDIES.map((study) => study.id), "hero study IDs");
  unique(ATMOSPHERE_HERO_STUDIES.map((study) => study.compositionId), "hero compositions");
  const compositionIds = new Set(compositions.map((composition) => composition.id));
  for (const study of ATMOSPHERE_HERO_STUDIES) {
    invariant(compositionIds.has(study.compositionId), `${study.id} must reference an atlas composition`);
    const family = ATMOSPHERE_FAMILIES.find((entry) => entry.id === study.familyId);
    invariant(
      family?.compositions.some((composition) => composition.id === study.compositionId),
      `${study.id} family must own its composition`,
    );
  }
}

export function assertWorldIdentityIntegrity(): void {
  invariant(WORLD_REGISTRY_IMPLEMENTATION_STATUS === "registry-only", "registry must not claim renderer or UI completion");
  invariant(WORLD_IDENTITIES.length === 8, "launch registry must contain eight Worlds");
  unique(WORLD_IDENTITIES.map((world) => world.id), "World IDs");
  unique(WORLD_IDENTITIES.map((world) => world.name), "World names");
  invariant(
    JSON.stringify(WORLD_IDENTITIES.map((world) => world.id)) === JSON.stringify(WORLD_IDS),
    "launch registry must contain the exact eight curated Worlds",
  );

  for (const world of WORLD_IDENTITIES) {
    invariant(world.authoredRecipeId === null, `${world.id} must not claim a shipped authored recipe`);
    invariant(
      JSON.stringify(world.supportedRatios) === JSON.stringify(WORLD_RATIO_IDS),
      `${world.id} must support 9:16, 4:5, 1:1, and 16:9`,
    );
    invariant(Object.keys(world.axes).sort().join(",") === "horizontal,vertical", `${world.id} must support both axes`);
    for (const axis of ["horizontal", "vertical"] as const) {
      invariant(
        world.axes[axis].supportedDirections.includes(-1) && world.axes[axis].supportedDirections.includes(1),
        `${world.id} ${axis} must support both directions`,
      );
      invariant(world.axes[axis].intent.length >= 24, `${world.id} ${axis} needs authored composition intent`);
    }
    invariant(world.compositionIntent.portrait.length >= 48, `${world.id} needs portrait-native intent`);
    invariant(world.compositionIntent.landscape.length >= 48, `${world.id} needs landscape-native intent`);
    invariant(
      Object.keys(world.variants).sort().join(",") === [...PUBLIC_WORLD_VARIANTS].sort().join(","),
      `${world.id} must expose all three variants`,
    );
    invariant(world.variants.restrained.pressure === 0, `${world.id} Restrained pressure must be zero`);
    invariant(world.variants.directed.pressure === 1, `${world.id} Directed pressure must be one`);
    invariant(world.variants.fever.pressure === 2, `${world.id} Fever pressure must be two`);
  }
}

export function assertEditorialDriftRecipeIntegrity(): void {
  invariant(
    Object.keys(EDITORIAL_DRIFT_9_16_RECIPE).sort().join(",") === [...WORLD_RECIPE_DOMAINS].sort().join(","),
    "Editorial Drift must own only V4 World recipe domains",
  );
  invariant(
    Object.keys(EDITORIAL_DRIFT_RATIO_OVERRIDES).sort().join(",") === "16:9,1:1,4:5",
    "Editorial Drift must define all non-source ratio overrides",
  );

  const compositionIds = new Set(atmosphereCompositions().map((composition) => composition.id));
  for (const ratio of WORLD_RATIO_IDS) {
    const recipe = editorialDriftRecipe(ratio);
    validateRecipeWithV4(recipe, ratio);
    invariant(recipe.card.borderWidth === 0, `${ratio} must not draw a transparent border shell`);
    invariant(recipe.card.borderOpacity === 0, `${ratio} border must remain fully absent`);
    invariant(recipe.atmosphere.grain <= EDITORIAL_DRIFT_GRAIN_BUDGET, `${ratio} atmosphere grain exceeds safe budget`);
    invariant(recipe.lens.cameraGrain <= EDITORIAL_DRIFT_GRAIN_BUDGET, `${ratio} camera grain exceeds safe budget`);
    invariant(
      recipe.atmosphere.grain + recipe.lens.cameraGrain <= EDITORIAL_DRIFT_GRAIN_BUDGET,
      `${ratio} combined grain exceeds safe budget`,
    );
    invariant(recipe.lens.presence <= EDITORIAL_DRIFT_LENS_PRESENCE_BUDGET, `${ratio} lens pressure is not restrained`);
    invariant(recipe.lens.chromaticSeparation <= 0.02, `${ratio} chromatic separation is not restrained`);
    invariant(recipe.lens.directionalSmear <= 0.08, `${ratio} directional smear is not restrained`);
    invariant(recipe.lens.presenterTreatment === "protected", `${ratio} must protect presenter pixels`);
    invariant(recipe.lighting.artworkProtection >= 0.85, `${ratio} must protect slide artwork`);
    invariant(recipe.lighting.heroProtection >= 0.85, `${ratio} must protect resting hero`);
    invariant(compositionIds.has(recipe.atmosphere.composition), `${ratio} must reference an authored atmosphere`);
  }

  invariant(editorialDriftRecipe("9:16").motion.transport.axis === "vertical", "9:16 must use true vertical travel");
  invariant(editorialDriftRecipe("4:5").motion.transport.axis === "vertical", "4:5 must use true vertical travel");
  invariant(editorialDriftRecipe("1:1").motion.transport.axis === "horizontal", "1:1 must use authored lateral travel");
  invariant(editorialDriftRecipe("16:9").motion.transport.axis === "horizontal", "16:9 must use authored lateral travel");
}

export function assertWorldRegistryIntegrity(): void {
  assertAtmosphereAtlasIntegrity();
  assertWorldIdentityIntegrity();
  assertEditorialDriftRecipeIntegrity();
}
