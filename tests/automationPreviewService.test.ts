import { describe, expect, it, vi } from "vitest";
import {
  AutomationPreviewError,
  DRIFT_AUTOMATION_PREVIEW_SCOPE,
  createProductAutomationPreviewService,
  type AutomationPreviewSnapshot,
} from "../src/core/automation/productAutomationPreview";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { createProjectRevisionState } from "../src/core/project/revisions";
import { createDriftSelfDescription } from "../src/core/automation/selfDescription";
import { createProductAutomationService } from "../src/core/automation/productAutomationService";
import { createDevelopmentMcpAdapter } from "../src/lib/developmentMcpAdapter";

const NOW = "2026-08-27T13:00:00.000Z";

function fixture(scopes: readonly string[] = [DRIFT_AUTOMATION_PREVIEW_SCOPE]) {
  const project = createDefaultDriftProjectV4("preview-project", NOW, 71);
  const snapshot: AutomationPreviewSnapshot = {
    project,
    revisions: createProjectRevisionState(9),
    documentId: project.projectId,
    scopes,
  };
  let clock = NOW;
  let resolveRender: ((value: { mimeType: "image/png"; bytes: Uint8Array }) => void) | null = null;
  let renderSignal: AbortSignal | null = null;
  const render = vi.fn((input: { signal: AbortSignal }) => new Promise<{ mimeType: "image/png"; bytes: Uint8Array }>((resolve) => {
    renderSignal = input.signal;
    resolveRender = resolve;
  }));
  const service = createProductAutomationPreviewService({
    read: () => structuredClone(snapshot),
    render,
  }, {
    now: () => clock,
    issueId: () => "preview-1",
  });
  return {
    service,
    snapshot,
    render,
    resolve: (bytes: Uint8Array) => resolveRender?.({ mimeType: "image/png", bytes }),
    signal: () => renderSignal,
    setClock: (value: string) => { clock = value; },
  };
}

describe("bounded automation preview", () => {
  it("renders one snapshot-bound PNG without mutating Project truth", async () => {
    const host = fixture();
    const before = structuredClone(host.snapshot);
    const started = host.service.start({
      requesterIdentity: "preview-session",
      width: 640,
      height: 360,
      timeSeconds: 1.25,
      maximumBytes: 64,
    });

    expect(started).toMatchObject({
      state: "running",
      documentId: "preview-project",
      revision: 9,
      width: 640,
      height: 360,
      timeSeconds: 1.25,
    });
    expect(host.render).toHaveBeenCalledWith(expect.objectContaining({
      project: before.project,
      width: 640,
      height: 360,
      timeSeconds: 1.25,
      signal: expect.any(AbortSignal),
    }));
    host.resolve(new Uint8Array([137, 80, 78, 71]));
    await Promise.resolve();

    expect(host.service.status(started.id, "preview-session")).toMatchObject({
      state: "completed",
      byteLength: 4,
    });
    expect(host.service.result(started.id, "preview-session")?.bytes)
      .toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(host.snapshot).toEqual(before);
  });

  it("rejects missing consent and dimension, pixel, byte, time, and lifetime excess", () => {
    const denied = fixture([]);
    expect(() => denied.service.start({
      requesterIdentity: "preview-session",
      width: 640,
      height: 360,
      timeSeconds: 0,
    })).toThrowError(/scope/u);

    const host = fixture();
    const invalid = [
      { width: 63, height: 360, timeSeconds: 0 },
      { width: 1_024, height: 1_024, timeSeconds: 0, maximumBytes: 2_000_001 },
      { width: 1_024, height: 1_024, timeSeconds: host.snapshot.project.master.duration + 1 },
      { width: 640, height: 360, timeSeconds: 0, expiresInMs: 60_001 },
    ];
    for (const request of invalid) {
      expect(() => host.service.start({ requesterIdentity: "preview-session", ...request }))
        .toThrowError(AutomationPreviewError);
    }
    expect(host.render).not.toHaveBeenCalled();
  });

  it("cancels, revokes, expires, and ignores late renderer completion", async () => {
    const host = fixture();
    const started = host.service.start({
      requesterIdentity: "preview-session",
      width: 320,
      height: 180,
      timeSeconds: 0,
      expiresInMs: 1_000,
    });
    const signal = host.signal();
    expect(host.service.cancel(started.id, "preview-session").state).toBe("cancelled");
    expect(signal?.aborted).toBe(true);
    host.resolve(new Uint8Array([1, 2, 3]));
    await Promise.resolve();
    expect(host.service.result(started.id, "preview-session")).toBeNull();
    expect(() => host.service.status(started.id, "other-session")).toThrowError(/another client/u);

    const expiring = fixture();
    const next = expiring.service.start({
      requesterIdentity: "preview-session",
      width: 320,
      height: 180,
      timeSeconds: 0,
      expiresInMs: 1_000,
    });
    expiring.setClock("2026-08-27T13:00:01.001Z");
    expect(expiring.service.status(next.id, "preview-session").state).toBe("expired");

    const revoked = fixture();
    const active = revoked.service.start({
      requesterIdentity: "preview-session",
      width: 320,
      height: 180,
      timeSeconds: 0,
    });
    revoked.service.revokeRequester("preview-session");
    expect(revoked.service.status(active.id, "preview-session").state).toBe("expired");
  });

  it("fails closed when the encoded payload exceeds the caller budget", async () => {
    const host = fixture();
    const started = host.service.start({
      requesterIdentity: "preview-session",
      width: 320,
      height: 180,
      timeSeconds: 0,
      maximumBytes: 3,
    });
    host.resolve(new Uint8Array([1, 2, 3, 4]));
    await Promise.resolve();
    expect(host.service.status(started.id, "preview-session")).toMatchObject({
      state: "failed",
      failureCode: "byte_limit",
      byteLength: null,
    });
    expect(host.service.result(started.id, "preview-session")).toBeNull();
  });
});

describe("bounded preview development adapter", () => {
  it("requires separate session scope and returns bounded base64 only after completion", async () => {
    const host = fixture();
    const manifests = createDriftSelfDescription({
      project: host.snapshot.project,
      documentRevision: host.snapshot.revisions.currentRevision,
      selectedAssetId: null,
      presentation: {
        interfaceScale: 100,
        workspace: "motion",
        panel: "director",
        focusMode: false,
        playheadSeconds: 0,
      },
      platform: { target: "browser-development", buildChannel: "v2-dev", packaged: false },
      exportCapabilities: null,
      jobs: [],
      previewAccess: true,
    });
    const product = createProductAutomationService(manifests, undefined, host.service);
    const adapter = createDevelopmentMcpAdapter(product, {
      enabled: true,
      enabledScopes: [DRIFT_AUTOMATION_PREVIEW_SCOPE],
      issueSessionId: () => "preview-session",
    });
    const session = adapter.connect({
      productId: "dog.pitch.drift",
      protocolVersion: 1,
      clientId: "preview-client",
      requestedScopes: [DRIFT_AUTOMATION_PREVIEW_SCOPE],
    });
    const tools = adapter.request(session.id, { id: 1, method: "tools/list", params: {} }).result as { name: string }[];
    expect(tools.map(({ name }) => name)).toContain("drift.start_preview");
    const started = adapter.request(session.id, {
      id: 2,
      method: "tools/call",
      params: {
        name: "drift.start_preview",
        arguments: { width: 320, height: 180, timeSeconds: 0, maximumBytes: 64 },
      },
    }).result as { id: string };
    expect(adapter.request(session.id, {
      id: 3,
      method: "tools/call",
      params: { name: "drift.get_preview", arguments: { previewId: started.id } },
    }).result).toMatchObject({ dataBase64: null });

    host.resolve(new Uint8Array([137, 80, 78, 71]));
    await Promise.resolve();
    expect(adapter.request(session.id, {
      id: 4,
      method: "tools/call",
      params: { name: "drift.get_preview", arguments: { previewId: started.id } },
    }).result).toMatchObject({ mimeType: "image/png", dataBase64: "iVBORw==" });
    adapter.disconnect(session.id);
    expect(host.service.status(started.id, session.id).state).toBe("expired");
  });
});
