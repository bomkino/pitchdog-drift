import { describe, expect, it } from "vitest";
import { fitStagePreview } from "../src/components/stageGeometry";

describe("stage preview geometry", () => {
  it("fits a wide stage by width without stretching its authored ratio", () => {
    const result = fitStagePreview(621, 694, 1920, 1080);

    expect(result).not.toBeNull();
    expect(result?.width).toBe(621);
    expect(result?.height).toBeCloseTo(349.3125, 8);
    expect((result?.width ?? 0) / (result?.height ?? 1)).toBeCloseTo(16 / 9, 12);
  });

  it("fits a portrait stage by height without stretching its authored ratio", () => {
    const result = fitStagePreview(931, 1041, 1080, 1920);

    expect(result).not.toBeNull();
    expect(result?.width).toBeCloseTo(461.25, 8);
    expect(result?.height).toBe(820);
    expect((result?.width ?? 0) / (result?.height ?? 1)).toBeCloseTo(9 / 16, 12);
  });

  it("fails closed for hidden or invalid geometry", () => {
    expect(fitStagePreview(0, 694, 1920, 1080)).toBeNull();
    expect(fitStagePreview(621, Number.NaN, 1920, 1080)).toBeNull();
    expect(fitStagePreview(621, 694, -1, 1080)).toBeNull();
  });
});
