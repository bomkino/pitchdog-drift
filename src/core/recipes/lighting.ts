import type { ProjectCommand } from "../commands/projectCommand";
import type { DriftProjectV3, LightingSettings } from "../project/schema";
import { recipeReference } from "./fingerprint";

export const LIGHTING_RECIPE_VERSION = 1 as const;

export interface LightingRecipe {
  id: string;
  version: typeof LIGHTING_RECIPE_VERSION;
  name: string;
  eyebrow: string;
  description: string;
  bestFor: string;
  avoidWhen: string;
  preferredSurfaces: readonly string[];
  cautions: readonly string[];
  lighting: Omit<LightingSettings, "enabled" | "presetId">;
}

function rig(
  id: string,
  name: string,
  eyebrow: string,
  description: string,
  bestFor: string,
  avoidWhen: string,
  preferredSurfaces: readonly string[],
  cautions: readonly string[],
  lighting: LightingRecipe["lighting"],
): LightingRecipe {
  return {
    id,
    version: LIGHTING_RECIPE_VERSION,
    name,
    eyebrow,
    description,
    bestFor,
    avoidWhen,
    preferredSurfaces,
    cautions,
    lighting,
  };
}

export const LIGHTING_RECIPES: readonly LightingRecipe[] = [
  rig(
    "studio-soft",
    "Studio Soft",
    "LARGE SOURCE · FAITHFUL COLOUR",
    "A broad warm key, quiet cool fill, and short contact-rich shadow. Physical presence without re-grading the deck.",
    "Dialogue, editorial, founder-led work, dense typography.",
    "Scenes that need hard tension, long directional shadows, or obvious environmental source logic.",
    ["card", "paper"],
    [],
    {
      space: "stage", motionMode: "breathe", motionSpeed: 1,
      keyColor: "#fff1dc", fillColor: "#b9c9e8", shadowColor: "#100c12",
      azimuth: 42, elevation: 56, keyIntensity: 0.78, fillIntensity: 0.54, rimIntensity: 0.14,
      artworkProtection: 0.82, heroProtection: 0.82, shadowOpacity: 0.34, shadowSoftness: 52,
      shadowDistance: 54, contactStrength: 0.58, backgroundSpill: 0.28, spillFocus: 0.78,
      gobo: "softbox", goboStrength: 0.08, breath: 0.1,
    },
  ),
  rig(
    "window-rake",
    "Window Rake",
    "LOW SIDE KEY · LONG AFTERNOON",
    "Warm directional light crosses the stage like a nearby window. A cool fill preserves faces, titles, and detail.",
    "Travel, memory, domestic drama, warm documentary.",
    "Very dense data or scenes where long shadows would compete with the evidence.",
    ["paper", "card", "silk"],
    ["long-shadow"],
    {
      space: "stage", motionMode: "sweep", motionSpeed: 1,
      keyColor: "#ffd39b", fillColor: "#8fa8d8", shadowColor: "#160e12",
      azimuth: 142, elevation: 28, keyIntensity: 1.08, fillIntensity: 0.3, rimIntensity: 0.2,
      artworkProtection: 0.72, heroProtection: 0.78, shadowOpacity: 0.48, shadowSoftness: 38,
      shadowDistance: 118, contactStrength: 0.72, backgroundSpill: 0.54, spillFocus: 0.66,
      gobo: "window", goboStrength: 0.32, breath: 0.16,
    },
  ),
  rig(
    "projector-haze",
    "Projector Haze",
    "FRONTAL POOL · OPTICAL MEMORY",
    "A contained frontal pool with soft falloff. The world feels projected rather than gradient-filled while the slide stays legible.",
    "Archive, evidence, screenings, documentary history.",
    "Scenes requiring naturalistic outdoor light or glossy edge response.",
    ["paper", "card"],
    ["flicker-with-held-poses"],
    {
      space: "stage", motionMode: "flicker", motionSpeed: 2,
      keyColor: "#ffe2b2", fillColor: "#566789", shadowColor: "#09090f",
      azimuth: 94, elevation: 68, keyIntensity: 0.86, fillIntensity: 0.38, rimIntensity: 0.08,
      artworkProtection: 0.78, heroProtection: 0.88, shadowOpacity: 0.32, shadowSoftness: 72,
      shadowDistance: 42, contactStrength: 0.56, backgroundSpill: 0.7, spillFocus: 0.5,
      gobo: "projector", goboStrength: 0.24, breath: 0.22,
    },
  ),
  rig(
    "noir-slice",
    "Noir Slice",
    "HARD CUT · DEEP NEGATIVE FILL",
    "A low hard source, near-black fill, and narrow atmospheric slash. Dread without swallowing the focal slide.",
    "Horror, thriller, noir, psychological tension.",
    "Dense small typography, warm comedy, or any scene requiring equal illumination across the deck.",
    ["card", "paper", "gel"],
    ["specular-pressure", "long-shadow", "low-artwork-protection"],
    {
      space: "stage", motionMode: "static", motionSpeed: 1,
      keyColor: "#edf4ff", fillColor: "#161a2a", shadowColor: "#000000",
      azimuth: 164, elevation: 18, keyIntensity: 1.34, fillIntensity: 0.08, rimIntensity: 0.07,
      artworkProtection: 0.54, heroProtection: 0.82, shadowOpacity: 0.72, shadowSoftness: 18,
      shadowDistance: 164, contactStrength: 0.9, backgroundSpill: 0.64, spillFocus: 0.3,
      gobo: "slit", goboStrength: 0.46, breath: 0.04,
    },
  ),
  rig(
    "golden-hour",
    "Golden Hour",
    "LOW AMBER KEY · VIOLET AIR",
    "A low warm source with restrained violet fill, generous penumbra, and a slowly travelling horizon glow.",
    "Romance, tenderness, nostalgia, family stories.",
    "Neutral evidence, clinical environments, or colour-critical artwork with no room for warm interpretation.",
    ["paper", "silk", "card"],
    ["warm-colour-shift", "long-shadow"],
    {
      space: "stage", motionMode: "sweep", motionSpeed: 1,
      keyColor: "#ffbd66", fillColor: "#777fba", shadowColor: "#31170f",
      azimuth: 24, elevation: 16, keyIntensity: 1.08, fillIntensity: 0.31, rimIntensity: 0.26,
      artworkProtection: 0.68, heroProtection: 0.82, shadowOpacity: 0.5, shadowSoftness: 58,
      shadowDistance: 172, contactStrength: 0.66, backgroundSpill: 0.58, spillFocus: 0.9,
      gobo: "sunset", goboStrength: 0.24, breath: 0.18,
    },
  ),
  rig(
    "electric-rim",
    "Electric Rim",
    "CYAN EDGE · ULTRAVIOLET FILL",
    "A cyan edge and ultraviolet fill for nocturnal worlds, with bounded gloss so typography remains the subject.",
    "Music, speculative fiction, nightlife, technology.",
    "Warm documentary, natural daylight, or scenes already carrying strong bloom and reflective Gel.",
    ["gel", "silk", "card"],
    ["specular-pressure", "bloom-pressure"],
    {
      space: "card", motionMode: "orbit", motionSpeed: 2,
      keyColor: "#8feeff", fillColor: "#d081ff", shadowColor: "#070311",
      azimuth: -28, elevation: 42, keyIntensity: 0.84, fillIntensity: 0.35, rimIntensity: 0.74,
      artworkProtection: 0.62, heroProtection: 0.76, shadowOpacity: 0.44, shadowSoftness: 46,
      shadowDistance: 92, contactStrength: 0.5, backgroundSpill: 0.5, spillFocus: 0.58,
      gobo: "edge", goboStrength: 0.28, breath: 0.32,
    },
  ),
  rig(
    "overcast-window",
    "Overcast Window",
    "CLOUD-SOFT DAYLIGHT · ALMOST SHADOWLESS",
    "Broad cool daylight and barely-there cast shadow. Quiet dimension while protecting every authored colour decision.",
    "Drama, documentary, architecture, restrained editorial.",
    "Scenes that need an obvious source, hard edge, or dramatic depth cue.",
    ["card", "paper", "silk", "gel"],
    [],
    {
      space: "stage", motionMode: "breathe", motionSpeed: 1,
      keyColor: "#e8f0ff", fillColor: "#d8d2c5", shadowColor: "#151820",
      azimuth: 118, elevation: 64, keyIntensity: 0.62, fillIntensity: 0.72, rimIntensity: 0.05,
      artworkProtection: 0.94, heroProtection: 0.94, shadowOpacity: 0.18, shadowSoftness: 112,
      shadowDistance: 30, contactStrength: 0.34, backgroundSpill: 0.38, spillFocus: 1.18,
      gobo: "overcast", goboStrength: 0.08, breath: 0.06,
    },
  ),
  rig(
    "moon-pool",
    "Moon Pool",
    "COLD CIRCLE · DEEP BLUE AIR",
    "A high cool pool with a slow orbital drift, soft enough for dream logic and severe enough for night.",
    "Fantasy, dream, night exteriors, solitude.",
    "Daylight realism, warm domesticity, or colour-critical natural skin treatment.",
    ["silk", "gel", "paper"],
    ["cool-colour-shift"],
    {
      space: "stage", motionMode: "orbit", motionSpeed: 1,
      keyColor: "#cadcff", fillColor: "#24345e", shadowColor: "#02040d",
      azimuth: -104, elevation: 74, keyIntensity: 0.88, fillIntensity: 0.18, rimIntensity: 0.34,
      artworkProtection: 0.7, heroProtection: 0.86, shadowOpacity: 0.46, shadowSoftness: 82,
      shadowDistance: 44, contactStrength: 0.52, backgroundSpill: 0.74, spillFocus: 0.46,
      gobo: "moon", goboStrength: 0.3, breath: 0.2,
    },
  ),
  rig(
    "sodium-vapor",
    "Sodium Vapor",
    "STREET AMBER · HARD URBAN CAST",
    "A narrow amber street source with dirty green fill and an assertive cast. Industrial, lonely, and materially specific.",
    "Crime, urban night, road films, industrial work.",
    "Warm tenderness, neutral evidence, or clean architectural daylight.",
    ["card", "gel", "paper"],
    ["warm-colour-shift", "flicker-with-held-poses"],
    {
      space: "stage", motionMode: "flicker", motionSpeed: 2,
      keyColor: "#ffac38", fillColor: "#6d7d62", shadowColor: "#170b02",
      azimuth: 152, elevation: 34, keyIntensity: 1.18, fillIntensity: 0.18, rimIntensity: 0.08,
      artworkProtection: 0.58, heroProtection: 0.74, shadowOpacity: 0.58, shadowSoftness: 28,
      shadowDistance: 126, contactStrength: 0.78, backgroundSpill: 0.66, spillFocus: 0.42,
      gobo: "sodium", goboStrength: 0.42, breath: 0.22,
    },
  ),
  rig(
    "lantern-flicker",
    "Lantern Flicker",
    "WARM LOCAL SOURCE · IMPERFECT PULSE",
    "A small warm source bound to each card, with deterministic asymmetric flicker and intimate falloff.",
    "Folklore, ritual, historical drama, intimate horror.",
    "Neutral modernism, clean data, or any scene that needs stage-fixed photographic light.",
    ["paper", "card", "silk"],
    ["flicker-with-held-poses", "card-bound-light"],
    {
      space: "card", motionMode: "flicker", motionSpeed: 3,
      keyColor: "#ffb05a", fillColor: "#6b3441", shadowColor: "#1a0805",
      azimuth: 58, elevation: 38, keyIntensity: 1.22, fillIntensity: 0.24, rimIntensity: 0.16,
      artworkProtection: 0.66, heroProtection: 0.8, shadowOpacity: 0.52, shadowSoftness: 48,
      shadowDistance: 86, contactStrength: 0.7, backgroundSpill: 0.46, spillFocus: 0.38,
      gobo: "lantern", goboStrength: 0.34, breath: 0.34,
    },
  ),
  rig(
    "fluorescent-flat",
    "Fluorescent Flat",
    "CEILING STRIP · INSTITUTIONAL UNEASE",
    "Cool overhead light, broad shallow shadow, and a nearly static ceiling field. Clinical rather than glossy.",
    "Workplace, hospital, bureaucracy, procedural stories.",
    "Romance, natural warmth, or scenes requiring sculptural directional modelling.",
    ["card", "paper"],
    ["flicker-with-held-poses", "cool-colour-shift"],
    {
      space: "stage", motionMode: "flicker", motionSpeed: 4,
      keyColor: "#d8ffe8", fillColor: "#b4c7d8", shadowColor: "#11181a",
      azimuth: 90, elevation: 82, keyIntensity: 0.74, fillIntensity: 0.68, rimIntensity: 0.02,
      artworkProtection: 0.9, heroProtection: 0.92, shadowOpacity: 0.24, shadowSoftness: 68,
      shadowDistance: 22, contactStrength: 0.46, backgroundSpill: 0.5, spillFocus: 1.12,
      gobo: "ceiling", goboStrength: 0.16, breath: 0.12,
    },
  ),
  rig(
    "headlight-sweep",
    "Headlight Sweep",
    "TWIN BEAMS · TRAVELLING URGENCY",
    "Two hard travelling beams rake across the stage with a long directional cast. Built for momentum rather than ambience.",
    "Thriller, chase, road night, kinetic suspense.",
    "Patient reading, small typography, quiet documentary, or static compositions.",
    ["card", "gel"],
    ["long-shadow", "fast-light-motion", "low-artwork-protection"],
    {
      space: "stage", motionMode: "sweep", motionSpeed: 3,
      keyColor: "#fff7df", fillColor: "#48627f", shadowColor: "#020409",
      azimuth: -8, elevation: 12, keyIntensity: 1.38, fillIntensity: 0.14, rimIntensity: 0.22,
      artworkProtection: 0.52, heroProtection: 0.8, shadowOpacity: 0.68, shadowSoftness: 24,
      shadowDistance: 178, contactStrength: 0.84, backgroundSpill: 0.8, spillFocus: 0.32,
      gobo: "headlights", goboStrength: 0.54, breath: 0.42,
    },
  ),
] as const;

export function lightingRecipe(id: string): LightingRecipe {
  const recipe = LIGHTING_RECIPES.find((entry) => entry.id === id);
  if (!recipe) throw new Error(`Unknown lighting rig: ${id}`);
  return recipe;
}

function lightingRecipeValues(settings: LightingSettings): Omit<LightingSettings, "enabled" | "presetId"> {
  const { enabled: _enabled, presetId: _presetId, ...values } = settings;
  return values;
}

export function applyLightingRecipe(project: DriftProjectV3, id: string): DriftProjectV3 {
  const recipe = lightingRecipe(id);
  const enabled = project.lighting.enabled;
  project.lighting = {
    enabled,
    presetId: recipe.id,
    ...recipe.lighting,
  };
  project.provenance.recipes.lighting = recipeReference(
    `lighting/${recipe.id}`,
    recipe.version,
    recipe.lighting,
  );
  return project;
}

export function detectLightingRecipe(project: DriftProjectV3): LightingRecipe | null {
  const values = lightingRecipeValues(project.lighting);
  return LIGHTING_RECIPES.find((recipe) => (
    project.lighting.presetId === recipe.id
    && JSON.stringify(values) === JSON.stringify(recipe.lighting)
  )) ?? null;
}

export function refreshLightingProvenance(project: DriftProjectV3): DriftProjectV3 {
  const detected = detectLightingRecipe(project);
  project.provenance.recipes.lighting = detected
    ? recipeReference(`lighting/${detected.id}`, detected.version, detected.lighting)
    : recipeReference("lighting/custom", LIGHTING_RECIPE_VERSION, lightingRecipeValues(project.lighting));
  return project;
}

export function applyLightingCommand(id: string): ProjectCommand {
  return {
    id: `apply-lighting:${id}`,
    source: "lighting-rig",
    ownedDomains: ["lighting", "provenance"],
    apply: (project) => applyLightingRecipe(project, id),
  };
}
