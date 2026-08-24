import { resolveMovingMedia } from "../project/movingMedia";
import type { DriftProjectV4 } from "../project/schema";
import {
  createPerformanceLifecycle,
  type LifecycleBodyBoundary,
  type LifecycleSegmentBoundary,
  type PerformanceLifecycleTimeline,
} from "./performanceLifecycle";
import {
  compileSequence,
  type CompiledSequence,
  type CompiledSequenceGroup,
  type CompiledSequencePass,
} from "./sequenceCompiler";
import {
  readSequenceAuthoring,
  type SequenceAuthoringRead,
  type SequencePace,
} from "./sequenceAuthoring";
import { invertTempoCurveProgress } from "./tempoCurve";
import {
  readTimingIntent,
  resolveProjectTiming,
  type TimingIntentRead,
  type TimingMode,
  type TimingProtectedInput,
} from "./timingIntent";

const TIMELINE_EPSILON = 1e-9;

export type VisualTimelineAuthority = "pass-sequence" | "legacy-tempo";
export type VisualTimelinePace = SequencePace | "legacy";

export interface VisualTimelineSpan {
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  readonly normalizedStart: number;
  readonly normalizedEnd: number;
  readonly normalizedWidth: number;
}

export interface VisualTimelinePass extends VisualTimelineSpan {
  readonly index: number;
  readonly indexInBody: number;
  readonly indexInGroup: number;
  readonly bodyCycleIndex: number;
  readonly sceneIndex: number;
  readonly groupSegmentIndex: number;
  readonly label: string;
  readonly pace: VisualTimelinePace;
  readonly paceLabel: string;
}

export interface VisualTimelinePassTick {
  readonly index: number;
  readonly time: number;
  readonly normalizedTime: number;
  readonly localProgress: number;
  readonly label: string;
}

interface VisualTimelineSegmentBase extends VisualTimelineSpan {
  readonly index: number;
  readonly id: string;
  readonly label: string;
  readonly sceneIndex: number;
}

export interface VisualTimelineTransitionSegment extends VisualTimelineSegmentBase {
  readonly kind: "entry" | "exit";
}

export interface VisualTimelineSequenceGroupSegment extends VisualTimelineSegmentBase {
  readonly kind: "sequence-group";
  readonly authority: "pass-sequence";
  readonly bodyCycleIndex: number;
  readonly bodyCycleIndexInScene: number;
  readonly sourceGroupIndex: number;
  readonly sequenceRepeatIndex: number;
  readonly sourceGroupId: string;
  readonly pace: SequencePace;
  readonly paceLabel: string;
  readonly passCount: number;
  readonly passes: readonly VisualTimelinePass[];
  readonly passTicks: readonly VisualTimelinePassTick[];
}

export interface VisualTimelineLegacyBodySegment extends VisualTimelineSegmentBase {
  readonly kind: "legacy-body";
  readonly authority: "legacy-tempo";
  readonly bodyCycleIndex: number;
  readonly bodyCycleIndexInScene: number;
  readonly pace: "legacy";
  readonly paceLabel: string;
  readonly passCount: number;
  readonly passes: readonly VisualTimelinePass[];
  readonly passTicks: readonly VisualTimelinePassTick[];
}

export type VisualTimelineBodySegment =
  | VisualTimelineSequenceGroupSegment
  | VisualTimelineLegacyBodySegment;

export type VisualTimelineSegment =
  | VisualTimelineTransitionSegment
  | VisualTimelineBodySegment;

export interface VisualTimelinePassBoundary {
  readonly index: number;
  readonly time: number;
  readonly normalizedTime: number;
  readonly passBeforeIndex: number | null;
  readonly passAfterIndex: number | null;
  readonly label: string;
}

export interface VisualTimelineModel {
  readonly totalDuration: number;
  readonly authority: VisualTimelineAuthority;
  readonly sequenceStatus: SequenceAuthoringRead["status"];
  readonly timing: {
    readonly mode: TimingMode;
    readonly status: TimingIntentRead["status"];
    readonly protectedInput: TimingProtectedInput;
  };
  readonly movingMediaOrder: readonly string[];
  readonly movingSlideCount: number;
  readonly sceneCount: number;
  readonly bodyCycleCount: number;
  readonly entrySegments: readonly VisualTimelineTransitionSegment[];
  readonly bodySegments: readonly VisualTimelineBodySegment[];
  readonly exitSegments: readonly VisualTimelineTransitionSegment[];
  readonly segments: readonly VisualTimelineSegment[];
  readonly passes: readonly VisualTimelinePass[];
  readonly passBoundaries: readonly VisualTimelinePassBoundary[];
}

export interface VisualTimelineSample {
  readonly requestedTime: number;
  readonly time: number;
  readonly atEnd: boolean;
  readonly normalizedPlayhead: number;
  readonly segmentIndex: number;
  readonly segment: VisualTimelineSegment;
  readonly localProgress: number;
  readonly nearestPassBoundary: VisualTimelinePassBoundary | null;
  readonly previousPassBoundary: VisualTimelinePassBoundary | null;
  readonly nextPassBoundary: VisualTimelinePassBoundary | null;
}

export class VisualTimelineModelError extends TypeError {
  constructor(detail: string) {
    super(detail);
    this.name = "VisualTimelineModelError";
  }
}

interface MutablePassBoundary {
  time: number;
  passBeforeIndex: number | null;
  passAfterIndex: number | null;
}

function normalizedSpan(
  start: number,
  end: number,
  totalDuration: number,
): VisualTimelineSpan {
  const duration = end - start;
  return {
    start,
    end,
    duration,
    normalizedStart: start / totalDuration,
    normalizedEnd: end / totalDuration,
    normalizedWidth: duration / totalDuration,
  };
}

function closeEnough(left: number, right: number): boolean {
  return Math.abs(left - right) <= TIMELINE_EPSILON;
}

function assertCanonicalMovingOrder(
  project: DriftProjectV4,
  movingMediaOrder: readonly string[],
): readonly string[] {
  const canonical = resolveMovingMedia(project).order;
  if (
    movingMediaOrder.length !== canonical.length
    || movingMediaOrder.some((assetId, index) => assetId !== canonical[index])
  ) {
    throw new VisualTimelineModelError(
      "Visual timeline moving-media order does not match Project V4.",
    );
  }
  return Object.freeze([...canonical]);
}

function assertMasterAgreement(
  project: DriftProjectV4,
  lifecycle: PerformanceLifecycleTimeline,
  movingSlideCount: number,
): ReturnType<typeof resolveProjectTiming> {
  const timing = resolveProjectTiming(project, movingSlideCount);
  if (!closeEnough(lifecycle.totalDuration, project.master.duration)) {
    throw new VisualTimelineModelError(
      "Visual timeline lifecycle duration does not match Project V4 master duration.",
    );
  }
  if (!closeEnough(timing.masterSeconds, project.master.duration)) {
    throw new VisualTimelineModelError(
      "Visual timeline timing intent is unresolved against Project V4 master duration.",
    );
  }
  if (!closeEnough(timing.lifecycle.totalDuration, lifecycle.totalDuration)) {
    throw new VisualTimelineModelError(
      "Visual timeline timing lifecycle does not match the authored lifecycle.",
    );
  }
  return timing;
}

function paceLabel(pace: VisualTimelinePace): string {
  switch (pace) {
    case "fast": return "Fast";
    case "read": return "Readable";
    case "custom": return "Custom pace";
    case "legacy": return "Original rhythm";
  }
}

function transitionSegment(
  kind: "entry" | "exit",
  boundary: LifecycleSegmentBoundary,
  sceneIndex: number,
  index: number,
  totalDuration: number,
): VisualTimelineTransitionSegment {
  return Object.freeze({
    kind,
    index,
    id: `${kind}:${sceneIndex}`,
    label: kind === "entry" ? "Entry" : "Exit",
    sceneIndex,
    ...normalizedSpan(boundary.start, boundary.end, totalDuration),
  });
}

function passTick(
  index: number,
  time: number,
  groupStart: number,
  groupDuration: number,
  totalDuration: number,
): VisualTimelinePassTick {
  return Object.freeze({
    index,
    time,
    normalizedTime: time / totalDuration,
    localProgress: index === 0 ? 0 : time >= groupStart + groupDuration
      ? 1
      : (time - groupStart) / groupDuration,
    label: index === 0 ? "Start" : `Pass ${index}`,
  });
}

function visualPass(
  input: {
    readonly index: number;
    readonly indexInBody: number;
    readonly indexInGroup: number;
    readonly body: LifecycleBodyBoundary;
    readonly groupSegmentIndex: number;
    readonly start: number;
    readonly end: number;
    readonly groupPassCount: number;
    readonly pace: VisualTimelinePace;
  },
  totalDuration: number,
): VisualTimelinePass {
  return Object.freeze({
    index: input.index,
    indexInBody: input.indexInBody,
    indexInGroup: input.indexInGroup,
    bodyCycleIndex: input.body.index,
    sceneIndex: input.body.sceneIndex,
    groupSegmentIndex: input.groupSegmentIndex,
    label: input.groupPassCount === 1
      ? "One pass"
      : `Pass ${input.indexInGroup + 1} of ${input.groupPassCount}`,
    pace: input.pace,
    paceLabel: paceLabel(input.pace),
    ...normalizedSpan(input.start, input.end, totalDuration),
  });
}

function sequenceGroupSegment(
  body: LifecycleBodyBoundary,
  group: CompiledSequenceGroup,
  compiled: CompiledSequence,
  index: number,
  passStartIndex: number,
  totalDuration: number,
): VisualTimelineSequenceGroupSegment {
  const start = body.start + group.start;
  const end = body.start + group.end;
  const sourcePasses = compiled.passes.slice(group.startPass, group.endPass);
  const passes = sourcePasses.map((pass: CompiledSequencePass, indexInGroup) => visualPass({
    index: passStartIndex + indexInGroup,
    indexInBody: pass.index,
    indexInGroup,
    body,
    groupSegmentIndex: index,
    start: body.start + pass.start,
    end: body.start + pass.end,
    groupPassCount: sourcePasses.length,
    pace: pass.pace,
  }, totalDuration));
  const passTicks = [
    passTick(0, start, start, end - start, totalDuration),
    ...passes.map((pass, tickIndex) => (
      passTick(tickIndex + 1, pass.end, start, end - start, totalDuration)
    )),
  ];
  return Object.freeze({
    kind: "sequence-group" as const,
    authority: "pass-sequence" as const,
    index,
    id: `sequence-group:${body.index}:${group.index}`,
    label: group.label,
    sceneIndex: body.sceneIndex,
    bodyCycleIndex: body.index,
    bodyCycleIndexInScene: body.indexInScene,
    sourceGroupIndex: group.sourceGroupIndex,
    sequenceRepeatIndex: group.repeatIndex,
    sourceGroupId: group.id,
    pace: group.pace,
    paceLabel: paceLabel(group.pace),
    passCount: passes.length,
    passes: Object.freeze(passes),
    passTicks: Object.freeze(passTicks),
    ...normalizedSpan(start, end, totalDuration),
  });
}

function legacyBodySegment(
  body: LifecycleBodyBoundary,
  lifecycle: PerformanceLifecycleTimeline,
  deckPasses: number,
  index: number,
  passStartIndex: number,
  totalDuration: number,
): VisualTimelineLegacyBodySegment {
  const passes: VisualTimelinePass[] = [];
  let start = body.start;
  for (let indexInBody = 0; indexInBody < deckPasses; indexInBody += 1) {
    const progress = (indexInBody + 1) / deckPasses;
    const end = indexInBody + 1 === deckPasses
      ? body.end
      : body.start + body.duration * invertTempoCurveProgress(lifecycle.tempoCurve, progress);
    passes.push(visualPass({
      index: passStartIndex + indexInBody,
      indexInBody,
      indexInGroup: indexInBody,
      body,
      groupSegmentIndex: index,
      start,
      end,
      groupPassCount: deckPasses,
      pace: "legacy",
    }, totalDuration));
    start = end;
  }
  const passTicks = [
    passTick(0, body.start, body.start, body.duration, totalDuration),
    ...passes.map((pass, tickIndex) => (
      passTick(tickIndex + 1, pass.end, body.start, body.duration, totalDuration)
    )),
  ];
  return Object.freeze({
    kind: "legacy-body" as const,
    authority: "legacy-tempo" as const,
    index,
    id: `legacy-body:${body.index}`,
    label: "Carousel",
    sceneIndex: body.sceneIndex,
    bodyCycleIndex: body.index,
    bodyCycleIndexInScene: body.indexInScene,
    pace: "legacy" as const,
    paceLabel: paceLabel("legacy"),
    passCount: passes.length,
    passes: Object.freeze(passes),
    passTicks: Object.freeze(passTicks),
    ...normalizedSpan(body.start, body.end, totalDuration),
  });
}

function appendBoundary(
  boundaries: MutablePassBoundary[],
  time: number,
  side: "before" | "after",
  passIndex: number,
): void {
  const last = boundaries.at(-1);
  const boundary = last?.time === time
    ? last
    : (() => {
        const next: MutablePassBoundary = {
          time,
          passBeforeIndex: null,
          passAfterIndex: null,
        };
        boundaries.push(next);
        return next;
      })();
  if (side === "before") boundary.passBeforeIndex = passIndex;
  else boundary.passAfterIndex = passIndex;
}

function passBoundaryLabel(boundary: MutablePassBoundary): string {
  if (boundary.passBeforeIndex === null) return "Pass start";
  if (boundary.passAfterIndex === null) return "Pass end";
  return `Pass ${boundary.passBeforeIndex + 1}`;
}

function createPassBoundaries(
  passes: readonly VisualTimelinePass[],
  totalDuration: number,
): readonly VisualTimelinePassBoundary[] {
  const mutable: MutablePassBoundary[] = [];
  for (const pass of passes) {
    appendBoundary(mutable, pass.start, "after", pass.index);
    appendBoundary(mutable, pass.end, "before", pass.index);
  }
  return Object.freeze(mutable.map((boundary, index) => Object.freeze({
    index,
    time: boundary.time,
    normalizedTime: boundary.time / totalDuration,
    passBeforeIndex: boundary.passBeforeIndex,
    passAfterIndex: boundary.passAfterIndex,
    label: passBoundaryLabel(boundary),
  })));
}

function assertContiguousTimeline(
  segments: readonly VisualTimelineSegment[],
  totalDuration: number,
): void {
  if (segments.length === 0) {
    throw new VisualTimelineModelError("Visual timeline must contain an authored body segment.");
  }
  if (!closeEnough(segments[0]!.start, 0)) {
    throw new VisualTimelineModelError("Visual timeline does not begin at the master start.");
  }
  for (let index = 1; index < segments.length; index += 1) {
    if (!closeEnough(segments[index - 1]!.end, segments[index]!.start)) {
      throw new VisualTimelineModelError("Visual timeline segments are not contiguous.");
    }
  }
  if (!closeEnough(segments.at(-1)!.end, totalDuration)) {
    throw new VisualTimelineModelError("Visual timeline does not end at the master endpoint.");
  }
}

/**
 * Builds the one authored timeline presentation shared by the editor UI.
 * Lifecycle boundaries, compiled sequence knots, timing intent, and legacy
 * tempo inversion remain owned by their existing authorities; this function
 * only maps those immutable facts into UI-ready spans and labels.
 */
export function buildVisualTimelineModel(
  project: DriftProjectV4,
  movingMediaOrderInput: readonly string[],
): VisualTimelineModel {
  const movingMediaOrder = assertCanonicalMovingOrder(project, movingMediaOrderInput);
  const lifecycle = createPerformanceLifecycle(project.performance);
  const timingResolution = assertMasterAgreement(project, lifecycle, movingMediaOrder.length);
  const timingRead = readTimingIntent(project);
  const sequenceRead = readSequenceAuthoring(project);
  const compiled = sequenceRead.authoring
    ? compileSequence(sequenceRead.authoring, {
        bodyDurationSeconds: lifecycle.authoring.body.durationSeconds,
        movingSlideCount: movingMediaOrder.length,
      })
    : null;
  const authority: VisualTimelineAuthority = compiled ? "pass-sequence" : "legacy-tempo";
  const segments: VisualTimelineSegment[] = [];
  const entries: VisualTimelineTransitionSegment[] = [];
  const bodies: VisualTimelineBodySegment[] = [];
  const exits: VisualTimelineTransitionSegment[] = [];
  const passes: VisualTimelinePass[] = [];

  for (const scene of lifecycle.scenes) {
    if (scene.entry) {
      const entry = transitionSegment(
        "entry",
        scene.entry,
        scene.index,
        segments.length,
        lifecycle.totalDuration,
      );
      entries.push(entry);
      segments.push(entry);
    }
    for (const body of scene.bodies) {
      if (compiled) {
        for (const group of compiled.groups) {
          const segment = sequenceGroupSegment(
            body,
            group,
            compiled,
            segments.length,
            passes.length,
            lifecycle.totalDuration,
          );
          bodies.push(segment);
          segments.push(segment);
          passes.push(...segment.passes);
        }
      } else {
        const segment = legacyBodySegment(
          body,
          lifecycle,
          project.motion.seamless.loops,
          segments.length,
          passes.length,
          lifecycle.totalDuration,
        );
        bodies.push(segment);
        segments.push(segment);
        passes.push(...segment.passes);
      }
    }
    if (scene.exit) {
      const exit = transitionSegment(
        "exit",
        scene.exit,
        scene.index,
        segments.length,
        lifecycle.totalDuration,
      );
      exits.push(exit);
      segments.push(exit);
    }
  }

  assertContiguousTimeline(segments, lifecycle.totalDuration);
  return Object.freeze({
    totalDuration: lifecycle.totalDuration,
    authority,
    sequenceStatus: sequenceRead.status,
    timing: Object.freeze({
      mode: timingResolution.intent.mode,
      status: timingRead.status,
      protectedInput: timingResolution.protectedInput,
    }),
    movingMediaOrder,
    movingSlideCount: movingMediaOrder.length,
    sceneCount: lifecycle.sceneCount,
    bodyCycleCount: lifecycle.bodyCycleCount,
    entrySegments: Object.freeze(entries),
    bodySegments: Object.freeze(bodies),
    exitSegments: Object.freeze(exits),
    segments: Object.freeze(segments),
    passes: Object.freeze(passes),
    passBoundaries: createPassBoundaries(passes, lifecycle.totalDuration),
  });
}

function clampTime(value: number, totalDuration: number): number {
  if (Number.isNaN(value) || value === -Infinity) return 0;
  if (value === Infinity) return totalDuration;
  return Math.max(0, Math.min(totalDuration, value));
}

function locateSegment(
  segments: readonly VisualTimelineSegment[],
  time: number,
  atEnd: boolean,
): number {
  if (atEnd) return segments.length - 1;
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (time < segments[middle]!.end) high = middle;
    else low = middle + 1;
  }
  return low;
}

function firstBoundaryAtOrAfter(
  boundaries: readonly VisualTimelinePassBoundary[],
  time: number,
): number {
  let low = 0;
  let high = boundaries.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (boundaries[middle]!.time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Samples editor navigation facts without evaluating renderer state. Exact
 * segment joins belong to the next segment; the master endpoint belongs to the
 * final segment. Previous/next pass boundaries are strict, so arrow-key
 * navigation never returns the boundary already under the playhead.
 */
export function sampleVisualTimeline(
  model: VisualTimelineModel,
  requestedTimeInput: number,
): VisualTimelineSample {
  const time = clampTime(requestedTimeInput, model.totalDuration);
  const requestedTime = Number.isFinite(requestedTimeInput) ? requestedTimeInput : time;
  const atEnd = time === model.totalDuration;
  const segmentIndex = locateSegment(model.segments, time, atEnd);
  const segment = model.segments[segmentIndex]!;
  const localProgress = time <= segment.start
    ? 0
    : time >= segment.end
      ? 1
      : (time - segment.start) / segment.duration;

  const boundaries = model.passBoundaries;
  const insertionIndex = firstBoundaryAtOrAfter(boundaries, time);
  const exactIndex = insertionIndex < boundaries.length && boundaries[insertionIndex]!.time === time
    ? insertionIndex
    : -1;
  const previousIndex = exactIndex >= 0 ? exactIndex - 1 : insertionIndex - 1;
  const nextIndex = exactIndex >= 0 ? exactIndex + 1 : insertionIndex;
  const previousPassBoundary = previousIndex >= 0 ? boundaries[previousIndex]! : null;
  const nextPassBoundary = nextIndex < boundaries.length ? boundaries[nextIndex]! : null;
  const earlierNearest = exactIndex >= 0 ? boundaries[exactIndex]! : previousPassBoundary;
  const laterNearest = exactIndex >= 0 ? boundaries[exactIndex]! : nextPassBoundary;
  const nearestPassBoundary = earlierNearest === null
    ? laterNearest
    : laterNearest === null
      ? earlierNearest
      : time - earlierNearest.time <= laterNearest.time - time
        ? earlierNearest
        : laterNearest;

  return Object.freeze({
    requestedTime,
    time,
    atEnd,
    normalizedPlayhead: time / model.totalDuration,
    segmentIndex,
    segment,
    localProgress,
    nearestPassBoundary,
    previousPassBoundary,
    nextPassBoundary,
  });
}
