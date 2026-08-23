import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { createPerformanceLifecycle } from "../src/core/timeline/performanceLifecycle";
import {
  applyTimingResolution,
  parseTimingIntentExtension,
  readTimingIntent,
  resolveProjectTiming,
  TIMING_EXTENSION_KEY,
  withTimingIntent,
  type TimingIntent,
} from "../src/core/timeline/timingIntent";

const NOW = "2026-08-23T00:00:00.000Z";
const FIXED: TimingIntent = { schemaVersion: 1, mode: "fixed-master", secondsPerSlide: 0.75 };

function withoutTransitions(duration = 10) {
  const project = createDefaultDriftProjectV4("timing", NOW);
  project.master.duration = duration;
  project.motion.seamless.enabled = true;
  project.motion.seamless.loops = 1;
  project.performance = createPerformanceLifecycle({
    entry: { enabled: false },
    body: { durationSeconds: duration, tempo: { kind: "preset", preset: "even" } },
    exit: { enabled: false },
    repeat: { mode: "off" },
  }).authoring;
  return project;
}

describe("Project V4 timing intent", () => {
  it("strictly parses only schema 1 intent and fails closed to fixed master", () => {
    expect(parseTimingIntentExtension(FIXED)).toEqual(FIXED);
    expect(parseTimingIntentExtension({ ...FIXED, future: true })).toBeNull();
    expect(parseTimingIntentExtension({ ...FIXED, schemaVersion: 2 })).toBeNull();
    expect(parseTimingIntentExtension({ ...FIXED, secondsPerSlide: 0 })).toBeNull();

    const missing = withoutTransitions(10);
    expect(readTimingIntent(missing)).toEqual({ intent: FIXED, status: "missing" });
    missing.extensions[TIMING_EXTENSION_KEY] = { schemaVersion: 1, mode: "content-paced" };
    expect(readTimingIntent(missing)).toEqual({ intent: FIXED, status: "malformed" });
    expect(missing.master.duration).toBe(10);
  });

  it("writes only the namespaced author intent and preserves unknown extensions", () => {
    const project = withoutTransitions();
    project.extensions["someone.else"] = { retained: [1, "two"] };
    const before = structuredClone(project);
    const intent: TimingIntent = { schemaVersion: 1, mode: "content-paced", secondsPerSlide: 1.25 };

    const next = withTimingIntent(project, intent);

    expect(next.extensions).toEqual({
      "someone.else": { retained: [1, "two"] },
      [TIMING_EXTENSION_KEY]: intent,
    });
    expect(project).toEqual(before);
  });

  it("protects a 10 second Exact Length while deriving its body pace", () => {
    const project = withoutTransitions(10);
    const resolution = resolveProjectTiming(project, 4, FIXED);

    expect(resolution).toMatchObject({
      protectedInput: "master-duration",
      requestedMasterSeconds: 10,
      masterSeconds: 10,
      bodySecondsPerCycle: 10,
      deckDistanceInSlides: 4,
      averageSlidesPerSecond: 0.4,
      repair: null,
    });
    expect(applyTimingResolution(project, resolution).master.duration).toBe(10);
  });

  it("protects Reading Pace and grows duration from moving slides and deck passes", () => {
    const project = withoutTransitions(10);
    project.motion.seamless.loops = 2;
    const intent: TimingIntent = { schemaVersion: 1, mode: "content-paced", secondsPerSlide: 0.75 };
    const resolution = resolveProjectTiming(project, 4, intent);
    const applied = applyTimingResolution(project, resolution);

    expect(resolution).toMatchObject({
      protectedInput: "seconds-per-slide",
      requestedMasterSeconds: 6,
      masterSeconds: 6,
      bodySecondsPerCycle: 6,
      deckDistanceInSlides: 8,
      averageSlidesPerSecond: 4 / 3,
      repair: null,
    });
    expect(applied.master.duration).toBe(6);
    expect(createPerformanceLifecycle(applied.performance).totalDuration).toBe(6);
    expect(readTimingIntent(applied)).toEqual({ intent, status: "stored" });
  });

  it("uses lifecycle scene counts for content-paced full-scene repeats", () => {
    const project = withoutTransitions(10);
    project.performance = createPerformanceLifecycle({
      entry: {
        enabled: true,
        durationSeconds: 1,
        treatment: "fade",
        curve: "linear",
        background: { lead: 0, span: 1 },
        slides: { lead: 0, span: 1, stagger: 0, order: "forward" },
      },
      body: { durationSeconds: 3, tempo: { kind: "preset", preset: "even" } },
      exit: {
        enabled: true,
        durationSeconds: 1,
        treatment: "fade",
        curve: "linear",
        background: { lead: 0, span: 1 },
        slides: { lead: 0, span: 1, stagger: 0, order: "reverse" },
      },
      repeat: { mode: "full-scene", count: 2 },
    }).authoring;
    project.master.duration = 10;
    const intent: TimingIntent = { schemaVersion: 1, mode: "content-paced", secondsPerSlide: 0.75 };

    const resolution = resolveProjectTiming(project, 4, intent);

    expect(resolution).toMatchObject({
      sceneCount: 2,
      bodyCycleCount: 2,
      entrySeconds: 2,
      exitSeconds: 2,
      bodySecondsPerCycle: 3,
      bodySeconds: 6,
      masterSeconds: 10,
    });
  });

  it("proposes one explicit minimum-master repair without disabling transitions", () => {
    const project = withoutTransitions(8);
    const transition = {
      enabled: true as const,
      durationSeconds: 4,
      treatment: "fade" as const,
      curve: "linear" as const,
      background: { lead: 0, span: 1 },
      slides: { lead: 0, span: 1, stagger: 0, order: "forward" as const },
    };
    project.performance = createPerformanceLifecycle({
      entry: transition,
      body: { durationSeconds: 1, tempo: { kind: "preset", preset: "even" } },
      exit: { ...transition, slides: { ...transition.slides, order: "reverse" } },
      repeat: { mode: "off" },
    }).authoring;
    project.master.duration = 8;

    const resolution = resolveProjectTiming(project, 4, FIXED);
    expect(resolution.repair).toEqual({
      reason: "master-too-short",
      requestedMasterSeconds: 8,
      minimumMasterSeconds: 8.25,
    });

    const repaired = applyTimingResolution(project, resolution);
    expect(repaired.master.duration).toBe(8.25);
    expect(repaired.performance.entry).toEqual(project.performance.entry);
    expect(repaired.performance.exit).toEqual(project.performance.exit);
    expect(repaired.performance.body.durationSeconds).toBe(0.25);
  });
});
