import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { DRIFT_V2_RENDER_CONTRACT } from "../src/core/project/schema";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import { evaluateProjectFrame } from "../src/core/render/projectFrameAdapter";
import { applyEditorialDriftFoundation } from "../src/core/worlds";
import type { StudioAsset } from "../src/model";

const NOW = "2026-08-22T13:00:00.000Z";

function fixture() {
  let project = createDefaultDriftProjectV4("v2-frame", NOW, 73, DRIFT_V2_RENDER_CONTRACT);
  const assets: StudioAsset[] = Array.from({ length: 4 }, (_, index) => {
    const id = `slide-${index}`;
    const blob = new Blob([new Uint8Array(index + 2).fill(index + 1)], { type: "image/png" });
    return {
      id,
      name: `${id}.png`,
      kind: "image",
      blob,
      mimeType: "image/png",
      width: 1600,
      height: 900,
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
  project.slides = Object.fromEntries(assets.map((asset) => [asset.id, {
    assetId: asset.id,
    fit: "cover" as const,
    focalX: 0.5,
    focalY: 0.5,
    scaleOffset: 0,
  }]));
  project = applyEditorialDriftFoundation(validateDriftProjectV4(project), "9:16", NOW);
  return { project, assets };
}

describe("Project V4 canonical V2 frame evaluation", () => {
  it("uses one deterministic lifecycle-aware frame truth for preview and export", () => {
    const { project, assets } = fixture();
    const preview = evaluateProjectFrame({ project, assets, time: 1.4, frameIndex: null });
    const exported = evaluateProjectFrame({ project, assets, time: 1.4, frameIndex: 42 });
    const repeated = evaluateProjectFrame({ project, assets, time: 1.4, frameIndex: 42 });

    expect(preview.lifecycle?.phase).toBe("body");
    expect(exported.lifecycle).toEqual(preview.lifecycle);
    expect({ ...exported.frame, frameIndex: null }).toEqual(preview.frame);
    expect(repeated).toEqual(exported);
  });

  it.each(["12fps", "18fps", "24fps"] as const)(
    "keeps %s held-pose preview, still, and sequence frames identical",
    (poseCadence) => {
      const { project, assets } = fixture();
      const heldProject = validateDriftProjectV4({
        ...project,
        motion: {
          ...project.motion,
          cadence: { ...project.motion.cadence, poseCadence },
        },
      });
      let movingFrameIndex: number | null = null;
      let sequence = null as ReturnType<typeof evaluateProjectFrame> | null;
      const frameCount = heldProject.master.duration * heldProject.master.fps;

      for (let frameIndex = 1; frameIndex < frameCount; frameIndex += 1) {
        const candidate = evaluateProjectFrame({
          project: heldProject,
          assets,
          time: frameIndex / heldProject.master.fps,
          frameIndex,
        });
        if (Math.abs(candidate.frame.track.velocity) > 1e-6) {
          movingFrameIndex = frameIndex;
          sequence = candidate;
          break;
        }
      }

      expect(movingFrameIndex).not.toBeNull();
      expect(sequence).not.toBeNull();
      const time = movingFrameIndex! / heldProject.master.fps;
      const preview = evaluateProjectFrame({
        project: heldProject,
        assets,
        time,
        frameIndex: null,
      });
      const still = evaluateProjectFrame({
        project: heldProject,
        assets,
        time,
        frameIndex: null,
      });

      expect(still).toEqual(preview);
      expect(sequence!.frame.track.velocity).not.toBe(0);
      expect({
        ...sequence!,
        frame: { ...sequence!.frame, frameIndex: null },
      }).toEqual(preview);
    },
  );

  it("keeps semantic event windows identical at preview and sequence delivery frames", () => {
    const { project, assets } = fixture();
    let sequence: ReturnType<typeof evaluateProjectFrame> | null = null;
    let frameIndex = 1;
    const frameCount = Math.round(project.master.duration * project.master.fps);

    for (; frameIndex <= frameCount; frameIndex += 1) {
      const candidate = evaluateProjectFrame({
        project,
        assets,
        time: frameIndex / project.master.fps,
        frameIndex,
      });
      if (candidate.frame.events.length > 0) {
        sequence = candidate;
        break;
      }
    }

    expect(sequence).not.toBeNull();
    const preview = evaluateProjectFrame({
      project,
      assets,
      time: frameIndex / project.master.fps,
      frameIndex: null,
    });
    expect(preview.frame.events.length).toBeGreaterThan(0);
    expect(preview.frame.events).toEqual(sequence!.frame.events);
    expect({ ...sequence!.frame, frameIndex: null }).toEqual(preview.frame);
  });

  it("keeps entry and exit stationary while exposing authored layer visibility", () => {
    const { project, assets } = fixture();
    const entry = evaluateProjectFrame({ project, assets, time: 0, frameIndex: 0 });
    const body = evaluateProjectFrame({ project, assets, time: 3, frameIndex: 90 });
    const end = evaluateProjectFrame({
      project,
      assets,
      time: project.master.duration,
      frameIndex: project.master.duration * project.master.fps,
    });

    expect(entry.lifecycle).toMatchObject({ phase: "entry", body: { cumulativeTravel: 0 } });
    expect(entry.lifecycle?.layers.background.visibility).toBe(0);
    expect(entry.frame.track.resting).toBe(true);
    expect(body.lifecycle?.phase).toBe("body");
    expect(body.frame.track.visibleDistance).not.toBe(0);
    expect(end.lifecycle?.phase).toBe("complete");
    expect(end.lifecycle?.layers.background.visibility).toBe(0);
    expect(end.frame.track.resting).toBe(true);
  });

  it("removes a pinned-only still from moving-track authority without losing source identity", () => {
    const { project, assets } = fixture();
    project.presenter = {
      ...project.presenter,
      enabled: true,
      assetId: assets[1]!.id,
      trackMode: "pinned-only",
    };
    const validated = validateDriftProjectV4(project);
    const result = evaluateProjectFrame({ project: validated, assets, time: 2, frameIndex: 60 });

    expect(result.sourceOrder).toEqual([assets[0]!.id, assets[2]!.id, assets[3]!.id]);
    expect(new Set(result.renderables.map((item) => item.asset.id))).not.toContain(assets[1]!.id);
    for (const item of result.renderables) {
      expect(item.sourceIndex).toBe(assets.findIndex((asset) => asset.id === item.asset.id));
    }
  });

  it("authors both vertical and horizontal layouts from the same evaluator", () => {
    const { project, assets } = fixture();
    const vertical = evaluateProjectFrame({ project, assets, time: 2.5, frameIndex: 75 });
    const horizontalSource = structuredClone(project);
    horizontalSource.composition = { ...horizontalSource.composition, width: 1920, height: 1080 };
    const horizontalProject = applyEditorialDriftFoundation(horizontalSource, "16:9", NOW);
    const horizontal = evaluateProjectFrame({ project: horizontalProject, assets, time: 2.5, frameIndex: 75 });

    expect(vertical.sourceOrder).toEqual(horizontal.sourceOrder);
    expect(vertical.frame.slides.some((slide) => Math.abs(slide.primary) > 0)).toBe(true);
    expect(horizontal.frame.slides.some((slide) => Math.abs(slide.primary) > 0)).toBe(true);
    expect(vertical.geometry.axisExtent).toBe(1920);
    expect(horizontal.geometry.axisExtent).toBe(1920);
    expect(vertical.geometry.crossExtent).toBe(1080);
    expect(horizontal.geometry.crossExtent).toBe(1080);
    expect(vertical.projectAxis).toBe("vertical");
    expect(horizontal.projectAxis).toBe("horizontal");
  });

  it("routes repeated preview interaction through the authored path and exact deck wrap", () => {
    const { project, assets } = fixture();
    const time = 2.35;
    const baseline = evaluateProjectFrame({ project, assets, time, frameIndex: null });
    const fractional = evaluateProjectFrame({
      project,
      assets,
      time,
      frameIndex: null,
      interactionDistancePx: baseline.geometry.stride * 0.47,
    });

    const baselineBySlot = new Map(
      baseline.renderables.map((item) => [item.evaluated.logicalIndex, item.evaluated]),
    );
    const shared = fractional.renderables
      .map((item) => ({ before: baselineBySlot.get(item.evaluated.logicalIndex), after: item.evaluated }))
      .filter((pair): pair is { before: NonNullable<typeof pair.before>; after: typeof pair.after } => (
        pair.before !== undefined
      ));

    expect(shared.length).toBeGreaterThan(0);
    expect(shared.some(({ before, after }) => (
      Math.abs(after.cross - before.cross) > 1e-6
      || Math.abs(after.z - before.z) > 1e-6
      || Math.abs(after.rotationZ - before.rotationZ) > 1e-6
      || Math.abs(after.opacity - before.opacity) > 1e-6
    ))).toBe(true);
    // A static manual offset changes position, never the authored timeline's
    // velocity. This prevents drag state from becoming a second master clock.
    expect(fractional.frame.track.velocity).toBe(baseline.frame.track.velocity);

    const assertWrappedPair = (shortSteps: number, repeatedLoops: number) => {
      const short = evaluateProjectFrame({
        project,
        assets,
        time,
        frameIndex: null,
        interactionDistancePx: baseline.geometry.stride * shortSteps,
      });
      const repeated = evaluateProjectFrame({
        project,
        assets,
        time,
        frameIndex: null,
        interactionDistancePx: baseline.geometry.stride
          * (shortSteps + baseline.geometry.virtualSlotCount * repeatedLoops),
      });

      expect(repeated.renderables.map((item) => item.evaluated.logicalIndex))
        .toEqual(short.renderables.map((item) => item.evaluated.logicalIndex));
      expect(repeated.renderables.map((item) => item.asset.id))
        .toEqual(short.renderables.map((item) => item.asset.id));
      expect(repeated.frame.track.visibleDistance).toBeCloseTo(short.frame.track.visibleDistance, 10);
      repeated.renderables.forEach((item, index) => {
        const expected = short.renderables[index]!.evaluated;
        expect(item.evaluated.primary).toBeCloseTo(expected.primary, 9);
        expect(item.evaluated.cross).toBeCloseTo(expected.cross, 9);
        expect(item.evaluated.z).toBeCloseTo(expected.z, 9);
        expect(item.evaluated.rotationX).toBeCloseTo(expected.rotationX, 9);
        expect(item.evaluated.rotationY).toBeCloseTo(expected.rotationY, 9);
        expect(item.evaluated.rotationZ).toBeCloseTo(expected.rotationZ, 9);
        expect(item.evaluated.scale).toBeCloseTo(expected.scale, 9);
        expect(item.evaluated.opacity).toBeCloseTo(expected.opacity, 9);
      });
    };

    // Hundreds of Next/Previous operations collapse to the same canonical
    // deck state instead of translating a finite card pool into empty space.
    assertWrappedPair(3, 127);
    assertWrappedPair(-2, -131);
  });

  it.each([
    { ratio: "9:16" as const, axis: "vertical" as const },
    { ratio: "16:9" as const, axis: "horizontal" as const },
  ])("smoothly hides accidental edge fragments on the $axis transport axis", ({ ratio, axis }) => {
    const { project, assets } = fixture();
    const axisSource = structuredClone(project);
    axisSource.composition = ratio === "16:9"
      ? { ...axisSource.composition, width: 1920, height: 1080 }
      : { ...axisSource.composition, width: 1080, height: 1920 };
    const axisProject = applyEditorialDriftFoundation(axisSource, ratio, NOW);
    const observations: Array<{
      frameIndex: number;
      logicalIndex: number;
      visibleFraction: number;
      baseOpacity: number;
      opacity: number;
    }> = [];
    const frameCount = Math.round(axisProject.master.duration * axisProject.master.fps);

    for (let frameIndex = 0; frameIndex <= frameCount; frameIndex += 1) {
      const evaluation = evaluateProjectFrame({
        project: axisProject,
        assets,
        time: frameIndex / axisProject.master.fps,
        frameIndex,
      });
      const unscaledCardExtent = axis === "horizontal"
        ? evaluation.geometry.width
        : evaluation.geometry.height;
      const stageHalfExtent = evaluation.geometry.axisExtent / 2;

      for (const slide of evaluation.frame.slides) {
        const cardExtent = unscaledCardExtent * slide.scale;
        const cardHalfExtent = cardExtent / 2;
        const intersection = Math.max(
          0,
          Math.min(stageHalfExtent, slide.primary + cardHalfExtent)
            - Math.max(-stageHalfExtent, slide.primary - cardHalfExtent),
        );
        const visibleFraction = Math.max(0, Math.min(1, intersection / cardExtent));
        const normalized = Math.max(
          -1.4,
          Math.min(1.4, slide.primary / evaluation.geometry.visibleRadius),
        );
        const baseOpacity = Math.max(
          0.08,
          Math.min(1, 1 - axisProject.motion.path.edgeFade * Math.pow(Math.abs(normalized), 1.6)),
        );
        observations.push({
          frameIndex,
          logicalIndex: slide.logicalIndex,
          visibleFraction,
          baseOpacity,
          opacity: slide.opacity,
        });
      }
    }

    const hidden = observations.find((sample) => sample.visibleFraction <= 0.1);
    const easing = observations.find(
      (sample) => sample.visibleFraction > 0.14 && sample.visibleFraction < 0.285,
    );
    const fullyRevealed = observations.find((sample) => sample.visibleFraction >= 0.325);

    expect(axisProject.motion.transport.axis).toBe(axis);
    expect(hidden).toBeDefined();
    expect(hidden!.opacity).toBe(0);
    expect(easing).toBeDefined();
    expect(easing!.opacity).toBeGreaterThan(0);
    expect(easing!.opacity).toBeLessThan(easing!.baseOpacity);
    const revealProgress = (easing!.visibleFraction - 0.1) / (0.325 - 0.1);
    const expectedReveal = revealProgress * revealProgress * (3 - 2 * revealProgress);
    expect(easing!.opacity).toBeCloseTo(easing!.baseOpacity * expectedReveal, 12);
    expect(fullyRevealed).toBeDefined();
    expect(fullyRevealed!.opacity).toBeCloseTo(fullyRevealed!.baseOpacity, 12);

    const easingTime = easing!.frameIndex / axisProject.master.fps;
    const sequence = evaluateProjectFrame({
      project: axisProject,
      assets,
      time: easingTime,
      frameIndex: easing!.frameIndex,
    });
    const still = evaluateProjectFrame({ project: axisProject, assets, time: easingTime, frameIndex: null });
    const repeated = evaluateProjectFrame({
      project: axisProject,
      assets,
      time: easingTime,
      frameIndex: easing!.frameIndex,
    });
    const sequenceSlide = sequence.frame.slides.find((slide) => slide.logicalIndex === easing!.logicalIndex);
    const stillSlide = still.frame.slides.find((slide) => slide.logicalIndex === easing!.logicalIndex);

    expect(sequenceSlide?.opacity).toBe(easing!.opacity);
    expect(stillSlide?.opacity).toBe(easing!.opacity);
    expect(repeated).toEqual(sequence);
  });
});
