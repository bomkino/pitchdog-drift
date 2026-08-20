import type { MotionSettings, StudioSettings } from "./model";

export type EditorialCutId =
  | "explainer-cut"
  | "paper-argument"
  | "clean-data"
  | "documentary-glide";

export interface EditorialCut {
  id: EditorialCutId;
  name: string;
  eyebrow: string;
  description: string;
  bestFor: string;
  motion: Pick<
    MotionSettings,
    | "axis"
    | "direction"
    | "speed"
    | "flow"
    | "gap"
    | "curvature"
    | "depth"
    | "tilt"
    | "distortion"
    | "focusScale"
    | "edgeFade"
    | "dragSensitivity"
  >;
}

export const EDITORIAL_CUTS: readonly EditorialCut[] = [
  {
    id: "explainer-cut",
    name: "Explainer Cut",
    eyebrow: "THESIS → PROOF",
    description: "Clear holds, decisive carries, and enough paper weight to make each claim feel placed rather than scrolled.",
    bestFor: "Short arguments, comparisons, before/after slides, and concise social explainers.",
    motion: {
      axis: "horizontal",
      direction: -1,
      speed: 0.5,
      flow: "editorial",
      gap: 0.16,
      curvature: 0.72,
      depth: 0.18,
      tilt: 4,
      distortion: 0.18,
      focusScale: 0.08,
      edgeFade: 0.62,
      dragSensitivity: 1,
    },
  },
  {
    id: "paper-argument",
    name: "Paper Argument",
    eyebrow: "PRESENTED ESSAY",
    description: "A slower vertical reading rhythm with longer rests, stronger hinge, and tactile page-to-page continuity.",
    bestFor: "Presenter-led videos, treatments, notes, mood pages, and reflective visual essays.",
    motion: {
      axis: "vertical",
      direction: -1,
      speed: 0.34,
      flow: "editorial",
      gap: 0.24,
      curvature: 0.84,
      depth: 0.26,
      tilt: 6,
      distortion: 0.1,
      focusScale: 0.1,
      edgeFade: 0.48,
      dragSensitivity: 1,
    },
  },
  {
    id: "clean-data",
    name: "Clean Data",
    eyebrow: "READABILITY FIRST",
    description: "Restrained depth and nearly flat paper behavior keep charts, timelines, and small typography legible.",
    bestFor: "Dense information, diagrams, charts, timelines, tables, and evidence-heavy decks.",
    motion: {
      axis: "horizontal",
      direction: -1,
      speed: 0.62,
      flow: "editorial",
      gap: 0.1,
      curvature: 0.54,
      depth: 0.08,
      tilt: 1.5,
      distortion: 0.04,
      focusScale: 0.04,
      edgeFade: 0.34,
      dragSensitivity: 0.85,
    },
  },
  {
    id: "documentary-glide",
    name: "Documentary Glide",
    eyebrow: "IMAGE-LED",
    description: "Quiet lateral movement, generous looking time, and soft focal lift without turning portraits into effects.",
    bestFor: "Portraits, archival material, photography-led stories, locations, and atmospheric sequences.",
    motion: {
      axis: "horizontal",
      direction: -1,
      speed: 0.28,
      flow: "editorial",
      gap: 0.22,
      curvature: 0.78,
      depth: 0.16,
      tilt: 2.5,
      distortion: 0.08,
      focusScale: 0.06,
      edgeFade: 0.22,
      dragSensitivity: 1.15,
    },
  },
] as const;

const RECIPE_KEYS = [
  "axis",
  "direction",
  "speed",
  "flow",
  "gap",
  "curvature",
  "depth",
  "tilt",
  "distortion",
  "focusScale",
  "edgeFade",
  "dragSensitivity",
] as const satisfies readonly (keyof MotionSettings)[];

const VALUE_EPSILON = 1e-6;
const DELIVERY_EPSILON = 0.015;
const DIRECTOR_SPEED_LIMIT = 1.5;
const MIN_DURATION = 3;
const MAX_DURATION = 30;
const MAX_LOOPS = 6;

function nearlyEqual(a: number, b: number, epsilon = VALUE_EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function getEditorialCut(id: EditorialCutId): EditorialCut {
  return EDITORIAL_CUTS.find((cut) => cut.id === id) ?? EDITORIAL_CUTS[0]!;
}

/** Apply only authored motion choices. Delivery, accessibility, atmosphere, media, and output remain the director's. */
export function applyEditorialCut(settings: StudioSettings, id: EditorialCutId): StudioSettings {
  const cut = getEditorialCut(id);
  return {
    ...settings,
    motion: {
      ...settings.motion,
      ...cut.motion,
    },
  };
}

export function detectEditorialCut(settings: StudioSettings): EditorialCutId | null {
  if (settings.motion.flow !== "editorial") return null;
  const match = EDITORIAL_CUTS.find((cut) => RECIPE_KEYS.every((key) => {
    const current = settings.motion[key];
    const authored = cut.motion[key as keyof typeof cut.motion];
    return typeof current === "number" && typeof authored === "number"
      ? nearlyEqual(current, authored)
      : current === authored;
  }));
  return match?.id ?? null;
}

export type DeliveryStatus =
  | "unscored"
  | "empty"
  | "still"
  | "partial"
  | "complete-open"
  | "closed"
  | "retimed"
  | "rushed";

export interface EditorialDeliveryAnalysis {
  status: DeliveryStatus;
  label: string;
  detail: string;
  sourceCount: number;
  authoredSpeed: number;
  effectiveSpeed: number;
  coveredSlides: number;
  coveredPasses: number;
  paceRatio: number | null;
  canRepair: boolean;
  repairLabel: string | null;
}

export interface CloseAtCutTempoResult {
  available: boolean;
  settings: StudioSettings;
  loops: number;
  duration: number;
  reason: string;
  label: string | null;
}

function safeSourceCount(sourceCount: number): number {
  return Number.isSafeInteger(sourceCount) && sourceCount > 0 ? sourceCount : 0;
}

function safeSpeed(settings: StudioSettings): number {
  return Number.isFinite(settings.motion.speed) ? Math.max(0, Math.abs(settings.motion.speed)) : 0;
}

function safeDuration(settings: StudioSettings): number {
  return Number.isFinite(settings.output.duration) ? Math.max(0.001, settings.output.duration) : 0.001;
}

function safeLoops(settings: StudioSettings): number {
  if (!Number.isFinite(settings.motion.seamlessLoops)) return 1;
  return Math.min(MAX_LOOPS, Math.max(1, Math.round(settings.motion.seamlessLoops)));
}

function durationForPasses(sourceCount: number, speed: number, loops: number): number {
  return (sourceCount * loops) / Math.max(1e-6, speed);
}

function roundDuration(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatSpeed(value: number): string {
  return `${value.toFixed(2)} slides/s`;
}

function formatPasses(value: number): string {
  return `${value.toFixed(value >= 10 ? 1 : 2)} deck pass${nearlyEqual(value, 1, 0.005) ? "" : "es"}`;
}

export function closeAtCutTempo(
  settings: StudioSettings,
  sourceCountInput: number,
): CloseAtCutTempoResult {
  const sourceCount = safeSourceCount(sourceCountInput);
  const speed = safeSpeed(settings);
  if (sourceCount === 0) {
    return { available: false, settings, loops: 1, duration: settings.output.duration, reason: "Add slides before fitting delivery.", label: null };
  }
  if (settings.motion.flow !== "editorial") {
    return { available: false, settings, loops: 1, duration: settings.output.duration, reason: "Choose an editorial cut before fitting delivery.", label: null };
  }
  if (settings.motion.reducedMotionOutput) {
    return { available: false, settings, loops: safeLoops(settings), duration: settings.output.duration, reason: "Disable Reduced-motion master before fitting a moving delivery.", label: null };
  }
  if (speed <= 1e-6) {
    return { available: false, settings, loops: 1, duration: settings.output.duration, reason: "Set a tempo above zero before fitting delivery.", label: null };
  }

  const feasible = Array.from({ length: MAX_LOOPS }, (_, index) => index + 1)
    .map((loops) => ({ loops, duration: durationForPasses(sourceCount, speed, loops) }))
    .filter(({ duration }) => duration >= MIN_DURATION - VALUE_EPSILON && duration <= MAX_DURATION + VALUE_EPSILON);

  if (feasible.length === 0) {
    const onePass = durationForPasses(sourceCount, speed, 1);
    return {
      available: false,
      settings,
      loops: 1,
      duration: settings.output.duration,
      reason: onePass > MAX_DURATION
        ? `One readable deck pass needs ${onePass.toFixed(1)} s. Split the deck into chapters rather than rushing it.`
        : "This cut cannot fit inside the current 3–30 second output range.",
      label: null,
    };
  }

  const requestedLoops = safeLoops(settings);
  let chosen = feasible.find((entry) => entry.loops === requestedLoops);
  if (!chosen) {
    const requestedDuration = durationForPasses(sourceCount, speed, requestedLoops);
    chosen = requestedDuration < MIN_DURATION
      ? feasible.find((entry) => entry.loops >= requestedLoops) ?? feasible[0]
      : [...feasible].reverse().find((entry) => entry.loops <= requestedLoops) ?? feasible.at(-1);
  }
  chosen ??= feasible[0]!;

  const duration = Math.min(MAX_DURATION, Math.max(MIN_DURATION, roundDuration(chosen.duration)));
  const label = `Close at cut tempo · ${chosen.loops} loop${chosen.loops === 1 ? "" : "s"} / ${duration.toFixed(1)} s`;
  return {
    available: true,
    settings: {
      ...settings,
      motion: {
        ...settings.motion,
        seamless: true,
        seamlessLoops: chosen.loops,
      },
      output: {
        ...settings.output,
        duration,
      },
    },
    loops: chosen.loops,
    duration,
    reason: chosen.loops === requestedLoops
      ? "Keeps the authored tempo and closes on the source deck."
      : `Uses ${chosen.loops} loop${chosen.loops === 1 ? "" : "s"} because ${requestedLoops} cannot fit without leaving the 3–30 second output range.`,
    label,
  };
}

export function analyzeEditorialDelivery(
  settings: StudioSettings,
  sourceCountInput: number,
): EditorialDeliveryAnalysis {
  const sourceCount = safeSourceCount(sourceCountInput);
  const authoredSpeed = safeSpeed(settings);
  const duration = safeDuration(settings);
  const repair = closeAtCutTempo(settings, sourceCount);

  if (settings.motion.flow !== "editorial") {
    const coveredSlides = authoredSpeed * duration;
    return {
      status: "unscored",
      label: "Choose an editorial cut",
      detail: "Delivery scoring begins after you choose an authored cut. Legacy paths remain available for custom motion.",
      sourceCount,
      authoredSpeed,
      effectiveSpeed: authoredSpeed,
      coveredSlides,
      coveredPasses: sourceCount > 0 ? coveredSlides / sourceCount : 0,
      paceRatio: null,
      canRepair: false,
      repairLabel: null,
    };
  }

  if (sourceCount === 0) {
    return {
      status: "empty",
      label: "Add slides",
      detail: "Delivery begins once the source deck has at least one slide.",
      sourceCount,
      authoredSpeed,
      effectiveSpeed: 0,
      coveredSlides: 0,
      coveredPasses: 0,
      paceRatio: null,
      canRepair: false,
      repairLabel: null,
    };
  }
  if (settings.motion.reducedMotionOutput) {
    return {
      status: "still",
      label: "Reduced-motion master",
      detail: "The exported master holds one exact authored frame. Preview motion remains a separate directing choice.",
      sourceCount,
      authoredSpeed,
      effectiveSpeed: 0,
      coveredSlides: 0,
      coveredPasses: 0,
      paceRatio: null,
      canRepair: false,
      repairLabel: null,
    };
  }
  if (authoredSpeed <= 1e-6) {
    return {
      status: "still",
      label: "Still composition",
      detail: "Tempo is zero. The master will hold one authored frame for the full duration.",
      sourceCount,
      authoredSpeed,
      effectiveSpeed: 0,
      coveredSlides: 0,
      coveredPasses: 0,
      paceRatio: null,
      canRepair: false,
      repairLabel: null,
    };
  }

  if (settings.motion.flow === "editorial" && settings.motion.seamless) {
    const loops = safeLoops(settings);
    const coveredSlides = sourceCount * loops;
    const effectiveSpeed = coveredSlides / duration;
    const paceRatio = effectiveSpeed / authoredSpeed;
    const retimed = Math.abs(paceRatio - 1) > DELIVERY_EPSILON;
    const rushed = effectiveSpeed > DIRECTOR_SPEED_LIMIT + VALUE_EPSILON;
    if (rushed) {
      return {
        status: "rushed",
        label: "Closed, but rushed",
        detail: `${formatPasses(loops)} closes, but delivery rises to ${formatSpeed(effectiveSpeed)}—above the director ceiling. Lengthen the master or reduce loops.`,
        sourceCount,
        authoredSpeed,
        effectiveSpeed,
        coveredSlides,
        coveredPasses: loops,
        paceRatio,
        canRepair: repair.available,
        repairLabel: repair.label,
      };
    }
    if (retimed) {
      const percent = Math.abs((paceRatio - 1) * 100).toFixed(0);
      return {
        status: "retimed",
        label: "Closed, but retimed",
        detail: `${formatPasses(loops)} closes at ${formatSpeed(effectiveSpeed)}, ${percent}% ${paceRatio > 1 ? "faster" : "slower"} than the cut you approved in preview.`,
        sourceCount,
        authoredSpeed,
        effectiveSpeed,
        coveredSlides,
        coveredPasses: loops,
        paceRatio,
        canRepair: repair.available,
        repairLabel: repair.label,
      };
    }
    return {
      status: "closed",
      label: "Closed at cut tempo",
      detail: `${formatPasses(loops)} closes cleanly at ${formatSpeed(effectiveSpeed)}. Preview and master share the same pace.`,
      sourceCount,
      authoredSpeed,
      effectiveSpeed,
      coveredSlides,
      coveredPasses: loops,
      paceRatio,
      canRepair: false,
      repairLabel: null,
    };
  }

  const coveredSlides = authoredSpeed * duration;
  const coveredPasses = coveredSlides / sourceCount;
  if (coveredPasses < 1 - DELIVERY_EPSILON) {
    return {
      status: "partial",
      label: "Partial deck",
      detail: `${coveredSlides.toFixed(1)} of ${sourceCount} source slides fit at the authored ${formatSpeed(authoredSpeed)}. The master ends before one full pass.`,
      sourceCount,
      authoredSpeed,
      effectiveSpeed: authoredSpeed,
      coveredSlides,
      coveredPasses,
      paceRatio: 1,
      canRepair: repair.available,
      repairLabel: repair.label,
    };
  }

  return {
    status: "complete-open",
    label: "Complete, but open",
    detail: `${formatPasses(coveredPasses)} fits at ${formatSpeed(authoredSpeed)}, but the endpoint is not locked to the source deck.`,
    sourceCount,
    authoredSpeed,
    effectiveSpeed: authoredSpeed,
    coveredSlides,
    coveredPasses,
    paceRatio: 1,
    canRepair: repair.available,
    repairLabel: repair.label,
  };
}
