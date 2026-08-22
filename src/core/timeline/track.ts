import type { DriftCreativeState } from "../project/schema";
import { evaluateCadence, type CadenceEvaluation } from "./cadence";
import { evaluateMasterTimeline, samplePoseTime, type MasterTimelineSample } from "./master";
import { canonicalZero } from "./math";
import { evaluatePerformance, type PerformanceSample } from "./performance";

export interface TrackEvaluation {
  requestedTime: number;
  poseTime: number;
  master: MasterTimelineSample;
  performance: PerformanceSample;
  cadence: CadenceEvaluation;
  totalTravelSlides: number;
  rawSlides: number;
  rawVelocitySlidesPerSecond: number;
  rawAccelerationSlidesPerSecondSquared: number;
  visibleSlides: number;
  visibleVelocitySlidesPerSecond: number;
  visibleAccelerationSlidesPerSecondSquared: number;
}

export interface TrackEvaluationOptions {
  samplePose?: boolean;
}

export function totalMasterTravelSlides(project: DriftCreativeState): number {
  if (project.master.reducedMotion) return 0;
  const sourceCount = project.media.order.length;
  if (project.motion.seamless.enabled) {
    return sourceCount > 0 ? sourceCount * project.motion.seamless.loops : 0;
  }
  return project.motion.transport.slidesPerSecond * project.master.duration;
}

export function evaluateTrack(
  project: DriftCreativeState,
  time: number,
  options: TrackEvaluationOptions = {},
): TrackEvaluation {
  const requestedTime = Math.min(project.master.duration, Math.max(0, Number.isFinite(time) ? time : 0));
  const poseTime = options.samplePose === false
    ? requestedTime
    : samplePoseTime(requestedTime, project.motion.cadence.poseCadence, project.master.duration);
  const master = evaluateMasterTimeline(project, poseTime);
  const performance = evaluatePerformance(
    master.progress,
    master.velocityPerSecond,
    master.accelerationPerSecondSquared,
    project.motion.character.id,
    project.motion.character.amount,
  );
  const totalTravelSlides = totalMasterTravelSlides(project);
  const rawSlides = canonicalZero(totalTravelSlides * performance.progress);
  const rawVelocitySlidesPerSecond = canonicalZero(totalTravelSlides * performance.velocityPerSecond);
  const rawAccelerationSlidesPerSecondSquared = canonicalZero(totalTravelSlides * performance.accelerationPerSecondSquared);
  const cadence = evaluateCadence(project, rawSlides);
  const visibleMagnitude = cadence.cycle + cadence.progress;
  const visibleVelocityMagnitude = cadence.derivative * rawVelocitySlidesPerSecond;
  const visibleAccelerationMagnitude = cadence.secondDerivative
    * rawVelocitySlidesPerSecond * rawVelocitySlidesPerSecond
    + cadence.derivative * rawAccelerationSlidesPerSecondSquared;
  const direction = project.motion.transport.direction;

  return {
    requestedTime,
    poseTime,
    master,
    performance,
    cadence,
    totalTravelSlides,
    rawSlides,
    rawVelocitySlidesPerSecond,
    rawAccelerationSlidesPerSecondSquared,
    visibleSlides: canonicalZero(direction * visibleMagnitude),
    visibleVelocitySlidesPerSecond: canonicalZero(direction * visibleVelocityMagnitude),
    visibleAccelerationSlidesPerSecondSquared: canonicalZero(direction * visibleAccelerationMagnitude),
  };
}
