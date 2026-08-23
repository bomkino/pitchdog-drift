import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import {
  DRIFT_PROJECT_VERSION,
  type DriftProjectV3,
  type DriftProjectV4,
} from "../src/core/project/schema";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import {
  ProjectFrameAdapterError,
  evaluateProjectFrame,
} from "../src/core/render/projectFrameAdapter";
import { deriveSlideGeometry } from "../src/core/spatial/spatial";
import { evaluateFrame } from "../src/core/timeline/evaluateFrame";
import type { StudioAsset } from "../src/model";

const NOW = "2026-08-22T12:00:00.000Z";

function creativeTreeForBaseline(project: DriftProjectV4): DriftProjectV3 {
  const {
    renderContract: _renderContract,
    migration: _migration,
    extensions: _extensions,
    formatVersion: _formatVersion,
    ...creative
  } = project;
  return { ...creative, formatVersion: DRIFT_PROJECT_VERSION };
}

function fixture(): { project: DriftProjectV4; assets: StudioAsset[] } {
  const project = createDefaultDriftProjectV4("frame-adapter", NOW, 31);
  const assets = Array.from({ length: 3 }, (_, index) => {
    const id = `slide-${index}`;
    const blob = new Blob([new Uint8Array(index + 2).fill(index + 1)], { type: "image/png" });
    return {
      id,
      name: `${id}.png`,
      kind: "image" as const,
      blob,
      mimeType: "image/png",
      width: 1920 - index * 100,
      height: 1080 + index * 100,
      hash: (index + 1).toString(16).repeat(64),
      objectUrl: `blob:${id}`,
    };
  });

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
  project.slides = Object.fromEntries(assets.map((asset, index) => [asset.id, {
    assetId: asset.id,
    fit: index === 1 ? "contain" as const : "cover" as const,
    focalX: 0.2 + index * 0.2,
    focalY: 0.7 - index * 0.2,
    scaleOffset: (index - 1) * 0.1,
  }]));
  project.extensions = { "com.pitchdog.adapter-test": { ignoredByV1Evaluation: true } };
  return { project: validateDriftProjectV4(project), assets };
}

describe("Project V4 canonical frame adapter", () => {
  it("preserves V4 creative values while resolving evaluated slots to exact assets and directives", () => {
    const { project, assets } = fixture();
    const before = structuredClone(project);
    const compatible = creativeTreeForBaseline(project);

    const result = evaluateProjectFrame({ project, time: 2.125, frameIndex: 64, assets });

    expect(result.frame).toEqual(evaluateFrame(compatible, 2.125, { frameIndex: 64 }));
    expect(result.geometry).toEqual(deriveSlideGeometry(compatible, assets.length));
    expect(result.frame.frameIndex).toBe(64);
    expect(result.renderables).toHaveLength(result.frame.slides.length);
    for (const item of result.renderables) {
      const sourceIndex = item.evaluated.sourceIndex;
      const asset = assets[sourceIndex]!;
      expect(item.asset).toBe(asset);
      expect(item.directive).toEqual(project.slides[asset.id]);
      expect(item.directive).not.toBe(project.slides[asset.id]);
    }
    expect(project).toEqual(before);
  });

  it("is deterministic and preserves nullable preview frame identity", () => {
    const { project, assets } = fixture();
    const first = evaluateProjectFrame({ project, time: 1.75, frameIndex: null, assets });
    const repeated = evaluateProjectFrame({ project, time: 1.75, frameIndex: null, assets });

    expect(repeated.frame).toEqual(first.frame);
    expect(repeated.geometry).toEqual(first.geometry);
    expect(repeated.renderables.map(({ asset, directive, evaluated }) => ({
      assetId: asset.id,
      directive,
      evaluated,
    }))).toEqual(first.renderables.map(({ asset, directive, evaluated }) => ({
      assetId: asset.id,
      directive,
      evaluated,
    })));
    expect(first.frame.frameIndex).toBeNull();
  });

  it("rejects missing and out-of-order moving-track assets", () => {
    const { project, assets } = fixture();
    expect(() => evaluateProjectFrame({
      project,
      time: 0,
      frameIndex: 0,
      assets: assets.slice(0, 2),
    })).toThrow(/contains 3 slides, but the renderer received 2/u);
    expect(() => evaluateProjectFrame({
      project,
      time: 0,
      frameIndex: 0,
      assets: [assets[1]!, assets[0]!, assets[2]!],
    })).toThrow(/media order mismatch at source 0/u);
  });

  it.each([
    ["name", (asset: StudioAsset) => ({ ...asset, name: "wrong.png" })],
    ["MIME type", (asset: StudioAsset) => ({ ...asset, mimeType: "image/jpeg" })],
    ["dimensions", (asset: StudioAsset) => ({ ...asset, width: asset.width + 1 })],
    ["byte length", (asset: StudioAsset) => ({ ...asset, blob: new Blob(["wrong-size"], { type: asset.mimeType }) })],
    ["SHA-256 identity", (asset: StudioAsset) => ({ ...asset, hash: "f".repeat(64) })],
  ])("rejects a decoded asset whose %s differs from Project V4", (field, mutate) => {
    const { project, assets } = fixture();
    const mismatched = [...assets];
    mismatched[1] = mutate(assets[1]!);
    expect(() => evaluateProjectFrame({ project, time: 0, frameIndex: 0, assets: mismatched }))
      .toThrow(new RegExp(`${field} does not match`, "u"));
  });

  it("rejects ambiguous explicit frame identities", () => {
    const { project, assets } = fixture();
    for (const frameIndex of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => evaluateProjectFrame({ project, time: 0, frameIndex, assets }))
        .toThrow(ProjectFrameAdapterError);
    }
  });

  it("rejects a non-finite preview interaction distance", () => {
    const { project, assets } = fixture();
    for (const interactionDistancePx of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => evaluateProjectFrame({
        project,
        time: 0,
        frameIndex: null,
        assets,
        interactionDistancePx,
      })).toThrow(/interaction distance must be finite/u);
    }
  });
});
