import { afterEach, describe, expect, it } from "vitest";
import {
  createProjectRevisionState,
  recordProjectMutation,
} from "../src/core/project/revisions";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import {
  createDesktopPlatform,
  requireDesktopPlatformCompletion,
} from "../src/lib/desktopPlatform";
import {
  createLinuxElectronDesktopPlatform,
  type LinuxDesktopBridge,
} from "../src/lib/linuxElectron";
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
import { sha256NativeDocumentBlob } from "../src/lib/nativeMac";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const bytes = new TextEncoder().encode("portable drift project");
const digest = "61bb993da558fdc613c8c749147ccc61b7c63647cd3d6cc4058f4046d10edda1";

function marker(): LinuxDesktopBridge["marker"] {
  return Object.freeze({
    bridgeVersion: 1,
    platform: "Linux",
    target: "linux-electron-tracer",
    protocol: "dog.pitch.drift/desktop-platform/1",
    sandboxed: true,
    contextIsolated: true,
    nodeIntegration: false,
    genericAuthority: false,
  });
}

function bridge(): LinuxDesktopBridge {
  return {
    marker: marker(),
    async choosePortableProject() { return {
      requestId: "choose-1",
      status: "completed",
      value: {
        grantId: "drift-grant-1481fdab-7fcc-4ddd-a63e-a1b666ca35f7",
        name: "fixture.pitched",
        mimeType: "application/vnd.pitchdog.pitched+zip",
        bytes,
      },
    } as const; },
    async finalizePortableProjectOpen() { return {
      requestId: "open-1",
      status: "completed",
      value: {
        sha256: digest,
        byteLength: bytes.byteLength,
        bound: true,
        conflict: false,
        readbackVerified: true,
      },
    } as const; },
    async abandonPortableProjectOpen() { return {
      requestId: "abandon-1",
      status: "completed",
      value: { abandoned: true },
    } as const; },
    async savePortableProject(request) { return {
      requestId: "save-1",
      status: "completed",
      value: {
        operation: request.operation,
        transactionId: request.transactionId,
        sequence: request.ticket.sequence,
        revision: request.ticket.revision,
        sha256: digest,
        byteLength: request.bytes.byteLength,
        bound: true,
        conflict: false,
        readbackVerified: true,
      },
    } as const; },
    async revertPortableProject() { return {
      requestId: "revert-1",
      status: "completed",
      value: {
        bytes,
        receipt: {
          operation: "revert",
          transactionId: "linux-revert-1",
          sequence: null,
          revision: null,
          sha256: digest,
          byteLength: bytes.byteLength,
          bound: true,
          conflict: false,
          readbackVerified: true,
        },
      },
    } as const; },
  };
}

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

describe("Linux DesktopPlatform adapter", () => {
  /**
   * Promise: Linux runs the D01 portable-project/revision flow through the same product seam.
   * Failure: opaque selection, verified Save, revision completion, or Revert forks from DesktopPlatform.
   * Public seam: DesktopPlatform.documents.
   * Cheapest loop: frozen external bridge adapter.
   */
  it("completes choose, open, verified Save, and Revert with revision truth", async () => {
    const external = bridge();
    const platform = createLinuxElectronDesktopPlatform(external);
    const chosen = requireDesktopPlatformCompletion(await platform.documents.choosePortableProject());
    const opened = requireDesktopPlatformCompletion(await platform.documents.finalizePortableProjectOpen(chosen.file));
    const prepared = platform.documents.preparePortableProjectSave(
      recordProjectMutation(createProjectRevisionState()),
    );
    const saved = requireDesktopPlatformCompletion(await platform.documents.savePortableProject({
      operation: "save",
      transactionId: "linux-save-1",
      ticket: prepared.ticket,
      blob: chosen.file,
      suggestedName: "fixture.pitched",
    }));
    const revisions = platform.documents.completePortableProjectSave(
      prepared.revisions,
      prepared.ticket,
      saved,
    );
    const reverted = requireDesktopPlatformCompletion(await platform.documents.revertPortableProject({
      transactionId: "linux-revert-request",
      expectedSha256: opened.sha256,
    }));

    expect(platform.target).toBe("linux-electron");
    expect(opened).toMatchObject({ sha256: digest, bound: true, readbackVerified: true });
    expect(saved).toMatchObject({ sha256: digest, sequence: 1, revision: 1, readbackVerified: true });
    expect(revisions).toMatchObject({ currentRevision: 1, savedRevision: 1 });
    expect(new Uint8Array(await reverted.blob.arrayBuffer())).toEqual(bytes);
    expect(JSON.stringify({ opened, saved })).not.toMatch(/path|grant|home|Users/iu);
  });

  it("selects Linux only from the complete hardened marker and rejects stale files safely", async () => {
    const external = bridge();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: { __DRIFT_LINUX_DESKTOP__: external },
    });
    const platform = createDesktopPlatform();
    expect(platform.target).toBe("linux-electron");

    await expect(platform.documents.finalizePortableProjectOpen(new File([bytes], "guessed.pitched")))
      .resolves.toMatchObject({
        status: "failed",
        failure: { code: "grant_expired", operation: "open" },
      });

    const hostile = bridge();
    hostile.choosePortableProject = async () => ({
      requestId: "hostile",
      status: "failed" as const,
      failure: { code: "internal_error", message: "/home/ada/private.pitched token=secret" },
    });
    const hostilePlatform = createLinuxElectronDesktopPlatform(hostile);
    const result = await hostilePlatform.documents.choosePortableProject();
    expect(JSON.stringify(result)).not.toMatch(/ada|token=|secret/iu);
  });

  it("round-trips canonical Project V4 bytes across a simulated Linux relaunch", async () => {
    const now = "2026-08-27T00:00:00.000Z";
    const project = createDefaultDriftProjectV4("linux-canonical-round-trip", now);
    project.composition = { ...project.composition, width: 1920, height: 1080 };
    project.master = { ...project.master, fps: 24 };
    project.motion = {
      ...project.motion,
      transport: { ...project.motion.transport, axis: "horizontal", direction: 1 },
    };
    const snapshot = await createProjectBundle({
      payload: createDriftProjectPayload(project),
      assets: [],
      engineVersion: "linux-adapter-test/1",
      themeVersion: "linux-adapter-test/1",
      projectId: project.projectId,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
    const archive = await exportProjectBundle(snapshot);
    const archiveBytes = new Uint8Array(await archive.arrayBuffer());
    const archiveSha256 = await sha256NativeDocumentBlob(archive);
    let persisted = archiveBytes;
    const canonicalBridge = (): LinuxDesktopBridge => ({
      marker: marker(),
      async choosePortableProject() {
        return {
          requestId: "canonical-choose",
          status: "completed" as const,
          value: {
            grantId: "drift-grant-81d19b5e-a652-46e9-a30a-31b3c5acb4ba",
            name: "canonical.pitched",
            mimeType: "application/vnd.pitchdog.pitched+zip",
            bytes: persisted,
          },
        };
      },
      async finalizePortableProjectOpen() {
        return {
          requestId: "canonical-open",
          status: "completed" as const,
          value: {
            sha256: archiveSha256,
            byteLength: persisted.byteLength,
            bound: true,
            conflict: false,
            readbackVerified: true,
          },
        };
      },
      async abandonPortableProjectOpen() {
        return { requestId: "canonical-abandon", status: "completed" as const, value: { abandoned: true as const } };
      },
      async savePortableProject(request) {
        persisted = new Uint8Array(request.bytes);
        return {
          requestId: "canonical-save",
          status: "completed" as const,
          value: {
            operation: request.operation,
            transactionId: request.transactionId,
            sequence: request.ticket.sequence,
            revision: request.ticket.revision,
            sha256: archiveSha256,
            byteLength: persisted.byteLength,
            bound: true,
            conflict: false,
            readbackVerified: true,
          },
        };
      },
      async revertPortableProject() {
        throw new Error("unexpected revert");
      },
    });

    const firstPlatform = createLinuxElectronDesktopPlatform(canonicalBridge());
    const chosen = requireDesktopPlatformCompletion(await firstPlatform.documents.choosePortableProject());
    requireDesktopPlatformCompletion(await firstPlatform.documents.finalizePortableProjectOpen(chosen.file));
    const prepared = firstPlatform.documents.preparePortableProjectSave(createProjectRevisionState());
    requireDesktopPlatformCompletion(await firstPlatform.documents.savePortableProject({
      operation: "save",
      transactionId: "canonical-linux-save",
      ticket: prepared.ticket,
      blob: chosen.file,
      suggestedName: "canonical.pitched",
    }));

    const relaunchedPlatform = createLinuxElectronDesktopPlatform(canonicalBridge());
    const reopened = requireDesktopPlatformCompletion(await relaunchedPlatform.documents.choosePortableProject());
    const reopenedSnapshot = await importProjectBundle<DriftProjectPayloadV4>(reopened.file);
    const reopenedProject = parseStudioProjectPayload(reopenedSnapshot.payload, {
      projectId: reopenedSnapshot.manifest.projectId,
      createdAt: reopenedSnapshot.manifest.createdAt,
      updatedAt: reopenedSnapshot.manifest.updatedAt,
      engineVersion: reopenedSnapshot.manifest.engineVersion,
      themeVersion: reopenedSnapshot.manifest.themeVersion,
      assets: [],
    }).project;
    expect(reopenedProject).toEqual(project);
  });
});
