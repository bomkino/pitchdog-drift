import type { ExportProgress as ExportProgressView } from "../model";
import type { ExportProgress as EncoderProgress } from "./exportStudio";

export interface ExportProgressClock {
  startedAt: number;
  lastProgressAt: number;
  phase: EncoderProgress["phase"] | null;
  previousCompleted: number;
  previousSampleAt: number;
  ratePerSecond: number | null;
  observations: number;
  overallRatio: number;
}

export function createExportProgressClock(now: number): ExportProgressClock {
  return {
    startedAt: now,
    lastProgressAt: now,
    phase: null,
    previousCompleted: 0,
    previousSampleAt: now,
    ratePerSecond: null,
    observations: 0,
    overallRatio: 0,
  };
}

export function projectExportProgress(
  progress: EncoderProgress,
  clock: ExportProgressClock,
  now: number,
): ExportProgressView {
  const phase: ExportProgressView["phase"] = progress.phase === "rendering" || progress.phase === "writing"
    ? "render"
    : progress.phase === "preparing"
      ? "preparing"
      : progress.phase === "audio"
        ? "audio"
        : progress.phase === "complete"
          ? "complete"
          : progress.phase === "finalizing"
            ? "finalize"
            : progress.phase === "verifying"
              ? "verify"
              : progress.phase === "committing"
                ? "commit"
                : "encode";
  const message = progress.message ?? {
    preparing: "Preparing deterministic timeline",
    video: "Encoding fixed-step video",
    audio: "Aligning presenter audio",
    rendering: "Rendering exact frames",
    writing: "Writing frames to disk",
    finalizing: "Closing and verifying output",
    verifying: "Reopening and verifying output",
    committing: "Publishing verified output",
    complete: "Master complete",
  }[progress.phase];
  clock.overallRatio = Math.max(clock.overallRatio, Math.max(0, Math.min(1, progress.ratio)));

  const phaseReset = clock.phase !== progress.phase || progress.completed < clock.previousCompleted;
  if (phaseReset) {
    clock.phase = progress.phase;
    clock.previousCompleted = progress.completed;
    clock.previousSampleAt = now;
    clock.lastProgressAt = now;
    clock.ratePerSecond = null;
    clock.observations = progress.completed > 0 ? 1 : 0;
  } else if (progress.completed > clock.previousCompleted) {
    const elapsed = Math.max(0.001, (now - clock.previousSampleAt) / 1_000);
    const observedRate = (progress.completed - clock.previousCompleted) / elapsed;
    clock.ratePerSecond = clock.ratePerSecond === null
      ? observedRate
      : clock.ratePerSecond * 0.72 + observedRate * 0.28;
    clock.previousCompleted = progress.completed;
    clock.previousSampleAt = now;
    clock.lastProgressAt = now;
    clock.observations += 1;
  }

  const unit: ExportProgressView["unit"] = progress.message === "Reading presenter video"
    ? "frames"
    : progress.phase === "audio"
      ? "seconds"
      : progress.phase === "video" || progress.phase === "rendering" || progress.phase === "writing"
        ? "frames"
        : "steps";
  const determinate = progress.completed > 0 && progress.total > 0;
  const etaSeconds = determinate
    && progress.completed < progress.total
    && clock.observations >= 3
    && clock.ratePerSecond !== null
    && clock.ratePerSecond > 0
      ? (progress.total - progress.completed) / clock.ratePerSecond
      : null;

  return {
    phase,
    ratio: clock.overallRatio,
    completed: progress.completed,
    total: progress.total,
    frameIndex: progress.frameIndex ?? null,
    message,
    unit,
    determinate,
    elapsedSeconds: Math.max(0, (now - clock.startedAt) / 1_000),
    etaSeconds,
    ratePerSecond: clock.observations >= 2 ? clock.ratePerSecond : null,
    stallKind: null,
  };
}

export function tickExportProgress(
  current: ExportProgressView,
  clock: ExportProgressClock,
  now: number,
): ExportProgressView {
  return {
    ...current,
    elapsedSeconds: Math.max(0, (now - clock.startedAt) / 1_000),
    stallKind: current.completed === 0
      && current.message === "Reading presenter video"
      && now - clock.lastProgressAt >= 8_000
      ? "first-frame"
      : current.phase !== "complete"
        && current.completed < current.total
        && now - clock.lastProgressAt >= 15_000
        ? "inactivity"
        : null,
  };
}
