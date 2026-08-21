import { describe, expect, it } from "vitest";
import { applyProjectCommand } from "../src/core/commands/projectCommand";
import { createDefaultDriftProject } from "../src/core/project/defaults";
import { createProjectRevisionState } from "../src/core/project/revisions";
import {
  MAX_RESIDENT_SLIDES,
  PATH_RECIPES,
  applyPathCommand,
  deriveSlideGeometry,
} from "../src/core/spatial/spatial";
import { evaluateFrame } from "../src/core/timeline/evaluateFrame";

function project(slideCount = 12) {
  const value = createDefaultDriftProject("spatial-v3", "2026-08-21T00:00:00.000Z");
  value.media.order = Array.from({ length: slideCount }, (_, index) => `slide-${index}`);
  value.media.assets = Object.fromEntries(value.media.order.map((id, index) => [id, {
    id,
    name: `${id}.png`,
    kind: "image" as const,
    mimeType: "image/png",
    hash: index.toString(16).padStart(64, "0"),
    byteLength: 1_024 + index,
    width: index % 2 === 0 ? 1920 : 1080,
    height: index % 2 === 0 ? 1080 : 1920,
  }]));
  value.slides = Object.fromEntries(value.media.order.map((assetId) => [assetId, {
    assetId,
    fit: "cover" as const,
    focalX: 0.5,
    focalY: 0.5,
    scaleOffset: 0,
  }]));
  return value;
}

function finiteSlide(slide: ReturnType<typeof evaluateFrame>["slides"][number]): boolean {
  return [
    slide.primary,
    slide.cross,
    slide.z,
    slide.rotationX,
    slide.rotationY,
    slide.rotationZ,
    slide.scale,
    slide.opacity,
    slide.pathBend,
    slide.focusWeight,
  ].every(Number.isFinite);
}

function signature(frame: ReturnType<typeof evaluateFrame>) {
  return frame.slides.map((slide) => ({
    logicalIndex: slide.logicalIndex,
    sourceIndex: slide.sourceIndex,
    primary: slide.primary,
    cross: slide.cross,
    z: slide.z,
    rotationX: slide.rotationX,
    rotationY: slide.rotationY,
    rotationZ: slide.rotationZ,
    scale: slide.scale,
    opacity: slide.opacity,
  }));
}

describe("Project V3 spatial fabric", () => {
  it("contains ten materially distinct authored paths", () => {
    expect(PATH_RECIPES).toHaveLength(10);
    expect(new Set(PATH_RECIPES.map((entry) => entry.id)).size).toBe(10);
    expect(new Set(PATH_RECIPES.map((entry) => JSON.stringify(entry.path))).size).toBe(10);
    expect(PATH_RECIPES.map((entry) => entry.id)).toEqual([
      "straight",
      "arc",
      "ribbon",
      "cylinder",
      "tunnel",
      "helix",
      "orbit",
      "cascade",
      "figure-eight",
      "switchback",
    ]);
  });

  it("keeps the virtual pool source-aligned and the rendered pool bounded", () => {
    for (const count of [1, 2, 3, 12, 90, 200]) {
      const current = project(count);
      const geometry = deriveSlideGeometry(current, count);
      expect(geometry.virtualSlotCount).toBeGreaterThanOrEqual(count);
      expect(geometry.virtualSlotCount % count).toBe(0);
      const frame = evaluateFrame(current, 2.1);
      expect(frame.slides.length).toBeLessThanOrEqual(MAX_RESIDENT_SLIDES);
      expect(frame.slides.every((slide) => slide.sourceIndex >= 0 && slide.sourceIndex < count)).toBe(true);
    }
  });

  it("stays finite across every path, axis, direction, and control extreme", () => {
    for (const recipe of PATH_RECIPES) {
      for (const axis of ["horizontal", "vertical"] as const) {
        for (const direction of [-1, 1] as const) {
          const current = project();
          current.motion.path = {
            ...recipe.path,
            id: recipe.id,
            gap: 1.5,
            curvature: 1,
            depth: 1,
            banking: direction * 45,
            focusScale: 0.5,
            edgeFade: 1,
          };
          current.motion.transport.axis = axis;
          current.motion.transport.direction = direction;
          current.motion.performance.imperfection = 1;
          current.motion.performance.take = 999_999;
          const frame = evaluateFrame(current, 7.43, { frameIndex: 223 });
          expect(frame.slides.length).toBeGreaterThan(0);
          expect(frame.slides.every(finiteSlide)).toBe(true);
          expect(frame.slides.every((slide) => slide.opacity >= 0.08 && slide.opacity <= 1)).toBe(true);
          expect(frame.slides.every((slide) => slide.scale >= 0.24 && slide.scale <= 1.6)).toBe(true);
        }
      }
    }
  });

  it("collapses every path to one flat strip when curve and depth are zero", () => {
    const signatures = PATH_RECIPES.map((recipe) => {
      const current = project();
      current.motion.path = {
        ...recipe.path,
        id: recipe.id,
        curvature: 0,
        depth: 0,
        banking: 0,
      };
      current.motion.performance.imperfection = 0;
      return evaluateFrame(current, 2.5).slides.map((slide) => ({
        logicalIndex: slide.logicalIndex,
        primary: slide.primary,
        cross: slide.cross,
        z: slide.z,
        rotationX: slide.rotationX,
        rotationY: slide.rotationY,
        rotationZ: slide.rotationZ,
      }));
    });
    for (const current of signatures.slice(1)) expect(current).toEqual(signatures[0]);
  });

  it("lets banking change orientation without moving the path", () => {
    const flat = project();
    flat.motion.path = { ...PATH_RECIPES[5]!.path, id: "helix", banking: 0 };
    flat.motion.performance.imperfection = 0;
    const banked = structuredClone(flat);
    banked.motion.path.banking = 14;

    const before = evaluateFrame(flat, 3.2).slides;
    const after = evaluateFrame(banked, 3.2).slides;
    expect(after.map((slide) => ({ primary: slide.primary, cross: slide.cross, z: slide.z })))
      .toEqual(before.map((slide) => ({ primary: slide.primary, cross: slide.cross, z: slide.z })));
    expect(after.some((slide, index) => (
      Math.abs(slide.rotationX - before[index]!.rotationX) > 1e-8
      || Math.abs(slide.rotationY - before[index]!.rotationY) > 1e-8
      || Math.abs(slide.rotationZ - before[index]!.rotationZ) > 1e-8
    ))).toBe(true);
  });

  it("closes the complete spatial and imperfection state at a seamless boundary", () => {
    for (const recipe of PATH_RECIPES) {
      const current = project(7);
      current.motion.path = { id: recipe.id, ...recipe.path };
      current.motion.seamless = { enabled: true, loops: 3 };
      current.motion.performance.imperfection = 0.67;
      current.motion.performance.take = 29;
      current.master.duration = 12;
      const first = evaluateFrame(current, 0, { frameIndex: 0 });
      const last = evaluateFrame(current, 12, { frameIndex: 288 });
      expect(signature(last)).toEqual(signature(first));
    }
  });

  it("is deterministic at the same explicit time and changes repeatably by take", () => {
    const current = project();
    current.motion.path = { id: "figure-eight", ...PATH_RECIPES[8]!.path };
    current.motion.performance.imperfection = 0.8;
    current.motion.performance.take = 11;
    const first = signature(evaluateFrame(current, 4.25));
    const repeated = signature(evaluateFrame(current, 4.25));
    expect(repeated).toEqual(first);

    current.motion.performance.take = 12;
    const recast = signature(evaluateFrame(current, 4.25));
    expect(recast).not.toEqual(first);
    expect(signature(evaluateFrame(current, 4.25))).toEqual(recast);
  });

  it("applies path recipes without changing cut, performance, master, or media", () => {
    const current = project();
    const preserved = structuredClone({
      media: current.media,
      slides: current.slides,
      cadence: current.motion.cadence,
      performance: current.motion.performance,
      master: current.master,
      material: current.material,
      lighting: current.lighting,
      atmosphere: current.atmosphere,
      lens: current.lens,
      sound: current.sound,
      presenter: current.presenter,
    });
    const result = applyProjectCommand(
      current,
      createProjectRevisionState(),
      applyPathCommand("switchback"),
      "2026-08-21T00:01:00.000Z",
    );

    expect(result.project.motion.path).toEqual({ id: "switchback", ...PATH_RECIPES[9]!.path });
    expect(result.project).toMatchObject(preserved);
    expect(result.receipt.ownedDomains).toEqual(["motion", "provenance"]);
    expect(result.receipt.changedPaths).toContain("motion.path.id");
  });
});
