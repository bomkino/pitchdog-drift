import type { DriftJsonValue, DriftProjectV4 } from "../project/schema";
import {
  createPerformanceLifecycle,
  type PerformanceLifecycleTimeline,
} from "./performanceLifecycle";
import { sequenceContentPacedBodySeconds } from "./sequenceCompiler";
import {
  readSequenceAuthoring,
  sequencePassCount,
  sequenceRelativePassWeight,
  type SequenceAuthoringRead,
} from "./sequenceAuthoring";

export const TIMING_EXTENSION_KEY = "dog.pitch.drift.timing" as const;
export const TIMING_INTENT_SCHEMA_VERSION = 1 as const;
export const DEFAULT_SECONDS_PER_SLIDE = 0.75;
export const MIN_SECONDS_PER_SLIDE = 0.05;
export const MAX_SECONDS_PER_SLIDE = 10;
export const MIN_TIMING_BODY_SECONDS = 0.25;
export const MIN_MASTER_SECONDS = 0.5;

export type TimingMode = "fixed-master" | "content-paced";
export type TimingProtectedInput = "master-duration" | "seconds-per-slide";

export interface TimingIntent {
  readonly schemaVersion: typeof TIMING_INTENT_SCHEMA_VERSION;
  readonly mode: TimingMode;
  readonly secondsPerSlide: number;
}

export interface TimingIntentRead {
  readonly intent: TimingIntent;
  readonly status: "stored" | "missing" | "malformed";
}

export type TimingRepairReason = "master-too-short" | "no-moving-media";

export interface TimingRepair {
  readonly reason: TimingRepairReason;
  readonly requestedMasterSeconds: number;
  readonly minimumMasterSeconds: number;
}

export interface TimingResolution {
  readonly intent: TimingIntent;
  readonly protectedInput: TimingProtectedInput;
  readonly travelAuthority: "legacy-tempo" | "pass-sequence";
  readonly sequenceStatus: SequenceAuthoringRead["status"];
  readonly relativePassWeightPerCycle: number;
  readonly movingSlideCount: number;
  readonly deckPasses: number;
  readonly sceneCount: number;
  readonly bodyCycleCount: number;
  readonly entrySeconds: number;
  readonly exitSeconds: number;
  readonly transitionSeconds: number;
  readonly requestedMasterSeconds: number;
  readonly minimumMasterSeconds: number;
  readonly masterSeconds: number;
  readonly bodySecondsPerCycle: number;
  readonly bodySeconds: number;
  readonly deckDistanceInSlidesPerCycle: number;
  readonly deckDistanceInSlides: number;
  readonly averageSlidesPerSecond: number;
  readonly repair: TimingRepair | null;
  readonly lifecycle: PerformanceLifecycleTimeline;
}

function defaultIntent(): TimingIntent {
  return Object.freeze({
    schemaVersion: TIMING_INTENT_SCHEMA_VERSION,
    mode: "fixed-master",
    secondsPerSlide: DEFAULT_SECONDS_PER_SLIDE,
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validSecondsPerSlide(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= MIN_SECONDS_PER_SLIDE
    && value <= MAX_SECONDS_PER_SLIDE;
}

/** Strict parser for the value stored at the namespaced extension key. */
export function parseTimingIntentExtension(value: unknown): TimingIntent | null {
  if (!isPlainRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== 3 || keys[0] !== "mode" || keys[1] !== "schemaVersion" || keys[2] !== "secondsPerSlide") {
    return null;
  }
  if (value.schemaVersion !== TIMING_INTENT_SCHEMA_VERSION) return null;
  if (value.mode !== "fixed-master" && value.mode !== "content-paced") return null;
  if (!validSecondsPerSlide(value.secondsPerSlide)) return null;
  return Object.freeze({
    schemaVersion: TIMING_INTENT_SCHEMA_VERSION,
    mode: value.mode,
    secondsPerSlide: Object.is(value.secondsPerSlide, -0) ? 0 : value.secondsPerSlide,
  });
}

/** Missing or malformed intent fails closed to Exact Length without changing the master. */
export function readTimingIntent(project: Pick<DriftProjectV4, "extensions">): TimingIntentRead {
  if (!Object.prototype.hasOwnProperty.call(project.extensions, TIMING_EXTENSION_KEY)) {
    return Object.freeze({ intent: defaultIntent(), status: "missing" as const });
  }
  const parsed = parseTimingIntentExtension(project.extensions[TIMING_EXTENSION_KEY]);
  return parsed
    ? Object.freeze({ intent: parsed, status: "stored" as const })
    : Object.freeze({ intent: defaultIntent(), status: "malformed" as const });
}

function assertTimingIntent(intent: TimingIntent): TimingIntent {
  const parsed = parseTimingIntentExtension(intent);
  if (!parsed) throw new TypeError("Timing intent is malformed or outside the supported range.");
  return parsed;
}

/** Writes only Drift's timing namespace and leaves every other extension untouched. */
export function withTimingIntent(project: DriftProjectV4, intent: TimingIntent): DriftProjectV4 {
  const parsed = assertTimingIntent(intent);
  const stored: DriftJsonValue = {
    schemaVersion: parsed.schemaVersion,
    mode: parsed.mode,
    secondsPerSlide: parsed.secondsPerSlide,
  };
  return {
    ...project,
    extensions: {
      ...project.extensions,
      [TIMING_EXTENSION_KEY]: stored,
    },
  };
}

function safeMovingSlideCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Moving slide count must be a non-negative safe integer.");
  }
  return value;
}

function enabledDuration(transition: DriftProjectV4["performance"]["entry"]): number {
  return transition.enabled ? transition.durationSeconds : 0;
}

/**
 * Resolves Exact Length or Reading Pace against the existing lifecycle counts.
 * It is pure. Impossible masters return one explicit repair proposal; no
 * transition is disabled and the source project is never changed here.
 */
export function resolveProjectTiming(
  project: DriftProjectV4,
  movingSlideCountInput: number,
  intentInput: TimingIntent = readTimingIntent(project).intent,
): TimingResolution {
  const intent = assertTimingIntent(intentInput);
  const movingSlideCount = safeMovingSlideCount(movingSlideCountInput);
  const currentLifecycle = createPerformanceLifecycle(project.performance);
  const sceneCount = currentLifecycle.sceneCount;
  const bodyCycleCount = currentLifecycle.bodyCycleCount;
  const entrySeconds = enabledDuration(currentLifecycle.authoring.entry) * sceneCount;
  const exitSeconds = enabledDuration(currentLifecycle.authoring.exit) * sceneCount;
  const transitionSeconds = entrySeconds + exitSeconds;
  const minimumMasterSeconds = Math.max(
    MIN_MASTER_SECONDS,
    transitionSeconds + MIN_TIMING_BODY_SECONDS * bodyCycleCount,
  );
  const sequenceRead = readSequenceAuthoring(project);
  const sequence = sequenceRead.authoring;
  const deckPasses = sequence
    ? sequencePassCount(sequence)
    : project.motion.seamless.loops;
  if (!Number.isSafeInteger(deckPasses) || deckPasses < 1) {
    throw new TypeError("Deck passes must be a positive safe integer.");
  }
  const deckDistanceInSlidesPerCycle = movingSlideCount * deckPasses;
  const deckDistanceInSlides = deckDistanceInSlidesPerCycle * bodyCycleCount;
  const relativePassWeightPerCycle = sequence
    ? sequenceRelativePassWeight(sequence)
    : deckPasses;

  const requestedMasterSeconds = intent.mode === "fixed-master"
    ? project.master.duration
    : transitionSeconds + (
        sequence
          ? sequenceContentPacedBodySeconds(sequence, movingSlideCount, intent.secondsPerSlide)
            * bodyCycleCount
          : deckDistanceInSlides * intent.secondsPerSlide
      );
  let repair: TimingRepair | null = null;
  if (movingSlideCount === 0) {
    repair = Object.freeze({
      reason: "no-moving-media" as const,
      requestedMasterSeconds,
      minimumMasterSeconds,
    });
  } else if (requestedMasterSeconds < minimumMasterSeconds) {
    repair = Object.freeze({
      reason: "master-too-short" as const,
      requestedMasterSeconds,
      minimumMasterSeconds,
    });
  }

  const masterSeconds = repair ? Math.max(requestedMasterSeconds, minimumMasterSeconds) : requestedMasterSeconds;
  const bodySecondsPerCycle = (masterSeconds - transitionSeconds) / bodyCycleCount;
  const bodySeconds = bodySecondsPerCycle * bodyCycleCount;
  const averageSlidesPerSecond = bodySeconds > 0 ? deckDistanceInSlides / bodySeconds : 0;
  const lifecycle = createPerformanceLifecycle({
    ...currentLifecycle.authoring,
    body: {
      ...currentLifecycle.authoring.body,
      durationSeconds: bodySecondsPerCycle,
    },
  });

  return Object.freeze({
    intent,
    protectedInput: intent.mode === "fixed-master" ? "master-duration" : "seconds-per-slide",
    travelAuthority: sequence ? "pass-sequence" : "legacy-tempo",
    sequenceStatus: sequenceRead.status,
    relativePassWeightPerCycle,
    movingSlideCount,
    deckPasses,
    sceneCount,
    bodyCycleCount,
    entrySeconds,
    exitSeconds,
    transitionSeconds,
    requestedMasterSeconds,
    minimumMasterSeconds,
    masterSeconds,
    bodySecondsPerCycle,
    bodySeconds,
    deckDistanceInSlidesPerCycle,
    deckDistanceInSlides,
    averageSlidesPerSecond,
    repair,
    lifecycle,
  });
}

/**
 * Applies a previously inspected resolution as one pure Project V4 value.
 * Applying a resolution with `repair !== null` is the explicit minimum-length
 * repair action; callers should preview that proposal first.
 */
export function applyTimingResolution(
  project: DriftProjectV4,
  resolution: TimingResolution,
): DriftProjectV4 {
  const withIntent = withTimingIntent(project, resolution.intent);
  return {
    ...withIntent,
    master: { ...withIntent.master, duration: resolution.masterSeconds },
    performance: resolution.lifecycle.authoring,
  };
}
