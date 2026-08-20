import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings, type StudioAsset } from "../src/model";
import {
  applyPacingRecipe,
  getDirectorPreflight,
  getMasterChapters,
  getMasterMetrics,
} from "../src/lib/directorJourney";

function image(id: string): StudioAsset {
  return {
    id,
    name: `${id}.png`,
    kind: "image",
    blob: new Blob([id], { type: "image/png" }),
    mimeType: "image/png",
    width: 1920,
    height: 1080,
    objectUrl: `blob:${id}`,
  };
}

describe("director journey edge contracts", () => {
  it("never emits a master outside the supported 3–30 second range", () => {
    const tiny = applyPacingRecipe(cloneSettings(DEFAULT_SETTINGS), 1, "trailer");
    const huge = applyPacingRecipe(cloneSettings(DEFAULT_SETTINGS), 200, "linger");
    expect(tiny.output.duration).toBe(3);
    expect(huge.output.duration).toBe(30);
    expect(tiny.motion.speed).toBeGreaterThanOrEqual(0);
    expect(huge.motion.speed).toBeLessThanOrEqual(1.5);
  });

  it("keeps chapter order deterministic in reverse", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.direction = -1;
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 1;
    const chapters = getMasterChapters(settings, 4);
    expect(chapters.map((chapter) => chapter.slideIndex)).toEqual([0, 3, 2, 1]);
  });

  it("warns whenever either output edge drops below 1080 pixels", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.output.width = 720;
    settings.output.height = 1280;
    settings.stage.width = 720;
    settings.stage.height = 1280;
    const items = getDirectorPreflight(settings, [image("one"), image("two")]);
    expect(items.some((item) => item.id === "small-output")).toBe(true);
  });

  it("uses live speed only when the export loop is unlocked", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.seamless = false;
    settings.motion.speed = 0.73;
    const metrics = getMasterMetrics(settings, 30);
    expect(metrics.slidesPerSecond).toBe(0.73);
    expect(metrics.passes).toBe(1);
  });
});
