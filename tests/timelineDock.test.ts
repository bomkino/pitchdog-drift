import { describe, expect, it, vi } from "vitest";
import {
  formatTimelineTime,
  resolveTimelineKeyboardSeek,
  timelineTimeFromClientX,
} from "../src/components/TimelineDock";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { resolveMovingMedia } from "../src/core/project/movingMedia";
import { DRIFT_V2_RENDER_CONTRACT, type DriftProjectV4 } from "../src/core/project/schema";
import { applyOutcomeRecipe } from "../src/core/recipes/outcomeRecipes";
import { buildVisualTimelineModel } from "../src/core/timeline/visualTimelineModel";
import {
  CinematicCarousel,
  PREVIEW_TIME_CALLBACK_INTERVAL_MS,
  clampPreviewSeekTime,
} from "../src/engine/CinematicCarousel";

const NOW = "2026-08-24T00:00:00.000Z";

function fixture(slideCount = 6): DriftProjectV4 {
  const project = createDefaultDriftProjectV4(
    "timeline-dock",
    NOW,
    101,
    DRIFT_V2_RENDER_CONTRACT,
  );
  project.master.duration = 10;
  project.performance = {
    ...project.performance,
    entry: { enabled: false },
    body: { ...project.performance.body, durationSeconds: 10 },
    exit: { enabled: false },
    repeat: { mode: "off" },
  };
  for (let index = 0; index < slideCount; index += 1) {
    const id = `slide-${index}`;
    project.media.order.push(id);
    project.media.assets[id] = {
      id,
      name: `${id}.png`,
      kind: "image",
      mimeType: "image/png",
      hash: (index + 1).toString(16).padStart(64, "0"),
      byteLength: index + 1,
      width: 1920,
      height: 1080,
    };
    project.slides[id] = {
      assetId: id,
      fit: "cover",
      focalX: 0.5,
      focalY: 0.5,
      scaleOffset: 0,
    };
  }
  return project;
}

function casinoModel() {
  const project = applyOutcomeRecipe(fixture(), "casino-reveal");
  return buildVisualTimelineModel(project, resolveMovingMedia(project).order);
}

describe("timeline dock presentation helpers", () => {
  it("formats tenths without producing an impossible 0:60.0 rollover", () => {
    expect(formatTimelineTime(0)).toBe("0:00.0");
    expect(formatTimelineTime(9.96)).toBe("0:10.0");
    expect(formatTimelineTime(59.96)).toBe("1:00.0");
    expect(formatTimelineTime(125.24)).toBe("2:05.2");
    expect(formatTimelineTime(Number.NaN)).toBe("0:00.0");
  });

  it("maps pointer positions to exact clamped master time", () => {
    expect(timelineTimeFromClientX(100, 100, 400, 10)).toBe(0);
    expect(timelineTimeFromClientX(300, 100, 400, 10)).toBe(5);
    expect(timelineTimeFromClientX(500, 100, 400, 10)).toBe(10);
    expect(timelineTimeFromClientX(-500, 100, 400, 10)).toBe(0);
    expect(timelineTimeFromClientX(900, 100, 400, 10)).toBe(10);
  });

  it("steps one output frame or strict authored pass boundary", () => {
    const model = casinoModel();
    const firstPassEnd = model.passBoundaries[1]!.time;
    expect(resolveTimelineKeyboardSeek(model, 0, "ArrowRight", false, 30)).toBeCloseTo(1 / 30, 12);
    expect(resolveTimelineKeyboardSeek(model, 1 / 30, "ArrowLeft", false, 30)).toBe(0);
    expect(resolveTimelineKeyboardSeek(model, 0, "ArrowRight", true, 30)).toBe(firstPassEnd);
    expect(resolveTimelineKeyboardSeek(model, firstPassEnd, "ArrowLeft", true, 30)).toBe(0);
    expect(resolveTimelineKeyboardSeek(model, firstPassEnd, "ArrowRight", true, 30))
      .toBe(model.passBoundaries[2]!.time);
    expect(resolveTimelineKeyboardSeek(model, 4, "Home", false, 30)).toBe(0);
    expect(resolveTimelineKeyboardSeek(model, 4, "End", false, 30)).toBe(model.totalDuration);
    expect(resolveTimelineKeyboardSeek(model, model.totalDuration, "ArrowRight", false, 30))
      .toBe(model.totalDuration);
  });
});

describe("preview seek API", () => {
  it("clamps invalid and out-of-range requests on the authored master", () => {
    expect(clampPreviewSeekTime(Number.NaN, 10)).toBe(0);
    expect(clampPreviewSeekTime(Number.NEGATIVE_INFINITY, 10)).toBe(0);
    expect(clampPreviewSeekTime(Number.POSITIVE_INFINITY, 10)).toBe(10);
    expect(clampPreviewSeekTime(-2, 10)).toBe(0);
    expect(clampPreviewSeekTime(4.25, 10)).toBe(4.25);
    expect(clampPreviewSeekTime(12, 10)).toBe(10);
    expect(() => clampPreviewSeekTime(1, 0)).toThrow(/duration/u);
    expect(PREVIEW_TIME_CALLBACK_INTERVAL_MS).toBe(100);
  });

  it("seeks preview immediately without taking pause ownership or entering fixed-time export", () => {
    const fake = {
      disposed: false,
      exportActive: false,
      paused: false,
      elapsed: 2,
      previewSeekOverride: null as number | null,
      performanceTimeline: { totalDuration: 10 },
      reducedMotionPreview: false,
      presenterReducedMotionMasterTime: null as number | null,
      syncPresenterPlayback: vi.fn(),
      renderPreview: vi.fn(),
      emitPreviewTime: vi.fn(),
    };
    const seekPreview = CinematicCarousel.prototype.seekPreview as unknown as (
      this: typeof fake,
      time: number,
    ) => number;

    expect(seekPreview.call(fake, 6.5)).toBe(6.5);
    expect(fake.elapsed).toBe(6.5);
    expect(fake.previewSeekOverride).toBe(6.5);
    expect(fake.paused).toBe(false);
    expect(fake.syncPresenterPlayback).toHaveBeenCalledWith(6.5);
    expect(fake.renderPreview).toHaveBeenCalledOnce();
    expect(fake.emitPreviewTime).toHaveBeenCalledWith(expect.any(Number), true);

    fake.exportActive = true;
    expect(() => seekPreview.call(fake, 3)).toThrow(/during export/u);
    expect(fake.elapsed).toBe(6.5);
    expect(fake.renderPreview).toHaveBeenCalledOnce();
  });

  it("exposes the canonical preview clock and rate-limits passive UI callbacks", () => {
    const previewTimeGetter = Object.getOwnPropertyDescriptor(
      CinematicCarousel.prototype,
      "currentPreviewTime",
    )?.get;
    expect(previewTimeGetter).toBeTypeOf("function");
    expect(previewTimeGetter?.call({ previewMasterTime: () => 4.25 })).toBe(4.25);

    const onPreviewTime = vi.fn();
    const fake = {
      callbacks: { onPreviewTime },
      lastPreviewTimeCallbackAt: Number.NEGATIVE_INFINITY,
      lastPreviewTimeCallbackValue: null as number | null,
      previewMasterTime: vi.fn(() => 1),
    };
    const emitPreviewTime = (
      CinematicCarousel.prototype as unknown as {
        emitPreviewTime(this: typeof fake, now: number, force?: boolean): void;
      }
    ).emitPreviewTime;

    emitPreviewTime.call(fake, 0);
    emitPreviewTime.call(fake, PREVIEW_TIME_CALLBACK_INTERVAL_MS - 1);
    emitPreviewTime.call(fake, PREVIEW_TIME_CALLBACK_INTERVAL_MS);
    expect(onPreviewTime).toHaveBeenCalledTimes(1);

    fake.previewMasterTime.mockReturnValue(2);
    emitPreviewTime.call(fake, PREVIEW_TIME_CALLBACK_INTERVAL_MS * 2);
    expect(onPreviewTime).toHaveBeenLastCalledWith(2);
    expect(onPreviewTime).toHaveBeenCalledTimes(2);

    emitPreviewTime.call(fake, PREVIEW_TIME_CALLBACK_INTERVAL_MS * 2 + 1, true);
    expect(onPreviewTime).toHaveBeenCalledTimes(3);
  });

  it("lets reduced-motion users choose a deterministic held frame", () => {
    const fake = {
      disposed: false,
      exportActive: false,
      elapsed: 0,
      previewSeekOverride: null as number | null,
      performanceTimeline: { totalDuration: 10 },
      reducedMotionPreview: true,
      presenterReducedMotionMasterTime: null as number | null,
      syncPresenterPlayback: vi.fn(),
      renderPreview: vi.fn(),
      emitPreviewTime: vi.fn(),
    };
    const seekPreview = CinematicCarousel.prototype.seekPreview as unknown as (
      this: typeof fake,
      time: number,
    ) => number;
    seekPreview.call(fake, 8);
    expect(fake.presenterReducedMotionMasterTime).toBe(8);
  });
});
