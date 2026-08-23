import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { resolveMovingMedia } from "../src/core/project/movingMedia";
import type { DriftProjectV4 } from "../src/core/project/schema";
import { buildDeliveryReceipt } from "../src/core/timeline/deliveryReceipt";
import { createPerformanceLifecycle } from "../src/core/timeline/performanceLifecycle";
import {
  createTempoCurve,
  createTempoCurveFromPreset,
  invertTempoCurveProgress,
} from "../src/core/timeline/tempoCurve";
import {
  applyTimingResolution,
  resolveProjectTiming,
  type TimingIntent,
} from "../src/core/timeline/timingIntent";

const NOW = "2026-08-23T00:00:00.000Z";
const FIXED: TimingIntent = { schemaVersion: 1, mode: "fixed-master", secondsPerSlide: 0.75 };

function fixture(slideCount = 4, duration = 10): DriftProjectV4 {
  const project = createDefaultDriftProjectV4("receipt", NOW);
  project.master.duration = duration;
  project.master.fps = 24;
  project.motion.seamless.enabled = true;
  project.motion.seamless.loops = 1;
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
      hash: index.toString(16).padStart(64, "0"),
      byteLength: 1,
      width: 1080,
      height: 1920,
    };
  }
  return project;
}

function resolve(project: DriftProjectV4, intent = FIXED): DriftProjectV4 {
  const moving = resolveMovingMedia(project);
  return applyTimingResolution(project, resolveProjectTiming(project, moving.count, intent));
}

function receipt(projectInput: DriftProjectV4, eventPlan: readonly unknown[] = []) {
  const project = resolve(projectInput);
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
    eventPlan,
    lifecycle: createPerformanceLifecycle(project.performance),
  });
}

describe("tempo inversion", () => {
  it("keeps endpoints exact, stays monotonic, and crosses zero-handle holds deterministically", () => {
    const held = createTempoCurve({ start: 0, middle: 0, finish: 1 });
    expect(invertTempoCurveProgress(held, 0)).toBe(0);
    expect(invertTempoCurveProgress(held, 1)).toBe(1);
    expect(invertTempoCurveProgress(held, 0.01)).toBeGreaterThan(0.5);

    const curve = createTempoCurveFromPreset("spin-then-read");
    const times = Array.from({ length: 101 }, (_, index) => invertTempoCurveProgress(curve, index / 100));
    expect(times.every((time, index) => index === 0 || time >= times[index - 1]!)).toBe(true);
    expect(invertTempoCurveProgress(curve, 0.5)).toBeCloseTo(0.1512843137, 9);
  });
});

describe("Delivery Receipt", () => {
  it("reports a complete 10 second pass and exact export frame facts", () => {
    const result = receipt(fixture());

    expect(result.timing).toMatchObject({ mode: "fixed-master", protectedInput: "master-duration" });
    expect(result.passes).toMatchObject({ deckPassesPerBody: 1, totalDeckPasses: 1 });
    expect(result.passes.boundaries).toEqual([{
      index: 0,
      indexInBody: 0,
      bodyCycleIndex: 0,
      sceneIndex: 0,
      start: 0,
      end: 10,
      duration: 10,
    }]);
    expect(result.segments).toEqual({ entrySeconds: 0, bodySeconds: 10, exitSeconds: 0, masterSeconds: 10 });
    expect(result.pace).toMatchObject({
      averageSlidesPerSecond: 0.4,
      minimumSlidesPerSecond: 0.4,
      peakSlidesPerSecond: 0.4,
      approximateAverageReadWindowSeconds: 2.5,
    });
    expect(result.output).toMatchObject({
      aspectLabel: "9:16",
      fps: 24,
      frameCount: 240,
      encodedDurationSeconds: 10,
      durationQuantizationDeltaSeconds: 0,
    });
    expect(result.seamlessClosure).toEqual({ closes: true, status: "clean" });
  });

  it("finds three equal pass windows in a 30 second Even master", () => {
    const project = fixture(4, 30);
    project.motion.seamless.loops = 3;
    const result = receipt(project);

    expect(result.passes.boundaries.map(({ start, end, duration }) => [start, end, duration])).toEqual([
      [0, 10, 10],
      [10, 20, 10],
      [20, 30, 10],
    ]);
  });

  it("puts the first Spin then Read pass at roughly 1.5 seconds without changing the 10 second master", () => {
    const project = fixture(4, 10);
    project.motion.seamless.loops = 2;
    project.performance = createPerformanceLifecycle({
      ...project.performance,
      body: {
        durationSeconds: 10,
        tempo: { kind: "preset", preset: "spin-then-read" },
      },
    }).authoring;
    const result = receipt(project);

    expect(result.segments.masterSeconds).toBe(10);
    expect(result.passes.boundaries[0]).toMatchObject({ start: 0 });
    expect(result.passes.boundaries[0]!.end).toBeCloseTo(1.512843137, 8);
    expect(result.passes.boundaries[0]!.duration).toBeCloseTo(1.512843137, 8);
    expect(result.passes.boundaries[1]!.duration).toBeCloseTo(8.487156863, 8);
    expect(result.pace.minimumSlidesPerSecond).toBeLessThan(result.pace.averageSlidesPerSecond);
    expect(result.pace.peakSlidesPerSecond).toBeGreaterThan(result.pace.averageSlidesPerSecond);
  });

  it("reports pinned-only exclusion, presenter participation, sound count, and alpha incompatibility", () => {
    const project = fixture();
    project.presenter = {
      ...project.presenter,
      enabled: true,
      assetId: "slide-1",
      trackMode: "pinned-only",
    };
    project.sound.exportEnabled = true;
    project.composition.alphaMode = "transparent";
    const result = receipt(project, [{}, {}, {}]);

    expect(result.media).toMatchObject({
      movingSlideCount: 3,
      pinnedOnlyAssetExcluded: true,
      excludedPinnedOnlyAssetId: "slide-1",
    });
    expect(result.presenter).toMatchObject({
      enabled: true,
      assetId: "slide-1",
      assetKind: "image",
      participatesInMovingTrack: false,
    });
    expect(result.sound.deterministicEventCount).toBe(3);
    expect(result.transparency).toEqual({
      requested: true,
      containerSupportsTransparency: false,
      compatible: false,
    });
  });

  it("distinguishes exact twos from deterministic mixed frame holds and flags endpoint mismatch", () => {
    const exactProject = fixture();
    exactProject.motion.cadence.poseCadence = "12fps";
    const exact = receipt(exactProject);
    expect(exact.cadence).toMatchObject({
      poseFps: 12,
      compatibility: "exact-holds",
      frameHolds: [2],
      endpointMismatch: false,
    });

    const mixedProject = fixture(4, 10.03);
    mixedProject.master.fps = 25;
    mixedProject.motion.cadence.poseCadence = "12fps";
    const mixed = receipt(mixedProject);
    expect(mixed.cadence).toMatchObject({
      poseFps: 12,
      compatibility: "mixed-holds",
      frameHolds: [2, 3],
      endpointMismatch: true,
    });
    expect(mixed.output.frameCount).toBe(251);
    expect(mixed.output.encodedDurationSeconds).toBe(10.04);
  });
});
