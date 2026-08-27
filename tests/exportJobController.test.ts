import { describe, expect, it } from "vitest";
import { captureExportAuthority } from "../src/core/export/exportAuthority";
import { createExportJobController } from "../src/core/export/exportJobController";
import {
  captureGuidedExportSnapshot,
  createExportIntent,
  type GuidedExportCompletion,
} from "../src/core/export/guidedExport";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { cloneSettings, DEFAULT_SETTINGS, type ExportProgress } from "../src/model";

const PREPARING: ExportProgress = {
  phase: "preparing",
  ratio: 0,
  completed: 0,
  total: 1,
  frameIndex: null,
  message: "Preparing one locked creative snapshot",
  unit: "steps",
  determinate: false,
  elapsedSeconds: 0,
  etaSeconds: null,
  ratePerSecond: null,
  stallKind: null,
};

function harness(maximumTerminalJobs = 20) {
  let milliseconds = Date.parse("2026-08-27T00:00:00.000Z");
  return {
    tick(amount = 1_000) {
      milliseconds += amount;
    },
    controller: createExportJobController({
      now: () => new Date(milliseconds),
      maximumTerminalJobs,
    }),
  };
}

function snapshot(id: string, format: "h264-mp4" | "png-frames" = "h264-mp4") {
  const project = createDefaultDriftProjectV4(id, "2026-08-27T00:00:00.000Z");
  const settings = cloneSettings(DEFAULT_SETTINGS);
  const authority = captureExportAuthority({ project, settings, assets: [], presenter: null });
  return captureGuidedExportSnapshot({
    id,
    createdAt: "2026-08-27T00:00:00.000Z",
    documentRevision: 4,
    intent: {
      ...createExportIntent({
        background: format === "h264-mp4" ? "opaque" : "transparent",
        settings: { width: 1080, height: 1920, fps: 30, duration: 8 },
        presenterAudio: false,
        soundDesignAudio: false,
      }),
      purpose: format === "h264-mp4" ? "social" as const : "frame-sequence" as const,
      preferredFormat: format,
      destinationClass: format === "h264-mp4" ? "file" as const : "directory" as const,
    },
    authority,
  });
}

function completion(id: string, format: "h264-mp4" | "png-frames" = "h264-mp4"): GuidedExportCompletion {
  return {
    snapshotId: id,
    format,
    artifact: format === "h264-mp4" ? "H.264 MP4 master" : "Numbered PNG frame directory",
    width: 1080,
    height: 1920,
    fps: 30,
    frameCount: 240,
    duration: 8,
    bytes: 8_192,
    publication: format === "h264-mp4" ? "committed" : "directory-written",
    verified: true,
  };
}

describe("export job controller", () => {
  /**
   * Promise: one public lifecycle exposes monotonic progress and an immutable verified receipt.
   * Failure: observers can regress/mutate truth or a receipt can describe another snapshot.
   * Public seam: begin/report/complete/getStatus/getReceipt.
   * Cheapest loop: pure controller lifecycle with an injected clock.
   */
  it("binds monotonic status and a receipt to one locked snapshot", () => {
    const run = harness();
    const token = new AbortController();
    const observed: string[] = [];
    run.controller.subscribe((status) => observed.push(`${status.id}:${status.state}:${status.progress.ratio}`));
    const started = run.controller.begin(snapshot("export-a"), token, PREPARING);
    run.tick();
    run.controller.report("export-a", { ...PREPARING, phase: "render", ratio: 0.7, completed: 7, total: 10 });
    run.controller.report("export-a", { ...PREPARING, phase: "encode", ratio: 0.2, completed: 1, total: 10 });
    run.tick(2_000);
    const receipt = run.controller.complete("export-a", completion("export-a"));

    expect(started).toMatchObject({ id: "export-a", documentRevision: 4, state: "running", canCancel: true });
    expect(run.controller.getStatus("export-a")).toMatchObject({
      state: "completed",
      progress: { phase: "complete", ratio: 1 },
      canCancel: false,
      failure: null,
    });
    expect(receipt).toMatchObject({
      jobId: "export-a",
      snapshotId: "export-a",
      documentRevision: 4,
      elapsedMilliseconds: 3_000,
      completion: { verified: true, publication: "committed" },
    });
    expect(run.controller.getReceipt("export-a")).toBe(receipt);
    expect(run.controller.getActiveStatus()).toBeNull();
    expect(observed).toContain("export-a:running:0.7");
    expect(observed).toContain("export-a:running:0.7");
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.completion)).toBe(true);

    const mismatch = harness();
    mismatch.controller.begin(snapshot("export-mismatch"), new AbortController(), PREPARING);
    expect(() => mismatch.controller.complete("export-mismatch", {
      ...completion("export-mismatch"),
      frameCount: 239,
    })).toThrowError(/locked render plan/iu);
  });

  /**
   * Promise: cancellation reaches the adopted exporter token and can never become success.
   * Failure: UI/D08 cancellation is cosmetic or a late completion publishes success.
   * Public seam: cancel/fail/complete.
   * Cheapest loop: AbortSignal and terminal-state assertions.
   */
  it("owns cancellation and rejects late completion", () => {
    const run = harness();
    const token = new AbortController();
    run.controller.begin(snapshot("export-cancel"), token, PREPARING);

    expect(run.controller.cancel("export-cancel")).toBe(true);
    expect(token.signal.aborted).toBe(true);
    expect(run.controller.getStatus("export-cancel")).toMatchObject({ state: "canceling", canCancel: false });
    expect(run.controller.cancel("export-cancel")).toBe(false);
    expect(() => run.controller.complete("export-cancel", completion("export-cancel"))).toThrowError(/cannot complete/iu);

    const terminal = run.controller.fail("export-cancel", token.signal.reason);
    expect(terminal).toMatchObject({
      state: "canceled",
      failure: { code: "canceled", message: "Export canceled before verified publication." },
    });
    expect(run.controller.getReceipt("export-cancel")).toBeNull();
  });

  /**
   * Promise: failures expose stable safe facts, one job runs at a time, and history is bounded.
   * Failure: raw paths/tokens leak, concurrent authority is admitted, or reconnect state grows forever.
   * Public seam: begin/fail/listStatuses.
   * Cheapest loop: hostile error plus two-job bounded history.
   */
  it("redacts failures, excludes concurrent jobs, and bounds terminal history", () => {
    const run = harness(1);
    run.controller.begin(snapshot("export-secret"), new AbortController(), PREPARING);
    expect(() => run.controller.begin(snapshot("export-overlap"), new AbortController(), PREPARING)).toThrowError(/already active/iu);
    const failed = run.controller.fail(
      "export-secret",
      new Error("/Users/Ada/private.mov token=super-secret"),
    );
    expect(JSON.stringify(failed)).not.toMatch(/Ada|private|super-secret/iu);
    expect(failed.failure).toEqual({
      code: "export-failed",
      message: "Export failed before verified publication.",
    });

    run.controller.begin(snapshot("export-latest", "png-frames"), new AbortController(), PREPARING);
    run.controller.complete("export-latest", completion("export-latest", "png-frames"));
    expect(run.controller.listStatuses().map(({ id }) => id)).toEqual(["export-latest"]);
    expect(run.controller.getStatus("export-secret")).toBeNull();
  });

});
