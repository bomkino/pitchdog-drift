import type { DriftProjectV3 } from "../project/schema";
import { planSemanticEvents } from "./eventPlanner";
import type { EvaluatedFrameSlide, FrameEvaluation } from "./FrameEvaluation";
import { poseCadenceFps } from "./master";
import { positiveModulo, TAU, TIMELINE_EPSILON } from "./math";
import { evaluateTrack, type TrackEvaluation } from "./track";

export interface SpatialEvaluationContext {
  project: DriftProjectV3;
  sourceCount: number;
  track: TrackEvaluation;
  frame: Omit<FrameEvaluation, "slides">;
}

export type SpatialEvaluator = (context: SpatialEvaluationContext) => EvaluatedFrameSlide[];

export interface EvaluateFrameOptions {
  frameIndex?: number | null;
  previousTime?: number | null;
  spatialEvaluator?: SpatialEvaluator;
}

function sourceIndex(value: number, sourceCount: number): number {
  if (sourceCount <= 0) return 0;
  return positiveModulo(value, sourceCount);
}

function resolvedTrackMotion(
  project: DriftProjectV3,
  current: TrackEvaluation,
  previousTime: number | null,
): { velocity: number; acceleration: number } {
  if (!poseCadenceFps(project.motion.cadence.poseCadence)) {
    return {
      velocity: current.visibleVelocitySlidesPerSecond,
      acceleration: current.visibleAccelerationSlidesPerSecondSquared,
    };
  }
  if (previousTime === null) return { velocity: 0, acceleration: 0 };
  const previous = evaluateTrack(project, previousTime);
  if (Math.abs(previous.poseTime - current.poseTime) <= TIMELINE_EPSILON) return { velocity: 0, acceleration: 0 };
  const elapsed = Math.max(1 / 240, current.requestedTime - Math.max(0, previousTime));
  return {
    velocity: (current.visibleSlides - previous.visibleSlides) / elapsed,
    acceleration: 0,
  };
}

export function evaluateFrame(
  project: DriftProjectV3,
  time: number,
  options: EvaluateFrameOptions = {},
): FrameEvaluation {
  const clampedTime = Math.max(0, Math.min(project.master.duration, Number.isFinite(time) ? time : 0));
  const frameIndex = options.frameIndex ?? null;
  const previousTime = options.previousTime !== undefined
    ? options.previousTime
    : frameIndex !== null && frameIndex > 0
      ? (frameIndex - 1) / project.master.fps
      : null;
  const track = evaluateTrack(project, clampedTime);
  const motion = resolvedTrackMotion(project, track, previousTime);
  const sourceCount = project.media.order.length;
  const visibleMagnitude = Math.abs(track.visibleSlides);
  const logicalSlot = Math.max(0, Math.floor(visibleMagnitude + track.cadence.focusHandoff + TIMELINE_EPSILON));
  const currentSource = sourceIndex(logicalSlot, sourceCount);
  const previousSource = sourceIndex(logicalSlot - 1, sourceCount);
  const loopIndex = sourceCount > 0 ? Math.floor(track.rawSlides / sourceCount) : 0;
  const phaseTurns = project.motion.seamless.enabled ? project.motion.seamless.loops : 1;
  const masterPhase = track.performance.progress * TAU * phaseTurns;
  const trackPhase = sourceCount > 0
    ? positiveModulo(visibleMagnitude / sourceCount, 1) * TAU
    : 0;

  const base: Omit<FrameEvaluation, "slides"> = {
    time: clampedTime,
    frameIndex,
    master: {
      phase: masterPhase,
      loopIndex,
      reducedMotion: project.master.reducedMotion,
    },
    track: {
      rawDistance: project.motion.transport.direction * track.rawSlides,
      visibleDistance: track.visibleSlides,
      velocity: motion.velocity,
      acceleration: motion.acceleration,
      direction: project.motion.transport.direction,
      resting: Math.abs(motion.velocity) <= TIMELINE_EPSILON && Math.abs(motion.acceleration) <= TIMELINE_EPSILON,
    },
    cadence: {
      beat: track.cadence.beat,
      poseIndex: poseCadenceFps(project.motion.cadence.poseCadence)
        ? Math.floor(track.poseTime * (poseCadenceFps(project.motion.cadence.poseCadence) ?? 1) + TIMELINE_EPSILON)
        : null,
      holdProgress: track.cadence.beatProgress,
      focusHandoff: track.cadence.focusHandoff,
    },
    focus: {
      logicalSlot,
      sourceIndex: currentSource,
      previousSourceIndex: previousSource,
    },
    phases: {
      material: trackPhase * 2,
      lighting: masterPhase,
      atmosphere: masterPhase,
      lens: masterPhase,
    },
    events: previousTime === null
      ? clampedTime <= TIMELINE_EPSILON ? planSemanticEvents(project, 0, 0) : []
      : planSemanticEvents(project, Math.max(0, previousTime), clampedTime),
  };

  const slides = options.spatialEvaluator?.({ project, sourceCount, track, frame: base }) ?? [];
  return { ...base, slides };
}
