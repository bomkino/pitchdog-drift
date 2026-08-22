import { describe, expect, it } from "vitest";
import {
  createPerformanceLifecycle,
  evaluatePerformanceLifecycle,
} from "../src/core/timeline/performanceLifecycle";
import { resolveLifecycleLayerPresentation } from "../src/engine/lifecyclePresentation";

const layer = (visibility: number, motionProgress: number) => ({
  visibility,
  progress: motionProgress,
  motionProgress,
  active: true,
});

describe("lifecycle layer presentation", () => {
  it("gives lift a near-rest scale and one coherent entry/exit path", () => {
    expect(resolveLifecycleLayerPresentation(layer(0, 0), "lift", 48)).toEqual({
      opacity: 0,
      translateY: 48,
      scale: 0.985,
    });
    expect(resolveLifecycleLayerPresentation(layer(1, 1), "lift", 48)).toEqual({
      opacity: 1,
      translateY: 0,
      scale: 1,
    });
    expect(resolveLifecycleLayerPresentation(layer(0.5, 0.5), "lift", 48)).toEqual({
      opacity: 0.5,
      translateY: 24,
      scale: 0.9924999999999999,
    });
  });

  it("keeps fade spatially still and projector/contact treatments restrained", () => {
    expect(resolveLifecycleLayerPresentation(layer(0.3, 0.2), "fade", 48)).toEqual({
      opacity: 0.3,
      translateY: 0,
      scale: 1,
    });
    expect(resolveLifecycleLayerPresentation(layer(1, 0), "projector", 48).scale).toBe(0.965);
    expect(resolveLifecycleLayerPresentation(layer(1, 0), "contact-cut", 48).scale).toBe(0.992);
  });

  it("leaves the body continuously, while reduced motion fades at rest", () => {
    const base = {
      entry: { enabled: false } as const,
      body: { durationSeconds: 4, tempo: { kind: "preset", preset: "even" } as const },
      exit: {
        enabled: true,
        durationSeconds: 1,
        treatment: "lift",
        curve: "linear",
        background: { lead: 0, span: 1 },
        slides: { lead: 0, span: 1, stagger: 0, order: "forward" },
      } as const,
      repeat: { mode: "off" } as const,
    };
    const normal = createPerformanceLifecycle(base);
    const reduced = createPerformanceLifecycle({ ...base, reducedMotion: true });

    const normalStart = evaluatePerformanceLifecycle(normal, 4, 1).layers.slides[0]!;
    const normalMiddle = evaluatePerformanceLifecycle(normal, 4.5, 1).layers.slides[0]!;
    const normalEnd = evaluatePerformanceLifecycle(normal, 5, 1).layers.slides[0]!;
    expect([
      resolveLifecycleLayerPresentation(normalStart, "lift", 48).translateY,
      resolveLifecycleLayerPresentation(normalMiddle, "lift", 48).translateY,
      resolveLifecycleLayerPresentation(normalEnd, "lift", 48).translateY,
    ]).toEqual([0, 24, 48]);

    for (const time of [4, 4.5, 5]) {
      const sample = evaluatePerformanceLifecycle(reduced, time, 1).layers.slides[0]!;
      expect(resolveLifecycleLayerPresentation(sample, "lift", 48).translateY).toBe(0);
    }
  });

  it("bounds malformed visual inputs without producing invalid transforms", () => {
    expect(resolveLifecycleLayerPresentation(layer(2, -1), "lift", Number.NaN)).toEqual({
      opacity: 1,
      translateY: 0,
      scale: 0.985,
    });
  });
});
