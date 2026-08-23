import { describe, expect, it } from "vitest";
import {
  INSTAGRAM_REEL_SAFE_INSETS,
  INSTAGRAM_STORY_SAFE_INSETS,
  META_REELS_CREATIVE_GUIDANCE_URL,
  META_STORY_SAFE_AREA_URL,
  PLATFORM_GUIDE_LAST_VERIFIED,
  PLATFORM_GUIDE_PROFILE_ORDER,
  PLATFORM_GUIDE_REGISTRY,
  createCustomPlatformGuide,
  evaluatePresenterGuideOverlap,
  evaluateSlideGuideOverlap,
  getPlatformGuideProfile,
  intersectNormalizedRects,
  normalizedBoundsFromRect,
  normalizedRectArea,
  normalizedRectFromBounds,
  unionNormalizedRects,
  validateNormalizedBounds,
  validateNormalizedInsets,
  validateNormalizedRect,
  type NormalizedRect,
} from "../src/core/platformGuides";

function totalArea(rects: readonly NormalizedRect[]): number {
  return rects.reduce((sum, rect) => sum + normalizedRectArea(rect), 0);
}

function expectPairwiseDisjoint(rects: readonly NormalizedRect[]): void {
  for (let first = 0; first < rects.length; first += 1) {
    for (let second = first + 1; second < rects.length; second += 1) {
      expect(intersectNormalizedRects(rects[first]!, rects[second]!)).toBeNull();
    }
  }
}

function expectRectClose(actual: NormalizedRect, expected: NormalizedRect): void {
  expect(actual.x).toBeCloseTo(expected.x, 12);
  expect(actual.y).toBeCloseTo(expected.y, 12);
  expect(actual.width).toBeCloseTo(expected.width, 12);
  expect(actual.height).toBeCloseTo(expected.height, 12);
}

describe("versioned platform guide registry", () => {
  it("ships the five Plan 001 profiles in stable order with source state", () => {
    expect(PLATFORM_GUIDE_REGISTRY.schemaVersion).toBe(1);
    expect(PLATFORM_GUIDE_PROFILE_ORDER).toEqual([
      "none",
      "instagram-story",
      "instagram-reel",
      "instagram-combined",
      "custom",
    ]);
    expect(Object.keys(PLATFORM_GUIDE_REGISTRY.profiles)).toEqual(PLATFORM_GUIDE_PROFILE_ORDER);
    expect(getPlatformGuideProfile("none").obstructions).toEqual([]);
    expect(getPlatformGuideProfile("instagram-story")).toMatchObject({
      status: "official",
      lastVerified: PLATFORM_GUIDE_LAST_VERIFIED,
      safeInsets: { top: 0.14, right: 0, bottom: 0.20, left: 0 },
    });
    expect(getPlatformGuideProfile("instagram-story").sourceUrls).toContain(META_STORY_SAFE_AREA_URL);
    expect(getPlatformGuideProfile("instagram-reel")).toMatchObject({
      status: "conservative-observed",
      lastVerified: "2026-08-23",
      safeInsets: INSTAGRAM_REEL_SAFE_INSETS,
    });
    expect(getPlatformGuideProfile("instagram-reel").sourceUrls)
      .toContain(META_REELS_CREATIVE_GUIDANCE_URL);
    expect(Object.isFrozen(PLATFORM_GUIDE_REGISTRY.profiles)).toBe(true);
    expect(Object.isFrozen(getPlatformGuideProfile("instagram-story").obstructions)).toBe(true);
  });

  it("stores Story's official percentages in normalized space", () => {
    expect(INSTAGRAM_STORY_SAFE_INSETS.top).toBe(0.14);
    expect(INSTAGRAM_STORY_SAFE_INSETS.bottom).toBe(0.20);
    expect(INSTAGRAM_STORY_SAFE_INSETS.top * 1920).toBeCloseTo(269, 0);
    expect(INSTAGRAM_STORY_SAFE_INSETS.bottom * 1920).toBe(384);
  });

  it("builds combined mode as one non-overlapping geometric union", () => {
    const story = getPlatformGuideProfile("instagram-story");
    const reel = getPlatformGuideProfile("instagram-reel");
    const combined = getPlatformGuideProfile("instagram-combined");
    const independentUnion = unionNormalizedRects([...story.obstructions, ...reel.obstructions]);

    expectPairwiseDisjoint(combined.obstructions);
    expect(totalArea(combined.obstructions)).toBeCloseTo(totalArea(independentUnion), 12);
    expect(totalArea(combined.obstructions)).toBeGreaterThan(totalArea(story.obstructions));
    expect(totalArea(combined.obstructions)).toBeGreaterThan(totalArea(reel.obstructions));
  });
});

describe("normalized guide geometry", () => {
  it("validates canonical rectangles, bounds, and independent insets", () => {
    const rect = validateNormalizedRect({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    const bounds = normalizedBoundsFromRect(rect);
    expect(bounds.left).toBeCloseTo(0.1, 12);
    expect(bounds.top).toBeCloseTo(0.2, 12);
    expect(bounds.right).toBeCloseTo(0.4, 12);
    expect(bounds.bottom).toBeCloseTo(0.6, 12);
    expectRectClose(normalizedRectFromBounds(bounds), rect);
    expect(validateNormalizedInsets({ top: 0.1, right: 0.2, bottom: 0.3, left: 0.4 }))
      .toEqual({ top: 0.1, right: 0.2, bottom: 0.3, left: 0.4 });

    expect(() => validateNormalizedRect({ x: -0.1, y: 0, width: 1, height: 1 }))
      .toThrow(/between 0 and 1/);
    expect(() => validateNormalizedRect({ x: 0, y: 0, width: 0, height: 1 }))
      .toThrow(/greater than zero/);
    expect(() => validateNormalizedRect({ x: 0.8, y: 0, width: 0.3, height: 1 }))
      .toThrow(/right edge/);
    expect(() => validateNormalizedBounds({ left: 0.5, top: 0, right: 0.5, bottom: 1 }))
      .toThrow(/right must be greater/);
    expect(() => validateNormalizedInsets({ top: 0.7, right: 0, bottom: 0.4, left: 0 }))
      .toThrow(/sum to at most 1/);
    expect(() => validateNormalizedInsets({ top: 0, right: Number.NaN, bottom: 0, left: 0 }))
      .toThrow(/finite/);
  });

  it("returns exact positive intersections and treats edge contact as clear", () => {
    const intersection = intersectNormalizedRects(
      { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
      { x: 0.4, y: 0.3, width: 0.5, height: 0.4 },
    );
    expect(intersection).not.toBeNull();
    expectRectClose(intersection!, { x: 0.4, y: 0.3, width: 0.2, height: 0.3 });
    expect(intersectNormalizedRects(
      { x: 0, y: 0, width: 0.5, height: 0.5 },
      { x: 0.5, y: 0, width: 0.5, height: 0.5 },
    )).toBeNull();
  });

  it("removes double-painted area from overlapping rectangle unions", () => {
    const union = unionNormalizedRects([
      { x: 0, y: 0, width: 0.7, height: 0.6 },
      { x: 0.4, y: 0.2, width: 0.6, height: 0.7 },
    ]);
    expectPairwiseDisjoint(union);
    expect(totalArea(union)).toBeCloseTo(0.42 + 0.42 - 0.12, 12);
  });

  it("creates four independently authored custom edge insets", () => {
    const custom = createCustomPlatformGuide({ top: 0.1, right: 0.2, bottom: 0.3, left: 0.4 });
    expect(custom).toMatchObject({
      id: "custom",
      status: "custom",
      safeInsets: { top: 0.1, right: 0.2, bottom: 0.3, left: 0.4 },
    });
    expectPairwiseDisjoint(custom.obstructions);
    expect(totalArea(custom.obstructions)).toBeCloseTo(0.76, 12);
    expect(getPlatformGuideProfile("custom").obstructions).toEqual([]);
  });
});

describe("presenter and selected-slide overlap facts", () => {
  it("reports exact presenter overlap area against the Story top obstruction", () => {
    const overlap = evaluatePresenterGuideOverlap(
      { left: 0.2, top: 0.1, right: 0.6, bottom: 0.3 },
      getPlatformGuideProfile("instagram-story"),
    );
    expect(overlap.subject).toBe("presenter");
    expect(overlap.overlaps).toBe(true);
    expect(overlap.intersections).toHaveLength(1);
    expectRectClose(overlap.intersections[0]!, { x: 0.2, y: 0.1, width: 0.4, height: 0.04 });
    expect(overlap.overlapArea).toBeCloseTo(0.016, 12);
    expect(overlap.subjectArea).toBeCloseTo(0.08, 12);
    expect(overlap.overlapRatio).toBeCloseTo(0.2, 12);
  });

  it("reports slide overlap against the Reel action rail and clear None state", () => {
    const bounds = { left: 0.76, top: 0.3, right: 0.92, bottom: 0.6 } as const;
    const reel = evaluateSlideGuideOverlap(bounds, getPlatformGuideProfile("instagram-reel"));
    const none = evaluateSlideGuideOverlap(bounds, getPlatformGuideProfile("none"));

    expect(reel.subject).toBe("slide");
    expect(reel.overlaps).toBe(true);
    expect(reel.overlapArea).toBeCloseTo(0.1 * 0.3, 12);
    expect(reel.overlapRatio).toBeCloseTo(0.625, 12);
    expect(none).toMatchObject({ overlaps: false, overlapArea: 0, overlapRatio: 0 });
    expect(none.intersections).toEqual([]);
  });
});
