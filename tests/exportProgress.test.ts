import { describe, expect, it } from "vitest";
import {
  createExportProgressClock,
  projectExportProgress,
  tickExportProgress,
} from "../src/lib/exportProgress";
import type { ExportProgress as EncoderProgress } from "../src/lib/exportStudio";

function progress(
  phase: EncoderProgress["phase"],
  completed: number,
  total: number,
  message?: string,
): EncoderProgress {
  return {
    phase,
    completed,
    total,
    ratio: total > 0 ? completed / total : 0,
    ...(message ? { message } : {}),
  };
}

describe("truthful export progress clock", () => {
  it("keeps 0/N indeterminate, warms ETA from real samples, resets phases, and detects both stalls", () => {
    const clock = createExportProgressClock(0);
    const awaitingFirstFrame = projectExportProgress(
      progress("preparing", 0, 120, "Reading presenter video"),
      clock,
      0,
    );
    expect(awaitingFirstFrame).toMatchObject({
      completed: 0,
      total: 120,
      unit: "frames",
      determinate: false,
      etaSeconds: null,
      ratePerSecond: null,
      stallKind: null,
    });
    expect(tickExportProgress(awaitingFirstFrame, clock, 7_999).stallKind).toBeNull();
    expect(tickExportProgress(awaitingFirstFrame, clock, 8_000).stallKind).toBe("first-frame");

    const frameOne = projectExportProgress(progress("video", 1, 120), clock, 9_000);
    const frameTwo = projectExportProgress(progress("video", 2, 120), clock, 10_000);
    const frameThree = projectExportProgress(progress("video", 3, 120), clock, 11_000);
    expect(frameOne.etaSeconds).toBeNull();
    expect(frameTwo.etaSeconds).toBeNull();
    expect(frameThree.ratePerSecond).toBeCloseTo(1, 6);
    expect(frameThree.etaSeconds).toBeCloseTo(117, 6);
    expect(tickExportProgress(frameThree, clock, 25_999).stallKind).toBeNull();
    expect(tickExportProgress(frameThree, clock, 26_000).stallKind).toBe("inactivity");

    const finalizing = projectExportProgress(
      progress("finalizing", 0, 4, "Closing encoded tracks"),
      clock,
      27_000,
    );
    expect(tickExportProgress(finalizing, clock, 41_999).stallKind).toBeNull();
    expect(tickExportProgress(finalizing, clock, 42_000).stallKind).toBe("inactivity");

    const audioReset = projectExportProgress(progress("audio", 0, 8), clock, 43_000);
    expect(audioReset).toMatchObject({
      phase: "audio",
      unit: "seconds",
      ratePerSecond: null,
      etaSeconds: null,
      stallKind: null,
    });
    expect(clock.lastProgressAt).toBe(43_000);
  });
});
