import { describe, expect, it } from "vitest";
import { isBuiltInDemoAssetIdentity } from "../src/lib/demoAssetIdentity";

describe("built-in demo asset identity", () => {
  it("recognizes only the eight reserved Drift study id/name pairs", () => {
    for (let index = 1; index <= 8; index += 1) {
      const suffix = String(index).padStart(2, "0");
      expect(isBuiltInDemoAssetIdentity(
        `demo-${suffix}`,
        `Drift study ${suffix}.png`,
      )).toBe(true);
    }
  });

  it("does not treat a filename or reserved-looking id alone as replaceable demo media", () => {
    expect(isBuiltInDemoAssetIdentity("user-01", "Drift study 01.png")).toBe(false);
    expect(isBuiltInDemoAssetIdentity("demo-01", "client-slide.png")).toBe(false);
    expect(isBuiltInDemoAssetIdentity("demo-09", "Drift study 09.png")).toBe(false);
    expect(isBuiltInDemoAssetIdentity("demo-1", "Drift study 01.png")).toBe(false);
  });
});
