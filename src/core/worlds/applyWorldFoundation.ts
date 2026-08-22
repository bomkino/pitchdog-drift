import { recipeReference } from "../recipes/fingerprint";
import {
  cloneDriftProjectV4,
  type DriftProjectV4,
  type ProjectDomain,
} from "../project/schema";
import { validateDriftProjectV4 } from "../project/validation";
import {
  WORLD_RATIO_DIMENSIONS,
  WORLD_RECIPE_DOMAINS,
  WORLD_RECIPE_VERSION,
  editorialDriftRecipe,
  type WorldRatioId,
} from "./worldRegistry";

const EDITORIAL_DRIFT_WORLD_ID = "editorial-drift";

/**
 * Explicitly upgrades only World-owned, unlocked domains. Media, per-slide
 * direction, presenter, lifecycle, sound, master/export state, and extensions
 * remain project authority. Ratio recut is explicit rather than inferred from
 * a crop after the fact.
 */
export function applyEditorialDriftFoundation(
  projectInput: DriftProjectV4,
  ratio: WorldRatioId,
  updatedAt = projectInput.updatedAt,
): DriftProjectV4 {
  const project = cloneDriftProjectV4(validateDriftProjectV4(projectInput));
  const recipe = editorialDriftRecipe(ratio);
  const dimensions = WORLD_RATIO_DIMENSIONS[ratio];
  const locked = new Set<ProjectDomain>(project.provenance.lockedDomains);

  for (const domain of WORLD_RECIPE_DOMAINS) {
    if (locked.has(domain)) continue;
    Object.assign(project, { [domain]: structuredClone(recipe[domain]) });
    project.provenance.recipes[domain] = recipeReference(
      `${EDITORIAL_DRIFT_WORLD_ID}/${domain}/${ratio}`,
      WORLD_RECIPE_VERSION,
      recipe[domain],
    );
  }

  project.composition.width = dimensions.width;
  project.composition.height = dimensions.height;
  project.provenance.world = recipeReference(
    `${EDITORIAL_DRIFT_WORLD_ID}/${ratio}`,
    WORLD_RECIPE_VERSION,
    recipe,
  );
  project.provenance.worldVariant = "restrained";
  project.updatedAt = updatedAt;
  return validateDriftProjectV4(project);
}
