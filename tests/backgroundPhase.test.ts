import { describe, expect, it } from "vitest";
import { resolveBackgroundPhase } from "../src/engine/backgroundPhase";

const BASE = {
  durationSeconds: 8,
  motion: 0.06,
  seamless: false,
  seamlessLoops: 1,
  reducedMotion: false,
} as const;

describe("canonical background phase", () => {
  it("uses one explicit-time result for preview and export callers", () => {
    const time = 3.25;
    const previewPhase = resolveBackgroundPhase(time, BASE);
    const exportPhase = resolveBackgroundPhase(time, BASE);
    expect(previewPhase).toBe(exportPhase);
    expect(previewPhase).toBe(time * BASE.motion * 0.72);
  });

  it("closes seamless room motion at the exact master boundary in every caller", () => {
    const options = { ...BASE, seamless: true, seamlessLoops: 3 };
    expect(resolveBackgroundPhase(0, options)).toBe(0);
    expect(resolveBackgroundPhase(8, options)).toBeCloseTo(Math.PI * 6, 14);
    expect(resolveBackgroundPhase(2, options)).toBeCloseTo(Math.PI * 1.5, 14);
  });

  it("pins reduced motion and hostile time to a finite resting phase", () => {
    expect(resolveBackgroundPhase(4, { ...BASE, reducedMotion: true })).toBe(0);
    for (const time of [Number.NaN, Infinity, -Infinity, -1]) {
      expect(resolveBackgroundPhase(time, BASE)).toBe(0);
    }
  });
});
