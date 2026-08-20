import { describe, expect, it } from "vitest";
import {
  EDITORIAL_CUTS,
  analyzeEditorialDelivery,
  applyEditorialCut,
  closeAtCutTempo,
  detectEditorialCut,
} from "../src/editorialCuts";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";

describe("editorial cuts", () => {
  it("offers four materially distinct user-facing cuts", () => {
    expect(EDITORIAL_CUTS.map((cut) => cut.name)).toEqual([
      "Explainer Cut",
      "Paper Argument",
      "Clean Data",
      "Documentary Glide",
    ]);
    expect(new Set(EDITORIAL_CUTS.map((cut) => JSON.stringify(cut.motion))).size).toBe(4);
  });

  it("changes authored motion while preserving delivery, atmosphere, media, and accessibility choices", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 3;
    settings.motion.reducedMotionOutput = true;
    settings.motion.autoplay = false;
    settings.background.seed = 943;
    settings.output.duration = 17;
    settings.presenter.assetId = "presenter";
    settings.presenter.enabled = true;

    const before = structuredClone(settings);
    const next = applyEditorialCut(settings, "clean-data");
    expect(settings).toEqual(before);
    expect(next.motion.flow).toBe("editorial");
    expect(next.motion.speed).toBe(0.62);
    expect(next.motion.seamless).toBe(true);
    expect(next.motion.seamlessLoops).toBe(3);
    expect(next.motion.reducedMotionOutput).toBe(true);
    expect(next.motion.autoplay).toBe(false);
    expect(next.output).toEqual(settings.output);
    expect(next.background).toEqual(settings.background);
    expect(next.presenter).toEqual(settings.presenter);
  });

  it("detects an exact cut and reports custom after a manual edit", () => {
    const settings = applyEditorialCut(cloneSettings(DEFAULT_SETTINGS), "paper-argument");
    expect(detectEditorialCut(settings)).toBe("paper-argument");
    settings.motion.tilt += 0.5;
    expect(detectEditorialCut(settings)).toBeNull();
  });
});

describe("editorial delivery analysis", () => {
  it("reports partial and complete-open free-running masters", () => {
    const settings = applyEditorialCut(cloneSettings(DEFAULT_SETTINGS), "explainer-cut");
    settings.output.duration = 8;
    expect(analyzeEditorialDelivery(settings, 8)).toMatchObject({
      status: "partial",
      coveredSlides: 4,
      coveredPasses: 0.5,
    });

    settings.output.duration = 20;
    expect(analyzeEditorialDelivery(settings, 8)).toMatchObject({
      status: "complete-open",
      coveredSlides: 10,
      coveredPasses: 1.25,
    });
  });

  it("distinguishes a genuinely tempo-safe closure from a silently retimed one", () => {
    const settings = applyEditorialCut(cloneSettings(DEFAULT_SETTINGS), "explainer-cut");
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 1;
    settings.output.duration = 16;
    expect(analyzeEditorialDelivery(settings, 8)).toMatchObject({
      status: "closed",
      effectiveSpeed: 0.5,
      paceRatio: 1,
    });

    settings.output.duration = 8;
    expect(analyzeEditorialDelivery(settings, 8)).toMatchObject({
      status: "retimed",
      effectiveSpeed: 1,
      paceRatio: 2,
    });
  });

  it("marks closure above the exposed director ceiling as rushed", () => {
    const settings = applyEditorialCut(cloneSettings(DEFAULT_SETTINGS), "clean-data");
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 3;
    settings.output.duration = 8;
    expect(analyzeEditorialDelivery(settings, 8)).toMatchObject({
      status: "rushed",
      effectiveSpeed: 3,
    });
  });

  it("repairs delivery at the authored cut tempo", () => {
    const settings = applyEditorialCut(cloneSettings(DEFAULT_SETTINGS), "explainer-cut");
    settings.output.duration = 8;
    const repair = closeAtCutTempo(settings, 8);
    expect(repair.available).toBe(true);
    expect(repair.loops).toBe(1);
    expect(repair.duration).toBe(16);
    expect(repair.settings.motion.seamless).toBe(true);
    expect(analyzeEditorialDelivery(repair.settings, 8).status).toBe("closed");
  });

  it("adds short loops for tiny decks rather than stretching one slide into dead air", () => {
    const settings = applyEditorialCut(cloneSettings(DEFAULT_SETTINGS), "clean-data");
    settings.motion.seamlessLoops = 1;
    const repair = closeAtCutTempo(settings, 1);
    expect(repair.available).toBe(true);
    expect(repair.loops).toBeGreaterThan(1);
    expect(repair.duration).toBeGreaterThanOrEqual(3);
    expect(repair.duration).toBeLessThanOrEqual(30);
  });

  it("reduces impossible requested loop counts before changing authored tempo", () => {
    const settings = applyEditorialCut(cloneSettings(DEFAULT_SETTINGS), "documentary-glide");
    settings.motion.seamlessLoops = 6;
    const repair = closeAtCutTempo(settings, 6);
    expect(repair.available).toBe(true);
    expect(repair.loops).toBe(1);
    expect(repair.duration).toBeCloseTo(21.4, 1);
  });


  it("repairs every feasible cut/source/loop combination into a tempo-safe closure", () => {
    for (const cut of EDITORIAL_CUTS) {
      for (let sourceCount = 1; sourceCount <= 30; sourceCount += 1) {
        for (let requestedLoops = 1; requestedLoops <= 6; requestedLoops += 1) {
          const settings = applyEditorialCut(cloneSettings(DEFAULT_SETTINGS), cut.id);
          settings.motion.seamlessLoops = requestedLoops;
          settings.output.duration = 8;
          const repair = closeAtCutTempo(settings, sourceCount);
          if (!repair.available) {
            expect(sourceCount / cut.motion.speed).toBeGreaterThan(30);
            continue;
          }
          expect(repair.duration).toBeGreaterThanOrEqual(3);
          expect(repair.duration).toBeLessThanOrEqual(30);
          expect(repair.loops).toBeGreaterThanOrEqual(1);
          expect(repair.loops).toBeLessThanOrEqual(6);
          expect(analyzeEditorialDelivery(repair.settings, sourceCount).status).toBe("closed");
        }
      }
    }
  });


  it("does not score legacy paths as an approved editorial cut", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    expect(settings.motion.flow).toBe("ribbon");
    expect(analyzeEditorialDelivery(settings, 8)).toMatchObject({
      status: "unscored",
      canRepair: false,
    });
  });

  it("reports an explicit reduced-motion master as still instead of falsely closed", () => {
    const settings = applyEditorialCut(cloneSettings(DEFAULT_SETTINGS), "explainer-cut");
    settings.motion.reducedMotionOutput = true;
    settings.motion.seamless = true;
    settings.output.duration = 16;
    expect(analyzeEditorialDelivery(settings, 8)).toMatchObject({
      status: "still",
      label: "Reduced-motion master",
      effectiveSpeed: 0,
      canRepair: false,
    });
    expect(closeAtCutTempo(settings, 8)).toMatchObject({ available: false });
  });

  it("fails closed for empty, still, and malformed delivery inputs", () => {
    const settings = applyEditorialCut(cloneSettings(DEFAULT_SETTINGS), "explainer-cut");
    expect(analyzeEditorialDelivery(settings, Number.NaN).status).toBe("empty");
    expect(analyzeEditorialDelivery(settings, -4).status).toBe("empty");
    settings.motion.speed = 0;
    expect(analyzeEditorialDelivery(settings, 8).status).toBe("still");
    expect(closeAtCutTempo(settings, 8).available).toBe(false);
    settings.motion.seamlessLoops = Number.NaN;
    settings.motion.speed = 0.5;
    expect(closeAtCutTempo(settings, 8).loops).toBe(1);
  });

  it("recommends chapters when even one readable pass exceeds the editor range", () => {
    const settings = applyEditorialCut(cloneSettings(DEFAULT_SETTINGS), "documentary-glide");
    const repair = closeAtCutTempo(settings, 40);
    expect(repair.available).toBe(false);
    expect(repair.reason).toContain("chapters");
  });
});
