import { describe, expect, it, vi } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { resolveMovingMedia } from "../src/core/project/movingMedia";
import {
  DRIFT_V2_RENDER_CONTRACT,
  type DriftProjectV4,
} from "../src/core/project/schema";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import { buildDeliveryReceipt } from "../src/core/timeline/deliveryReceipt";
import { evaluateV2Frame } from "../src/core/timeline/evaluateV2Frame";
import { createPerformanceLifecycle } from "../src/core/timeline/performanceLifecycle";
import {
  compileSequence,
  evaluateCompiledSequence,
  sequenceContentPacedBodySeconds,
} from "../src/core/timeline/sequenceCompiler";
import { measureSequenceVelocityEnvelope } from "../src/core/timeline/sequenceDiagnostics";
import {
  createSequenceAuthoring,
  parseSequenceAuthoringExtension,
  readSequenceAuthoring,
  SEQUENCE_EXTENSION_KEY,
  withSequenceAuthoring,
  type SequenceAuthoring,
} from "../src/core/timeline/sequenceAuthoring";
import {
  applyTimingResolution,
  resolveProjectTiming,
  type TimingIntent,
} from "../src/core/timeline/timingIntent";

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
      id: "read",
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

const HUNDRED_PASSES: SequenceAuthoring = {
  schemaVersion: 1,
  groups: [{
    id: "hundred",
    label: "100 passes",
    passes: 100,
    pace: "custom",
    relativeSecondsPerPass: 1,
  }],
  repeatCount: 1,
};

function fixture(slideCount = 4, duration = 10): DriftProjectV4 {
  const project = createDefaultDriftProjectV4(
    "sequence-test",
    NOW,
    47,
    DRIFT_V2_RENDER_CONTRACT,
  );
  project.master.duration = duration;
  project.motion.seamless.enabled = false;
  project.motion.seamless.loops = 1;
  project.motion.cadence.poseCadence = "continuous";
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
      width: 1080,
      height: 1920,
    };
    project.slides[id] = {
      assetId: id,
      fit: "cover",
      focalX: 0.5,
      focalY: 0.5,
      scaleOffset: 0,
    };
  }
  return project;
}

function resolvedSequenceProject(
  slideCount = 4,
  duration = 10,
  intent: TimingIntent = FIXED,
): DriftProjectV4 {
  const authored = withSequenceAuthoring(fixture(slideCount, duration), CASINO);
  return applyTimingResolution(
    authored,
    resolveProjectTiming(authored, resolveMovingMedia(authored).count, intent),
  );
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

describe("pass-sequence authoring", () => {
  it("strictly validates one namespaced value and preserves unrelated extensions", () => {
    expect(createSequenceAuthoring(CASINO)).toEqual(CASINO);
    expect(parseSequenceAuthoringExtension({ ...CASINO, future: true })).toBeNull();
    expect(parseSequenceAuthoringExtension({ ...CASINO, schemaVersion: 2 })).toBeNull();
    expect(parseSequenceAuthoringExtension({ ...CASINO, groups: [] })).toBeNull();
    expect(parseSequenceAuthoringExtension({
      ...CASINO,
      groups: [{ ...CASINO.groups[0]!, relativeSecondsPerPass: Number.NaN }],
    })).toBeNull();
    expect(parseSequenceAuthoringExtension({
      ...CASINO,
      groups: [{ ...CASINO.groups[0]!, relativeSecondsPerPass: 1 }],
    })).toBeNull();
    expect(parseSequenceAuthoringExtension({
      ...CASINO,
      groups: [{ ...CASINO.groups[1]!, relativeSecondsPerPass: 0.5 }],
    })).toBeNull();
    expect(parseSequenceAuthoringExtension({
      ...CASINO,
      groups: [CASINO.groups[0], { ...CASINO.groups[0]!, label: "Duplicate" }],
    })).toBeNull();
    expect(parseSequenceAuthoringExtension({
      schemaVersion: 1,
      groups: [{
        id: "too-many",
        label: "Too many",
        passes: 51,
        pace: "custom",
        relativeSecondsPerPass: 1,
      }],
      repeatCount: 2,
    })).toBeNull();

    const project = fixture();
    project.extensions["someone.else"] = { retained: [1, "two"] };
    const before = structuredClone(project);
    const next = withSequenceAuthoring(project, CASINO);
    expect(next.extensions).toEqual({
      "someone.else": { retained: [1, "two"] },
      [SEQUENCE_EXTENSION_KEY]: CASINO,
    });
    expect(project).toEqual(before);
    expect(readSequenceAuthoring(next)).toMatchObject({ status: "stored", authoring: CASINO });
    expect(validateDriftProjectV4(next).extensions[SEQUENCE_EXTENSION_KEY]).toEqual(CASINO);
  });

  it("fails closed for malformed persisted sequence data", () => {
    const project = fixture();
    project.extensions[SEQUENCE_EXTENSION_KEY] = {
      schemaVersion: 1,
      groups: [],
      repeatCount: 1,
    };
    expect(readSequenceAuthoring(project)).toEqual({ authoring: null, status: "malformed" });
  });
});

describe("deterministic pass-sequence compiler", () => {
  it("compiles exact Casino groups: fast ×2, read ×1, fast ×1", () => {
    const sequence = compileSequence(CASINO, { bodyDurationSeconds: 10, movingSlideCount: 4 });

    expect(sequence.totalPasses).toBe(4);
    expect(sequence.totalDistanceSlides).toBe(16);
    expect(sequence.groups.map(({ label, passes, startPass, endPass }) => ({
      label,
      passes,
      startPass,
      endPass,
    }))).toEqual([
      { label: "FAST ×2", passes: 2, startPass: 0, endPass: 2 },
      { label: "READ ×1", passes: 1, startPass: 2, endPass: 3 },
      { label: "FAST ×1", passes: 1, startPass: 3, endPass: 4 },
    ]);
    expect(sequence.passes[0]!.start).toBe(0);
    expect(sequence.passes.at(-1)!.end).toBe(10);
    sequence.passes.forEach((pass, index) => {
      expect(pass.startPass).toBe(index);
      expect(pass.endPass).toBe(index + 1);
      expect(pass.startDistanceSlides).toBe(index * 4);
      expect(pass.endDistanceSlides).toBe((index + 1) * 4);
    });
    expect(sequence.groups[0]!.duration).toBeCloseTo(10 * 0.44 / 1.66, 12);
    expect(sequence.groups[1]!.duration).toBeCloseTo(10 / 1.66, 12);
    expect(sequence.groups[2]!.duration).toBeCloseTo(10 * 0.22 / 1.66, 12);
  });

  it("is frame-rate independent, monotonic, finite, and C2 at every pass join", () => {
    const sequence = compileSequence(CASINO, { bodyDurationSeconds: 10, movingSlideCount: 7 });
    let previous = -1;
    for (let index = 0; index <= 20_000; index += 1) {
      const sample = evaluateCompiledSequence(sequence, 10 * index / 20_000);
      expect(Number.isFinite(sample.passProgress)).toBe(true);
      expect(Number.isFinite(sample.velocitySlidesPerSecond)).toBe(true);
      expect(Number.isFinite(sample.accelerationSlidesPerSecondSquared)).toBe(true);
      expect(sample.passProgress).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = sample.passProgress;
    }
    expect(evaluateCompiledSequence(sequence, 0).passProgress).toBe(0);
    expect(evaluateCompiledSequence(sequence, 10).passProgress).toBe(4);
    for (let index = 0; index < sequence.passes.length - 1; index += 1) {
      const left = sequence.passes[index]!;
      const right = sequence.passes[index + 1]!;
      expect(left.end).toBe(right.start);
      expect(left.endPass).toBe(right.startPass);
      expect(left.endVelocityPassesPerSecond).toBe(right.startVelocityPassesPerSecond);
      const exact = evaluateCompiledSequence(sequence, left.end);
      expect(exact.passProgress).toBe(left.endPass);
      expect(exact.velocitySlidesPerSecond).toBeCloseTo(
        left.endVelocityPassesPerSecond * sequence.movingSlideCount,
        12,
      );
      expect(exact.accelerationSlidesPerSecondSquared).toBe(0);
    }

    const arbitrary = [0, 0.001, 1.23456789, 5, 9.999, 10];
    expect(arbitrary.map((time) => evaluateCompiledSequence(sequence, time)))
      .toEqual(arbitrary.map((time) => evaluateCompiledSequence(sequence, time)));
  });

  it("handles empty, one-slide, 100-pass, and very-short bodies without NaN", () => {
    const empty = compileSequence(CASINO, { bodyDurationSeconds: 0.5, movingSlideCount: 0 });
    for (const time of [0, 0.1, 0.5]) {
      expect(evaluateCompiledSequence(empty, time)).toMatchObject({
        distanceSlides: 0,
        velocitySlidesPerSecond: 0,
        accelerationSlidesPerSecondSquared: 0,
      });
    }

    const one = compileSequence(CASINO, { bodyDurationSeconds: 10, movingSlideCount: 1 });
    expect(evaluateCompiledSequence(one, 10).distanceSlides).toBe(4);

    const short = compileSequence(HUNDRED_PASSES, {
      bodyDurationSeconds: 0.001,
      movingSlideCount: 200,
    });
    expect(short.passes).toHaveLength(100);
    expect(short.passes.at(-1)!.end).toBe(0.001);
    expect(evaluateCompiledSequence(short, 0.001)).toMatchObject({
      passProgress: 100,
      distanceSlides: 20_000,
    });
    for (let index = 0; index <= 1_000; index += 1) {
      const sample = evaluateCompiledSequence(short, 0.001 * index / 1_000);
      expect(Number.isFinite(sample.velocitySlidesPerSecond)).toBe(true);
      expect(Number.isFinite(sample.accelerationSlidesPerSecondSquared)).toBe(true);
    }

    expect(() => compileSequence(CASINO, { bodyDurationSeconds: 0, movingSlideCount: 4 }))
      .toThrow(/bodyDurationSeconds/u);
    expect(() => compileSequence(HUNDRED_PASSES, {
      bodyDurationSeconds: Number.MIN_VALUE,
      movingSlideCount: 4,
    })).toThrow(/too short/u);
    expect(() => compileSequence(CASINO, { bodyDurationSeconds: 10, movingSlideCount: -1 }))
      .toThrow(/movingSlideCount/u);
  });

  it("stays monotonic across the full allowed pace ratio and whole-sequence repeats", () => {
    const extremes: SequenceAuthoring = {
      schemaVersion: 1,
      groups: [
        {
          id: "flash",
          label: "Flash",
          passes: 1,
          pace: "custom",
          relativeSecondsPerPass: 0.01,
        },
        {
          id: "long-read",
          label: "Long read",
          passes: 1,
          pace: "custom",
          relativeSecondsPerPass: 100,
        },
      ],
      repeatCount: 2,
    };
    const sequence = compileSequence(extremes, { bodyDurationSeconds: 300, movingSlideCount: 1 });
    expect(sequence.groups.map(({ repeatIndex, id }) => [repeatIndex, id])).toEqual([
      [0, "flash"],
      [0, "long-read"],
      [1, "flash"],
      [1, "long-read"],
    ]);
    let previous = 0;
    for (let index = 0; index <= 50_000; index += 1) {
      const sample = evaluateCompiledSequence(sequence, 300 * index / 50_000);
      expect(sample.passProgress).toBeGreaterThanOrEqual(previous - 1e-10);
      expect(sample.velocitySlidesPerSecond).toBeGreaterThanOrEqual(0);
      previous = sample.passProgress;
    }
    expect(previous).toBe(4);
  });
});

describe("sequence timing, rendering, receipts, and events", () => {
  it("allocates fixed master proportionally and content-paced by readable-pass weight", () => {
    const fixedProject = withSequenceAuthoring(fixture(4, 10), CASINO);
    const fixed = resolveProjectTiming(fixedProject, 4, FIXED);
    expect(fixed).toMatchObject({
      travelAuthority: "pass-sequence",
      deckPasses: 4,
      bodySecondsPerCycle: 10,
      masterSeconds: 10,
      relativePassWeightPerCycle: 1.66,
    });

    expect(sequenceContentPacedBodySeconds(CASINO, 4, 0.75)).toBeCloseTo(4.98, 12);
    const paced = resolveProjectTiming(fixedProject, 4, CONTENT_PACED);
    expect(paced).toMatchObject({
      travelAuthority: "pass-sequence",
      deckPasses: 4,
      repair: null,
    });
    expect(paced.requestedMasterSeconds).toBeCloseTo(4.98, 12);
    expect(paced.bodySecondsPerCycle).toBeCloseTo(4.98, 12);
    expect(paced.masterSeconds).toBeCloseTo(4.98, 12);
    expect(paced.averageSlidesPerSecond).toBeCloseTo(16 / 4.98, 12);
    const applied = applyTimingResolution(fixedProject, paced);
    expect(applied.master.duration).toBeCloseTo(4.98, 12);
    expect(createPerformanceLifecycle(applied.performance).totalDuration).toBeCloseTo(4.98, 12);
    const pacedReceipt = receipt(applied);
    expect(pacedReceipt.passes.boundaries.map(({ duration }) => duration)).toEqual([
      expect.closeTo(0.66, 12),
      expect.closeTo(0.66, 12),
      expect.closeTo(3, 12),
      expect.closeTo(0.66, 12),
    ]);
  });

  it("repairs pinned-only zero-moving-media authority without crashing evaluation", () => {
    const project = withSequenceAuthoring(fixture(1, 10), CASINO);
    project.presenter = {
      ...project.presenter,
      enabled: true,
      assetId: "slide-0",
      trackMode: "pinned-only",
    };
    const moving = resolveMovingMedia(project);
    expect(moving.count).toBe(0);
    const resolution = resolveProjectTiming(project, moving.count, CONTENT_PACED);
    expect(resolution.repair).toMatchObject({ reason: "no-moving-media" });
    const repaired = applyTimingResolution(project, resolution);
    const evaluation = evaluateV2Frame(repaired, moving.order, repaired.master.duration / 2);
    expect(evaluation.frame.slides).toEqual([]);
    expect(evaluation.frame.track).toMatchObject({
      rawDistance: 0,
      visibleDistance: 0,
      velocity: 0,
      acceleration: 0,
      resting: true,
    });
  });

  it("keeps sequence travel continuous and makes receipts/events share exact pass order", () => {
    const project = resolvedSequenceProject();
    const moving = resolveMovingMedia(project);
    const result = receipt(project);
    expect(result.passes).toMatchObject({
      authority: "pass-sequence",
      sequenceStatus: "stored",
      deckPassesPerBody: 4,
      totalDeckPasses: 4,
    });
    expect(result.passes.groups?.map(({ label, passes }) => ({ label, passes }))).toEqual([
      { label: "FAST ×2", passes: 2 },
      { label: "READ ×1", passes: 1 },
      { label: "FAST ×1", passes: 1 },
    ]);
    expect(result.passes.boundaries.map(({ end }) => end)).toEqual(
      compileSequence(CASINO, { bodyDurationSeconds: 10, movingSlideCount: 4 })
        .passes.map(({ end }) => end),
    );

    for (const boundary of result.passes.boundaries.slice(0, -1)) {
      for (const offset of [-1e-5, 0, 1e-5]) {
        const frame = evaluateV2Frame(project, moving.order, boundary.end + offset).frame;
        expect(Math.abs(frame.track.velocity)).toBeGreaterThan(1e-6);
      }
    }

    const completed = evaluateV2Frame(project, moving.order, project.master.duration, {
      previousTime: 0,
    });
    const loopEvents = completed.frame.events.filter((event) => event.type === "loop-boundary");
    expect(loopEvents).toHaveLength(4);
    loopEvents.forEach((event, index) => {
      expect(event.sequence).toBe((index + 1) * moving.count);
      expect(event.time).toBeCloseTo(result.passes.boundaries[index]!.end, 5);
    });
  });

  it("keeps the O(pass × samples) velocity diagnostic out of every frame evaluation", () => {
    const project = withSequenceAuthoring(fixture(1, 10), HUNDRED_PASSES);
    const moving = resolveMovingMedia(project);
    const compiled = compileSequence(HUNDRED_PASSES, {
      bodyDurationSeconds: 10,
      movingSlideCount: moving.count,
    });
    expect(measureSequenceVelocityEnvelope(compiled).samples).toBe(6_500);
    expect(compiled).not.toHaveProperty("minimumVelocitySlidesPerSecond");
    expect(compiled).not.toHaveProperty("peakVelocitySlidesPerSecond");

    // The old hot path ran at least 6,500 sampled quintic evaluations here,
    // each with multiple Math.min calls. This guard measures the actual frame
    // call and leaves a generous ceiling for spatial evaluation.
    const minSpy = vi.spyOn(Math, "min");
    try {
      const frame = evaluateV2Frame(project, moving.order, 5, { previousTime: null });
      expect(frame.frame.track.rawDistance).toBe(-50);
      expect(minSpy.mock.calls.length).toBeLessThan(1_000);
    } finally {
      minSpy.mockRestore();
    }
  });

  it("renders legacy V4 projects bit-identically when sequence data is absent or malformed", () => {
    const legacy = fixture(4, 10);
    legacy.motion.seamless.enabled = true;
    legacy.motion.seamless.loops = 2;
    const malformed = structuredClone(legacy);
    malformed.extensions[SEQUENCE_EXTENSION_KEY] = {
      schemaVersion: 1,
      groups: [],
      repeatCount: 1,
    };
    for (const time of [0, 0.125, 1.75, 5, 9.999, 10]) {
      expect(evaluateV2Frame(malformed, malformed.media.order, time))
        .toEqual(evaluateV2Frame(legacy, legacy.media.order, time));
    }
  });
});
