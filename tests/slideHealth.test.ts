import { describe, expect, it } from "vitest";
import { evaluateSlideHealth } from "../src/core/media/slideHealth";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";

const NOW = "2026-08-23T00:00:00.000Z";

function projectWithSlide(width = 1080, height = 1920) {
  const project = createDefaultDriftProjectV4("health", NOW);
  const assetId = "slide-a";
  project.media.order = [assetId];
  project.media.assets[assetId] = {
    id: assetId,
    name: "slide-a.png",
    kind: "image",
    mimeType: "image/png",
    hash: "a".repeat(64),
    byteLength: 10,
    width,
    height,
  };
  project.slides[assetId] = { assetId, fit: "cover", focalX: 0.5, focalY: 0.5, scaleOffset: 0 };
  return { project, assetId };
}

describe("slide health", () => {
  it("reports only metadata facts and catches projected upscaling", () => {
    const { project, assetId } = projectWithSlide(120, 120);
    const result = evaluateSlideHealth(project, assetId);
    expect(result.severity).toBe("warning");
    expect(result.issues.map((issue) => issue.id)).toContain("low-resolution");
    expect(result.requiredWidth).toBeGreaterThan(120);
  });

  it("reports a focal point that cannot remain centred after cover crop", () => {
    const { project, assetId } = projectWithSlide(2400, 800);
    project.slides[assetId]!.focalX = 0.01;
    expect(evaluateSlideHealth(project, assetId).issues.map((issue) => issue.id)).toContain("focal-edge");
  });

  it("labels a still-only deck image as excluded from timing", () => {
    const { project, assetId } = projectWithSlide();
    project.presenter.enabled = true;
    project.presenter.assetId = assetId;
    project.presenter.trackMode = "pinned-only";
    const issue = evaluateSlideHealth(project, assetId).issues.find((entry) => entry.id === "pinned-only");
    expect(issue?.severity).toBe("note");
  });

  it("blocks a manifest reference whose source is missing", () => {
    const project = createDefaultDriftProjectV4("health", NOW);
    expect(evaluateSlideHealth(project, "missing").severity).toBe("blocker");
  });
});
