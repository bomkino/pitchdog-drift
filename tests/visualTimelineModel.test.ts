import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { resolveMovingMedia } from "../src/core/project/movingMedia";
import {
  DRIFT_V2_RENDER_CONTRACT,
  type Axis,
  type DriftProjectV4,
} from "../src/core/project/schema";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import { applyOutcomeRecipe } from "../src/core/recipes/outcomeRecipes";
import { buildDeliveryReceipt } from "../src/core/timeline/deliveryReceipt";
import {
  createPerformanceLifecycle,
  TRANSITION_PRESETS,
  type LifecycleRepeat,
} from "../src/core/timeline/performanceLifecycle";
import { compileSequence } from "../src/core/timeline/sequenceCompiler";
import {
  readSequenceAuthoring,
  SEQUENCE_EXTENSION_KEY,
  withSequenceAuthoring,
  type SequenceAuthoring,
} from "../src/core/timeline/sequenceAuthoring";
import {
  applyTimingResolution,
  resolveProjectTiming,
  withTimingIntent,
  type TimingIntent,
} from "../src/core/timeline/timingIntent";
import {
  buildVisualTimelineModel,
  sampleVisualTimeline,
  VisualTimelineModelError,
  type VisualTimelineModel,
} from "../src/core/timeline/visualTimelineModel";

const NOW = "2026-08-24T00:00:00.000Z";
const FIXED: TimingIntent = { schemaVersion: 1, mode: "fixed-master", secondsPerSlide: 0.75 };
const CONTENT_PACED: TimingIntent = {
  schemaVersion: 1,
  mode: "content-paced",
  secondsPerSlide: 0.75,
};

const CASINO: SequenceAuthoring = {
  schemaVersion: 1,
  groups: [
    {
      id: "fast-open",
      label: "FAST ×2",
      passes: 2,
      pace: "fast",
      relativeSecondsPerPass: 0.22,
    },
    {
      id: "read-reveal",
      label: "READ ×1",
      passes: 1,
      pace: "read",
      relativeSecondsPerPass: 1,
    },
    {
      id: "fast-close",
      label: "FAST ×1",
      passes: 1,
      pace: "fast",
      relativeSecondsPerPass: 0.22,
    },
  ],
  repeatCount: 1,
};

function fixture(slideCount = 6, duration = 10, axis: Axis = "horizontal"): DriftProjectV4 {
  const project = createDefaultDriftProjectV4(
    "visual-timeline",
    NOW,
    91,
    DRIFT_V2_RENDER_CONTRACT,
  );
  project.master.duration = duration;
  project.motion.transport.axis = axis;
  project.motion.seamless = { enabled: true, loops: 1 };
  project.performance = createPerformanceLifecycle({
    entry: { enabled: false },
    body: { durationSeconds: duration, tempo: { kind: "preset", preset: "even" } },
    exit: { enabled: false },
    repeat: { mode: "off" },
  }).authoring;
  for (let index = 0; index < slideCount; index += 1) {
    const id = `slide-${index}`;
    project.media.order.push(id);
    project.media.assets[id] = {
      id,
      name: `${id}.png`,
      kind: "image",
      mimeType: "image/png",
      hash: (index + 1).toString(16).padStart(64, "0"),
      byteLength: index + 1,
      width: 1920,
      height: 1080,
    };
    project.slides[id] = {
      assetId: id,
      fit: "cover",
      focalX: 0.5,
      focalY: 0.5,
      scaleOffset: 0,
    };
  }
  return validateDriftProjectV4(project);
}

function resolve(
  project: DriftProjectV4,
  intent: TimingIntent = FIXED,
): DriftProjectV4 {
  const withIntent = withTimingIntent(project, intent);
  return applyTimingResolution(
    withIntent,
    resolveProjectTiming(withIntent, resolveMovingMedia(withIntent).count, intent),
  );
}

function casinoProject(slideCount = 6, duration = 10): DriftProjectV4 {
  return applyOutcomeRecipe(fixture(slideCount, duration), "casino-reveal");
}

function model(project: DriftProjectV4): VisualTimelineModel {
  return buildVisualTimelineModel(project, resolveMovingMedia(project).order);
}

function receipt(project: DriftProjectV4) {
  const moving = resolveMovingMedia(project);
  return buildDeliveryReceipt({
    project,
    movingMediaOrder: moving.order,
    exportSettings: {
      width: project.composition.width,
      height: project.composition.height,
      fps: project.master.fps,
      duration: project.master.duration,
      container: "mp4",
    },
    eventPlan: [],
    lifecycle: createPerformanceLifecycle(project.performance),
  });
}

function repeatedProject(
  repeat: LifecycleRepeat,
  sequence = CASINO,
): DriftProjectV4 {
  const project = withSequenceAuthoring(fixture(4, 10), sequence);
  project.performance = createPerformanceLifecycle({
    transitionPreset: "quiet-lift",
    entry: TRANSITION_PRESETS["quiet-lift"].entry,
    body: { durationSeconds: 3, tempo: { kind: "preset", preset: "even" } },
    exit: TRANSITION_PRESETS["quiet-lift"].exit,
    repeat,
  }).authoring;
  project.master.duration = createPerformanceLifecycle(project.performance).totalDuration;
  return resolve(project);
}

describe("canonical visual timeline model", () => {
  it("renders Casino as exact FAST ×2 → READ ×1 → FAST ×1 spans and compiler knots", () => {
    const project = casinoProject(6, 10);
    const result = model(project);
    const compiled = compileSequence(readSequenceAuthoring(project).authoring!, {
      bodyDurationSeconds: project.performance.body.durationSeconds,
      movingSlideCount: 6,
    });
    const delivery = receipt(project);

    expect(result).toMatchObject({
      totalDuration: 10,
      authority: "pass-sequence",
      sequenceStatus: "stored",
      movingSlideCount: 6,
      sceneCount: 1,
      bodyCycleCount: 1,
    });
    expect(result.entrySegments).toEqual([]);
    expect(result.exitSegments).toEqual([]);
    expect(result.bodySegments.map(({ label, pace, passCount }) => ({ label, pace, passCount })))
      .toEqual([
        { label: "FAST ×2", pace: "fast", passCount: 2 },
        { label: "READ ×1", pace: "read", passCount: 1 },
        { label: "FAST ×1", pace: "fast", passCount: 1 },
      ]);
    expect(result.bodySegments.map(({ start, end, duration }) => ({ start, end, duration })))
      .toEqual(compiled.groups.map(({ start, end, duration }) => ({ start, end, duration })));
    expect(result.passes.map(({ start, end, duration }) => ({ start, end, duration })))
      .toEqual(compiled.passes.map(({ start, end, duration }) => ({ start, end, duration })));
    expect(result.passes.map(({ end }) => end))
      .toEqual(delivery.passes.boundaries.map(({ end }) => end));
    result.passes.forEach((pass, index) => {
      expect(Math.abs(pass.start - compiled.passes[index]!.start)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(pass.end - delivery.passes.boundaries[index]!.end)).toBeLessThanOrEqual(1e-9);
    });
    expect(Math.abs(result.totalDuration - project.master.duration)).toBeLessThanOrEqual(1e-9);
    expect(result.bodySegments[0]!.passTicks.map(({ time }) => time)).toEqual([
      compiled.passes[0]!.start,
      compiled.passes[0]!.end,
      compiled.passes[1]!.end,
    ]);
    expect(result.bodySegments.reduce((total, segment) => total + segment.normalizedWidth, 0))
      .toBeCloseTo(1, 14);
    expect(result.bodySegments.at(-1)!.end).toBe(project.master.duration);
    expect(result.passBoundaries.at(-1)!.time).toBe(project.master.duration);
  });

  it("uses the resolved content-paced duration without inventing another clock", () => {
    const source = withSequenceAuthoring(fixture(4, 10), CASINO);
    const project = resolve(source, CONTENT_PACED);
    const result = model(project);
    const resolution = resolveProjectTiming(project, 4, CONTENT_PACED);
    const delivery = receipt(project);

    expect(result.timing).toEqual({
      mode: "content-paced",
      status: "stored",
      protectedInput: "seconds-per-slide",
    });
    expect(result.totalDuration).toBeCloseTo(4.98, 12);
    expect(result.totalDuration).toBe(resolution.masterSeconds);
    expect(result.totalDuration).toBe(delivery.segments.masterSeconds);
    result.passes.forEach((pass, index) => {
      expect(Math.abs(pass.start - delivery.passes.boundaries[index]!.start)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(pass.end - delivery.passes.boundaries[index]!.end)).toBeLessThanOrEqual(1e-9);
    });
  });

  it("expands body and full-scene repeats in exact authored order", () => {
    const bodyRepeat = model(repeatedProject({ mode: "body", count: 2 }));
    expect(bodyRepeat.segments.map(({ kind }) => kind)).toEqual([
      "entry",
      "sequence-group",
      "sequence-group",
      "sequence-group",
      "sequence-group",
      "sequence-group",
      "sequence-group",
      "exit",
    ]);
    expect(bodyRepeat.entrySegments).toHaveLength(1);
    expect(bodyRepeat.bodySegments).toHaveLength(6);
    expect(bodyRepeat.exitSegments).toHaveLength(1);
    expect(bodyRepeat.passes).toHaveLength(8);

    const sceneRepeat = model(repeatedProject({ mode: "full-scene", count: 2 }));
    expect(sceneRepeat.segments.map(({ kind }) => kind)).toEqual([
      "entry",
      "sequence-group",
      "sequence-group",
      "sequence-group",
      "exit",
      "entry",
      "sequence-group",
      "sequence-group",
      "sequence-group",
      "exit",
    ]);
    expect(sceneRepeat.entrySegments.map(({ sceneIndex }) => sceneIndex)).toEqual([0, 1]);
    expect(sceneRepeat.exitSegments.map(({ sceneIndex }) => sceneIndex)).toEqual([0, 1]);
    expect(sceneRepeat.bodySegments.map(({ bodyCycleIndex }) => bodyCycleIndex)).toEqual([
      0, 0, 0, 1, 1, 1,
    ]);
    expect(sceneRepeat.segments.reduce((sum, segment) => sum + segment.normalizedWidth, 0))
      .toBeCloseTo(1, 14);
  });

  it("falls back to exact legacy tempo passes when sequence data is missing or malformed", () => {
    const missing = fixture(4, 10);
    missing.motion.seamless.loops = 2;
    missing.performance = createPerformanceLifecycle({
      entry: { enabled: false },
      body: { durationSeconds: 10, tempo: { kind: "preset", preset: "spin-then-read" } },
      exit: { enabled: false },
      repeat: { mode: "off" },
    }).authoring;
    const missingModel = model(resolve(missing));
    const missingReceipt = receipt(resolve(missing));
    expect(missingModel).toMatchObject({ authority: "legacy-tempo", sequenceStatus: "missing" });
    expect(missingModel.bodySegments).toHaveLength(1);
    expect(missingModel.bodySegments[0]).toMatchObject({
      kind: "legacy-body",
      label: "Carousel",
      paceLabel: "Original rhythm",
      passCount: 2,
    });
    expect(missingModel.passes.map(({ start, end }) => ({ start, end }))).toEqual(
      missingReceipt.passes.boundaries.map(({ start, end }) => ({ start, end })),
    );

    const malformed = structuredClone(missing);
    malformed.extensions[SEQUENCE_EXTENSION_KEY] = {
      schemaVersion: 1,
      groups: [],
      repeatCount: 1,
    };
    const malformedModel = model(resolve(malformed));
    expect(malformedModel.sequenceStatus).toBe("malformed");
    expect(malformedModel.authority).toBe("legacy-tempo");
    expect(malformedModel.passes).toEqual(missingModel.passes);
  });

  it("keeps zero-slide masters and disabled transitions deterministic", () => {
    const project = resolve(withSequenceAuthoring(fixture(0, 10), CASINO));
    const result = model(project);
    expect(result.movingMediaOrder).toEqual([]);
    expect(result.movingSlideCount).toBe(0);
    expect(result.entrySegments).toEqual([]);
    expect(result.exitSegments).toEqual([]);
    expect(result.bodySegments).toHaveLength(3);
    expect(result.passes).toHaveLength(4);
    expect(result.passes.every(({ start, end }) => end > start)).toBe(true);
    expect(result.totalDuration).toBe(10);
    expect(sampleVisualTimeline(result, 5)).toMatchObject({
      time: 5,
      normalizedPlayhead: 0.5,
    });
  });

  it("samples clamped playheads, exact joins, and strict keyboard boundaries", () => {
    const result = model(casinoProject(6, 10));
    const join = result.bodySegments[0]!.end;
    const atJoin = sampleVisualTimeline(result, join);
    expect(atJoin.segmentIndex).toBe(1);
    expect(atJoin.segment).toBe(result.bodySegments[1]);
    expect(atJoin.localProgress).toBe(0);
    expect(atJoin.nearestPassBoundary?.time).toBe(join);
    expect(atJoin.previousPassBoundary?.time).toBeLessThan(join);
    expect(atJoin.nextPassBoundary?.time).toBeGreaterThan(join);

    const start = sampleVisualTimeline(result, Number.NEGATIVE_INFINITY);
    expect(start).toMatchObject({
      requestedTime: 0,
      time: 0,
      atEnd: false,
      normalizedPlayhead: 0,
      previousPassBoundary: null,
    });
    expect(start.nearestPassBoundary?.time).toBe(0);

    const end = sampleVisualTimeline(result, Number.POSITIVE_INFINITY);
    expect(end).toMatchObject({
      requestedTime: 10,
      time: 10,
      atEnd: true,
      normalizedPlayhead: 1,
      localProgress: 1,
      nextPassBoundary: null,
    });
    expect(end.segment).toBe(result.segments.at(-1));

    const before = sampleVisualTimeline(result, -42);
    const after = sampleVisualTimeline(result, 42);
    expect(before.time).toBe(0);
    expect(after.time).toBe(10);
    expect(before.requestedTime).toBe(-42);
    expect(after.requestedTime).toBe(42);
  });

  it("is immutable, horizontal/vertical invariant, and rejects non-canonical order", () => {
    const horizontal = casinoProject();
    const vertical = structuredClone(horizontal);
    vertical.motion.transport.axis = "vertical";
    vertical.motion.transport.direction = -1;
    const beforeHorizontal = JSON.stringify(horizontal);
    const beforeVertical = JSON.stringify(vertical);

    const horizontalModel = model(horizontal);
    const verticalModel = model(vertical);
    expect(verticalModel).toEqual(horizontalModel);
    expect(JSON.stringify(horizontal)).toBe(beforeHorizontal);
    expect(JSON.stringify(vertical)).toBe(beforeVertical);
    expect(Object.isFrozen(horizontalModel)).toBe(true);
    expect(Object.isFrozen(horizontalModel.segments)).toBe(true);
    expect(Object.isFrozen(horizontalModel.bodySegments[0]!.passes)).toBe(true);

    const wrongOrder = [...resolveMovingMedia(horizontal).order].reverse();
    expect(() => buildVisualTimelineModel(horizontal, wrongOrder))
      .toThrow(VisualTimelineModelError);
  });

  it("matches Smooth Carousel authored content pace and exact endpoint", () => {
    const project = applyOutcomeRecipe(fixture(5, 10), "smooth-carousel");
    const result = model(project);
    expect(result.timing.mode).toBe("content-paced");
    expect(result.authority).toBe("pass-sequence");
    expect(result.bodySegments).toHaveLength(1);
    expect(result.bodySegments[0]).toMatchObject({
      label: "READ ×1",
      pace: "read",
      passCount: 1,
      start: 0,
    });
    expect(result.totalDuration).toBeCloseTo(4.5, 12);
    expect(result.bodySegments[0]!.end).toBe(result.totalDuration);
    expect(result.passBoundaries.at(-1)!.normalizedTime).toBe(1);
  });

  it("builds the maximum 100-pass model in linear-size output far below a frame budget", () => {
    const hundred: SequenceAuthoring = {
      schemaVersion: 1,
      groups: Array.from({ length: 100 }, (_, index) => ({
        id: `group-${index}`,
        label: `Group ${index + 1}`,
        passes: 1,
        pace: "custom" as const,
        relativeSecondsPerPass: 1,
      })),
      repeatCount: 1,
    };
    const project = resolve(withSequenceAuthoring(fixture(10, 100), hundred));
    const moving = resolveMovingMedia(project).order;
    const result = buildVisualTimelineModel(project, moving);
    expect(result.bodySegments).toHaveLength(100);
    expect(result.passes).toHaveLength(100);
    expect(result.passBoundaries).toHaveLength(101);

    for (let warmup = 0; warmup < 20; warmup += 1) buildVisualTimelineModel(project, moving);
    const iterations = 300;
    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) {
      buildVisualTimelineModel(project, moving);
    }
    const averageMilliseconds = (performance.now() - started) / iterations;
    expect(averageMilliseconds).toBeLessThan(5);
  });
});
