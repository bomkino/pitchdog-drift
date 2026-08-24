import { resolveMovingMedia } from "../project/movingMedia";
import type { DriftProjectV4, PoseCadence } from "../project/schema";
import { getExportFrameCount, type ExportSettings } from "../../lib/exportContract";
import { poseCadenceFps } from "./master";
import type { PerformanceLifecycleTimeline } from "./performanceLifecycle";
import { evaluateTempoCurve, invertTempoCurveProgress } from "./tempoCurve";
import { readTimingIntent, type TimingMode, type TimingProtectedInput } from "./timingIntent";
import { compileSequence, type CompiledSequence } from "./sequenceCompiler";
import {
  readSequenceAuthoring,
  type SequenceAuthoringRead,
  type SequencePace,
} from "./sequenceAuthoring";

export type DeliveryContainer = "mp4" | "png-sequence" | "png-still";
export type ExportWorkloadClass = "light" | "moderate" | "heavy" | "extreme";

export type DeliveryExportSettings = Pick<ExportSettings, "width" | "height" | "fps" | "duration"> & {
  readonly container?: DeliveryContainer;
};

export interface DeckPassBoundary {
  readonly index: number;
  readonly indexInBody: number;
  readonly bodyCycleIndex: number;
  readonly sceneIndex: number;
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  readonly groupIndex?: number;
  readonly sourceGroupIndex?: number;
  readonly repeatIndex?: number;
  readonly groupId?: string;
  readonly groupLabel?: string;
  readonly pace?: SequencePace;
  readonly relativeSecondsPerPass?: number;
}

export interface DeckPassGroupBoundary {
  readonly index: number;
  readonly indexInBody: number;
  readonly bodyCycleIndex: number;
  readonly sceneIndex: number;
  readonly sourceGroupIndex: number;
  readonly repeatIndex: number;
  readonly id: string;
  readonly label: string;
  readonly pace: SequencePace;
  readonly passes: number;
  readonly relativeSecondsPerPass: number;
  readonly startPass: number;
  readonly endPass: number;
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

export interface DeliveryReceipt {
  readonly timing: {
    readonly mode: TimingMode;
    readonly protectedInput: TimingProtectedInput;
    readonly intentStatus: ReturnType<typeof readTimingIntent>["status"];
    readonly secondsPerSlide: number;
  };
  readonly media: {
    readonly movingSlideCount: number;
    readonly movingMediaOrder: readonly string[];
    readonly pinnedOnlyAssetExcluded: boolean;
    readonly excludedPinnedOnlyAssetId: string | null;
  };
  readonly passes: {
    readonly authority?: "legacy-tempo" | "pass-sequence";
    readonly sequenceStatus?: SequenceAuthoringRead["status"];
    readonly deckPassesPerBody: number;
    readonly totalDeckPasses: number;
    readonly sceneRepeatMode: PerformanceLifecycleTimeline["repeatMode"];
    readonly sceneRepeatCount: number;
    readonly legacyBodyRepeatCount: number;
    readonly boundaries: readonly DeckPassBoundary[];
    readonly groups?: readonly DeckPassGroupBoundary[];
  };
  readonly segments: {
    readonly entrySeconds: number;
    readonly bodySeconds: number;
    readonly exitSeconds: number;
    readonly masterSeconds: number;
  };
  readonly pace: {
    readonly averageSlidesPerSecond: number;
    readonly minimumSlidesPerSecond: number;
    readonly peakSlidesPerSecond: number;
    /** Mechanical timing diagnostic only; it does not inspect slide content. */
    readonly approximateAverageReadWindowSeconds: number | null;
  };
  readonly output: {
    readonly width: number;
    readonly height: number;
    readonly aspectRatio: number;
    readonly aspectLabel: string;
    readonly fps: number;
    readonly frameCount: number;
    readonly encodedDurationSeconds: number;
    readonly durationQuantizationDeltaSeconds: number;
    readonly container: DeliveryContainer;
  };
  readonly cadence: {
    readonly authored: PoseCadence;
    readonly poseFps: number | null;
    readonly compatibility: "continuous" | "exact-holds" | "mixed-holds";
    readonly frameHolds: readonly number[];
    readonly endpointMismatch: boolean;
  };
  readonly seamlessClosure: {
    readonly closes: boolean;
    readonly status: "clean" | "not-authored" | "empty-track";
  };
  readonly sound: {
    readonly exportEnabled: boolean;
    readonly masterAudioEnabled: boolean;
    readonly deterministicEventCount: number;
  };
  readonly presenter: {
    readonly enabled: boolean;
    readonly assetId: string | null;
    readonly assetKind: "image" | "video" | null;
    readonly trackMode: DriftProjectV4["presenter"]["trackMode"];
    readonly participatesInMovingTrack: boolean;
    readonly participatesInEntry: boolean;
    readonly participatesInExit: boolean;
  };
  readonly transparency: {
    readonly requested: boolean;
    readonly containerSupportsTransparency: boolean;
    readonly compatible: boolean;
  };
  readonly workload: {
    readonly pixelCount: number;
    readonly pixelFrames: number;
    readonly class: ExportWorkloadClass;
  };
}

export interface BuildDeliveryReceiptInput {
  readonly project: DriftProjectV4;
  readonly movingMediaOrder: readonly string[];
  readonly exportSettings: DeliveryExportSettings;
  /** The already-deterministic sound/event plan that export will consume. */
  readonly eventPlan: readonly unknown[];
  readonly lifecycle: PerformanceLifecycleTimeline;
}

const EPSILON = 1e-9;

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function aspectLabel(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function cadenceFacts(
  cadence: PoseCadence,
  outputFps: number,
  frameCount: number,
  authoredDuration: number,
  encodedDuration: number,
): DeliveryReceipt["cadence"] {
  const poseFps = poseCadenceFps(cadence);
  if (poseFps === null) {
    return Object.freeze({
      authored: cadence,
      poseFps: null,
      compatibility: "continuous" as const,
      frameHolds: Object.freeze([] as number[]),
      endpointMismatch: Math.abs(encodedDuration - authoredDuration) > EPSILON,
    });
  }

  const cycleFrames = outputFps / greatestCommonDivisor(outputFps, poseFps);
  const holds: number[] = [];
  let activePose = -1;
  for (let frame = 0; frame < cycleFrames; frame += 1) {
    const pose = Math.floor(frame * poseFps / outputFps);
    if (pose !== activePose) {
      holds.push(1);
      activePose = pose;
    } else {
      holds[holds.length - 1]! += 1;
    }
  }
  const frameHolds = [...new Set(holds)].sort((a, b) => a - b);
  const cadenceEndsExactly = (frameCount * poseFps) % outputFps === 0;
  return Object.freeze({
    authored: cadence,
    poseFps,
    compatibility: outputFps % poseFps === 0 ? "exact-holds" as const : "mixed-holds" as const,
    frameHolds: Object.freeze(frameHolds),
    endpointMismatch: !cadenceEndsExactly || Math.abs(encodedDuration - authoredDuration) > EPSILON,
  });
}

function workloadClass(pixelFrames: number): ExportWorkloadClass {
  if (pixelFrames < 500_000_000) return "light";
  if (pixelFrames < 2_000_000_000) return "moderate";
  if (pixelFrames < 8_000_000_000) return "heavy";
  return "extreme";
}

function passBoundaries(
  lifecycle: PerformanceLifecycleTimeline,
  deckPasses: number,
): readonly DeckPassBoundary[] {
  const boundaries: DeckPassBoundary[] = [];
  for (const body of lifecycle.bodyCycles) {
    let start = body.start;
    for (let indexInBody = 0; indexInBody < deckPasses; indexInBody += 1) {
      const progress = (indexInBody + 1) / deckPasses;
      const end = body.start
        + body.duration * invertTempoCurveProgress(lifecycle.tempoCurve, progress);
      boundaries.push(Object.freeze({
        index: boundaries.length,
        indexInBody,
        bodyCycleIndex: body.index,
        sceneIndex: body.sceneIndex,
        start,
        end,
        duration: end - start,
      }));
      start = end;
    }
  }
  return Object.freeze(boundaries);
}

function compiledPassBoundaries(
  lifecycle: PerformanceLifecycleTimeline,
  sequence: CompiledSequence,
): readonly DeckPassBoundary[] {
  const boundaries: DeckPassBoundary[] = [];
  for (const body of lifecycle.bodyCycles) {
    for (const pass of sequence.passes) {
      boundaries.push(Object.freeze({
        index: boundaries.length,
        indexInBody: pass.index,
        bodyCycleIndex: body.index,
        sceneIndex: body.sceneIndex,
        start: body.start + pass.start,
        end: body.start + pass.end,
        duration: pass.duration,
        groupIndex: pass.groupIndex,
        sourceGroupIndex: pass.sourceGroupIndex,
        repeatIndex: pass.repeatIndex,
        groupId: pass.groupId,
        groupLabel: pass.groupLabel,
        pace: pass.pace,
        relativeSecondsPerPass: pass.relativeSecondsPerPass,
      }));
    }
  }
  return Object.freeze(boundaries);
}

function compiledGroupBoundaries(
  lifecycle: PerformanceLifecycleTimeline,
  sequence: CompiledSequence,
): readonly DeckPassGroupBoundary[] {
  const boundaries: DeckPassGroupBoundary[] = [];
  for (const body of lifecycle.bodyCycles) {
    for (const group of sequence.groups) {
      boundaries.push(Object.freeze({
        index: boundaries.length,
        indexInBody: group.index,
        bodyCycleIndex: body.index,
        sceneIndex: body.sceneIndex,
        sourceGroupIndex: group.sourceGroupIndex,
        repeatIndex: group.repeatIndex,
        id: group.id,
        label: group.label,
        pace: group.pace,
        passes: group.passes,
        relativeSecondsPerPass: group.relativeSecondsPerPass,
        startPass: group.startPass,
        endPass: group.endPass,
        start: body.start + group.start,
        end: body.start + group.end,
        duration: group.duration,
      }));
    }
  }
  return Object.freeze(boundaries);
}

/** Builds immutable export facts. It performs no formatting, mutation, or ETA guess. */
export function buildDeliveryReceipt(input: BuildDeliveryReceiptInput): DeliveryReceipt {
  const { project, lifecycle, exportSettings } = input;
  const canonicalMovingMedia = resolveMovingMedia(project);
  if (
    input.movingMediaOrder.length !== canonicalMovingMedia.order.length
    || input.movingMediaOrder.some((assetId, index) => assetId !== canonicalMovingMedia.order[index])
  ) {
    throw new TypeError("Delivery receipt moving-media order does not match Project V4.");
  }
  if (Math.abs(lifecycle.totalDuration - project.master.duration) > EPSILON) {
    throw new TypeError("Delivery receipt lifecycle duration does not match Project V4 master duration.");
  }
  if (Math.abs(exportSettings.duration - project.master.duration) > EPSILON) {
    throw new TypeError("Delivery receipt export duration does not match Project V4 master duration.");
  }
  const sequenceRead = readSequenceAuthoring(project);
  const sequence = sequenceRead.authoring
    ? compileSequence(sequenceRead.authoring, {
        bodyDurationSeconds: lifecycle.authoring.body.durationSeconds,
        movingSlideCount: canonicalMovingMedia.count,
      })
    : null;
  if (
    sequence === null
    && (!Number.isSafeInteger(project.motion.seamless.loops) || project.motion.seamless.loops < 1)
  ) {
    throw new TypeError("Delivery receipt deck-pass count must be a positive safe integer.");
  }

  const timingRead = readTimingIntent(project);
  const deckPasses = sequence?.totalPasses ?? project.motion.seamless.loops;
  const boundaries = sequence
    ? compiledPassBoundaries(lifecycle, sequence)
    : passBoundaries(lifecycle, deckPasses);
  const groupBoundaries = sequence ? compiledGroupBoundaries(lifecycle, sequence) : Object.freeze([]);
  const entrySeconds = lifecycle.scenes.reduce((total, scene) => total + (scene.entry?.duration ?? 0), 0);
  const bodySeconds = lifecycle.bodyCycles.reduce((total, body) => total + body.duration, 0);
  const exitSeconds = lifecycle.scenes.reduce((total, scene) => total + (scene.exit?.duration ?? 0), 0);
  const totalSlideDistance = canonicalMovingMedia.count * boundaries.length;
  const averageSlidesPerSecond = bodySeconds > 0 ? totalSlideDistance / bodySeconds : 0;
  const tempoVelocities = sequence
    ? null
    : [0, 0.5, 1].map((time) => evaluateTempoCurve(lifecycle.tempoCurve, time).velocity);
  const minimumSlidesPerSecond = sequence
    ? sequence.minimumVelocitySlidesPerSecond
    : averageSlidesPerSecond * Math.min(...tempoVelocities!);
  const peakSlidesPerSecond = sequence
    ? sequence.peakVelocitySlidesPerSecond
    : averageSlidesPerSecond * Math.max(...tempoVelocities!);

  const frameCount = getExportFrameCount(exportSettings);
  const encodedDurationSeconds = frameCount / exportSettings.fps;
  const container = exportSettings.container ?? "mp4";
  const containerSupportsTransparency = container !== "mp4";
  const requestedTransparency = project.composition.alphaMode === "transparent";
  const pixelCount = exportSettings.width * exportSettings.height;
  const pixelFrames = pixelCount * frameCount;
  const presenterAsset = project.presenter.assetId === null
    ? null
    : project.media.assets[project.presenter.assetId] ?? null;
  const presenterInMovingTrack = project.presenter.assetId !== null
    && canonicalMovingMedia.order.includes(project.presenter.assetId);

  return Object.freeze({
    timing: Object.freeze({
      mode: timingRead.intent.mode,
      protectedInput: timingRead.intent.mode === "fixed-master" ? "master-duration" : "seconds-per-slide",
      intentStatus: timingRead.status,
      secondsPerSlide: timingRead.intent.secondsPerSlide,
    }),
    media: Object.freeze({
      movingSlideCount: canonicalMovingMedia.count,
      movingMediaOrder: canonicalMovingMedia.order,
      pinnedOnlyAssetExcluded: canonicalMovingMedia.pinnedOnlyAssetExcluded,
      excludedPinnedOnlyAssetId: canonicalMovingMedia.excludedPinnedOnlyAssetId,
    }),
    passes: Object.freeze({
      authority: sequence ? "pass-sequence" as const : "legacy-tempo" as const,
      sequenceStatus: sequenceRead.status,
      deckPassesPerBody: deckPasses,
      totalDeckPasses: boundaries.length,
      sceneRepeatMode: lifecycle.repeatMode,
      sceneRepeatCount: lifecycle.repeatMode === "full-scene" ? lifecycle.repeatCount : 1,
      legacyBodyRepeatCount: lifecycle.repeatMode === "body" ? lifecycle.repeatCount : 0,
      boundaries,
      groups: groupBoundaries,
    }),
    segments: Object.freeze({
      entrySeconds,
      bodySeconds,
      exitSeconds,
      masterSeconds: lifecycle.totalDuration,
    }),
    pace: Object.freeze({
      averageSlidesPerSecond,
      minimumSlidesPerSecond,
      peakSlidesPerSecond,
      approximateAverageReadWindowSeconds: averageSlidesPerSecond > 0
        ? 1 / averageSlidesPerSecond
        : null,
    }),
    output: Object.freeze({
      width: exportSettings.width,
      height: exportSettings.height,
      aspectRatio: exportSettings.width / exportSettings.height,
      aspectLabel: aspectLabel(exportSettings.width, exportSettings.height),
      fps: exportSettings.fps,
      frameCount,
      encodedDurationSeconds,
      durationQuantizationDeltaSeconds: encodedDurationSeconds - exportSettings.duration,
      container,
    }),
    cadence: cadenceFacts(
      project.motion.cadence.poseCadence,
      exportSettings.fps,
      frameCount,
      project.master.duration,
      encodedDurationSeconds,
    ),
    seamlessClosure: Object.freeze({
      closes: (sequence !== null || project.motion.seamless.enabled) && canonicalMovingMedia.count > 0,
      status: canonicalMovingMedia.count === 0
        ? "empty-track" as const
        : sequence !== null || project.motion.seamless.enabled
          ? "clean" as const
          : "not-authored" as const,
    }),
    sound: Object.freeze({
      exportEnabled: project.sound.exportEnabled,
      masterAudioEnabled: project.master.audio.enabled,
      deterministicEventCount: project.sound.exportEnabled ? input.eventPlan.length : 0,
    }),
    presenter: Object.freeze({
      enabled: project.presenter.enabled,
      assetId: project.presenter.assetId,
      assetKind: presenterAsset?.kind ?? null,
      trackMode: project.presenter.trackMode,
      participatesInMovingTrack: presenterInMovingTrack,
      participatesInEntry: project.presenter.enabled
        && lifecycle.authoring.entry.enabled
        && lifecycle.authoring.entry.includePresenter === true,
      participatesInExit: project.presenter.enabled
        && lifecycle.authoring.exit.enabled
        && lifecycle.authoring.exit.includePresenter === true,
    }),
    transparency: Object.freeze({
      requested: requestedTransparency,
      containerSupportsTransparency,
      compatible: !requestedTransparency || containerSupportsTransparency,
    }),
    workload: Object.freeze({
      pixelCount,
      pixelFrames,
      class: workloadClass(pixelFrames),
    }),
  });
}
