import type { DriftProjectV3 } from "../project/schema";
import {
  clamp,
  finite,
  smootherstep,
  smootherstepDerivative,
  smootherstepSecondDerivative,
  TIMELINE_EPSILON,
} from "./math";

export type CadenceBeat = "read" | "anticipate" | "carry" | "impact" | "settle" | "land";

export interface CadenceSchedule {
  readEnd: number;
  anticipationEnd: number;
  carryEnd: number;
  impactEnd: number;
  settleEnd: number;
  carryStart: number;
  carryLength: number;
}

export interface CadenceEvaluation {
  cycle: number;
  rawPhase: number;
  progress: number;
  derivative: number;
  secondDerivative: number;
  beat: CadenceBeat;
  beatProgress: number;
  focusHandoff: number;
  anticipation: number;
  impact: number;
  settle: number;
  schedule: CadenceSchedule;
}

function phaseWeights(project: DriftProjectV3): Record<CadenceBeat, number> {
  const cadence = project.motion.cadence;
  const linger = clamp(project.motion.performance.linger, 0, 1);
  const values: Record<CadenceBeat, number> = {
    read: Math.max(0, cadence.read) * (0.72 + linger * 0.72),
    anticipate: Math.max(0, cadence.anticipation),
    carry: Math.max(0.001, cadence.carry),
    impact: Math.max(0, cadence.impact),
    settle: Math.max(0, cadence.settle),
    land: Math.max(0, cadence.land) * (0.72 + linger * 0.72),
  };
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  if (total <= TIMELINE_EPSILON) return { read: 0, anticipate: 0, carry: 1, impact: 0, settle: 0, land: 0 };
  for (const key of Object.keys(values) as CadenceBeat[]) values[key] /= total;
  return values;
}

export function cadenceSchedule(project: DriftProjectV3): CadenceSchedule {
  const weights = phaseWeights(project);
  const readEnd = weights.read;
  const anticipationEnd = readEnd + weights.anticipate;
  const carryEnd = anticipationEnd + weights.carry;
  const impactEnd = carryEnd + weights.impact;
  const settleEnd = impactEnd + weights.settle;
  return {
    readEnd,
    anticipationEnd,
    carryEnd,
    impactEnd,
    settleEnd,
    carryStart: anticipationEnd,
    carryLength: Math.max(TIMELINE_EPSILON, weights.carry),
  };
}

function localProgress(phase: number, start: number, end: number): number {
  return clamp((phase - start) / Math.max(TIMELINE_EPSILON, end - start), 0, 1);
}

export function evaluateCadence(project: DriftProjectV3, rawSlideDistance: number): CadenceEvaluation {
  const distance = Math.max(0, finite(rawSlideDistance));
  const cycle = Math.floor(distance);
  const rawPhase = distance - cycle;
  const schedule = cadenceSchedule(project);
  const carryProgress = localProgress(rawPhase, schedule.carryStart, schedule.carryEnd);

  let progress = 0;
  let derivative = 0;
  let secondDerivative = 0;
  if (rawPhase >= schedule.carryEnd) {
    progress = 1;
  } else if (rawPhase > schedule.carryStart) {
    progress = smootherstep(carryProgress);
    derivative = smootherstepDerivative(carryProgress) / schedule.carryLength;
    secondDerivative = smootherstepSecondDerivative(carryProgress)
      / (schedule.carryLength * schedule.carryLength);
  }

  let beat: CadenceBeat;
  let beatProgress: number;
  if (rawPhase < schedule.readEnd) {
    beat = "read";
    beatProgress = localProgress(rawPhase, 0, schedule.readEnd);
  } else if (rawPhase < schedule.anticipationEnd) {
    beat = "anticipate";
    beatProgress = localProgress(rawPhase, schedule.readEnd, schedule.anticipationEnd);
  } else if (rawPhase < schedule.carryEnd) {
    beat = "carry";
    beatProgress = carryProgress;
  } else if (rawPhase < schedule.impactEnd) {
    beat = "impact";
    beatProgress = localProgress(rawPhase, schedule.carryEnd, schedule.impactEnd);
  } else if (rawPhase < schedule.settleEnd) {
    beat = "settle";
    beatProgress = localProgress(rawPhase, schedule.impactEnd, schedule.settleEnd);
  } else {
    beat = "land";
    beatProgress = localProgress(rawPhase, schedule.settleEnd, 1);
  }

  const anticipation = beat === "anticipate" ? Math.sin(Math.PI * beatProgress) ** 2 : 0;
  const impact = beat === "impact" ? Math.sin(Math.PI * beatProgress) ** 2 : 0;
  const settle = beat === "settle"
    ? Math.sin(beatProgress * Math.PI * 2.25) * (1 - beatProgress) ** 2
    : 0;

  return {
    cycle,
    rawPhase,
    progress,
    derivative,
    secondDerivative,
    beat,
    beatProgress,
    focusHandoff: progress,
    anticipation,
    impact,
    settle,
    schedule,
  };
}

export function visibleSlideDistance(project: DriftProjectV3, rawSlideDistance: number): number {
  const cadence = evaluateCadence(project, rawSlideDistance);
  return cadence.cycle + cadence.progress;
}

export function invertVisibleSlideDistance(project: DriftProjectV3, visibleDistance: number): number {
  const visible = Math.max(0, finite(visibleDistance));
  const cycle = Math.floor(visible);
  const target = visible - cycle;
  const schedule = cadenceSchedule(project);
  if (target <= TIMELINE_EPSILON) return cycle + schedule.carryStart * 0.5;
  if (target >= 1 - TIMELINE_EPSILON) return cycle + schedule.carryEnd + (1 - schedule.carryEnd) * 0.5;

  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 44; iteration += 1) {
    const midpoint = (lower + upper) * 0.5;
    if (smootherstep(midpoint) < target) lower = midpoint;
    else upper = midpoint;
  }
  return cycle + schedule.carryStart + ((lower + upper) * 0.5) * schedule.carryLength;
}
