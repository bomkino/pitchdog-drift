import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import {
  assertExportAuthorityUnchanged,
  captureExportAuthority,
  type ExportAuthorityState,
} from "../src/core/export/exportAuthority";
import { cloneSettings, DEFAULT_SETTINGS, type StudioAsset } from "../src/model";

function imageAsset(id: string): StudioAsset {
  return {
    id,
    name: `${id}.png`,
    kind: "image",
    blob: new Blob([id], { type: "image/png" }),
    mimeType: "image/png",
    width: 1080,
    height: 1920,
    objectUrl: `blob:${id}`,
  };
}

function authority(): ExportAuthorityState {
  return {
    project: createDefaultDriftProjectV4(
      "export-authority",
      "2026-08-23T00:00:00.000Z",
    ),
    settings: cloneSettings(DEFAULT_SETTINGS),
    assets: [imageAsset("slide-a")],
    presenter: null,
  };
}

describe("export authority snapshot", () => {
  it("survives asynchronous preparation only while every creative authority stays unchanged", async () => {
    let current = authority();
    const snapshot = captureExportAuthority(current);
    let release: () => void = () => undefined;
    const decodeGate = new Promise<void>((resolve) => { release = resolve; });
    const preparation = (async () => {
      await decodeGate;
      assertExportAuthorityUnchanged(snapshot, current);
    })();

    const changedProject = structuredClone(current.project);
    changedProject.master = { ...changedProject.master, fps: 24 };
    current = { ...current, project: changedProject };
    release();

    await expect(preparation).rejects.toMatchObject({ name: "InvalidStateError" });
    expect(snapshot.project.master.fps).not.toBe(current.project.master.fps);
  });

  it("accepts the captured project, settings, media, and presenter identities unchanged", () => {
    const current = authority();
    const snapshot = captureExportAuthority(current);

    expect(() => assertExportAuthorityUnchanged(snapshot, current)).not.toThrow();
    expect(snapshot.project).not.toBe(current.project);
    expect(snapshot.settings).not.toBe(current.settings);
    expect(snapshot.assets).not.toBe(current.assets);
  });
});
