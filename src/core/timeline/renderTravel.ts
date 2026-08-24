import {
  evaluatePerformanceLifecycle,
  type PerformanceLifecycleSample,
  type PerformanceLifecycleTimeline,
} from "./performanceLifecycle";
import {
  evaluateCompiledSequence,
  type CompiledSequence,
} from "./sequenceCompiler";

export interface PerformanceTravelOptions {
  readonly direction: -1 | 1;
  readonly slidesPerSecond: number;
  readonly stride: number;
  readonly slotCount: number;
  readonly slideLayerCount: number;
  readonly seamless: boolean;
  readonly seamlessLoops: number;
}

export interface PerformanceTravelSample {
  readonly lifecycle: PerformanceLifecycleSample;
  readonly distance: number;
  readonly velocity: number;
  readonly acceleration: number;
  readonly distancePerBodyCycle: number;
}

function finiteAtOrAboveZero(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite number at or above zero.`);
  }
  return value;
}

function safeCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

/**
 * Converts lifecycle travel into renderer world units. One body cycle owns one
 * complete seamless strip when seamless output is active; otherwise it owns
 * the authored slides-per-second distance. Entry and exit never steal body
 * duration or silently move the strip.
 */
export function evaluatePerformanceTravel(
  timeline: PerformanceLifecycleTimeline,
  masterTime: number,
  options: PerformanceTravelOptions,
): PerformanceTravelSample {
  if (options.direction !== -1 && options.direction !== 1) {
    throw new TypeError("direction must be -1 or 1.");
  }
  const slidesPerSecond = finiteAtOrAboveZero(options.slidesPerSecond, "slidesPerSecond");
  const stride = finiteAtOrAboveZero(options.stride, "stride");
  const slotCount = safeCount(options.slotCount, "slotCount");
  const slideLayerCount = safeCount(options.slideLayerCount, "slideLayerCount");
  if (!Number.isSafeInteger(options.seamlessLoops) || options.seamlessLoops < 1) {
    throw new TypeError("seamlessLoops must be a positive safe integer.");
  }

  const lifecycle = evaluatePerformanceLifecycle(timeline, masterTime, slideLayerCount);
  const distancePerBodyCycle = options.seamless && slotCount > 0
    ? slotCount * stride * options.seamlessLoops
    : slidesPerSecond * stride * timeline.authoring.body.durationSeconds;
  const signedDistancePerBodyCycle = options.direction * distancePerBodyCycle;
  const distance = signedDistancePerBodyCycle * lifecycle.body.cumulativeTravel;
  const velocity = signedDistancePerBodyCycle * lifecycle.body.velocityPerSecond;
  const acceleration = signedDistancePerBodyCycle * lifecycle.body.accelerationPerSecondSquared;

  return {
    lifecycle,
    distancePerBodyCycle,
    distance: distance === 0 ? 0 : distance,
    velocity: velocity === 0 ? 0 : velocity,
    acceleration: acceleration === 0 ? 0 : acceleration,
  };
}

/**
 * Converts one compiled pass sequence into the same renderer travel contract.
 * Lifecycle repetition repeats the complete compiled sequence; entry and exit
 * hold its exact endpoints. The compiled body owns pace and pass boundaries.
 */
export function evaluateSequencePerformanceTravel(
  timeline: PerformanceLifecycleTimeline,
  masterTime: number,
  sequence: CompiledSequence,
  options: Pick<PerformanceTravelOptions, "direction" | "slideLayerCount">,
): PerformanceTravelSample {
  if (options.direction !== -1 && options.direction !== 1) {
    throw new TypeError("direction must be -1 or 1.");
  }
  const slideLayerCount = safeCount(options.slideLayerCount, "slideLayerCount");
  const lifecycle = evaluatePerformanceLifecycle(timeline, masterTime, slideLayerCount);
  const reducedMotion = lifecycle.reducedMotion;
  const bodySample = evaluateCompiledSequence(sequence, lifecycle.body.time);
  const completedBodyDistance = lifecycle.body.cycleIndex * sequence.totalDistanceSlides;
  const unsignedDistance = reducedMotion
    ? 0
    : completedBodyDistance + bodySample.distanceSlides;
  const activelyTravelling = lifecycle.phase === "body" && !reducedMotion;
  const distance = options.direction * unsignedDistance;
  const velocity = activelyTravelling
    ? options.direction * bodySample.velocitySlidesPerSecond
    : 0;
  const acceleration = activelyTravelling
    ? options.direction * bodySample.accelerationSlidesPerSecondSquared
    : 0;

  return {
    lifecycle,
    distancePerBodyCycle: sequence.totalDistanceSlides,
    distance: distance === 0 ? 0 : distance,
    velocity: velocity === 0 ? 0 : velocity,
    acceleration: acceleration === 0 ? 0 : acceleration,
  };
}

/** Studio autoplay repeats the authored performance without accumulating time. */
export function loopPerformanceTime(elapsedSeconds: number, totalDuration: number): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    throw new TypeError("totalDuration must be a finite number above zero.");
  }
  const remainder = elapsedSeconds % totalDuration;
  return remainder === 0 ? 0 : remainder;
}

/** A still should show the composition at rest, never the first blank entry frame. */
export function defaultPerformanceStillTime(timeline: PerformanceLifecycleTimeline): number {
  const firstBody = timeline.bodyCycles[0];
  if (!firstBody) return 0;
  return firstBody.start + firstBody.duration * 0.5;
}
