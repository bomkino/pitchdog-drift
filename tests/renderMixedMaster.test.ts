import { describe, expect, it } from "vitest";
import {
  getPresenterActivityThreshold,
  getPresenterVoiceRegions,
  measurePresenterActivity,
  mergePresenterCoverage,
  type ReadablePresenterBuffer,
} from "../src/sonic/renderMixedMaster";

function monoBuffer(values: readonly number[], sampleRate: number): ReadablePresenterBuffer {
  const channel = Float32Array.from(values);
  return {
    sampleRate,
    length: channel.length,
    numberOfChannels: 1,
    getChannelData(index) {
      if (index !== 0) throw new RangeError("mono fixture has one channel");
      return channel;
    },
  };
}

describe("presenter activity ducking", () => {
  it("detects voice around a zero-filled decoder gap in one continuous buffer", () => {
    const sampleRate = 1_000;
    const values = new Float32Array(sampleRate * 3);
    values.fill(0.05, 0, sampleRate / 2);
    values.fill(0.05, sampleRate * 2.5);

    const windows = measurePresenterActivity(
      monoBuffer(values, sampleRate),
      0,
      3,
      0,
    );
    const regions = getPresenterVoiceRegions(windows, 3);

    expect(getPresenterActivityThreshold(windows)).toBeGreaterThan(0);
    expect(regions).toHaveLength(2);
    expect(regions[0]!.start).toBe(0);
    expect(regions[0]!.end).toBeCloseTo(0.5, 2);
    expect(regions[1]!.start).toBeCloseTo(2.5, 2);
    expect(regions[1]!.end).toBe(3);
  });

  it("places a quiet voice above a measured steady noise floor", () => {
    const sampleRate = 1_000;
    const values = new Float32Array(sampleRate).fill(0.002);
    values.fill(0.025, 400, 600);
    const windows = measurePresenterActivity(
      monoBuffer(values, sampleRate),
      0,
      1,
      0,
    );
    const threshold = getPresenterActivityThreshold(windows);
    const regions = getPresenterVoiceRegions(windows, 1);

    expect(threshold).toBeGreaterThan(0.002);
    expect(threshold).toBeLessThan(0.025);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.start).toBeCloseTo(0.4, 2);
    expect(regions[0]!.end).toBeCloseTo(0.6, 2);
  });

  it("bridges codec-sized gaps but preserves meaningful pauses", () => {
    expect(mergePresenterCoverage([
      { start: 0, end: 0.5 },
      { start: 0.56, end: 0.9 },
      { start: 2.5, end: 3 },
    ], 3)).toEqual([
      { start: 0, end: 0.9 },
      { start: 2.5, end: 3 },
    ]);
  });

  it("sorts, clamps, and rejects malformed coverage", () => {
    expect(mergePresenterCoverage([
      { start: 2.8, end: 4 },
      { start: -1, end: 0.4 },
      { start: 1.2, end: 1.1 },
      { start: Number.NaN, end: 2 },
      { start: 0.35, end: 0.6 },
    ], 3)).toEqual([
      { start: 0, end: 0.6 },
      { start: 2.8, end: 3 },
    ]);
  });

  it("returns no ducking regions for silence or an invalid master duration", () => {
    const silence = measurePresenterActivity(
      monoBuffer(new Float32Array(1_000), 1_000),
      0,
      1,
      0,
    );
    expect(getPresenterActivityThreshold(silence)).toBe(Number.POSITIVE_INFINITY);
    expect(getPresenterVoiceRegions(silence, 1)).toEqual([]);
    expect(mergePresenterCoverage([{ start: 0, end: 1 }], 0)).toEqual([]);
    expect(mergePresenterCoverage([{ start: 0, end: 1 }], Number.NaN)).toEqual([]);
  });
});
