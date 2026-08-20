import { describe, expect, it } from "vitest";
import { cloneSettings, DEFAULT_SETTINGS } from "../src/model";
import { buildDeliveryReceipt } from "../src/preflight";

describe("delivery preflight", () => {
  it("reports exact frame count and the normal opaque path", () => {
    const receipt = buildDeliveryReceipt(DEFAULT_SETTINGS);
    expect(receipt.frameCount).toBe(240);
    expect(receipt.checks.find((check) => check.id === "alpha")).toMatchObject({
      level: "ready",
      label: "Opaque master",
    });
  });

  it("explains transparency without pretending MP4 preserves alpha", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.stage.transparent = true;
    settings.background.style = "transparent";
    const receipt = buildDeliveryReceipt(settings);
    expect(receipt.checks.find((check) => check.id === "alpha")).toMatchObject({
      level: "note",
      label: "Alpha needs PNG",
    });
  });

  it("surfaces the presenter-audio frame-rate conflict before export", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.presenter.enabled = true;
    settings.presenter.assetId = "presenter";
    settings.presenter.muted = false;
    settings.output.fps = 60;
    const receipt = buildDeliveryReceipt(settings);
    expect(receipt.checks.find((check) => check.id === "audio")).toMatchObject({
      level: "warning",
      label: "Presenter audio conflicts with frame rate",
    });
  });

  it("distinguishes free-running and closed-loop masters", () => {
    const free = buildDeliveryReceipt(DEFAULT_SETTINGS);
    expect(free.checks.find((check) => check.id === "closure")?.level).toBe("note");

    const looped = cloneSettings(DEFAULT_SETTINGS);
    looped.motion.seamless = true;
    looped.motion.seamlessLoops = 2;
    expect(buildDeliveryReceipt(looped).checks.find((check) => check.id === "closure")).toMatchObject({
      level: "ready",
      label: "2 closed loops",
    });
  });
});
