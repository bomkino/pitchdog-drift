import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { DRIFT_V2_RENDER_CONTRACT } from "../src/core/project/schema";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import { evaluateProjectFrame } from "../src/core/render/projectFrameAdapter";
import {
  resolvePinnedFrameCompositePlan,
  resolvePinnedFramePresentation,
} from "../src/core/presenter/presentation";
import {
  createProjectBundle,
  exportProjectBundle,
  importProjectBundle,
} from "../src/lib/projectStore";
import type { StudioAsset } from "../src/model";

const NOW = "2026-08-27T02:00:00.000Z";

function fixture() {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
  const asset: StudioAsset = {
    id: "pinned-still",
    name: "pinned-still.png",
    kind: "image",
    blob,
    mimeType: "image/png",
    width: 1600,
    height: 900,
    hash: "a".repeat(64),
    objectUrl: "blob:pinned-still",
  };
  const project = createDefaultDriftProjectV4("pinned-frame-story", NOW, 41, DRIFT_V2_RENDER_CONTRACT);
  project.media.order = [asset.id];
  project.media.assets = {
    [asset.id]: {
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      mimeType: asset.mimeType,
      hash: asset.hash!,
      byteLength: blob.size,
      width: asset.width,
      height: asset.height,
    },
  };
  project.slides = {
    [asset.id]: { assetId: asset.id, fit: "cover", focalX: 0.5, focalY: 0.5, scaleOffset: 0 },
  };
  project.presenter = {
    ...project.presenter,
    enabled: true,
    assetId: asset.id,
    trackMode: "pinned-only",
    layer: "below-slides",
    trimStart: 0.4,
    startAt: 1.5,
    endAt: 3.25,
  };
  return { project: validateDriftProjectV4(project), asset };
}

describe("D10 pinned-frame presentation truth", () => {
  it("keeps one exclusive story range and source clock across preview and export evaluation", () => {
    const { project, asset } = fixture();
    const before = evaluateProjectFrame({ project, assets: [asset], time: 1.49, frameIndex: null });
    const first = evaluateProjectFrame({ project, assets: [asset], time: 1.5, frameIndex: null });
    const preview = evaluateProjectFrame({ project, assets: [asset], time: 2, frameIndex: null });
    const exported = evaluateProjectFrame({ project, assets: [asset], time: 2, frameIndex: 60 });
    const ended = evaluateProjectFrame({ project, assets: [asset], time: 3.25, frameIndex: null });

    expect(before.pinnedFrame.visible).toBe(false);
    expect(first.pinnedFrame).toMatchObject({ visible: true, layer: "below-slides" });
    expect(first.pinnedFrame.sourceTime).toBeCloseTo(0.4, 12);
    expect(exported.pinnedFrame).toEqual(preview.pinnedFrame);
    expect(preview.pinnedFrame.sourceTime).toBeCloseTo(0.9, 12);
    expect(ended.pinnedFrame.visible).toBe(false);
  });

  it("keeps below/above and protected/through-lens compositing decisions independent", () => {
    const visibleBelow = { visible: true, layer: "below-slides" as const };
    expect(resolvePinnedFrameCompositePlan(visibleBelow, true, "protected")).toEqual({
      visible: true,
      layer: "below-slides",
      opticalPath: "protected",
      requiresProtectedUnderlayPass: true,
    });
    expect(resolvePinnedFrameCompositePlan(visibleBelow, true, "through-lens")).toMatchObject({
      opticalPath: "through-lens",
      requiresProtectedUnderlayPass: false,
    });
    expect(resolvePinnedFrameCompositePlan({ visible: true, layer: "above-slides" }, true, "protected"))
      .toMatchObject({ layer: "above-slides", requiresProtectedUnderlayPass: false });
  });

  it("is optional and defaults to the full master without inventing media", () => {
    const project = createDefaultDriftProjectV4("default-pin", NOW);
    expect(resolvePinnedFramePresentation(project.presenter, project.master.duration, 4)).toEqual({
      enabled: false,
      visible: false,
      layer: "above-slides",
      storyStart: 0,
      storyEnd: 8,
      sourceTime: 4,
    });
  });

  it("round-trips selection, composition, treatment, layer, and range in portable project bytes", async () => {
    const { project, asset } = fixture();
    project.presenter = {
      ...project.presenter,
      x: 0.81,
      y: 0.22,
      width: 0.37,
      layoutMode: "safe-overlay",
      aspectMode: "custom",
      aspectWidth: 4,
      aspectHeight: 5,
      fit: "contain",
      focalX: 0.23,
      focalY: 0.77,
      radius: 46,
      smoothing: 0.72,
      matteOpacity: 0.18,
    };
    project.lens.presenterTreatment = "through-lens";
    const validated = validateDriftProjectV4(project);
    const snapshot = await createProjectBundle({
      payload: validated,
      projectId: validated.projectId,
      createdAt: validated.createdAt,
      updatedAt: validated.updatedAt,
      engineVersion: "0.1.0",
      themeVersion: "1",
      assets: [{ id: asset.id, name: asset.name, blob: asset.blob }],
    });
    const reopened = await importProjectBundle<unknown>(await exportProjectBundle(snapshot));
    const roundTripped = validateDriftProjectV4(reopened.payload);

    expect(roundTripped.presenter).toEqual(validated.presenter);
    expect(roundTripped.lens.presenterTreatment).toBe("through-lens");
  });

  it("rejects an empty authored story range", () => {
    const { project } = fixture();
    expect(() => validateDriftProjectV4({
      ...project,
      presenter: { ...project.presenter, startAt: 2, endAt: 2 },
    })).toThrow(/endAt.*greater/u);
  });
});
