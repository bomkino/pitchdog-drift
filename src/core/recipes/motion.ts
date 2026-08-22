import type { ProjectCommand } from "../commands/projectCommand";
import type {
  DriftProjectV3,
  MotionCharacterId,
  MotionSettings,
  PoseCadence,
  RecipeReference,
} from "../project/schema";
import { recipeReference } from "./fingerprint";

export const MOTION_RECIPE_VERSION = 1 as const;

export interface EditorialCutRecipe {
  id: string;
  version: typeof MOTION_RECIPE_VERSION;
  name: string;
  eyebrow: string;
  description: string;
  bestFor: string;
  avoidWhen: string;
  tags: readonly string[];
  transport: Pick<MotionSettings["transport"], "axis" | "direction" | "slidesPerSecond">;
  cadence: Omit<MotionSettings["cadence"], "cutId" | "poseCadence">;
}

export interface PerformanceRecipe {
  id: string;
  version: typeof MOTION_RECIPE_VERSION;
  name: string;
  eyebrow: string;
  description: string;
  bestFor: string;
  avoidWhen: string;
  tags: readonly string[];
  suggestedSlidesPerSecond: number;
  poseCadence: PoseCadence;
  performance: Omit<MotionSettings["performance"], "id" | "take">;
}

export interface MotionCharacterRecipe {
  id: MotionCharacterId;
  version: typeof MOTION_RECIPE_VERSION;
  name: string;
  description: string;
  bestFor: string;
  amount: number;
}

export const EDITORIAL_CUTS: readonly EditorialCutRecipe[] = [
  {
    id: "explainer-cut",
    version: MOTION_RECIPE_VERSION,
    name: "Explainer Cut",
    eyebrow: "THESIS → PROOF",
    description: "Clear reads, decisive carries, and a restrained physical landing. Each claim feels placed rather than scrolled.",
    bestFor: "Short arguments, comparisons, before/after slides, and concise visual explainers.",
    avoidWhen: "The deck depends on patient image study or long reflective pauses.",
    tags: ["editorial", "clear", "argument", "social", "evidence"],
    transport: { axis: "horizontal", direction: -1, slidesPerSecond: 0.5 },
    cadence: { read: 0.32, anticipation: 0.07, carry: 0.31, impact: 0.07, settle: 0.09, land: 0.14 },
  },
  {
    id: "paper-argument",
    version: MOTION_RECIPE_VERSION,
    name: "Paper Argument",
    eyebrow: "PRESENTED ESSAY",
    description: "A slower vertical reading rhythm with longer rests, a visible hinge, and page-to-page continuity.",
    bestFor: "Presenter-led essays, treatments, notes, mood pages, and reflective visual writing.",
    avoidWhen: "The sequence must feel terse, graphic, or aggressively compressed.",
    tags: ["paper", "essay", "vertical", "presenter", "reflective"],
    transport: { axis: "vertical", direction: -1, slidesPerSecond: 0.34 },
    cadence: { read: 0.39, anticipation: 0.06, carry: 0.25, impact: 0.05, settle: 0.1, land: 0.15 },
  },
  {
    id: "clean-data",
    version: MOTION_RECIPE_VERSION,
    name: "Clean Data",
    eyebrow: "READABILITY FIRST",
    description: "A direct evidence rhythm: enough hold to inspect detail, a clean transfer, and almost no decorative punctuation.",
    bestFor: "Charts, timelines, diagrams, tables, small typography, and evidence-heavy decks.",
    avoidWhen: "The emotional effect depends on suspense, tactility, or expressive arrival.",
    tags: ["data", "graphic", "clean", "readable", "evidence"],
    transport: { axis: "horizontal", direction: -1, slidesPerSecond: 0.62 },
    cadence: { read: 0.29, anticipation: 0.025, carry: 0.39, impact: 0.025, settle: 0.06, land: 0.21 },
  },
  {
    id: "documentary-glide",
    version: MOTION_RECIPE_VERSION,
    name: "Documentary Glide",
    eyebrow: "IMAGE-LED",
    description: "Patient looking time, quiet lateral travel, and a soft hand-off that does not turn portraits into effects.",
    bestFor: "Portraits, archive, photography-led stories, locations, and atmospheric chapters.",
    avoidWhen: "The deck needs rapid argumentative comparison or dense sequential proof.",
    tags: ["documentary", "portrait", "archive", "patient", "photography"],
    transport: { axis: "horizontal", direction: -1, slidesPerSecond: 0.28 },
    cadence: { read: 0.42, anticipation: 0.035, carry: 0.245, impact: 0.035, settle: 0.075, land: 0.19 },
  },
] as const;

export const PERFORMANCE_RECIPES: readonly PerformanceRecipe[] = [
  {
    id: "long-take",
    version: MOTION_RECIPE_VERSION,
    name: "Long Take",
    eyebrow: "PATIENT · WEIGHTED · OBSERVANT",
    description: "A camera that waits: gentle departure, a readable focal beat, and a soft return to momentum.",
    bestFor: "Narrative decks, emotional reveals, elegant vertical runs.",
    avoidWhen: "The sequence must deliver many claims inside a very short master.",
    tags: ["patient", "cinematic", "weighted", "narrative"],
    suggestedSlidesPerSecond: 0.24,
    poseCadence: "continuous",
    performance: { weight: 0.72, linger: 0.48, release: 0.72, runway: 1, overlap: 0.22, imperfection: 0.04 },
  },
  {
    id: "cut-on-breath",
    version: MOTION_RECIPE_VERSION,
    name: "Cut on Breath",
    eyebrow: "EDITORIAL · LUCID · DECISIVE",
    description: "Clear twenty-four-frame phrasing with small reading windows and clean exits instead of mechanical constant speed.",
    bestFor: "Case studies, documentary decks, and information-dense slides.",
    avoidWhen: "A handmade held-frame language is more important than editorial clarity.",
    tags: ["editorial", "24fps", "decisive", "clear"],
    suggestedSlidesPerSecond: 0.38,
    poseCadence: "24fps",
    performance: { weight: 0.52, linger: 0.3, release: 0.36, runway: 0.72, overlap: 0.12, imperfection: 0.03 },
  },
  {
    id: "twelve-frame-hand",
    version: MOTION_RECIPE_VERSION,
    name: "Twelve-Frame Hand",
    eyebrow: "HELD · TACTILE · HANDMADE",
    description: "Deliberate twelve-frame poses carried inside a smooth delivery master. The scene moves by authored holds.",
    bestFor: "Illustration, collage, process films, analogue and playful work.",
    avoidWhen: "Very fast travel would create large jumps between held poses.",
    tags: ["12fps", "held", "handmade", "collage"],
    suggestedSlidesPerSecond: 0.3,
    poseCadence: "12fps",
    performance: { weight: 0.64, linger: 0.2, release: 0.58, runway: 0.86, overlap: 0.28, imperfection: 0.32 },
  },
  {
    id: "silk-dolly",
    version: MOTION_RECIPE_VERSION,
    name: "Silk Dolly",
    eyebrow: "FLOATING · CLOSE · CONTINUOUS",
    description: "Light primary movement with generous secondary overlap. Frames seem to follow one another through the same air.",
    bestFor: "Romance, fashion, travel, music, and luminous presentation work.",
    avoidWhen: "Charts or hard evidence need visibly disciplined placement.",
    tags: ["silk", "floating", "romance", "fashion", "continuous"],
    suggestedSlidesPerSecond: 0.2,
    poseCadence: "continuous",
    performance: { weight: 0.34, linger: 0.16, release: 0.82, runway: 1, overlap: 0.48, imperfection: 0.08 },
  },
  {
    id: "held-nerve",
    version: MOTION_RECIPE_VERSION,
    name: "Held Nerve",
    eyebrow: "TENSE · RELUCTANT · WATCHFUL",
    description: "Eighteen-frame tension, longer focal hesitation, and restrained instability. Unease without random shaking.",
    bestFor: "Horror, thriller, investigation, and ominous reveals.",
    avoidWhen: "The subject needs warmth, ease, or a neutral evidence tone.",
    tags: ["18fps", "tension", "horror", "watchful"],
    suggestedSlidesPerSecond: 0.18,
    poseCadence: "18fps",
    performance: { weight: 0.78, linger: 0.56, release: 0.44, runway: 0.9, overlap: 0.2, imperfection: 0.24 },
  },
  {
    id: "forward-rush",
    version: MOTION_RECIPE_VERSION,
    name: "Forward Rush",
    eyebrow: "PROPULSIVE · GRAPHIC · BRIGHT",
    description: "Fast twenty-four-frame movement with short focal beats and enough follow-through to feel physical rather than slick.",
    bestFor: "Trailers, music, sport, and punchy horizontal sequences.",
    avoidWhen: "Dense text needs more than a glance or the master already contains many loops.",
    tags: ["24fps", "fast", "music", "graphic", "kinetic"],
    suggestedSlidesPerSecond: 0.64,
    poseCadence: "24fps",
    performance: { weight: 0.42, linger: 0.08, release: 0.28, runway: 0.56, overlap: 0.34, imperfection: 0.12 },
  },
] as const;

export const MOTION_CHARACTERS: readonly MotionCharacterRecipe[] = [
  { id: "direct", version: 1, name: "Direct", description: "Immediate, disciplined movement with almost no residual coast.", bestFor: "Evidence, charts, compact arguments.", amount: 0 },
  { id: "weighted", version: 1, name: "Weighted", description: "Restrained mass and a short cinematic gathering of pace.", bestFor: "General narrative and editorial work.", amount: 0.62 },
  { id: "spring", version: 1, name: "Spring", description: "A visible but bounded pulse that recovers quickly.", bestFor: "Graphic, playful, energetic material.", amount: 0.58 },
  { id: "drift", version: 1, name: "Drift", description: "A broad release and the longest quiet coast.", bestFor: "Photography, travel, atmosphere, memory.", amount: 0.72 },
] as const;

function cutById(id: string): EditorialCutRecipe {
  const recipe = EDITORIAL_CUTS.find((entry) => entry.id === id);
  if (!recipe) throw new Error(`Unknown editorial cut: ${id}`);
  return recipe;
}

function performanceById(id: string): PerformanceRecipe {
  const recipe = PERFORMANCE_RECIPES.find((entry) => entry.id === id);
  if (!recipe) throw new Error(`Unknown performance recipe: ${id}`);
  return recipe;
}

function characterById(id: MotionCharacterId): MotionCharacterRecipe {
  const recipe = MOTION_CHARACTERS.find((entry) => entry.id === id);
  if (!recipe) throw new Error(`Unknown motion character: ${id}`);
  return recipe;
}

function motionReference(project: DriftProjectV3): RecipeReference {
  return recipeReference("motion-stack", MOTION_RECIPE_VERSION, {
    cut: project.motion.cadence.cutId,
    performance: project.motion.performance.id,
    character: project.motion.character.id,
    path: project.motion.path.id,
    transport: project.motion.transport,
    cadence: project.motion.cadence,
    performanceValues: project.motion.performance,
    characterValues: project.motion.character,
    pathValues: project.motion.path,
  });
}

function withMotionProvenance(project: DriftProjectV3): DriftProjectV3 {
  project.provenance.recipes.motion = motionReference(project);
  return project;
}

export function applyEditorialCut(project: DriftProjectV3, id: string): DriftProjectV3 {
  const recipe = cutById(id);
  project.motion.transport = { ...recipe.transport };
  project.motion.cadence = {
    ...project.motion.cadence,
    ...recipe.cadence,
    cutId: recipe.id,
  };
  return withMotionProvenance(project);
}

export function applyPerformanceRecipe(project: DriftProjectV3, id: string): DriftProjectV3 {
  const recipe = performanceById(id);
  project.motion.cadence.poseCadence = recipe.poseCadence;
  project.motion.performance = {
    ...recipe.performance,
    id: recipe.id,
    take: project.motion.performance.take,
  };
  return withMotionProvenance(project);
}

export function applyMotionCharacter(project: DriftProjectV3, id: MotionCharacterId): DriftProjectV3 {
  const recipe = characterById(id);
  project.motion.character = { id: recipe.id, amount: recipe.amount };
  return withMotionProvenance(project);
}

export function detectEditorialCut(project: DriftProjectV3): EditorialCutRecipe | null {
  const current = project.motion;
  return EDITORIAL_CUTS.find((recipe) => (
    current.cadence.cutId === recipe.id
    && JSON.stringify(current.transport) === JSON.stringify(recipe.transport)
    && JSON.stringify({
      read: current.cadence.read,
      anticipation: current.cadence.anticipation,
      carry: current.cadence.carry,
      impact: current.cadence.impact,
      settle: current.cadence.settle,
      land: current.cadence.land,
    }) === JSON.stringify(recipe.cadence)
  )) ?? null;
}

export function detectPerformanceRecipe(project: DriftProjectV3): PerformanceRecipe | null {
  const current = project.motion;
  return PERFORMANCE_RECIPES.find((recipe) => (
    current.performance.id === recipe.id
    && current.cadence.poseCadence === recipe.poseCadence
    && JSON.stringify({
      weight: current.performance.weight,
      linger: current.performance.linger,
      release: current.performance.release,
      runway: current.performance.runway,
      overlap: current.performance.overlap,
      imperfection: current.performance.imperfection,
    }) === JSON.stringify(recipe.performance)
  )) ?? null;
}

export function applyEditorialCutCommand(id: string): ProjectCommand {
  return {
    id: `apply-cut:${id}`,
    source: "editorial-cut",
    ownedDomains: ["motion", "provenance"],
    apply: (project) => applyEditorialCut(project, id),
  };
}

export function applyPerformanceCommand(id: string): ProjectCommand {
  return {
    id: `apply-performance:${id}`,
    source: "performance-recipe",
    ownedDomains: ["motion", "provenance"],
    apply: (project) => applyPerformanceRecipe(project, id),
  };
}

export function applyMotionCharacterCommand(id: MotionCharacterId): ProjectCommand {
  return {
    id: `apply-motion-character:${id}`,
    source: "motion-character",
    ownedDomains: ["motion", "provenance"],
    apply: (project) => applyMotionCharacter(project, id),
  };
}

export function refreshMotionRecipeProvenance(project: DriftProjectV3): DriftProjectV3 {
  return withMotionProvenance(project);
}
