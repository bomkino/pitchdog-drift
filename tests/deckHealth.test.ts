import { describe, expect, it } from "vitest";
import { assessDeckHealth } from "../src/deckHealth";
import { cloneSettings, DEFAULT_SETTINGS, type StudioAsset } from "../src/model";

function asset(id: string, width: number, height: number): StudioAsset {
  return {
    id,
    name: `${id}.png`,
    kind: "image",
    blob: new Blob(),
    mimeType: "image/png",
    width,
    height,
    objectUrl: `blob:${id}`,
  };
}

describe("deck health", () => {
  it("recognises a consistent deck and suggests its common frame", () => {
    const health = assessDeckHealth([asset("a", 1920, 1080), asset("b", 3840, 2160)], DEFAULT_SETTINGS);
    expect(health.status).toBe("ready");
    expect(health.ratioLabel).toBe("16:9");
    expect(health.mixedRatios).toBe(false);
    expect(health.frameRatioMismatch).toBe(false);
    expect(health.lowResolutionCount).toBe(0);
    expect([health.suggestedAspectWidth, health.suggestedAspectHeight]).toEqual([16, 9]);
  });

  it("names mixed ratios rather than pretending one global crop is neutral", () => {
    const health = assessDeckHealth([asset("wide", 1920, 1080), asset("square", 1080, 1080)], DEFAULT_SETTINGS);
    expect(health.status).toBe("warning");
    expect(health.mixedRatios).toBe(true);
    expect(health.frameRatioMismatch).toBe(false);
  });

  it("flags source enlargement at the chosen publishing master", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.output.width = 3840;
    settings.output.height = 2160;
    settings.slide.scale = 0.9;
    const health = assessDeckHealth([asset("small", 1280, 720), asset("large", 3840, 2160)], settings);
    expect(health.lowResolutionCount).toBe(1);
    expect(health.smallestSource).toEqual({ width: 1280, height: 720 });
    expect(health.status).toBe("warning");
  });
});
