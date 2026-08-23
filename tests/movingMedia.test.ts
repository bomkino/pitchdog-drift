import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import {
  countMovingMedia,
  getPinnedOnlyMovingMediaExclusion,
  resolveMovingMedia,
  resolveMovingMediaOrder,
} from "../src/core/project/movingMedia";

function projectWithDeck() {
  const project = createDefaultDriftProjectV4("moving-media", "2026-08-23T00:00:00.000Z");
  for (const [index, kind] of (["image", "image", "image"] as const).entries()) {
    const id = `asset-${index}`;
    project.media.order.push(id);
    project.media.assets[id] = {
      id,
      name: `${id}.png`,
      kind,
      mimeType: "image/png",
      hash: id.padEnd(64, "0"),
      byteLength: 1,
      width: 1080,
      height: 1920,
    };
  }
  return project;
}

describe("canonical moving media", () => {
  it("excludes exactly one enabled pinned-only still and preserves original source indices", () => {
    const project = projectWithDeck();
    project.presenter = {
      ...project.presenter,
      enabled: true,
      assetId: "asset-1",
      trackMode: "pinned-only",
    };
    const before = structuredClone(project);

    expect(getPinnedOnlyMovingMediaExclusion(project)).toBe("asset-1");
    expect(resolveMovingMedia(project)).toEqual({
      order: ["asset-0", "asset-2"],
      items: [
        { assetId: "asset-0", sourceIndex: 0 },
        { assetId: "asset-2", sourceIndex: 2 },
      ],
      count: 2,
      excludedPinnedOnlyAssetId: "asset-1",
      pinnedOnlyAssetExcluded: true,
    });
    expect(resolveMovingMediaOrder(project)).toEqual(["asset-0", "asset-2"]);
    expect(countMovingMedia(project)).toBe(2);
    expect(project).toEqual(before);
  });

  it("includes disabled pins and moving-and-pinned stills", () => {
    const project = projectWithDeck();
    project.presenter = { ...project.presenter, enabled: false, assetId: "asset-1", trackMode: "pinned-only" };
    expect(resolveMovingMediaOrder(project)).toEqual(project.media.order);

    project.presenter = { ...project.presenter, enabled: true, trackMode: "moving-and-pinned" };
    expect(resolveMovingMediaOrder(project)).toEqual(project.media.order);
  });

  it("never removes presenter video from the ordered moving deck", () => {
    const project = projectWithDeck();
    project.media.assets["asset-1"] = {
      ...project.media.assets["asset-1"]!,
      kind: "video",
      mimeType: "video/mp4",
      duration: 4,
    };
    project.presenter = { ...project.presenter, enabled: true, assetId: "asset-1", trackMode: "pinned-only" };

    expect(getPinnedOnlyMovingMediaExclusion(project)).toBeNull();
    expect(resolveMovingMediaOrder(project)).toEqual(project.media.order);
  });
});
