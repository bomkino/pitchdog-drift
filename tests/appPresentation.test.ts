import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import {
  exportPlanFromProject,
  exportPlanFromV1Settings,
  stagePresentationFromProject,
  stagePresentationFromV1Settings,
} from "../src/core/project/appPresentation";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";

const NOW = "2026-08-23T00:00:00.000Z";

describe("app Project V4 presentation authority", () => {
  it("reads stage, path, pin, and alpha directly from Project V4", () => {
    const project = createDefaultDriftProjectV4("app-stage-authority", NOW, 17);
    project.composition = { ...project.composition, width: 1080, height: 1920, alphaMode: "transparent" };
    project.motion.transport.axis = "vertical";
    project.motion.path.id = "paper-river";
    project.presenter = { ...project.presenter, enabled: true, assetId: "still-1" };
    project.provenance.world = { id: "road-memory", version: 1, fingerprint: "test" };

    expect(stagePresentationFromProject(project)).toEqual({
      width: 1080,
      height: 1920,
      transparent: true,
      directionLabel: "road memory",
      axis: "vertical",
      pathLabel: "paper river",
      pinnedAssetId: "still-1",
      pinEnabled: true,
    });
  });

  it("builds V2 export truth from composition, master, performance, and presenter domains", () => {
    const project = createDefaultDriftProjectV4("app-export-authority", NOW, 19);
    project.composition = { ...project.composition, width: 2160, height: 3840, alphaMode: "transparent" };
    project.master = {
      fps: 60,
      duration: 13.5,
      reducedMotion: false,
      video: { format: "h264", bitrate: 44_000_000 },
      audio: { enabled: true, bitrate: 256_000 },
    };
    project.presenter = {
      ...project.presenter,
      enabled: true,
      assetId: "voice",
      muted: false,
      gain: 0.72,
      trimStart: 1.25,
      startAt: 0.4,
    };

    const plan = exportPlanFromProject(project);
    expect(plan).toMatchObject({
      width: 2160,
      height: 3840,
      fps: 60,
      duration: 13.5,
      videoBitrate: 44_000_000,
      audioBitrate: 256_000,
      requireTransparentPixels: true,
      presenter: {
        enabled: true,
        assetId: "voice",
        muted: false,
        includeAudio: true,
        gain: 0.72,
        trimStart: 1.25,
        startAt: 0.4,
      },
    });
    expect(plan.performance).toEqual(project.performance);
    expect(plan.performance).not.toBe(project.performance);
  });

  it("keeps StudioSettings behind explicit V1-only adapters", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.stage = { width: 1080, height: 1920, transparent: true };
    settings.background.style = "transparent";
    settings.output = { ...settings.output, width: 1080, height: 1920, fps: 25, duration: 8 };
    settings.presenter = { ...settings.presenter, enabled: true, assetId: "legacy-pin", muted: true };

    expect(stagePresentationFromV1Settings(settings)).toMatchObject({
      width: 1080,
      height: 1920,
      transparent: true,
      pinnedAssetId: "legacy-pin",
      pinEnabled: true,
    });
    expect(exportPlanFromV1Settings(settings)).toMatchObject({
      width: 1080,
      height: 1920,
      fps: 25,
      duration: 8,
      presenter: { enabled: true, assetId: "legacy-pin", muted: true, includeAudio: false },
    });
  });
});
