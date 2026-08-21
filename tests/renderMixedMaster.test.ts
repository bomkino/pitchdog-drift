import { describe, expect, it } from "vitest";
import { mergePresenterCoverage } from "../src/sonic/renderMixedMaster";

describe("presenter coverage ducking", () => {
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

  it("returns no ducking regions for an invalid master duration", () => {
    expect(mergePresenterCoverage([{ start: 0, end: 1 }], 0)).toEqual([]);
    expect(mergePresenterCoverage([{ start: 0, end: 1 }], Number.NaN)).toEqual([]);
  });
});
