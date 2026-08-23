import { recipeFingerprint, recipeReference } from "../recipes/fingerprint";
import {
  cloneDriftProjectV4,
  DRIFT_V2_RENDER_CONTRACT,
  type DriftProjectV4,
  type ProjectDomain,
} from "../project/schema";
import { validateDriftProjectV4 } from "../project/validation";
import {
  WORLD_RECIPE_DOMAINS,
  WORLD_RECIPE_VERSION,
  WORLD_RATIO_IDS,
  editorialDriftRecipe,
  type WorldRatioId,
} from "./worldRegistry";

const EDITORIAL_DRIFT_WORLD_ID = "editorial-drift";

function editorialRatioFromReferenceId(
  referenceId: string,
  prefix: string,
): WorldRatioId | null {
  return WORLD_RATIO_IDS.find((ratio) => referenceId === `${prefix}/${ratio}`) ?? null;
}

/**
 * Ratio recuts may resume after a dimensions-only provenance detach, but must
 * never overwrite a genuinely directed/custom project or an unknown future
 * World. Detach preserves all six truthful Editorial domain references; any
 * creative edit invalidates at least its owning reference during reconciliation.
 */
export function canRecutEditorialDrift(projectInput: DriftProjectV4): boolean {
  const project = validateDriftProjectV4(projectInput);
  if (project.renderContract !== DRIFT_V2_RENDER_CONTRACT) return false;

  const aggregate = project.provenance.world;
  let aggregateRatio: WorldRatioId | null = null;
  if (aggregate !== null) {
    aggregateRatio = editorialRatioFromReferenceId(
      aggregate.id,
      EDITORIAL_DRIFT_WORLD_ID,
    );
    if (
      aggregateRatio === null
      || aggregate.version !== WORLD_RECIPE_VERSION
      || project.provenance.worldVariant !== "restrained"
      || recipeFingerprint(
        aggregate.id,
        aggregate.version,
        editorialDriftRecipe(aggregateRatio),
      ) !== aggregate.fingerprint
    ) return false;
  }

  const locked = new Set<ProjectDomain>(project.provenance.lockedDomains);
  const truthfulRatios = new Set<WorldRatioId>();
  for (const domain of WORLD_RECIPE_DOMAINS) {
    if (locked.has(domain)) continue;
    const reference = project.provenance.recipes[domain];
    if (reference === null || reference.version !== WORLD_RECIPE_VERSION) return false;
    const ratio = editorialRatioFromReferenceId(
      reference.id,
      `${EDITORIAL_DRIFT_WORLD_ID}/${domain}`,
    );
    if (
      ratio === null
      || recipeFingerprint(reference.id, reference.version, project[domain]) !== reference.fingerprint
    ) return false;
    truthfulRatios.add(ratio);
  }

  // A detached dimensions-only project has no aggregate reference, so its
  // coherent per-domain ratio is the surviving authority. Mixed ratios are a
  // directed composition, not an automatic recut candidate. With every World
  // domain locked, a truthful aggregate remains sufficient and the locks keep
  // all authored overrides untouched.
  if (truthfulRatios.size === 0) return aggregateRatio !== null;
  if (truthfulRatios.size !== 1) return false;
  const [domainRatio] = truthfulRatios;
  return aggregateRatio === null || aggregateRatio === domainRatio;
}

export function detachEditorialDriftRatioProvenance(
  projectInput: DriftProjectV4,
  updatedAt = projectInput.updatedAt,
): DriftProjectV4 {
  const project = cloneDriftProjectV4(validateDriftProjectV4(projectInput));
  if (project.provenance.world?.id.startsWith(`${EDITORIAL_DRIFT_WORLD_ID}/`)) {
    // Ratio recipes remain truthful per-domain references, but an arbitrary
    // composition can no longer claim one of the four authored World recuts.
    project.provenance.world = null;
    project.provenance.worldVariant = "custom";
    project.updatedAt = updatedAt;
  }
  return validateDriftProjectV4(project);
}

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
  const locked = new Set<ProjectDomain>(project.provenance.lockedDomains);

  // Crossing this boundary is the user's explicit visual upgrade. Imported
  // V1/V3 projects remain on drift-v1-compat/1 until a V2 World is applied.
  project.renderContract = DRIFT_V2_RENDER_CONTRACT;

  for (const domain of WORLD_RECIPE_DOMAINS) {
    if (locked.has(domain)) continue;
    Object.assign(project, { [domain]: structuredClone(recipe[domain]) });
    project.provenance.recipes[domain] = recipeReference(
      `${EDITORIAL_DRIFT_WORLD_ID}/${domain}/${ratio}`,
      WORLD_RECIPE_VERSION,
      recipe[domain],
    );
  }

  project.provenance.world = recipeReference(
    `${EDITORIAL_DRIFT_WORLD_ID}/${ratio}`,
    WORLD_RECIPE_VERSION,
    recipe,
  );
  project.provenance.worldVariant = "restrained";
  project.updatedAt = updatedAt;
  return validateDriftProjectV4(project);
}
