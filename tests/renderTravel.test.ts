import { describe, expect, it } from "vitest";
import { createPerformanceLifecycle } from "../src/core/timeline/performanceLifecycle";
import {
  defaultPerformanceStillTime,
  evaluatePerformanceTravel,
  loopPerformanceTime,
} from "../src/core/timeline/renderTravel";

function timeline(
  tempo: "even" | "fast-slow-fast" = "even",
  repeat: { mode: "off" } | { mode: "body"; count: number } = { mode: "off" },
  reducedMotion = false,
) {
  return createPerformanceLifecycle({
    entry: { enabled: false },
    body: { durationSeconds: 4, tempo: { kind: "preset", preset: tempo } },
    exit: { enabled: false },
    repeat,
    reducedMotion,
  });
}

const BASE_OPTIONS = {
  direction: -1 as const,
  slidesPerSecond: 0.5,
  stride: 100,
  slotCount: 8,
  slideLayerCount: 8,
  seamless: false,
  seamlessLoops: 1,
};

describe("canonical performance travel", () => {
  it("preserves legacy even-speed distance while deriving it from explicit time", () => {
    const performance = timeline();
    expect(evaluatePerformanceTravel(performance, 0, BASE_OPTIONS)).toMatchObject({ distance: 0, velocity: -50 });
    expect(evaluatePerformanceTravel(performance, 2, BASE_OPTIONS)).toMatchObject({ distance: -100, velocity: -50 });
    expect(evaluatePerformanceTravel(performance, 4, BASE_OPTIONS)).toMatchObject({ distance: -200, velocity: 0 });
  });

  it("changes instantaneous pace without changing exact cycle distance", () => {
    const performance = timeline("fast-slow-fast");
    const quarter = evaluatePerformanceTravel(performance, 1, BASE_OPTIONS);
    const middle = evaluatePerformanceTravel(performance, 2, BASE_OPTIONS);
    const end = evaluatePerformanceTravel(performance, 4, BASE_OPTIONS);

    expect(Math.abs(quarter.distance)).toBeGreaterThan(50);
    expect(Math.abs(middle.distance)).toBeCloseTo(100, 12);
    expect(end.distance).toBe(-200);
  });

  it("closes an exact number of strips for every repeated body", () => {
    const performance = timeline("fast-slow-fast", { mode: "body", count: 3 });
    const options = { ...BASE_OPTIONS, seamless: true, seamlessLoops: 2 };

    expect(evaluatePerformanceTravel(performance, 4, options).distance).toBe(-1_600);
    expect(evaluatePerformanceTravel(performance, 8, options).distance).toBe(-3_200);
    expect(evaluatePerformanceTravel(performance, 12, options).distance).toBe(-4_800);
  });

  it("keeps all spatial travel still under reduced motion", () => {
    const performance = timeline("fast-slow-fast", { mode: "body", count: 2 }, true);
    for (const time of [0, 1, 4, 7.5, 8]) {
      expect(evaluatePerformanceTravel(performance, time, BASE_OPTIONS)).toMatchObject({
        distance: 0,
        velocity: 0,
        acceleration: 0,
      });
    }
  });

  it("loops preview time deterministically and chooses a body-frame still", () => {
    expect(loopPerformanceTime(0, 8)).toBe(0);
    expect(loopPerformanceTime(8, 8)).toBe(0);
    expect(loopPerformanceTime(18.25, 8)).toBe(2.25);
    expect(() => loopPerformanceTime(1, 0)).toThrow(/totalDuration/u);

    const performance = createPerformanceLifecycle({
      entry: {
        enabled: true,
        durationSeconds: 0.75,
        treatment: "fade",
        curve: "ease-out",
        background: { lead: 0, span: 1 },
        slides: { lead: 0, span: 1, stagger: 0, order: "forward" },
      },
      body: { durationSeconds: 4, tempo: { kind: "preset", preset: "even" } },
      exit: { enabled: false },
      repeat: { mode: "off" },
    });
    expect(defaultPerformanceStillTime(performance)).toBe(2.75);
    expect(evaluatePerformanceTravel(performance, 2.75, BASE_OPTIONS).lifecycle.phase).toBe("body");
  });

  it("rejects malformed renderer units instead of producing NaN", () => {
    const performance = timeline();
    expect(() => evaluatePerformanceTravel(performance, 1, { ...BASE_OPTIONS, stride: NaN })).toThrow(/stride/u);
    expect(() => evaluatePerformanceTravel(performance, 1, { ...BASE_OPTIONS, slotCount: 1.5 })).toThrow(/slotCount/u);
    expect(() => evaluatePerformanceTravel(performance, 1, { ...BASE_OPTIONS, seamlessLoops: 0 })).toThrow(/seamlessLoops/u);
  });
});
