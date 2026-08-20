import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings, type StudioAsset } from "../src/model";
import {
  applyPacingRecipe,
  buildMasterBrief,
  getDirectorPreflight,
  getMasterChapters,
  getMasterMetrics,
} from "../src/lib/directorJourney";

function image(id: string): StudioAsset {
  return {
    id,
    name: `${id}.png`,
    kind: "image",
    blob: new Blob(["x"], { type: "image/png" }),
    mimeType: "image/png",
    width: 1600,
    height: 900,
    objectUrl: `blob:${id}`,
  };
}

function video(id: string, duration: number): StudioAsset {
  return {
    id,
    name: `${id}.mp4`,
    kind: "video",
    blob: new Blob(["x"], { type: "video/mp4" }),
    mimeType: "video/mp4",
    width: 1080,
    height: 1920,
    duration,
    objectUrl: `blob:${id}`,
  };
}

describe("director journey", () => {
  it("reports the true authored-deck pace under seamless lock", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.output.duration = 8;
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 2;
    const metrics = getMasterMetrics(settings, 8);
    expect(metrics.totalSlideBeats).toBe(16);
    expect(metrics.slidesPerSecond).toBe(2);
    expect(metrics.secondsPerSlide).toBe(0.5);
  });

  it("builds one focal chapter per slide per authored pass", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.output.duration = 12;
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 3;
    const chapters = getMasterChapters(settings, 4);
    expect(chapters).toHaveLength(12);
    expect(chapters[0]?.time).toBe(0);
    expect(chapters[4]?.passIndex).toBe(1);
    expect(chapters.at(-1)?.time).toBeCloseTo(11, 5);
  });

  it("turns pacing recipes into bounded, loop-true masters", () => {
    const settings = applyPacingRecipe(cloneSettings(DEFAULT_SETTINGS), 20, "linger");
    expect(settings.motion.seamless).toBe(true);
    expect(settings.motion.seamlessLoops).toBe(1);
    expect(settings.output.duration).toBe(30);
    expect(settings.output.fps).toBe(24);
    expect(settings.motion.speed).toBeCloseTo(20 / 30, 5);
  });

  it("warns when a pinned presenter ends before the master", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.output.duration = 12;
    settings.presenter.enabled = true;
    settings.presenter.assetId = "presenter";
    const items = getDirectorPreflight(settings, [image("slide"), video("presenter", 7)]);
    expect(items.some((item) => item.id === "presenter-short")).toBe(true);
  });

  it("blocks presenter audio at the guarded high frame rates", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.output.fps = 60;
    settings.presenter.enabled = true;
    settings.presenter.assetId = "presenter";
    settings.presenter.muted = false;
    const items = getDirectorPreflight(settings, [image("slide"), video("presenter", 30)]);
    expect(items.some((item) => item.id === "audio-high-fps" && item.severity === "blocker")).toBe(true);
  });

  it("creates a portable human-readable master brief", () => {
    const brief = buildMasterBrief(cloneSettings(DEFAULT_SETTINGS), [image("one"), image("two")]);
    expect(brief).toContain("DRIFT MASTER BRIEF");
    expect(brief).toContain("Slides: 2");
    expect(brief).toContain("Preflight:");
  });
});
