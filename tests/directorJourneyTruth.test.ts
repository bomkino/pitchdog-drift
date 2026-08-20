import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import { getMasterChapters, getPresenterSourceTime } from "../src/lib/directorJourney";

describe("master truth", () => {
  it("places unlocked chapter marks at real speed-derived arrival times", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.output.duration = 8;
    settings.motion.seamless = false;
    settings.motion.speed = 0.5;
    settings.motion.direction = 1;
    const chapters = getMasterChapters(settings, 3);
    expect(chapters.map((chapter) => chapter.time)).toEqual([0, 2, 4, 6, 8]);
    expect(chapters.map((chapter) => chapter.slideIndex)).toEqual([0, 1, 2, 0, 1]);
  });

  it("maps master time through presenter start and trim offsets", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.presenter.enabled = true;
    settings.presenter.assetId = "presenter";
    settings.presenter.startAt = 2;
    settings.presenter.trimStart = 1.5;
    expect(getPresenterSourceTime(settings, 12, 1.99)).toBeNull();
    expect(getPresenterSourceTime(settings, 12, 2)).toBeCloseTo(1.5, 6);
    expect(getPresenterSourceTime(settings, 12, 5)).toBeCloseTo(4.5, 6);
  });

  it("refuses to invent frames after a presenter clip ends", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.presenter.enabled = true;
    settings.presenter.assetId = "presenter";
    settings.presenter.startAt = 0;
    settings.presenter.trimStart = 2;
    expect(getPresenterSourceTime(settings, 6, 3.9)).toBeCloseTo(5.9, 6);
    expect(getPresenterSourceTime(settings, 6, 4.01)).toBeNull();
  });
});
