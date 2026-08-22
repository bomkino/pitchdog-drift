import { describe, expect, it } from "vitest";
import {
  resetPinnedFrameComposition,
  resolveFirstPinComposition,
} from "../src/core/presenter/activation";
import { cloneSettings, DEFAULT_SETTINGS } from "../src/model";
import { resolvePresenterOverlayLayout } from "../src/core/presenter/layout";
import {
  resolvePinLaneComposition,
  resolveProtectedPinLaneComposition,
} from "../src/core/presenter/lane";

function rotatedHalfExtents(
  width: number,
  height: number,
  scale: number,
  rotationZ: number,
): { x: number; y: number } {
  const cosine = Math.abs(Math.cos(rotationZ));
  const sine = Math.abs(Math.sin(rotationZ));
  return {
    x: (width * scale * cosine + height * scale * sine) / 2,
    y: (width * scale * sine + height * scale * cosine) / 2,
  };
}

describe("authored pin composition", () => {
  it("gives landscape and portrait sources distinct intentional 9:16 defaults", () => {
    const stage = { width: 1080, height: 1920 };
    const landscape = resolveFirstPinComposition(stage, { width: 1920, height: 1080 });
    const portrait = resolveFirstPinComposition(stage, { width: 1080, height: 1920 });

    expect(landscape).toMatchObject({
      trackMode: "pinned-only",
      layoutMode: "safe-overlay",
      aspectMode: "source",
      x: 0.94,
      y: 0.62,
      width: 0.35,
      shadowSoftness: 72,
    });
    expect(portrait).toMatchObject({
      trackMode: "pinned-only",
      layoutMode: "safe-overlay",
      aspectMode: "source",
      x: 0.94,
      y: 0.58,
      width: 0.34,
      shadowSoftness: 72,
    });
    expect(landscape.y).toBeLessThan(1);
    expect(portrait.y).toBeLessThan(1);
  });

  it("caps a portrait pin by stage height on a 16:9 composition", () => {
    const stage = { width: 1920, height: 1080 };
    const composition = resolveFirstPinComposition(stage, { width: 1080, height: 1920 });
    const layout = resolvePresenterOverlayLayout({
      stage,
      source: { width: 1080, height: 1920 },
      anchor: { x: composition.x, y: composition.y },
      scale: composition.width,
    });

    expect(composition.width).toBeGreaterThanOrEqual(0.14);
    expect(composition.width).toBeLessThanOrEqual(0.16);
    expect(layout.frameSizePx.height / stage.height).toBeLessThanOrEqual(0.45);
  });

  it("repairs legacy first-pin geometry only through an explicit reset", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.presenter = {
      ...settings.presenter,
      enabled: true,
      assetId: "landscape-slide",
      trackMode: "moving-and-pinned",
      layoutMode: "safe-overlay",
      aspectMode: "custom",
      aspectWidth: 9,
      aspectHeight: 16,
      x: 0.94,
      y: 0.62,
      width: 0.42,
      fit: "contain",
      borderWidth: 3,
      borderOpacity: 0.7,
    };
    const before = structuredClone(settings);

    const reset = resetPinnedFrameComposition(settings, { width: 1920, height: 1080 });

    expect(settings).toEqual(before);
    expect(reset.presenter).toMatchObject({
      enabled: true,
      assetId: "landscape-slide",
      trackMode: "pinned-only",
      layoutMode: "safe-overlay",
      aspectMode: "source",
      x: 0.94,
      y: 0.62,
      width: 0.35,
      fit: "contain",
      borderWidth: 3,
      borderOpacity: 0.7,
    });
  });

  it("yields a cross-axis lane opposite the pin without changing timing", () => {
    const common = {
      enabled: true,
      safeOverlay: true,
      stage: { width: 1080, height: 1920 },
      pinX: 0.94,
      pinY: 0.74,
      pinWidth: 0.42,
    } as const;
    const vertical = resolvePinLaneComposition({ ...common, axis: "vertical" });
    const horizontal = resolvePinLaneComposition({ ...common, axis: "horizontal" });

    // Exact legacy outputs are a compatibility lock. V2's local avoidance is
    // selected by the renderer without changing this V1 projection.
    expect(vertical.scale).toBeCloseTo(0.7228, 12);
    expect(vertical.offsetX).toBeCloseTo(-217.728, 12);
    expect(vertical.offsetY).toBe(0);
    expect(horizontal.offsetX).toBe(0);
    expect(horizontal.offsetY).toBeCloseTo(201.6, 12);
    expect(resolvePinLaneComposition({ ...common, enabled: false, axis: "vertical" }))
      .toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it("protects a 9:16 pin with a local vertical-flow lane instead of permanent shrink", () => {
    const stage = { width: 1080, height: 1920 };
    const pin = resolvePresenterOverlayLayout({
      stage,
      source: { width: 1920, height: 1080 },
      anchor: { x: 0.94, y: 0.62 },
      scale: 0.42,
      safeInset: 59.4,
      shadowExtents: { top: 66, right: 80, bottom: 94, left: 80 },
    });
    const movingSize = { width: 820.8, height: 461.7 };
    const movingScale = 1.08;
    const movingRotationZ = 0.06;
    const movingCenter = { x: 0, y: pin.centerStage.y };
    const result = resolveProtectedPinLaneComposition({
      enabled: true,
      safeOverlay: true,
      stage,
      axis: "vertical",
      presenterBounds: pin.frameBoundsStage,
      movingCenter,
      movingSize,
      movingScale,
      movingRotationZ,
      edgeInset: 59.4,
    });
    const movingHalf = rotatedHalfExtents(
      movingSize.width,
      movingSize.height,
      movingScale,
      movingRotationZ,
    );
    const finalRight = movingCenter.x + result.offsetX + movingHalf.x * result.scale;

    expect(result.influence).toBe(1);
    expect(result.scale).toBeLessThan(0.5);
    expect(result.targetScale).toBeLessThan(0.55);
    expect(result.opacity).toBe(0);
    expect(result.offsetX).toBeLessThan(-250);
    expect(result.offsetY).toBe(0);
    expect(finalRight).toBeLessThanOrEqual(
      pin.frameBoundsStage.minX - result.protectedGap + 1e-7,
    );

    const farAway = resolveProtectedPinLaneComposition({
      enabled: true,
      safeOverlay: true,
      stage,
      axis: "vertical",
      presenterBounds: pin.frameBoundsStage,
      movingCenter: { x: 0, y: stage.height },
      movingSize,
      movingScale,
      movingRotationZ,
      edgeInset: 59.4,
    });
    expect(farAway).toMatchObject({ scale: 1, offsetX: 0, offsetY: 0, influence: 0 });
  });

  it("protects a lower 16:9 pin by lifting horizontal travel into the upper lane", () => {
    const stage = { width: 1920, height: 1080 };
    const pin = resolvePresenterOverlayLayout({
      stage,
      source: { width: 1920, height: 1080 },
      anchor: { x: 0.94, y: 0.86 },
      scale: 0.32,
      safeInset: 48.6,
      shadowExtents: { top: 60, right: 72, bottom: 84, left: 72 },
    });
    const movingSize = { width: 1190.4, height: 669.6 };
    const movingScale = 1.075;
    const movingRotationZ = -0.05;
    const movingCenter = { x: pin.centerStage.x, y: 0 };
    const result = resolveProtectedPinLaneComposition({
      enabled: true,
      safeOverlay: true,
      stage,
      axis: "horizontal",
      presenterBounds: pin.frameBoundsStage,
      movingCenter,
      movingSize,
      movingScale,
      movingRotationZ,
      edgeInset: 48.6,
    });
    const movingHalf = rotatedHalfExtents(
      movingSize.width,
      movingSize.height,
      movingScale,
      movingRotationZ,
    );
    const finalBottom = movingCenter.y + result.offsetY - movingHalf.y * result.scale;

    expect(result.influence).toBe(1);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBeGreaterThan(200);
    expect(finalBottom).toBeGreaterThanOrEqual(
      pin.frameBoundsStage.maxY + result.protectedGap - 1e-7,
    );
  });

  it("keeps the V2 avoidance deterministic, finite, and opt-in", () => {
    const input = {
      enabled: true,
      safeOverlay: true,
      stage: { width: 1080, height: 1920 },
      axis: "vertical" as const,
      presenterBounds: {
        minX: 40,
        maxX: 500,
        minY: -300,
        maxY: 20,
        width: 460,
        height: 320,
      },
      movingCenter: { x: Number.NaN, y: -100 },
      movingSize: { width: 820, height: 460 },
      movingScale: Number.POSITIVE_INFINITY,
      movingRotationZ: Number.NaN,
    } as const;
    const first = resolveProtectedPinLaneComposition(input);
    const second = resolveProtectedPinLaneComposition(input);

    expect(first).toEqual(second);
    expect(Object.values(first).every(Number.isFinite)).toBe(true);
    expect(resolveProtectedPinLaneComposition({ ...input, enabled: false }))
      .toEqual({
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        opacity: 1,
        influence: 0,
        targetScale: 1,
        targetCrossCenter: 0,
        protectedGap: 0,
      });
  });
});
