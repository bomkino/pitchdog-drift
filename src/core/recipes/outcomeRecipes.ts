import type {
  DriftJsonValue,
  DriftProjectV4,
  MotionSettings,
} from "../project/schema";
import { countMovingMedia } from "../project/movingMedia";
import type {
  ProjectV4Command,
  ProjectV4CommandDomain,
} from "../commands/projectCommand";
import { recipeFingerprint } from "./fingerprint";
import {
  MOVEMENT_GRAMMAR_EXTENSION_KEY,
  withMovementGrammar,
  type MovementGrammar,
} from "../timeline/movementGrammar";
import {
  createPerformanceLifecycle,
  type PerformanceLifecycleAuthoring,
} from "../timeline/performanceLifecycle";
import {
  SEQUENCE_EXTENSION_KEY,
  withSequenceAuthoring,
  type SequenceAuthoring,
} from "../timeline/sequenceAuthoring";
import {
  DEFAULT_SECONDS_PER_SLIDE,
  TIMING_EXTENSION_KEY,
  applyTimingResolution,
  readTimingIntent,
  resolveProjectTiming,
  withTimingIntent,
  type TimingIntent,
} from "../timeline/timingIntent";

export const OUTCOME_RECIPE_EXTENSION_KEY = "dog.pitch.drift.outcome-recipe" as const;
export const OUTCOME_RECIPE_SCHEMA_VERSION = 1 as const;

export const OUTCOME_RECIPE_IDS = [
  "smooth-carousel",
  "slow-cinema",
  "editorial-holds",
  "casino-reveal",
] as const;

export type OutcomeRecipeId = (typeof OUTCOME_RECIPE_IDS)[number];
export type OutcomeRecipeIdentity = OutcomeRecipeId | "custom";
export type OutcomeRecipeOwnedDomain = "motion" | "performance" | "timing" | "sequence";

export type OutcomeRecipeOwnedPath =
  | "motion.cadence"
  | "motion.performance.linger"
  | "motion.performance.imperfection"
  | "motion.path"
  | "performance.transitionPreset"
  | "performance.entry"
  | "performance.body"
  | "performance.exit"
  | "performance.repeat"
  | "master.duration"
  | `extensions.${typeof MOVEMENT_GRAMMAR_EXTENSION_KEY}`
  | `extensions.${typeof SEQUENCE_EXTENSION_KEY}`
  | `extensions.${typeof TIMING_EXTENSION_KEY}`
  | `extensions.${typeof OUTCOME_RECIPE_EXTENSION_KEY}`;

interface OutcomeMotionValues {
  readonly cadence: MotionSettings["cadence"];
  readonly performance: Pick<MotionSettings["performance"], "linger" | "imperfection">;
  readonly path: MotionSettings["path"];
}

export interface OutcomeRecipeDefinition {
  readonly id: OutcomeRecipeId;
  readonly label: string;
  readonly description: string;
  readonly changesSummary: string;
  readonly axisCompatibility: "horizontal-and-vertical";
  readonly ownedDomains: readonly OutcomeRecipeOwnedDomain[];
  readonly ownedPaths: readonly OutcomeRecipeOwnedPath[];
  readonly grammar: MovementGrammar;
  readonly motion: OutcomeMotionValues;
  readonly timing: TimingIntent;
  readonly sequence: SequenceAuthoring;
}

export interface OutcomeRecipeReference {
  readonly schemaVersion: typeof OUTCOME_RECIPE_SCHEMA_VERSION;
  readonly id: OutcomeRecipeId;
  readonly ownedFingerprint: string;
}

const OWNED_DOMAINS = ["motion", "performance", "timing", "sequence"] as const;
const OWNED_PATHS = [
  "motion.cadence",
  "motion.performance.linger",
  "motion.performance.imperfection",
  "motion.path",
  "performance.transitionPreset",
  "performance.entry",
  "performance.body",
  "performance.exit",
  "performance.repeat",
  "master.duration",
  `extensions.${MOVEMENT_GRAMMAR_EXTENSION_KEY}`,
  `extensions.${SEQUENCE_EXTENSION_KEY}`,
  `extensions.${TIMING_EXTENSION_KEY}`,
  `extensions.${OUTCOME_RECIPE_EXTENSION_KEY}`,
] as const satisfies readonly OutcomeRecipeOwnedPath[];

function oneReadablePass(id: string, label = "READ ×1"): SequenceAuthoring {
  return {
    schemaVersion: 1,
    groups: [{
      id,
      label,
      passes: 1,
      pace: "read",
      relativeSecondsPerPass: 1,
    }],
    repeatCount: 1,
  };
}

const CASINO_SEQUENCE: SequenceAuthoring = {
  schemaVersion: 1,
  groups: [
    {
      id: "fast-open",
      label: "FAST ×2",
      passes: 2,
      pace: "fast",
      relativeSecondsPerPass: 0.22,
    },
    {
      id: "read-reveal",
      label: "READ ×1",
      passes: 1,
      pace: "read",
      relativeSecondsPerPass: 1,
    },
    {
      id: "fast-close",
      label: "FAST ×1",
      passes: 1,
      pace: "fast",
      relativeSecondsPerPass: 0.22,
    },
  ],
  repeatCount: 1,
};

export const OUTCOME_RECIPES: readonly OutcomeRecipeDefinition[] = [
  {
    id: "smooth-carousel",
    label: "Smooth Carousel — Safe Default",
    description: "One readable deck pass with uninterrupted glide and almost-flat ribbon depth.",
    changesSummary: "Changes Motion, Performance, Timing, and Sequence: continuous glide, one 0.90 s-per-slide pass, restrained ribbon, entry and exit off.",
    axisCompatibility: "horizontal-and-vertical",
    ownedDomains: OWNED_DOMAINS,
    ownedPaths: OWNED_PATHS,
    grammar: "continuous-glide",
    motion: {
      cadence: {
        cutId: "outcome-smooth-carousel",
        read: 0.08,
        anticipation: 0.04,
        carry: 0.72,
        impact: 0.03,
        settle: 0.06,
        land: 0.07,
        poseCadence: "continuous",
      },
      performance: { linger: 0.12, imperfection: 0.01 },
      path: {
        id: "ribbon",
        gap: 0.2,
        curvature: 0.1,
        depth: 0.055,
        banking: 1.5,
        focusScale: 0.025,
        edgeFade: 0.12,
      },
    },
    timing: { schemaVersion: 1, mode: "content-paced", secondsPerSlide: 0.9 },
    sequence: oneReadablePass("smooth-read"),
  },
  {
    id: "slow-cinema",
    label: "Slow Cinema",
    description: "Patient continuous reading with shallow arc depth and restrained drift.",
    changesSummary: "Changes Motion, Performance, Timing, and Sequence: continuous glide, one 1.60 s-per-slide pass, shallow arc, entry and exit off.",
    axisCompatibility: "horizontal-and-vertical",
    ownedDomains: OWNED_DOMAINS,
    ownedPaths: OWNED_PATHS,
    grammar: "continuous-glide",
    motion: {
      cadence: {
        cutId: "outcome-slow-cinema",
        read: 0.16,
        anticipation: 0.05,
        carry: 0.56,
        impact: 0.03,
        settle: 0.08,
        land: 0.12,
        poseCadence: "continuous",
      },
      performance: { linger: 0.34, imperfection: 0.025 },
      path: {
        id: "arc",
        gap: 0.28,
        curvature: 0.2,
        depth: 0.11,
        banking: 2.25,
        focusScale: 0.045,
        edgeFade: 0.18,
      },
    },
    timing: { schemaVersion: 1, mode: "content-paced", secondsPerSlide: 1.6 },
    sequence: oneReadablePass("slow-read"),
  },
  {
    id: "editorial-holds",
    label: "Editorial Holds",
    description: "Readable stops and deliberate carries make each claim land before the next arrives.",
    changesSummary: "Changes Motion, Performance, Timing, and Sequence: editorial hold grammar, one 1.20 s-per-slide pass, shallow ribbon, entry and exit off.",
    axisCompatibility: "horizontal-and-vertical",
    ownedDomains: OWNED_DOMAINS,
    ownedPaths: OWNED_PATHS,
    grammar: "editorial-holds",
    motion: {
      cadence: {
        cutId: "outcome-editorial-holds",
        read: 0.28,
        anticipation: 0.08,
        carry: 0.3,
        impact: 0.06,
        settle: 0.1,
        land: 0.18,
        poseCadence: "continuous",
      },
      performance: { linger: 0.42, imperfection: 0.018 },
      path: {
        id: "ribbon",
        gap: 0.24,
        curvature: 0.16,
        depth: 0.075,
        banking: 2.5,
        focusScale: 0.035,
        edgeFade: 0.15,
      },
    },
    timing: { schemaVersion: 1, mode: "content-paced", secondsPerSlide: 1.2 },
    sequence: oneReadablePass("editorial-read"),
  },
  {
    id: "casino-reveal",
    label: "Casino Reveal",
    description: "Two fast deck spins, one readable reveal, then one fast closing spin.",
    changesSummary: "Changes Motion, Performance, Timing, and Sequence: continuous glide and FAST ×2, READ ×1, FAST ×1 with a protected 0.90 s-per-slide reveal; entry and exit off. Choose Exact length only when you want to squeeze the sequence into a fixed runtime.",
    axisCompatibility: "horizontal-and-vertical",
    ownedDomains: OWNED_DOMAINS,
    ownedPaths: OWNED_PATHS,
    grammar: "continuous-glide",
    motion: {
      cadence: {
        cutId: "outcome-casino-reveal",
        read: 0.06,
        anticipation: 0.03,
        carry: 0.79,
        impact: 0.03,
        settle: 0.04,
        land: 0.05,
        poseCadence: "continuous",
      },
      performance: { linger: 0.08, imperfection: 0.008 },
      path: {
        id: "ribbon",
        gap: 0.18,
        curvature: 0.13,
        depth: 0.065,
        banking: 2,
        focusScale: 0.03,
        edgeFade: 0.11,
      },
    },
    timing: { schemaVersion: 1, mode: "content-paced", secondsPerSlide: 0.9 },
    sequence: CASINO_SEQUENCE,
  },
] as const;

function isOutcomeRecipeId(value: unknown): value is OutcomeRecipeId {
  return typeof value === "string" && OUTCOME_RECIPE_IDS.includes(value as OutcomeRecipeId);
}

export function getOutcomeRecipe(id: OutcomeRecipeId): OutcomeRecipeDefinition {
  const recipe = OUTCOME_RECIPES.find((candidate) => candidate.id === id);
  if (!recipe) throw new Error(`Unknown outcome recipe: ${id}`);
  return recipe;
}

function withoutOutcomeReference(project: DriftProjectV4): DriftProjectV4 {
  if (!Object.prototype.hasOwnProperty.call(project.extensions, OUTCOME_RECIPE_EXTENSION_KEY)) {
    return project;
  }
  const extensions = { ...project.extensions };
  delete extensions[OUTCOME_RECIPE_EXTENSION_KEY];
  return { ...project, extensions };
}

function noTransitionPerformance(project: DriftProjectV4, bodyDuration: number): PerformanceLifecycleAuthoring {
  return createPerformanceLifecycle({
    transitionPreset: "quiet-lift",
    entry: { enabled: false },
    body: { durationSeconds: bodyDuration, tempo: { kind: "preset", preset: "even" } },
    exit: { enabled: false },
    repeat: { mode: "off" },
    ...(project.performance.reducedMotion === undefined
      ? {}
      : { reducedMotion: project.performance.reducedMotion }),
  }).authoring;
}

function applyMotionValues(project: DriftProjectV4, values: OutcomeMotionValues): DriftProjectV4 {
  return {
    ...project,
    motion: {
      ...project.motion,
      cadence: { ...values.cadence },
      performance: { ...project.motion.performance, ...values.performance },
      path: { ...values.path },
    },
    performance: noTransitionPerformance(project, project.master.duration),
  };
}

function ownedValue(project: DriftProjectV4): unknown {
  return {
    motion: {
      cadence: project.motion.cadence,
      performance: {
        linger: project.motion.performance.linger,
        imperfection: project.motion.performance.imperfection,
      },
      path: project.motion.path,
    },
    performance: {
      transitionPreset: project.performance.transitionPreset ?? null,
      entry: project.performance.entry,
      body: project.performance.body,
      exit: project.performance.exit,
      repeat: project.performance.repeat,
    },
    masterDuration: project.master.duration,
    movementGrammar: project.extensions[MOVEMENT_GRAMMAR_EXTENSION_KEY] ?? null,
    sequence: project.extensions[SEQUENCE_EXTENSION_KEY] ?? null,
    timing: project.extensions[TIMING_EXTENSION_KEY] ?? null,
  };
}

function ownedFingerprint(project: DriftProjectV4, id: OutcomeRecipeId): string {
  return recipeFingerprint(`outcome-recipe/${id}`, OUTCOME_RECIPE_SCHEMA_VERSION, ownedValue(project));
}

function withOutcomeReference(project: DriftProjectV4, id: OutcomeRecipeId): DriftProjectV4 {
  const reference: DriftJsonValue = {
    schemaVersion: OUTCOME_RECIPE_SCHEMA_VERSION,
    id,
    ownedFingerprint: ownedFingerprint(project, id),
  };
  return {
    ...project,
    extensions: {
      ...project.extensions,
      [OUTCOME_RECIPE_EXTENSION_KEY]: reference,
    },
  };
}

export function parseOutcomeRecipeReference(value: unknown): OutcomeRecipeReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 3
    || keys[0] !== "id"
    || keys[1] !== "ownedFingerprint"
    || keys[2] !== "schemaVersion"
    || record.schemaVersion !== OUTCOME_RECIPE_SCHEMA_VERSION
    || !isOutcomeRecipeId(record.id)
    || typeof record.ownedFingerprint !== "string"
    || record.ownedFingerprint.length === 0
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: OUTCOME_RECIPE_SCHEMA_VERSION,
    id: record.id,
    ownedFingerprint: record.ownedFingerprint,
  });
}

/** Custom is derived from owned-value drift; unowned Look, media, pin, axis, and direction are ignored. */
export function detectOutcomeRecipe(project: DriftProjectV4): OutcomeRecipeIdentity {
  const reference = parseOutcomeRecipeReference(project.extensions[OUTCOME_RECIPE_EXTENSION_KEY]);
  if (!reference) return "custom";
  return reference.ownedFingerprint === ownedFingerprint(project, reference.id)
    ? reference.id
    : "custom";
}

/** Pure complete outcome application; timestamp and revision remain reducer-owned. */
export function applyOutcomeRecipe(project: DriftProjectV4, id: OutcomeRecipeId): DriftProjectV4 {
  const recipe = getOutcomeRecipe(id);
  let next = applyMotionValues(project, recipe.motion);
  next = withMovementGrammar(next, { schemaVersion: 1, grammar: recipe.grammar });
  next = withSequenceAuthoring(next, recipe.sequence);
  next = withTimingIntent(next, recipe.timing);
  const movingSlideCount = countMovingMedia(next);
  if (recipe.timing.mode === "content-paced") {
    next = applyTimingResolution(
      next,
      resolveProjectTiming(next, movingSlideCount, recipe.timing),
    );
  }
  return withOutcomeReference(next, id);
}

/**
 * Reconciles stored Reading Pace after media or pin changes. Timing authority
 * survives visual or motion customization: changing a World must not turn a
 * later pin into an unresolved master. A still-valid outcome reference is
 * refreshed; Custom projects remain Custom while their authored pace holds.
 */
export function reconcileOutcomeRecipeTiming(project: DriftProjectV4): DriftProjectV4 {
  const timing = readTimingIntent(project);
  if (timing.status !== "stored" || timing.intent.mode !== "content-paced") return project;

  const identity = detectOutcomeRecipe(project);
  const resolution = resolveProjectTiming(project, countMovingMedia(project), timing.intent);
  const reconciled = applyTimingResolution(project, resolution);
  if (identity === "custom") {
    return reconciled.master.duration === project.master.duration
        && reconciled.performance.body.durationSeconds === project.performance.body.durationSeconds
      ? project
      : reconciled;
  }

  const reference = parseOutcomeRecipeReference(project.extensions[OUTCOME_RECIPE_EXTENSION_KEY]);
  if (!reference) return reconciled;
  if (ownedFingerprint(reconciled, identity) === reference.ownedFingerprint) return project;
  return withOutcomeReference(reconciled, identity);
}

export function applyOutcomeRecipeCommand(id: OutcomeRecipeId): ProjectV4Command {
  const recipeId = getOutcomeRecipe(id).id;
  const ownedDomains: readonly ProjectV4CommandDomain[] = [
    "motion",
    "performance",
    "master",
    "compatibility",
  ];
  return {
    id: `outcome-recipe.${recipeId}`,
    source: "outcome-recipe",
    ownedDomains,
    apply: (project) => applyOutcomeRecipe(project, recipeId),
  };
}

/** New-document/UI integration point. Existing projects remain untouched until explicitly chosen. */
export function applySafeStartOutcome(project: DriftProjectV4): DriftProjectV4 {
  return applyOutcomeRecipe(project, "smooth-carousel");
}

/** Resets motion feel and lifecycle only. Existing timing, sequence, Look, media, and pin survive. */
export function resetMotion(project: DriftProjectV4): DriftProjectV4 {
  const smooth = getOutcomeRecipe("smooth-carousel");
  let next = applyMotionValues(project, smooth.motion);
  next = withMovementGrammar(next, { schemaVersion: 1, grammar: smooth.grammar });
  return withoutOutcomeReference(next);
}

export function resetMotionCommand(): ProjectV4Command {
  return {
    id: "outcome-reset.motion",
    source: "outcome-reset",
    ownedDomains: ["motion", "performance", "compatibility"],
    apply: resetMotion,
  };
}

/** Resets pass/timing authority only. Existing motion feel, lifecycle, master, Look, media, and pin survive. */
export function resetSequence(project: DriftProjectV4): DriftProjectV4 {
  let next = withSequenceAuthoring(project, oneReadablePass("reset-read"));
  next = withTimingIntent(next, {
    schemaVersion: 1,
    mode: "fixed-master",
    secondsPerSlide: DEFAULT_SECONDS_PER_SLIDE,
  });
  return withoutOutcomeReference(next);
}

export function resetSequenceCommand(): ProjectV4Command {
  return {
    id: "outcome-reset.sequence",
    source: "outcome-reset",
    ownedDomains: ["compatibility"],
    apply: resetSequence,
  };
}
