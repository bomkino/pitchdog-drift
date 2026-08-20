import { describe, expect, it } from "vitest";
import { cloneSettings, DEFAULT_SETTINGS } from "../src/model";
import {
  EMPTY_DIRECTOR_HISTORY,
  applyDirectorLook,
  captureDirectorLook,
  recordDirectorChange,
  redoDirectorChange,
  settingsChangeSignature,
  settingsEqual,
  undoDirectorChange,
} from "../src/lib/directorSession";

describe("director session safety", () => {
  it("captures only the authored look and preserves delivery and pinned media on recall", () => {
    const source = cloneSettings(DEFAULT_SETTINGS);
    source.motion.speed = 0.77;
    source.background.seed = 404;
    const look = captureDirectorLook(source);

    const current = cloneSettings(DEFAULT_SETTINGS);
    current.stage.width = 1920;
    current.stage.height = 1080;
    current.output.width = 1920;
    current.output.height = 1080;
    current.output.duration = 19;
    current.presenter.enabled = true;
    current.presenter.assetId = "presenter";
    current.motion.autoplay = false;
    current.motion.dragSensitivity = 2.4;
    current.motion.seamless = true;
    current.motion.seamlessLoops = 3;
    current.motion.reducedMotionOutput = true;

    const recalled = applyDirectorLook(current, look);
    expect(recalled.motion.speed).toBe(0.77);
    expect(recalled.background.seed).toBe(404);
    expect(recalled.stage).toMatchObject({ width: 1920, height: 1080 });
    expect(recalled.output.duration).toBe(19);
    expect(recalled.presenter).toMatchObject({ enabled: true, assetId: "presenter" });
    expect(recalled.motion).toMatchObject({ autoplay: false, dragSensitivity: 2.4, seamless: true, seamlessLoops: 3, reducedMotionOutput: true });
  });

  it("coalesces one slider gesture into one undo step", () => {
    const start = cloneSettings(DEFAULT_SETTINGS);
    const first = cloneSettings(start);
    first.motion.speed = 0.4;
    const signature = settingsChangeSignature(start, first);
    const afterFirst = recordDirectorChange(EMPTY_DIRECTOR_HISTORY, start, signature, 100);
    const afterSecond = recordDirectorChange(afterFirst, first, signature, 500);

    expect(afterFirst.past).toHaveLength(1);
    expect(afterSecond.past).toHaveLength(1);
    expect(afterSecond.future).toHaveLength(0);
  });

  it("keeps separate actions separate and supports a lossless undo/redo roundtrip", () => {
    const start = cloneSettings(DEFAULT_SETTINGS);
    const speed = cloneSettings(start);
    speed.motion.speed = 0.72;
    const radius = cloneSettings(speed);
    radius.slide.radius = 88;

    let history = recordDirectorChange(
      EMPTY_DIRECTOR_HISTORY,
      start,
      settingsChangeSignature(start, speed),
      100,
    );
    history = recordDirectorChange(
      history,
      speed,
      settingsChangeSignature(speed, radius),
      2_000,
    );
    expect(history.past).toHaveLength(2);

    const undone = undoDirectorChange(history, radius);
    expect(undone.settings).toEqual(speed);
    const redone = redoDirectorChange(undone.history, undone.settings!);
    expect(redone.settings).toEqual(radius);
    expect(settingsEqual(redone.settings!, radius)).toBe(true);
  });

  it("reports stable leaf-level change signatures", () => {
    const next = cloneSettings(DEFAULT_SETTINGS);
    next.motion.speed = 0.5;
    next.slide.radius = 90;
    expect(settingsChangeSignature(DEFAULT_SETTINGS, next)).toBe("motion.speed|slide.radius");
    expect(settingsEqual(DEFAULT_SETTINGS, cloneSettings(DEFAULT_SETTINGS))).toBe(true);
  });
});
