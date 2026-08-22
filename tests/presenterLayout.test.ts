import { describe, expect, it } from "vitest";
import {
  BOTTOM_RIGHT_SAFE_ANCHOR,
  resolveBottomRightPresenterLayout,
  resolvePresenterOverlayLayout,
  type EdgeInsets,
  type PresenterOverlayLayout,
  type StageSize,
} from "../src/core/presenter/layout";

const STAGES: readonly StageSize[] = [
  { width: 1080, height: 1920 },
  { width: 1080, height: 1350 },
  { width: 1080, height: 1080 },
  { width: 1920, height: 1080 },
];

const SOURCES: readonly StageSize[] = [
  { width: 1920, height: 1080 },
  { width: 1080, height: 1920 },
  { width: 1000, height: 1000 },
];

const EPSILON = 1e-8;

function expectInsideSafeArea(layout: PresenterOverlayLayout): void {
  expect(layout.occupiedBoundsPx.left).toBeGreaterThanOrEqual(layout.safeBoundsPx.left - EPSILON);
  expect(layout.occupiedBoundsPx.top).toBeGreaterThanOrEqual(layout.safeBoundsPx.top - EPSILON);
  expect(layout.occupiedBoundsPx.right).toBeLessThanOrEqual(layout.safeBoundsPx.right + EPSILON);
  expect(layout.occupiedBoundsPx.bottom).toBeLessThanOrEqual(layout.safeBoundsPx.bottom + EPSILON);
}

function expectFiniteLayout(layout: PresenterOverlayLayout): void {
  const values = [
    layout.aspect.ratio,
    layout.fitScale,
    layout.centerPx.x,
    layout.centerPx.y,
    layout.centerStage.x,
    layout.centerStage.y,
    layout.frameSizePx.width,
    layout.frameSizePx.height,
    layout.frameBoundsPx.left,
    layout.frameBoundsPx.top,
    layout.frameBoundsPx.right,
    layout.frameBoundsPx.bottom,
    layout.occupiedBoundsPx.left,
    layout.occupiedBoundsPx.top,
    layout.occupiedBoundsPx.right,
    layout.occupiedBoundsPx.bottom,
  ];
  expect(values.every(Number.isFinite)).toBe(true);
}

describe("protected presenter overlay layout", () => {
  it("keeps every frame and shadow inside 9:16, 4:5, 1:1, and 16:9 stages", () => {
    const safeInset: EdgeInsets = { top: 72, right: 54, bottom: 96, left: 42 };
    const shadowExtents: EdgeInsets = { top: 28, right: 72, bottom: 86, left: 34 };
    for (const stage of STAGES) {
      for (const source of SOURCES) {
        for (const scale of [0.14, 0.34, 0.82, 2.4]) {
          for (const x of [-1, 0, 0.17, 0.5, 0.91, 1, 2]) {
            for (const y of [-1, 0, 0.23, 0.5, 0.88, 1, 2]) {
              const layout = resolvePresenterOverlayLayout({
                stage,
                source,
                scale,
                anchor: { x, y },
                safeInset,
                shadowExtents,
              });
              expectFiniteLayout(layout);
              expectInsideSafeArea(layout);
              expect(layout.frameSizePx.width / layout.frameSizePx.height)
                .toBeCloseTo(source.width / source.height, 12);
            }
          }
        }
      }
    }
  });

  it("maps anchor endpoints to exact safe footprint edges", () => {
    for (const stage of STAGES) {
      const common = {
        stage,
        source: { width: 1080, height: 1920 },
        scale: 0.34,
        safeInset: { top: 81, right: 63, bottom: 117, left: 45 },
        shadowExtents: { top: 22, right: 41, bottom: 59, left: 17 },
      } as const;
      const topLeft = resolvePresenterOverlayLayout({ ...common, anchor: { x: 0, y: 0 } });
      const bottomRight = resolvePresenterOverlayLayout({ ...common, anchor: { x: 1, y: 1 } });
      expect(topLeft.occupiedBoundsPx.left).toBeCloseTo(topLeft.safeBoundsPx.left, 10);
      expect(topLeft.occupiedBoundsPx.top).toBeCloseTo(topLeft.safeBoundsPx.top, 10);
      expect(bottomRight.occupiedBoundsPx.right).toBeCloseTo(bottomRight.safeBoundsPx.right, 10);
      expect(bottomRight.occupiedBoundsPx.bottom).toBeCloseTo(bottomRight.safeBoundsPx.bottom, 10);
    }
  });

  it("uses source aspect by default and an explicit custom aspect when authored", () => {
    for (const source of SOURCES) {
      const sourceLayout = resolvePresenterOverlayLayout({
        stage: STAGES[0]!,
        source,
        scale: 0.34,
        anchor: { x: 0.5, y: 0.5 },
      });
      expect(sourceLayout.aspect.origin).toBe("source");
      expect(sourceLayout.aspect.ratio).toBeCloseTo(source.width / source.height, 12);
      expect(sourceLayout.frameSizePx.width / sourceLayout.frameSizePx.height)
        .toBeCloseTo(source.width / source.height, 12);
    }

    const custom = resolvePresenterOverlayLayout({
      stage: STAGES[0]!,
      source: { width: 1920, height: 1080 },
      customAspect: { width: 4, height: 5 },
      scale: 0.34,
      anchor: { x: 0.5, y: 0.5 },
    });
    expect(custom.aspect).toMatchObject({ origin: "custom", width: 4, height: 5, ratio: 0.8 });
    expect(custom.frameSizePx.width / custom.frameSizePx.height).toBeCloseTo(0.8, 12);
  });

  it("uniformly fits impossible oversize requests without changing proportions", () => {
    const input = {
      stage: { width: 320, height: 180 },
      source: { width: 9, height: 16 },
      scale: 12,
      anchor: { x: 1, y: 1 },
      safeInset: { top: 40, right: 50, bottom: 30, left: 20 },
      shadowExtents: { top: 800, right: 600, bottom: 400, left: 200 },
    } as const;
    const layout = resolvePresenterOverlayLayout(input);
    const repeated = resolvePresenterOverlayLayout(input);
    expect(layout).toEqual(repeated);
    expect(layout.constrained).toBe(true);
    expect(layout.fitScale).toBeGreaterThan(0);
    expect(layout.fitScale).toBeLessThan(1);
    expect(layout.frameSizePx.width / layout.requestedFrameSizePx.width).toBeCloseTo(layout.fitScale, 12);
    expect(layout.shadowExtentsPx.left / input.shadowExtents.left).toBeCloseTo(layout.fitScale, 12);
    expect(layout.shadowExtentsPx.bottom / input.shadowExtents.bottom).toBeCloseTo(layout.fitScale, 12);
    expect(layout.frameSizePx.width / layout.frameSizePx.height).toBeCloseTo(9 / 16, 12);
    expectInsideSafeArea(layout);
    expect(layout.occupiedBoundsPx.right).toBeCloseTo(layout.safeBoundsPx.right, 10);
    expect(layout.occupiedBoundsPx.bottom).toBeCloseTo(layout.safeBoundsPx.bottom, 10);
  });

  it("returns exact top-left pixel and centered y-up stage coordinates", () => {
    const layout = resolvePresenterOverlayLayout({
      stage: { width: 1000, height: 800 },
      source: { width: 1, height: 1 },
      scale: 0.2,
      anchor: { x: 0.25, y: 0.75 },
      safeInset: 100,
      shadowExtents: 0,
    });
    expect(layout.centerPx).toEqual({ x: 350, y: 500 });
    expect(layout.centerStage).toEqual({ x: -150, y: -100 });
    expect(layout.frameBoundsPx).toEqual({
      left: 250,
      top: 400,
      right: 450,
      bottom: 600,
      width: 200,
      height: 200,
    });
    expect(layout.frameBoundsStage).toEqual({
      minX: -250,
      maxX: -50,
      minY: -200,
      maxY: 0,
      width: 200,
      height: 200,
    });
  });

  it("clamps authored anchors but rejects non-finite ones", () => {
    const clamped = resolvePresenterOverlayLayout({
      stage: STAGES[0]!,
      source: SOURCES[0]!,
      scale: 0.34,
      anchor: { x: -4, y: 9 },
      safeInset: 64,
      shadowExtents: 48,
    });
    expect(clamped.anchor).toEqual({ x: 0, y: 1 });
    expect(clamped.anchorWasClamped).toBe(true);
    expectInsideSafeArea(clamped);

    expect(() => resolvePresenterOverlayLayout({
      stage: STAGES[0]!,
      source: SOURCES[0]!,
      scale: 0.34,
      anchor: { x: Number.NaN, y: 0.5 },
    })).toThrow(/anchor\.x must be finite/);
  });

  it("provides one bottom-right safe-lane policy", () => {
    const input = {
      stage: STAGES[0]!,
      source: SOURCES[1]!,
      scale: 0.34,
      safeInset: 64,
      shadowExtents: { top: 20, right: 52, bottom: 68, left: 24 },
    } as const;
    const layout = resolveBottomRightPresenterLayout(input);
    const direct = resolvePresenterOverlayLayout({ ...input, anchor: BOTTOM_RIGHT_SAFE_ANCHOR });
    expect(layout).toEqual(direct);
    expect(layout.anchor).toEqual({ x: 1, y: 1 });
    expect(layout.occupiedBoundsPx.right).toBeCloseTo(layout.safeBoundsPx.right, 10);
    expect(layout.occupiedBoundsPx.bottom).toBeCloseTo(layout.safeBoundsPx.bottom, 10);
  });

  it("rejects malformed geometry instead of emitting NaN or negative bounds", () => {
    const valid = {
      stage: STAGES[0]!,
      source: SOURCES[0]!,
      scale: 0.34,
      anchor: { x: 0.5, y: 0.5 },
    } as const;
    expect(() => resolvePresenterOverlayLayout({ ...valid, stage: { width: 0, height: 1920 } }))
      .toThrow(/stage\.width/);
    expect(() => resolvePresenterOverlayLayout({ ...valid, source: { width: 1920, height: 0 } }))
      .toThrow(/source\.height/);
    expect(() => resolvePresenterOverlayLayout({ ...valid, scale: -1 })).toThrow(/scale/);
    expect(() => resolvePresenterOverlayLayout({ ...valid, safeInset: -1 })).toThrow(/safeInset/);
    expect(() => resolvePresenterOverlayLayout({ ...valid, shadowExtents: { right: Number.POSITIVE_INFINITY } }))
      .toThrow(/shadowExtents\.right/);
    expect(() => resolvePresenterOverlayLayout({ ...valid, scale: Number.MAX_VALUE }))
      .toThrow(/requested frame width/);
    expect(() => resolvePresenterOverlayLayout({ ...valid, safeInset: { left: 600, right: 600 } }))
      .toThrow(/positive safe area/);
  });
});
