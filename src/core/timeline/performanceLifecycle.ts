import {
  evaluateTempoCurve,
  resolveTempoCurve,
  type TempoCurve,
  type TempoCurveAuthoring,
} from "./tempoCurve";
import { TRANSITION_PRESETS } from "./transitionPresets";

export { TRANSITION_PRESETS, TRANSITION_PRESET_ORDER } from "./transitionPresets";

export type LifecycleRepeat =
  | { readonly mode: "off" }
  | { readonly mode: "body"; readonly count: number }
  | { readonly mode: "full-scene"; readonly count: number };

export type TransitionCurveId = "linear" | "ease-out" | "ease-in-out";
export type TransitionTreatment = "lift" | "projector" | "contact-cut" | "fade";
export type SlideTransitionOrder = "forward" | "reverse";
export type TransitionPresetId = "quiet-lift" | "projector-open" | "contact-cut" | "fade-through";

export interface LayerTransitionTiming {
  /** Normalized delay inside the transition segment. */
  readonly lead: number;
  /** Normalized duration of this layer's transition. */
  readonly span: number;
}

export interface SlideTransitionTiming extends LayerTransitionTiming {
  /** Total normalized window across every slide, not a per-slide delay. */
  readonly stagger: number;
  readonly order: SlideTransitionOrder;
}

export type TransitionAuthoring =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly durationSeconds: number;
      readonly treatment: TransitionTreatment;
      readonly curve: TransitionCurveId;
      readonly background: LayerTransitionTiming;
      readonly slides: SlideTransitionTiming;
      /** Protected by default. It joins only when this flag is explicitly true. */
      readonly includePresenter?: boolean;
      /** Defaults to the background timing when the presenter joins. */
      readonly presenter?: LayerTransitionTiming;
    };

export interface PerformanceLifecycleAuthoring {
  /** Retains the director's chosen style even while both transitions are off. */
  readonly transitionPreset?: TransitionPresetId;
  readonly entry: TransitionAuthoring;
  readonly body: {
    /** Duration of one body cycle. Repeats extend total duration. */
    readonly durationSeconds: number;
    readonly tempo: TempoCurveAuthoring;
  };
  readonly exit: TransitionAuthoring;
  readonly repeat: LifecycleRepeat;
  /** Keeps fades and timing, removes spatial travel and slide-by-slide stagger. */
  readonly reducedMotion?: boolean;
}

export interface LifecycleSegmentBoundary {
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

export interface LifecycleBodyBoundary extends LifecycleSegmentBoundary {
  readonly index: number;
  readonly indexInScene: number;
  readonly sceneIndex: number;
}

export interface LifecycleSceneBoundary extends LifecycleSegmentBoundary {
  readonly index: number;
  readonly entry: LifecycleSegmentBoundary | null;
  readonly bodies: readonly LifecycleBodyBoundary[];
  readonly exit: LifecycleSegmentBoundary | null;
}

export interface PerformanceLifecycleTimeline {
  readonly authoring: PerformanceLifecycleAuthoring;
  readonly tempoCurve: TempoCurve;
  readonly repeatMode: LifecycleRepeat["mode"];
  readonly repeatCount: number;
  readonly sceneCount: number;
  readonly bodyCycleCount: number;
  readonly sceneDuration: number;
  readonly totalDuration: number;
  readonly scenes: readonly LifecycleSceneBoundary[];
  readonly bodyCycles: readonly LifecycleBodyBoundary[];
}

export type LifecyclePhase = "entry" | "body" | "exit" | "complete";

export interface LifecycleLayerSample {
  /** Current visual presence: 0 hidden, 1 fully present. */
  readonly visibility: number;
  /** Current transition's normalized, eased progress. */
  readonly progress: number;
  /** Transform progress. Reduced motion pins this at the resting pose. */
  readonly motionProgress: number;
  readonly active: boolean;
}

export interface PerformanceLifecycleSample {
  /** Finite caller input for diagnostics; non-finite input resolves to clamped time. */
  readonly requestedTime: number;
  readonly time: number;
  readonly phase: LifecyclePhase;
  readonly atEnd: boolean;
  readonly reducedMotion: boolean;
  readonly scene: {
    readonly index: number;
    readonly count: number;
    readonly time: number;
    readonly progress: number;
  };
  readonly segment: LifecycleSegmentBoundary & {
    readonly time: number;
    readonly progress: number;
  };
  readonly body: {
    readonly cycleIndex: number;
    readonly cycleIndexInScene: number;
    readonly cycleCount: number;
    readonly time: number;
    readonly clockProgress: number;
    readonly travelProgress: number;
    readonly cumulativeTravel: number;
    readonly velocityPerSecond: number;
    readonly accelerationPerSecondSquared: number;
  };
  readonly layers: {
    readonly background: LifecycleLayerSample;
    readonly slides: readonly LifecycleLayerSample[];
    readonly presenter: LifecycleLayerSample & { readonly participates: boolean };
  };
}

export interface TransitionPreset {
  readonly id: TransitionPresetId;
  readonly label: string;
  readonly description: string;
  readonly entry: TransitionAuthoring;
  readonly exit: TransitionAuthoring;
}

const MAX_DURATION_SECONDS = 3_600;
const MAX_REPEAT_COUNT = 1_000;
const MAX_SLIDE_COUNT = 10_000;
const EPSILON = 1e-12;

export class PerformanceLifecycleAuthoringError extends TypeError {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`${path} ${detail}`);
    this.name = "PerformanceLifecycleAuthoringError";
    this.path = path;
  }
}

function frozenTiming(lead: number, span: number): LayerTransitionTiming {
  return Object.freeze({ lead, span });
}

function frozenSlideTiming(
  lead: number,
  span: number,
  stagger: number,
  order: SlideTransitionOrder,
): SlideTransitionTiming {
  return Object.freeze({ lead, span, stagger, order });
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PerformanceLifecycleAuthoringError(path, "must be an object.");
  }
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PerformanceLifecycleAuthoringError(path, "must be a finite number.");
  }
  return Object.is(value, -0) ? 0 : value;
}

function positiveDuration(value: unknown, path: string): number {
  const duration = finiteNumber(value, path);
  if (duration <= 0 || duration > MAX_DURATION_SECONDS) {
    throw new PerformanceLifecycleAuthoringError(
      path,
      `must be above zero and at or below ${MAX_DURATION_SECONDS}.`,
    );
  }
  return duration;
}

function unitInterval(value: unknown, path: string, allowZero = true): number {
  const normalized = finiteNumber(value, path);
  if (normalized < 0 || normalized > 1 || (!allowZero && normalized === 0)) {
    throw new PerformanceLifecycleAuthoringError(
      path,
      `must be ${allowZero ? "between zero and one" : "above zero and at or below one"}.`,
    );
  }
  return normalized;
}

function validateLayerTiming(value: unknown, path: string): LayerTransitionTiming {
  assertRecord(value, path);
  const lead = unitInterval(value.lead, `${path}.lead`);
  const span = unitInterval(value.span, `${path}.span`, false);
  if (lead + span > 1 + EPSILON) {
    throw new PerformanceLifecycleAuthoringError(path, "lead plus span must not exceed one.");
  }
  return frozenTiming(lead, span);
}

function validateSlideTiming(value: unknown, path: string): SlideTransitionTiming {
  assertRecord(value, path);
  const lead = unitInterval(value.lead, `${path}.lead`);
  const span = unitInterval(value.span, `${path}.span`, false);
  const stagger = unitInterval(value.stagger, `${path}.stagger`);
  if (lead + span + stagger > 1 + EPSILON) {
    throw new PerformanceLifecycleAuthoringError(path, "lead plus span plus stagger must not exceed one.");
  }
  if (value.order !== "forward" && value.order !== "reverse") {
    throw new PerformanceLifecycleAuthoringError(`${path}.order`, "must be forward or reverse.");
  }
  return frozenSlideTiming(lead, span, stagger, value.order);
}

function validateTransition(value: unknown, path: "entry" | "exit"): TransitionAuthoring {
  assertRecord(value, path);
  if (value.enabled === false) return Object.freeze({ enabled: false as const });
  if (value.enabled !== true) {
    throw new PerformanceLifecycleAuthoringError(`${path}.enabled`, "must be true or false.");
  }

  const durationSeconds = positiveDuration(value.durationSeconds, `${path}.durationSeconds`);
  if (value.treatment !== "lift" && value.treatment !== "projector"
    && value.treatment !== "contact-cut" && value.treatment !== "fade") {
    throw new PerformanceLifecycleAuthoringError(`${path}.treatment`, "is not supported.");
  }
  if (value.curve !== "linear" && value.curve !== "ease-out" && value.curve !== "ease-in-out") {
    throw new PerformanceLifecycleAuthoringError(`${path}.curve`, "is not supported.");
  }
  const background = validateLayerTiming(value.background, `${path}.background`);
  const slides = validateSlideTiming(value.slides, `${path}.slides`);
  const includePresenter = value.includePresenter === undefined ? false : value.includePresenter;
  if (typeof includePresenter !== "boolean") {
    throw new PerformanceLifecycleAuthoringError(`${path}.includePresenter`, "must be true or false.");
  }
  const presenter = value.presenter === undefined
    ? undefined
    : validateLayerTiming(value.presenter, `${path}.presenter`);

  return Object.freeze({
    enabled: true as const,
    durationSeconds,
    treatment: value.treatment,
    curve: value.curve,
    background,
    slides,
    includePresenter,
    ...(presenter ? { presenter } : {}),
  });
}

function validateRepeat(value: unknown): LifecycleRepeat {
  assertRecord(value, "repeat");
  if (value.mode === "off") return Object.freeze({ mode: "off" as const });
  if (value.mode !== "body" && value.mode !== "full-scene") {
    throw new PerformanceLifecycleAuthoringError("repeat.mode", "must be off, body, or full-scene.");
  }
  const count = finiteNumber(value.count, "repeat.count");
  if (!Number.isInteger(count) || count < 1 || count > MAX_REPEAT_COUNT) {
    throw new PerformanceLifecycleAuthoringError(
      "repeat.count",
      `must be an integer from 1 through ${MAX_REPEAT_COUNT}.`,
    );
  }
  return Object.freeze({ mode: value.mode, count });
}

function validateTempo(value: unknown): TempoCurveAuthoring {
  assertRecord(value, "body.tempo");
  if (value.kind === "preset") {
    if (typeof value.preset !== "string") {
      throw new PerformanceLifecycleAuthoringError("body.tempo.preset", "must name a preset.");
    }
    return Object.freeze({ kind: "preset" as const, preset: value.preset }) as TempoCurveAuthoring;
  }
  if (value.kind === "custom") {
    assertRecord(value.envelope, "body.tempo.envelope");
    return Object.freeze({
      kind: "custom" as const,
      envelope: Object.freeze({
        start: value.envelope.start,
        middle: value.envelope.middle,
        finish: value.envelope.finish,
      }),
    }) as TempoCurveAuthoring;
  }
  throw new PerformanceLifecycleAuthoringError("body.tempo.kind", "must be preset or custom.");
}

function validateTransitionPreset(value: unknown): TransitionPresetId | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string"
    || !Object.prototype.hasOwnProperty.call(TRANSITION_PRESETS, value)
  ) {
    throw new PerformanceLifecycleAuthoringError(
      "transitionPreset",
      `is unknown: ${String(value)}.`,
    );
  }
  return value as TransitionPresetId;
}

function segment(start: number, duration: number): LifecycleSegmentBoundary {
  return Object.freeze({ start, end: start + duration, duration });
}

function resolveValidatedTempoCurve(authoring: TempoCurveAuthoring): TempoCurve {
  try {
    return resolveTempoCurve(authoring);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "is invalid.";
    throw new PerformanceLifecycleAuthoringError("body.tempo", detail);
  }
}

/**
 * Validates authoring and derives every boundary once. Repetition always adds
 * duration: body repeats retain one entry and exit; full-scene repeats retain
 * one complete entry/body/exit sequence per scene.
 */
export function createPerformanceLifecycle(
  input: PerformanceLifecycleAuthoring,
): PerformanceLifecycleTimeline {
  assertRecord(input, "lifecycle");
  const entry = validateTransition(input.entry, "entry");
  const exit = validateTransition(input.exit, "exit");
  assertRecord(input.body, "body");
  const durationSeconds = positiveDuration(input.body.durationSeconds, "body.durationSeconds");
  const tempo = validateTempo(input.body.tempo);
  const tempoCurve = resolveValidatedTempoCurve(tempo);
  const repeat = validateRepeat(input.repeat);
  const transitionPreset = validateTransitionPreset(input.transitionPreset);
  const reducedMotion = input.reducedMotion === undefined ? false : input.reducedMotion;
  if (typeof reducedMotion !== "boolean") {
    throw new PerformanceLifecycleAuthoringError("reducedMotion", "must be true or false.");
  }

  const authoring: PerformanceLifecycleAuthoring = Object.freeze({
    ...(transitionPreset ? { transitionPreset } : {}),
    entry,
    body: Object.freeze({ durationSeconds, tempo }),
    exit,
    repeat,
    reducedMotion,
  });

  const repeatCount = repeat.mode === "off" ? 1 : repeat.count;
  const sceneCount = repeat.mode === "full-scene" ? repeatCount : 1;
  const bodiesPerScene = repeat.mode === "body" ? repeatCount : 1;
  const entryDuration = entry.enabled ? entry.durationSeconds : 0;
  const exitDuration = exit.enabled ? exit.durationSeconds : 0;
  const bodyCycles: LifecycleBodyBoundary[] = [];
  const scenes: LifecycleSceneBoundary[] = [];
  let cursor = 0;

  for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
    const sceneStart = cursor;
    const entryBoundary = entry.enabled ? segment(sceneStart, entryDuration) : null;
    if (entryBoundary) cursor = entryBoundary.end;
    const bodies: LifecycleBodyBoundary[] = [];
    for (let indexInScene = 0; indexInScene < bodiesPerScene; indexInScene += 1) {
      const body: LifecycleBodyBoundary = Object.freeze({
        ...segment(cursor, durationSeconds),
        index: bodyCycles.length,
        indexInScene,
        sceneIndex,
      });
      bodyCycles.push(body);
      bodies.push(body);
      cursor = body.end;
    }
    const exitBoundary = exit.enabled ? segment(cursor, exitDuration) : null;
    if (exitBoundary) cursor = exitBoundary.end;
    const sceneEnd = cursor;
    scenes.push(Object.freeze({
      start: sceneStart,
      end: sceneEnd,
      duration: sceneEnd - sceneStart,
      index: sceneIndex,
      entry: entryBoundary,
      bodies: Object.freeze(bodies),
      exit: exitBoundary,
    }));
  }

  const sceneDuration = scenes[0]!.duration;
  const totalDuration = cursor;

  return Object.freeze({
    authoring,
    tempoCurve,
    repeatMode: repeat.mode,
    repeatCount,
    sceneCount,
    bodyCycleCount: bodyCycles.length,
    sceneDuration,
    totalDuration,
    scenes: Object.freeze(scenes),
    bodyCycles: Object.freeze(bodyCycles),
  });
}

export function createPerformanceLifecycleFromPreset(
  presetId: TransitionPresetId,
  body: PerformanceLifecycleAuthoring["body"],
  repeat: LifecycleRepeat = { mode: "off" },
  reducedMotion = false,
): PerformanceLifecycleTimeline {
  const preset: TransitionPreset | undefined = TRANSITION_PRESETS[presetId];
  if (!preset) throw new PerformanceLifecycleAuthoringError("preset", `is unknown: ${String(presetId)}.`);
  return createPerformanceLifecycle({
    transitionPreset: presetId,
    entry: preset.entry,
    body,
    exit: preset.exit,
    repeat,
    reducedMotion,
  });
}

function clampTime(value: number, totalDuration: number): number {
  if (Number.isNaN(value) || value === -Infinity) return 0;
  if (value === Infinity) return totalDuration;
  return Math.max(0, Math.min(totalDuration, value));
}

function exactRatio(value: number, duration: number): number {
  if (value <= 0) return 0;
  if (value >= duration) return 1;
  return value / duration;
}

function evaluateTransitionCurve(curve: TransitionCurveId, progress: number): number {
  const time = Math.max(0, Math.min(1, progress));
  if (time === 0 || time === 1) return time;
  switch (curve) {
    case "linear": return time;
    case "ease-out": return 1 - (1 - time) ** 3;
    case "ease-in-out": return time < 0.5
      ? 4 * time ** 3
      : 1 - (-2 * time + 2) ** 3 / 2;
  }
}

function layerSample(
  phaseProgress: number,
  timing: LayerTransitionTiming,
  curve: TransitionCurveId,
  entering: boolean,
  reducedMotion: boolean,
): LifecycleLayerSample {
  const local = exactRatio(phaseProgress - timing.lead, timing.span);
  const progress = evaluateTransitionCurve(curve, local);
  const visibility = entering ? progress : 1 - progress;
  return Object.freeze({
    visibility,
    progress,
    motionProgress: reducedMotion ? 1 : entering ? progress : 1 - progress,
    active: local > 0 && local < 1,
  });
}

function restingLayer(
  visibility: number,
  progress: number,
  motionProgress: number,
): LifecycleLayerSample {
  return Object.freeze({
    visibility,
    progress,
    motionProgress,
    active: false,
  });
}

function protectedPresenter(): PerformanceLifecycleSample["layers"]["presenter"] {
  return Object.freeze({ ...restingLayer(1, 1, 1), participates: false });
}

function transitionLayers(
  transitionAuthoring: Extract<TransitionAuthoring, { enabled: true }>,
  phaseProgress: number,
  slideCount: number,
  entering: boolean,
  reducedMotion: boolean,
): PerformanceLifecycleSample["layers"] {
  const background = layerSample(
    phaseProgress,
    transitionAuthoring.background,
    transitionAuthoring.curve,
    entering,
    reducedMotion,
  );
  const slideDenominator = Math.max(1, slideCount - 1);
  const slides = Array.from({ length: slideCount }, (_, slideIndex) => {
    const orderedIndex = transitionAuthoring.slides.order === "forward"
      ? slideIndex
      : Math.max(0, slideCount - 1 - slideIndex);
    const stagger = reducedMotion
      ? 0
      : transitionAuthoring.slides.stagger * orderedIndex / slideDenominator;
    return layerSample(
      phaseProgress,
      {
        lead: transitionAuthoring.slides.lead + stagger,
        span: transitionAuthoring.slides.span,
      },
      transitionAuthoring.curve,
      entering,
      reducedMotion,
    );
  });

  if (!transitionAuthoring.includePresenter) {
    return Object.freeze({ background, slides: Object.freeze(slides), presenter: protectedPresenter() });
  }
  const presenterTiming = transitionAuthoring.presenter ?? transitionAuthoring.background;
  const presenter = Object.freeze({
    ...layerSample(phaseProgress, presenterTiming, transitionAuthoring.curve, entering, reducedMotion),
    participates: true,
  });
  return Object.freeze({ background, slides: Object.freeze(slides), presenter });
}

function restingLayers(
  slideCount: number,
  visible: boolean,
  presenterParticipates: boolean,
  completedExit = false,
  reducedMotion = false,
): PerformanceLifecycleSample["layers"] {
  const visibility = visible ? 1 : 0;
  const progress = completedExit ? 1 : visibility;
  const motionProgress = visible || reducedMotion ? 1 : 0;
  const layer = restingLayer(visibility, progress, motionProgress);
  const presenter = presenterParticipates
    ? Object.freeze({ ...layer, participates: true })
    : protectedPresenter();
  return Object.freeze({
    background: layer,
    slides: Object.freeze(Array.from({ length: slideCount }, () => layer)),
    presenter,
  });
}

function validateSlideCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_SLIDE_COUNT) {
    throw new PerformanceLifecycleAuthoringError(
      "slideCount",
      `must be an integer from zero through ${MAX_SLIDE_COUNT}.`,
    );
  }
  return value;
}

function locateScene(timeline: PerformanceLifecycleTimeline, time: number): LifecycleSceneBoundary {
  if (timeline.repeatMode !== "full-scene") return timeline.scenes[0]!;
  let low = 0;
  let high = timeline.scenes.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (time < timeline.scenes[middle]!.end) high = middle;
    else low = middle + 1;
  }
  return timeline.scenes[low]!;
}

function locateBody(scene: LifecycleSceneBoundary, time: number): LifecycleBodyBoundary {
  let low = 0;
  let high = scene.bodies.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (time < scene.bodies[middle]!.end) high = middle;
    else low = middle + 1;
  }
  return scene.bodies[low]!;
}

/**
 * Maps explicit master time to one scene, one body cycle, and deterministic
 * layer states. Exact internal boundaries belong to the next segment/cycle;
 * the final master endpoint is represented by the complete phase.
 */
export function evaluatePerformanceLifecycle(
  timeline: PerformanceLifecycleTimeline,
  masterTime: number,
  slideCount = 0,
): PerformanceLifecycleSample {
  const count = validateSlideCount(slideCount);
  const time = clampTime(masterTime, timeline.totalDuration);
  const requestedTime = Number.isFinite(masterTime) ? masterTime : time;
  const reducedMotion = timeline.authoring.reducedMotion ?? false;
  const atEnd = time === timeline.totalDuration;
  const scene = locateScene(timeline, time);
  const sceneTime = atEnd ? scene.duration : time - scene.start;
  const sceneProgress = exactRatio(sceneTime, scene.duration);
  const firstBody = scene.bodies[0]!;
  const lastBody = scene.bodies[scene.bodies.length - 1]!;

  let phase: LifecyclePhase;
  let activeSegment: LifecycleSegmentBoundary;
  let segmentTime: number;
  let segmentProgress: number;
  let bodyBoundary: LifecycleBodyBoundary;
  let bodyTime: number;
  let bodyClockProgress: number;

  if (atEnd) {
    phase = "complete";
    activeSegment = Object.freeze({ start: timeline.totalDuration, end: timeline.totalDuration, duration: 0 });
    segmentTime = 0;
    segmentProgress = 1;
    bodyBoundary = timeline.bodyCycles[timeline.bodyCycles.length - 1]!;
    bodyTime = bodyBoundary.duration;
    bodyClockProgress = 1;
  } else if (scene.entry && time < scene.entry.end) {
    phase = "entry";
    activeSegment = scene.entry;
    segmentTime = time - scene.entry.start;
    segmentProgress = exactRatio(segmentTime, scene.entry.duration);
    bodyBoundary = firstBody;
    bodyTime = 0;
    bodyClockProgress = 0;
  } else if (time < lastBody.end) {
    phase = "body";
    bodyBoundary = locateBody(scene, time);
    activeSegment = bodyBoundary;
    segmentTime = time - bodyBoundary.start;
    segmentProgress = exactRatio(segmentTime, bodyBoundary.duration);
    bodyTime = segmentTime;
    bodyClockProgress = segmentProgress;
  } else if (scene.exit) {
    phase = "exit";
    activeSegment = scene.exit;
    segmentTime = time - scene.exit.start;
    segmentProgress = exactRatio(segmentTime, scene.exit.duration);
    bodyBoundary = lastBody;
    bodyTime = bodyBoundary.duration;
    bodyClockProgress = 1;
  } else {
    // Only reachable at a floating-point scene boundary without an exit. It is
    // resolved as the next scene by locateScene whenever another scene exists.
    phase = "complete";
    activeSegment = Object.freeze({ start: scene.end, end: scene.end, duration: 0 });
    segmentTime = 0;
    segmentProgress = 1;
    bodyBoundary = lastBody;
    bodyTime = bodyBoundary.duration;
    bodyClockProgress = 1;
  }

  const tempo = evaluateTempoCurve(timeline.tempoCurve, bodyClockProgress);
  const travelProgress = reducedMotion ? 0 : tempo.progress;
  const velocityPerSecond = phase === "body" && !reducedMotion
    ? tempo.velocity / bodyBoundary.duration
    : 0;
  const accelerationPerSecondSquared = phase === "body" && !reducedMotion
    ? tempo.acceleration / (bodyBoundary.duration ** 2)
    : 0;

  let layers: PerformanceLifecycleSample["layers"];
  if (phase === "entry" && timeline.authoring.entry.enabled) {
    layers = transitionLayers(
      timeline.authoring.entry,
      segmentProgress,
      count,
      true,
      reducedMotion,
    );
  } else if (phase === "exit" && timeline.authoring.exit.enabled) {
    layers = transitionLayers(
      timeline.authoring.exit,
      segmentProgress,
      count,
      false,
      reducedMotion,
    );
  } else if (phase === "complete") {
    const finalExit = timeline.authoring.exit;
    layers = restingLayers(
      count,
      !finalExit.enabled,
      finalExit.enabled && finalExit.includePresenter === true,
      finalExit.enabled,
      reducedMotion,
    );
  } else {
    layers = restingLayers(count, true, false);
  }

  return Object.freeze({
    requestedTime,
    time,
    phase,
    atEnd,
    reducedMotion,
    scene: Object.freeze({
      index: scene.index,
      count: timeline.sceneCount,
      time: sceneTime,
      progress: sceneProgress,
    }),
    segment: Object.freeze({
      ...activeSegment,
      time: segmentTime,
      progress: segmentProgress,
    }),
    body: Object.freeze({
      cycleIndex: bodyBoundary.index,
      cycleIndexInScene: bodyBoundary.indexInScene,
      cycleCount: timeline.bodyCycleCount,
      time: bodyTime,
      clockProgress: bodyClockProgress,
      travelProgress,
      cumulativeTravel: reducedMotion ? 0 : bodyBoundary.index + travelProgress,
      velocityPerSecond,
      accelerationPerSecondSquared,
    }),
    layers,
  });
}
