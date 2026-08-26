import { afterEach, describe, expect, it, vi } from "vitest";
import { exportPlanFromProject, stagePresentationFromProject } from "../src/core/project/appPresentation";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import {
  createProjectRevisionState,
  recordProjectMutation,
} from "../src/core/project/revisions";
import { DRIFT_V2_RENDER_CONTRACT } from "../src/core/project/schema";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import { evaluateProjectFrame } from "../src/core/render/projectFrameAdapter";
import {
  createBrowserDesktopPlatform,
  createNativeMacDesktopPlatform,
  requireDesktopPlatformCompletion,
  type BrowserDesktopDocumentHost,
} from "../src/lib/desktopPlatform";
import {
  createProjectBundle,
  exportProjectBundle,
  importProjectBundle,
} from "../src/lib/projectStore";
import {
  createDriftProjectPayload,
  parseStudioProjectPayload,
  type DriftProjectPayloadV4,
} from "../src/lib/studioProjectPayload";
import {
  sha256NativeDocumentBlob,
  type NativeMacDocumentTransactionRequest,
} from "../src/lib/nativeMac";
import type { StudioAsset } from "../src/model";

const NOW = "2026-08-26T12:00:00.000Z";
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function setWindow(value: Record<string, unknown>): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value,
  });
}

function nativeMarker(): Record<string, unknown> {
  return {
    bridgeVersion: 2,
    platform: "macOS",
    systemCodecsOnly: true,
    documentAuthority: "appkit-issued-per-document",
    webKitOutboundPolicyInstalled: true,
    webKitOutboundPolicyVersion: 3,
    nativeNetworkClientSurface: "none-shipped",
    networkBoundary: "app-entitled-webkit-blocked",
    networkClientEntitlementRequiredWhenSandboxed: true,
  };
}

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

async function pinnedProjectFixture() {
  const firstBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
  const pinnedBlob = new Blob([new Uint8Array([5, 6, 7, 8])], { type: "image/png" });
  const firstHash = await sha256NativeDocumentBlob(firstBlob);
  const pinnedHash = await sha256NativeDocumentBlob(pinnedBlob);
  const assets: StudioAsset[] = [
    {
      id: "slide-one",
      name: "slide-one.png",
      kind: "image",
      blob: firstBlob,
      mimeType: "image/png",
      width: 1600,
      height: 900,
      hash: firstHash,
      objectUrl: "blob:slide-one",
    },
    {
      id: "pinned-frame",
      name: "pinned-frame.png",
      kind: "image",
      blob: pinnedBlob,
      mimeType: "image/png",
      width: 900,
      height: 1600,
      hash: pinnedHash,
      objectUrl: "blob:pinned-frame",
    },
  ];

  const project = createDefaultDriftProjectV4(
    "desktop-platform-fixture",
    NOW,
    41,
    DRIFT_V2_RENDER_CONTRACT,
  );
  project.media.order = assets.map((asset) => asset.id);
  project.media.assets = Object.fromEntries(assets.map((asset) => [asset.id, {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType,
    hash: asset.hash!,
    byteLength: asset.blob.size,
    width: asset.width,
    height: asset.height,
  }]));
  project.slides = {
    "slide-one": {
      assetId: "slide-one",
      fit: "cover",
      focalX: 0.42,
      focalY: 0.61,
      scaleOffset: 0.08,
    },
    "pinned-frame": {
      assetId: "pinned-frame",
      fit: "contain",
      focalX: 0.31,
      focalY: 0.72,
      scaleOffset: -0.04,
    },
  };
  project.presenter = {
    ...project.presenter,
    enabled: true,
    assetId: "pinned-frame",
    trackMode: "pinned-only",
    layoutMode: "safe-overlay",
    aspectMode: "custom",
    x: 0.83,
    y: 0.27,
    width: 0.38,
    aspectWidth: 4,
    aspectHeight: 5,
    fit: "cover",
    focalX: 0.37,
    focalY: 0.66,
    radius: 34,
    smoothing: 0.81,
    borderWidth: 3,
    borderColor: "#e6d8c2",
    borderOpacity: 0.73,
    shadowOpacity: 0.47,
    shadowSoftness: 66,
    shadowOffsetX: -8,
    shadowOffsetY: 19,
    matteColor: "#130f0b",
    matteOpacity: 0.22,
    muted: true,
    gain: 0.64,
    trimStart: 1.25,
    startAt: 0.75,
  };
  project.lens = { ...project.lens, presenterTreatment: "through-lens" };
  project.master = { ...project.master, fps: 30 };
  const validated = validateDriftProjectV4(project);
  const snapshot = await createProjectBundle({
    payload: createDriftProjectPayload(validated),
    assets: assets.map((asset) => ({ id: asset.id, name: asset.name, blob: asset.blob })),
    engineVersion: "4.0.0-test",
    themeVersion: "4.0.0-test",
    projectId: validated.projectId,
    createdAt: validated.createdAt,
    updatedAt: validated.updatedAt,
  });
  const archive = await exportProjectBundle(snapshot);
  return { project: validated, assets, archive };
}

function parseProject(snapshot: Awaited<ReturnType<typeof importProjectBundle<DriftProjectPayloadV4>>>) {
  return parseStudioProjectPayload(snapshot.payload, {
    projectId: snapshot.manifest.projectId,
    createdAt: snapshot.manifest.createdAt,
    updatedAt: snapshot.manifest.updatedAt,
    engineVersion: snapshot.manifest.engineVersion,
    themeVersion: snapshot.manifest.themeVersion,
    assets: snapshot.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      sha256: asset.sha256,
    })),
  }).project;
}

describe("DesktopPlatform portable-project tracer", () => {
  it("chooses, saves, and reopens exact Project V4 and pinned-frame intent through browser adapter", async () => {
    const fixture = await pinnedProjectFixture();
    const choices: File[] = [new File([fixture.archive], "fixture.pitched")];
    let published: Blob | null = null;
    const host: BrowserDesktopDocumentHost = {
      choosePortableProject: vi.fn(async () => choices.shift() ?? null),
      publishPortableProject: vi.fn(async (blob) => { published = blob; }),
    };
    const platform = createBrowserDesktopPlatform(host);

    const chosen = requireDesktopPlatformCompletion(await platform.documents.choosePortableProject());
    const openedSnapshot = await importProjectBundle<DriftProjectPayloadV4>(chosen.file);
    const openedProject = parseProject(openedSnapshot);
    const openReceipt = requireDesktopPlatformCompletion(
      await platform.documents.finalizePortableProjectOpen(chosen.file),
    );

    const prepared = platform.documents.preparePortableProjectSave(createProjectRevisionState());
    const saveReceipt = requireDesktopPlatformCompletion(await platform.documents.savePortableProject({
      operation: "save",
      transactionId: "browser-round-trip",
      ticket: prepared.ticket,
      blob: await exportProjectBundle(openedSnapshot),
      suggestedName: "round-trip.pitched",
    }));
    platform.documents.completePortableProjectSave(
      prepared.revisions,
      prepared.ticket,
      saveReceipt,
    );

    expect(openReceipt).toMatchObject({ bound: false, readbackVerified: true });
    expect(saveReceipt).toMatchObject({ bound: false, readbackVerified: false });
    expect(published).not.toBeNull();
    choices.push(new File([published!], "round-trip.pitched"));

    const reopened = requireDesktopPlatformCompletion(await platform.documents.choosePortableProject());
    const reopenedSnapshot = await importProjectBundle<DriftProjectPayloadV4>(reopened.file);
    const reopenedProject = parseProject(reopenedSnapshot);
    const reopenedReceipt = requireDesktopPlatformCompletion(
      await platform.documents.finalizePortableProjectOpen(reopened.file),
    );

    expect(reopenedProject).toEqual(openedProject);
    expect(reopenedReceipt.sha256).toBe(openReceipt.sha256);
    expect(reopenedProject.presenter).toEqual(fixture.project.presenter);
    expect(stagePresentationFromProject(reopenedProject)).toEqual(stagePresentationFromProject(openedProject));
    expect(exportPlanFromProject(reopenedProject)).toEqual(exportPlanFromProject(openedProject));

    const preview = evaluateProjectFrame({
      project: reopenedProject,
      assets: fixture.assets,
      time: 2.4,
      frameIndex: null,
    });
    const exported = evaluateProjectFrame({
      project: reopenedProject,
      assets: fixture.assets,
      time: 2.4,
      frameIndex: 72,
    });
    expect({ ...exported.frame, frameIndex: null }).toEqual(preview.frame);
    expect(exported.sourceOrder).not.toContain("pinned-frame");
  });

  it("delegates Mac Open, Save, and reopen through existing verified native document seam", async () => {
    const file = new File(["native portable project"], "native.pitched", {
      type: "application/vnd.pitchdog.pitched+zip",
    });
    const sha256 = await sha256NativeDocumentBlob(file);
    const release = vi.fn(async () => undefined);
    const picker = vi.fn(async () => [{
      getFile: vi.fn(async () => file),
      _release: release,
    }]);
    const confirm = vi.fn(async () => ({
      sha256,
      byteLength: file.size,
      bound: true,
      conflict: false,
      verified: true,
    }));
    const transaction = vi.fn(async (request: NativeMacDocumentTransactionRequest) => {
      if (request.operation === "revert") throw new Error("unexpected revert");
      return {
        operation: request.operation,
        transactionId: request.transactionId,
        sequence: request.sequence,
        revision: request.revision,
        sha256: request.expectedSha256,
        byteLength: request.byteLength,
        bound: true,
        conflict: false,
      };
    });
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      showOpenFilePicker: picker,
      __driftNativeConfirmProjectOpen: confirm,
      __driftNativeDocumentTransaction: transaction,
    });
    const platform = createNativeMacDesktopPlatform();

    const chosen = requireDesktopPlatformCompletion(await platform.documents.choosePortableProject());
    const opened = requireDesktopPlatformCompletion(
      await platform.documents.finalizePortableProjectOpen(chosen.file),
    );
    const prepared = platform.documents.preparePortableProjectSave(
      recordProjectMutation(createProjectRevisionState()),
    );
    const saved = requireDesktopPlatformCompletion(await platform.documents.savePortableProject({
      operation: "save",
      transactionId: "native-round-trip",
      ticket: prepared.ticket,
      blob: file,
      suggestedName: "native.pitched",
    }));
    const revisions = platform.documents.completePortableProjectSave(
      prepared.revisions,
      prepared.ticket,
      saved,
    );
    const reopenedChoice = requireDesktopPlatformCompletion(
      await platform.documents.choosePortableProject(),
    );
    const reopened = requireDesktopPlatformCompletion(
      await platform.documents.finalizePortableProjectOpen(reopenedChoice.file),
    );

    expect(opened).toEqual(reopened);
    expect(opened).toMatchObject({ sha256, bound: true, readbackVerified: true });
    expect(saved).toMatchObject({
      operation: "save",
      sha256,
      bound: true,
      readbackVerified: true,
    });
    expect(revisions).toMatchObject({ currentRevision: 1, savedRevision: 1 });
    expect(picker).toHaveBeenCalledTimes(2);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("returns typed cancellation and failure without advancing document revisions", async () => {
    const revisionState = createProjectRevisionState();
    const host: BrowserDesktopDocumentHost = {
      choosePortableProject: vi.fn(async () => null),
      publishPortableProject: vi.fn(async () => {
        throw new DOMException("disk rejected the write", "NotAllowedError");
      }),
    };
    const platform = createBrowserDesktopPlatform(host);

    await expect(platform.documents.choosePortableProject()).resolves.toEqual({ status: "cancelled" });
    const prepared = platform.documents.preparePortableProjectSave(revisionState);
    const result = await platform.documents.savePortableProject({
      operation: "save",
      transactionId: "browser-rejected",
      ticket: prepared.ticket,
      blob: new Blob(["unchanged"]),
      suggestedName: "unchanged.pitched",
    });

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "permission_denied", operation: "save" },
    });
    expect(prepared.revisions).toEqual(revisionState);
  });
});
