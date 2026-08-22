import { describe, expect, it } from "vitest";
import { resolveFirstPinComposition } from "../src/core/presenter/activation";
import { resolvePinLaneComposition } from "../src/core/presenter/lane";

describe("authored pin composition", () => {
  it("gives landscape and portrait sources distinct intentional 9:16 defaults", () => {
    const stage = { width: 1080, height: 1920 };
    const landscape = resolveFirstPinComposition(stage, { width: 1920, height: 1080 });
    const portrait = resolveFirstPinComposition(stage, { width: 1080, height: 1920 });

    expect(landscape).toMatchObject({
      layoutMode: "safe-overlay",
      aspectMode: "source",
      x: 0.94,
      y: 0.62,
      width: 0.42,
      shadowSoftness: 72,
    });
    expect(portrait).toMatchObject({
      layoutMode: "safe-overlay",
      aspectMode: "source",
      x: 0.94,
      y: 0.58,
      width: 0.38,
      shadowSoftness: 72,
    });
    expect(landscape.y).toBeLessThan(1);
    expect(portrait.y).toBeLessThan(1);
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

    expect(vertical.scale).toBeLessThan(1);
    expect(vertical.scale).toBeLessThanOrEqual(0.73);
    expect(vertical.offsetX).toBeLessThan(0);
    expect(vertical.offsetX).toBeLessThanOrEqual(-210);
    expect(vertical.offsetY).toBe(0);
    expect(horizontal.offsetX).toBe(0);
    expect(horizontal.offsetY).toBeGreaterThan(0);
    expect(resolvePinLaneComposition({ ...common, enabled: false, axis: "vertical" }))
      .toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
});
