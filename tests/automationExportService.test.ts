import { describe, expect, it, vi } from "vitest";
import {
  createProductAutomationExportService,
  type AutomationExportReservationHooks,
} from "../src/core/automation/productAutomationExport";
import type { ExportJobController, ExportJobReceipt, ExportJobStatus } from "../src/core/export/exportJobController";
import { createExportIntent, type GuidedExportCompletion } from "../src/core/export/guidedExport";
import type { ExportProgress } from "../src/model";
import type { ProductAutomationService } from "../src/core/automation/productAutomationService";
import { DRIFT_AUTOMATION_EXPORT_SCOPE } from "../src/core/automation/productAutomationExport";
import { createDevelopmentMcpAdapter } from "../src/lib/developmentMcpAdapter";

const PROGRESS: ExportProgress = {
  phase: "render",
  ratio: 0.4,
  completed: 4,
  total: 10,
  frameIndex: 3,
  message: "Rendering exact frames",
  unit: "frames",
  determinate: true,
  elapsedSeconds: 1,
  etaSeconds: 2,
  ratePerSecond: 4,
  stallKind: null,
};

function harness(canStart = true) {
  let hooks: AutomationExportReservationHooks | null = null;
  let resolveRun: ((value: GuidedExportCompletion | null) => void) | null = null;
  let status: ExportJobStatus | null = null;
  let receipt: ExportJobReceipt | null = null;
  const cancel = vi.fn(() => {
    if (!status) return false;
    status = { ...status, state: "canceling", canCancel: false };
    return true;
  });
  const jobs = {
    getStatus: () => status,
    getReceipt: () => receipt,
    cancel,
  } as unknown as ExportJobController;
  let sequence = 0;
  const service = createProductAutomationExportService({
    jobs,
    preflight: (choice) => ({
      request: {
        intent: createExportIntent({
          background: choice.format === "h264-mp4" ? "opaque" : "transparent",
          settings: { width: 640, height: 360, fps: 30, duration: 2 },
          presenterAudio: false,
          soundDesignAudio: false,
          preferredFormat: choice.format,
        }),
        pngDestination: choice.pngDestination,
        audioConsequenceAcknowledged: choice.audioConsequenceAcknowledged,
      },
      preflight: {
        canStart,
        capability: { id: choice.format, state: canStart ? "available" : "unavailable", source: "runtime-probe" },
        blockers: canStart ? [] : [{ id: "capability-unavailable", severity: "blocker", message: "Unavailable." }],
        warnings: [],
      },
    }),
    run: (_request, reservationHooks) => {
      hooks = reservationHooks;
      return new Promise((resolve) => { resolveRun = resolve; });
    },
  }, {
    now: () => "2026-08-27T14:00:00.000Z",
    issueId: (kind) => `${kind}-${++sequence}`,
  });
  return {
    service,
    hooks: () => hooks,
    reserve: (jobId = "job-1") => {
      hooks?.beforeReservation();
      status = {
        id: jobId,
        snapshotId: jobId,
        documentRevision: 3,
        format: "h264-mp4",
        state: "running",
        createdAt: "2026-08-27T14:00:00.000Z",
        updatedAt: "2026-08-27T14:00:00.000Z",
        finishedAt: null,
        progress: PROGRESS,
        canCancel: true,
        failure: null,
      };
      hooks?.onReserved(jobId);
    },
    complete: () => {
      const completion: GuidedExportCompletion = {
        snapshotId: "job-1",
        format: "h264-mp4",
        artifact: "H.264 MP4 master",
        width: 640,
        height: 360,
        fps: 30,
        frameCount: 60,
        duration: 2,
        bytes: 1234,
        publication: "download-requested",
        verified: true,
      };
      status = { ...status!, state: "completed", finishedAt: "2026-08-27T14:00:02.000Z", canCancel: false };
      receipt = {
        jobId: "job-1",
        snapshotId: "job-1",
        documentRevision: 3,
        format: "h264-mp4",
        startedAt: "2026-08-27T14:00:00.000Z",
        finishedAt: "2026-08-27T14:00:02.000Z",
        elapsedMilliseconds: 2_000,
        completion,
      };
      resolveRun?.(completion);
    },
    cancel,
  };
}

const CHOICE = {
  format: "h264-mp4" as const,
  pngDestination: "zip" as const,
  audioConsequenceAcknowledged: false,
};

describe("automation export job reuse", () => {
  it("preflights, starts asynchronously, reconnects, and reads the D05 receipt", async () => {
    const host = harness();
    expect(host.service.preflight(CHOICE).canStart).toBe(true);
    const started = host.service.start(CHOICE);
    expect(started).toMatchObject({ state: "awaiting-destination", jobId: null });
    host.reserve();
    expect(host.service.status(started.id, started.reconnectToken)).toMatchObject({
      state: "running",
      jobId: "job-1",
      job: { progress: { ratio: 0.4 } },
    });
    host.complete();
    await Promise.resolve();
    expect(host.service.status(started.id, started.reconnectToken).state).toBe("completed");
    expect(host.service.receipt(started.id, started.reconnectToken)).toMatchObject({
      jobId: "job-1",
      completion: { verified: true, publication: "download-requested" },
    });
    expect(() => host.service.status(started.id, "wrong-token")).toThrowError(/token/u);
  });

  it("cancels before reservation or through the adopted D05 controller", () => {
    const before = harness();
    const waiting = before.service.start(CHOICE);
    expect(before.service.cancel(waiting.id, waiting.reconnectToken).state).toBe("canceled");
    expect(() => before.hooks()?.beforeReservation()).toThrowError(/canceled/u);

    const running = harness();
    const started = running.service.start(CHOICE);
    running.reserve();
    expect(running.service.cancel(started.id, started.reconnectToken).state).toBe("canceled");
    expect(running.cancel).toHaveBeenCalledWith("job-1");
  });

  it("refuses blocked preflight before destination or job authority", () => {
    const host = harness(false);
    expect(host.service.preflight(CHOICE).canStart).toBe(false);
    expect(() => host.service.start(CHOICE)).toThrowError(/preflight/u);
    expect(host.hooks()).toBeNull();
  });
});

describe("automation export development adapter", () => {
  it("reconnects from a new client session using only the opaque request token", () => {
    const host = harness();
    const product = {
      snapshotIdentity: "fixture",
      mutation: null,
      preview: null,
      exports: host.service,
      listResources: () => [],
      readResource: () => ({}),
      getManifest: () => ({}),
    } satisfies ProductAutomationService;
    let sessionSequence = 0;
    const adapter = createDevelopmentMcpAdapter(product, {
      enabled: true,
      enabledScopes: [DRIFT_AUTOMATION_EXPORT_SCOPE],
      issueSessionId: () => `export-session-${++sessionSequence}`,
    });
    const first = adapter.connect({
      productId: "dog.pitch.drift",
      protocolVersion: 1,
      clientId: "export-client",
      requestedScopes: [DRIFT_AUTOMATION_EXPORT_SCOPE],
    });
    expect(() => adapter.request(first.id, {
      id: 0,
      method: "tools/call",
      params: {
        name: "drift.start_export",
        arguments: { ...CHOICE, path: "/tmp/must-not-be-accepted" },
      },
    })).toThrowError(/unexpected or missing fields/u);
    const started = adapter.request(first.id, {
      id: 1,
      method: "tools/call",
      params: { name: "drift.start_export", arguments: CHOICE },
    }).result as { id: string; reconnectToken: string };
    adapter.disconnect(first.id);
    host.reserve();
    const second = adapter.connect({
      productId: "dog.pitch.drift",
      protocolVersion: 1,
      clientId: "export-client",
      requestedScopes: [DRIFT_AUTOMATION_EXPORT_SCOPE],
    });
    expect(adapter.request(second.id, {
      id: 2,
      method: "tools/call",
      params: {
        name: "drift.get_export",
        arguments: { requestId: started.id, reconnectToken: started.reconnectToken },
      },
    }).result).toMatchObject({ status: { state: "running", jobId: "job-1" }, receipt: null });
  });
});
