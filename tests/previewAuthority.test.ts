import { describe, expect, it, vi } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import {
  DRIFT_V1_COMPAT_RENDER_CONTRACT,
  DRIFT_V2_RENDER_CONTRACT,
} from "../src/core/project/schema";
import { installPreviewAuthority } from "../src/core/render/previewAuthority";
import { DEFAULT_SETTINGS, type StudioAsset } from "../src/model";

const still: StudioAsset = {
  id: "still",
  name: "Still.png",
  kind: "image",
  blob: new Blob(["still"], { type: "image/png" }),
  mimeType: "image/png",
  width: 1080,
  height: 1920,
  objectUrl: "blob:still",
};

function engine() {
  return {
    setV2ProjectState: vi.fn(async () => undefined),
    setV1CompatibilityState: vi.fn(async () => undefined),
    setPresenterAsset: vi.fn(async () => undefined),
  };
}

describe("preview authority restoration", () => {
  it("restores the visible V2 comparison snapshot and its pin as one authority", async () => {
    const renderer = engine();
    const before = createDefaultDriftProjectV4(
      "comparison-before",
      "2026-08-23T00:00:00.000Z",
      17,
      DRIFT_V2_RENDER_CONTRACT,
    );

    await installPreviewAuthority(renderer, {
      project: before,
      settings: structuredClone(DEFAULT_SETTINGS),
      assets: [still],
      pinnedAsset: still,
    });

    expect(renderer.setV2ProjectState).toHaveBeenCalledWith(before, [still]);
    expect(renderer.setV1CompatibilityState).not.toHaveBeenCalled();
    expect(renderer.setPresenterAsset).toHaveBeenCalledWith(still);
    expect(renderer.setV2ProjectState.mock.invocationCallOrder[0]).toBeLessThan(
      renderer.setPresenterAsset.mock.invocationCallOrder[0]!,
    );
  });

  it("restores the frozen V1 lane without crossing into V2", async () => {
    const renderer = engine();
    const settings = structuredClone(DEFAULT_SETTINGS);
    const project = createDefaultDriftProjectV4(
      "compat-preview",
      "2026-08-23T00:00:00.000Z",
      17,
      DRIFT_V1_COMPAT_RENDER_CONTRACT,
    );

    await installPreviewAuthority(renderer, {
      project,
      settings,
      assets: [still],
      pinnedAsset: null,
    });

    expect(renderer.setV1CompatibilityState).toHaveBeenCalledWith(settings, project, [still]);
    expect(renderer.setV2ProjectState).not.toHaveBeenCalled();
    expect(renderer.setPresenterAsset).toHaveBeenCalledWith(null);
  });
});
