import type { SemanticEvent, SemanticEventType } from "../events/SemanticEvent";
import type { DriftProjectV3 } from "../project/schema";
import { cadenceSchedule } from "./cadence";
import { quantizeEventTimeToPose } from "./master";
import { stableEventTime, TIMELINE_EPSILON } from "./math";
import { evaluateTrack } from "./track";

interface PlannedThreshold {
  type: SemanticEventType;
  phase: number;
  intensity: number;
}

function sourceIndex(sequence: number, sourceCount: number): number | null {
  if (sourceCount <= 0) return null;
  return ((sequence % sourceCount) + sourceCount) % sourceCount;
}

function defaultRawDistanceAtTime(project: DriftProjectV3, time: number): number {
  return evaluateTrack(project, time, { samplePose: false }).rawSlides;
}

function timeForRawDistance(
  duration: number,
  rawDistanceAtTime: (time: number) => number,
  target: number,
): number {
  let lower = 0;
  let upper = duration;
  for (let iteration = 0; iteration < 56; iteration += 1) {
    const midpoint = (lower + upper) * 0.5;
    if (rawDistanceAtTime(midpoint) < target) lower = midpoint;
    else upper = midpoint;
  }
  return (lower + upper) * 0.5;
}

function event(
  project: DriftProjectV3,
  type: SemanticEventType,
  rawTime: number,
  sequence: number,
  intensity: number,
): SemanticEvent {
  const time = stableEventTime(quantizeEventTimeToPose(
    rawTime,
    project.motion.cadence.poseCadence,
    project.master.duration,
  ));
  const sourceCount = project.media.order.length;
  const current = sourceIndex(sequence, sourceCount);
  const previous = sourceIndex(sequence - 1, sourceCount);
  return {
    id: `${type}:${sequence}:${Math.round(time * 1_000_000)}`,
    type,
    time,
    sequence,
    sourceIndex: current,
    previousSourceIndex: previous,
    direction: project.motion.transport.direction,
    intensity,
  };
}

export interface SemanticEventRawTimeline {
  readonly duration: number;
  /** Monotonic unsigned authored slide distance at exact time. */
  rawDistanceAtTime(time: number): number;
}

/**
 * Plans the one semantic event spine from a caller-owned authored timeline.
 * V1 compatibility and V2 lifecycle timing share this threshold logic while
 * retaining their own pure distance evaluators.
 */
export function planSemanticEventsFromRawTimeline(
  project: DriftProjectV3,
  fromTime: number,
  toTime: number,
  timeline: SemanticEventRawTimeline,
): SemanticEvent[] {
  const duration = timeline.duration;
  const startTime = Math.max(0, Math.min(duration, fromTime));
  const endTime = Math.max(0, Math.min(duration, toTime));
  // Backward scrubbing is direct manipulation, not automatic authored playback.
  // Grab/release feedback is emitted by the interaction controller separately.
  if (endTime < startTime) return [];

  const events: SemanticEvent[] = [];
  if (startTime <= TIMELINE_EPSILON && endTime <= TIMELINE_EPSILON) {
    events.push(event(project, "master-start", 0, 0, 0));
  }

  const startDistance = timeline.rawDistanceAtTime(startTime);
  const endDistance = timeline.rawDistanceAtTime(endTime);
  const schedule = cadenceSchedule(project);
  const thresholds: PlannedThreshold[] = [
    { type: "slide-approach", phase: schedule.readEnd, intensity: 0.22 },
    { type: "slide-departure", phase: schedule.anticipationEnd, intensity: 0.42 },
    { type: "focus-handoff", phase: schedule.carryStart + schedule.carryLength * 0.5, intensity: 0.72 },
    { type: "focus-impact", phase: schedule.carryEnd, intensity: 1 },
    { type: "settle", phase: schedule.impactEnd, intensity: 0.48 },
  ];

  const firstCycle = Math.max(0, Math.floor(startDistance) - 1);
  const lastCycle = Math.ceil(endDistance) + 1;
  for (let cycle = firstCycle; cycle <= lastCycle; cycle += 1) {
    for (const threshold of thresholds) {
      const target = cycle + threshold.phase;
      if (target <= startDistance + TIMELINE_EPSILON || target > endDistance + TIMELINE_EPSILON) continue;
      const rawTime = timeForRawDistance(duration, timeline.rawDistanceAtTime, target);
      const planned = event(project, threshold.type, rawTime, cycle + 1, threshold.intensity);
      if (planned.time > startTime + TIMELINE_EPSILON && planned.time <= endTime + TIMELINE_EPSILON) events.push(planned);
    }
  }

  const sourceCount = project.media.order.length;
  if (project.motion.seamless.enabled && sourceCount > 0) {
    const firstBoundary = Math.max(1, Math.floor(startDistance / sourceCount) + 1);
    const finalBoundary = Math.floor((endDistance + TIMELINE_EPSILON) / sourceCount);
    for (let boundary = firstBoundary; boundary <= finalBoundary; boundary += 1) {
      const target = boundary * sourceCount;
      const rawTime = timeForRawDistance(duration, timeline.rawDistanceAtTime, target);
      const planned = event(project, "loop-boundary", rawTime, target, 0);
      if (planned.time > startTime + TIMELINE_EPSILON && planned.time <= endTime + TIMELINE_EPSILON) events.push(planned);
    }
  }

  if (startTime < duration - TIMELINE_EPSILON && endTime >= duration - TIMELINE_EPSILON) {
    events.push(event(project, "master-finish", duration, Math.ceil(endDistance), 0));
  }

  const unique = new Map(events.map((entry) => [entry.id, entry]));
  return [...unique.values()].sort((a, b) => a.time - b.time || a.type.localeCompare(b.type));
}

export function planSemanticEvents(
  project: DriftProjectV3,
  fromTime: number,
  toTime: number,
): SemanticEvent[] {
  return planSemanticEventsFromRawTimeline(project, fromTime, toTime, {
    duration: project.master.duration,
    rawDistanceAtTime: (time) => defaultRawDistanceAtTime(project, time),
  });
}
