import type { DriftCreativeState, DriftProjectV4 } from "../project/schema";
import { deriveSlideGeometry, evaluateSpatialFrame } from "../spatial/spatial";
import { evaluateCadence } from "./cadence";
import { planSemanticEventsFromRawTimeline } from "./eventPlanner";
import type { FrameEvaluation } from "./FrameEvaluation";
import { poseCadenceFps, samplePoseTime } from "./master";
import { canonicalZero, positiveModulo, TAU, TIMELINE_EPSILON } from "./math";
import {
  createPerformanceLifecycle,
  evaluatePerformanceLifecycle,
  type PerformanceLifecycleSample,
  type PerformanceLifecycleTimeline,
} from "./performanceLifecycle";
import { evaluatePerformanceTravel, type PerformanceTravelSample } from "./renderTravel";

export interface EvaluateV2FrameOptions {
  frameIndex?: number | null;
  previousTime?: number | null;
  reducedMotion?: boolean;
  /** Session-only preview travel, expressed in canonical slide strides. */
  interactionSlides?: number;
}

export interface EvaluatedV2Frame {
  frame: FrameEvaluation;
  lifecycle: PerformanceLifecycleSample;
}

// A card fragment below this threshold reads as a rendering accident. Keep it
// fully absent, then ease it into authored opacity before a third of the card
// has crossed the physical stage edge. These values belong to the V2 render
// contract only; V1-compatible spatial pixels remain untouched.
const REVEAL_HIDDEN_FRACTION = 0.1;
const REVEAL_FULL_FRACTION = 0.325;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return progress * progress * (3 - 2 * progress);
}

function applyStageRevealEnvelope(
  project: DriftCreativeState,
  sourceCount: number,
  slides: FrameEvaluation["slides"],
): FrameEvaluation["slides"] {
  const geometry = deriveSlideGeometry(project, sourceCount);
  const stageHalfExtent = geometry.axisExtent / 2;
  const unscaledCardExtent = project.motion.transport.axis === "horizontal"
    ? geometry.width
    : geometry.height;

  return slides.map((slide) => {
    const cardExtent = Math.max(TIMELINE_EPSILON, unscaledCardExtent * slide.scale);
    const cardHalfExtent = cardExtent / 2;
    const intersection = Math.max(
      0,
      Math.min(stageHalfExtent, slide.primary + cardHalfExtent)
        - Math.max(-stageHalfExtent, slide.primary - cardHalfExtent),
    );
    const visibleFraction = Math.max(0, Math.min(1, intersection / cardExtent));
    const reveal = smoothstep(REVEAL_HIDDEN_FRACTION, REVEAL_FULL_FRACTION, visibleFraction);
    return {
      ...slide,
      opacity: canonicalZero(slide.opacity * reveal),
    };
  });
}

function lifecycleTimeline(project: DriftProjectV4, reducedMotion: boolean): PerformanceLifecycleTimeline {
  return createPerformanceLifecycle({
    ...project.performance,
    reducedMotion: reducedMotion || project.master.reducedMotion || project.performance.reducedMotion === true,
  });
}

function travelAt(
  project: DriftCreativeState,
  timeline: PerformanceLifecycleTimeline,
  sourceCount: number,
  time: number,
  samplePose: boolean,
): { time: number; lifecycle: PerformanceLifecycleSample; travel: PerformanceTravelSample } {
  const sampledTime = samplePose
    ? samplePoseTime(time, project.motion.cadence.poseCadence, timeline.totalDuration)
    : Math.max(0, Math.min(timeline.totalDuration, Number.isFinite(time) ? time : 0));
  const lifecycle = evaluatePerformanceLifecycle(timeline, sampledTime, sourceCount);
  const travel = evaluatePerformanceTravel(timeline, sampledTime, {
    direction: project.motion.transport.direction,
    slidesPerSecond: project.motion.transport.slidesPerSecond,
    stride: 1,
    // A seamless body owns one exact source-deck pass. Renderer padding is
    // never allowed to turn into authored content distance.
    slotCount: sourceCount,
    slideLayerCount: sourceCount,
    seamless: project.motion.seamless.enabled,
    seamlessLoops: Math.max(1, Math.round(project.motion.seamless.loops)),
  });
  return { time: sampledTime, lifecycle, travel };
}

function visibleDistance(project: DriftCreativeState, travel: PerformanceTravelSample): number {
  const cadence = evaluateCadence(project, Math.abs(travel.distance));
  return canonicalZero(project.motion.transport.direction * (cadence.cycle + cadence.progress));
}

function wrappedInteractionSlides(value: number | undefined, virtualSlotCount: number): number {
  if (value === undefined || !Number.isFinite(value) || virtualSlotCount <= 0) return 0;
  return canonicalZero(
    positiveModulo(value + virtualSlotCount / 2, virtualSlotCount) - virtualSlotCount / 2,
  );
}

function previousImplicitFrameTime(time: number, masterFps: number): number | null {
  if (time <= TIMELINE_EPSILON) return null;
  const nearestFrameIndex = Math.round(time * masterFps);
  const nearestFrameTime = nearestFrameIndex / masterFps;
  if (nearestFrameIndex > 0 && Math.abs(time - nearestFrameTime) <= TIMELINE_EPSILON) {
    // Use the same division as explicit sequence authority so aligned preview
    // and still samples are bit-identical, not only visually equivalent.
    return (nearestFrameIndex - 1) / masterFps;
  }
  return Math.max(0, time - 1 / masterFps);
}

/**
 * Pure Project V4 timeline evaluation for the drift-v2/1 contract. Entry,
 * body, exit, repeats, tempo, pose exposure, semantic events, and spatial
 * placement all derive from one explicit time request.
 */
export function evaluateV2Frame(
  projectInput: DriftProjectV4,
  sourceOrder: readonly string[],
  time: number,
  options: EvaluateV2FrameOptions = {},
): EvaluatedV2Frame {
  const project = projectInput;
  const frameIndex = options.frameIndex ?? null;
  const reducedMotion = options.reducedMotion === true;
  const timeline = lifecycleTimeline(projectInput, reducedMotion);
  const clampedTime = Math.max(0, Math.min(timeline.totalDuration, Number.isFinite(time) ? time : 0));
  const current = travelAt(project, timeline, sourceOrder.length, clampedTime, true);
  const cadence = evaluateCadence(project, Math.abs(current.travel.distance));
  const geometry = deriveSlideGeometry(project, sourceOrder.length);
  const interactionSlides = wrappedInteractionSlides(
    options.interactionSlides,
    geometry.virtualSlotCount,
  );
  const currentVisibleDistance = canonicalZero(
    visibleDistance(project, current.travel) + interactionSlides,
  );
  const poseFps = poseCadenceFps(project.motion.cadence.poseCadence);
  const previousTime = options.previousTime !== undefined
    ? options.previousTime
    : frameIndex !== null
      ? frameIndex > 0
        ? (frameIndex - 1) / project.master.fps
        : null
      // Preview and still requests have no discrete frame identity. One
      // master-frame lookback keeps held-pose velocity and diagnostic event
      // windows identical to a sequence sample at the same explicit time.
      // Event consumers must deduplicate stable IDs when preview paints more
      // frequently than the authored master rate.
      : previousImplicitFrameTime(clampedTime, project.master.fps);

  let velocity = project.motion.transport.direction
    * cadence.derivative
    * Math.abs(current.travel.velocity);
  let acceleration = project.motion.transport.direction * (
    cadence.secondDerivative * Math.abs(current.travel.velocity) ** 2
    + cadence.derivative * project.motion.transport.direction * current.travel.acceleration
  );
  if (previousTime !== null) {
    const previous = travelAt(project, timeline, sourceOrder.length, previousTime, true);
    if (Math.abs(previous.time - current.time) <= TIMELINE_EPSILON) {
      velocity = 0;
      acceleration = 0;
    } else if (poseFps) {
      const elapsed = Math.max(1 / 240, clampedTime - Math.max(0, previousTime));
      const previousVisibleDistance = canonicalZero(
        visibleDistance(project, previous.travel) + interactionSlides,
      );
      velocity = (currentVisibleDistance - previousVisibleDistance) / elapsed;
      acceleration = 0;
    }
  } else if (poseFps) {
    velocity = 0;
    acceleration = 0;
  }

  const sourceCount = sourceOrder.length;
  const logicalSlot = Math.max(0, cadence.cycle + (cadence.focusHandoff >= 0.5 ? 1 : 0));
  const sourceIndex = sourceCount > 0 ? positiveModulo(logicalSlot, sourceCount) : 0;
  const previousSourceIndex = sourceCount > 0 ? positiveModulo(logicalSlot - 1, sourceCount) : 0;
  const rawMagnitude = Math.abs(current.travel.distance);
  const masterPhase = timeline.totalDuration > 0 ? current.time / timeline.totalDuration * TAU : 0;
  const trackPhase = sourceCount > 0
    ? positiveModulo(Math.abs(currentVisibleDistance) / sourceCount, 1) * TAU
    : 0;
  const rawDistanceAtTime = (requestedTime: number) => Math.abs(
    travelAt(project, timeline, sourceCount, requestedTime, false).travel.distance,
  );

  const base: Omit<FrameEvaluation, "slides"> = {
    time: clampedTime,
    frameIndex,
    master: {
      phase: masterPhase,
      loopIndex: sourceCount > 0 ? Math.floor(rawMagnitude / sourceCount) : 0,
      reducedMotion: timeline.authoring.reducedMotion === true,
    },
    track: {
      rawDistance: canonicalZero(current.travel.distance),
      visibleDistance: currentVisibleDistance,
      velocity: canonicalZero(velocity),
      acceleration: canonicalZero(acceleration),
      direction: project.motion.transport.direction,
      resting: Math.abs(velocity) <= TIMELINE_EPSILON && Math.abs(acceleration) <= TIMELINE_EPSILON,
    },
    cadence: {
      beat: cadence.beat,
      poseIndex: poseFps ? Math.floor(current.time * poseFps + TIMELINE_EPSILON) : null,
      holdProgress: cadence.beatProgress,
      focusHandoff: cadence.focusHandoff,
    },
    focus: {
      logicalSlot,
      sourceIndex,
      previousSourceIndex,
    },
    phases: {
      material: trackPhase * 2,
      lighting: masterPhase,
      atmosphere: masterPhase,
      lens: masterPhase,
    },
    events: previousTime === null
      ? clampedTime <= TIMELINE_EPSILON
        ? planSemanticEventsFromRawTimeline(project, 0, 0, {
            duration: timeline.totalDuration,
            sourceCount,
            rawDistanceAtTime,
          })
        : []
      : previousTime <= clampedTime
        ? planSemanticEventsFromRawTimeline(project, Math.max(0, previousTime), clampedTime, {
            duration: timeline.totalDuration,
            sourceCount,
            rawDistanceAtTime,
          })
        : [],
  };

  const spatialSlides = evaluateSpatialFrame(project, sourceCount, base, sourceOrder);
  return {
    frame: {
      ...base,
      slides: applyStageRevealEnvelope(project, sourceCount, spatialSlides),
    },
    lifecycle: current.lifecycle,
  };
}
