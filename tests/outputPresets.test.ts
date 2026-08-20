import { describe, expect, it } from "vitest";
import {
  OUTPUT_PRESETS,
  OUTPUT_PRESET_IDS,
  applyOutputPreset,
  assessOutputReadiness,
  estimateMp4Bytes,
  findOutputPreset,
  formatBytes,
} from "../src/outputPresets";
import { cloneSettings, DEFAULT_SETTINGS, type StudioAsset } from "../src/model";

function image(id = "slide", width = 1920, height = 1080): StudioAsset {
  return { id, name: `${id}.png`, kind: "image", blob: new Blob(), mimeType: "image/png", width, height, objectUrl: `blob:${id}` };
}

function presenter(): StudioAsset {
  return { ...image("presenter", 1080, 1920), kind: "video", mimeType: "video/mp4", duration: 8 };
}

describe("publishing masters", () => {
  it("covers five authored destinations without duplicate dimensions", () => {
    expect(OUTPUT_PRESETS.map((preset) => preset.id)).toEqual(OUTPUT_PRESET_IDS);
    expect(new Set(OUTPUT_PRESETS.map((preset) => `${preset.width}x${preset.height}@${preset.fps}`)).size).toBe(5);
  });

  it("applies the output and stage frame together while preserving the rest of the cut", () => {
    const current = cloneSettings(DEFAULT_SETTINGS);
    current.output.duration = 13;
    current.presenter.enabled = true;
    const next = applyOutputPreset(current, "cinema");
    expect(next.stage).toEqual({ ...current.stage, width: 1920, height: 804 });
    expect(next.output).toMatchObject({ width: 1920, height: 804, fps: 24, duration: 13 });
    expect(next.presenter).toEqual(current.presenter);
    expect(findOutputPreset(next)).toBe("cinema");
  });

  it("estimates the master before an encoder or file picker is opened", () => {
    expect(estimateMp4Bytes(DEFAULT_SETTINGS, false)).toBe(16_000_000);
    expect(estimateMp4Bytes(DEFAULT_SETTINGS, true)).toBe(16_192_000);
    expect(formatBytes(16_192_000)).toBe("16.2 MB");
  });

  it("blocks impossible H.264 states before export begins", () => {
    const empty = assessOutputReadiness(DEFAULT_SETTINGS, { slideCount: 0, slides: [], pinnedAsset: null, mp4Supported: true });
    expect(empty.status).toBe("blocked");
    expect(empty.checks.find((check) => check.id === "slides")?.status).toBe("blocked");

    const transparent = cloneSettings(DEFAULT_SETTINGS);
    transparent.stage.transparent = true;
    transparent.background.style = "transparent";
    const alpha = assessOutputReadiness(transparent, { slideCount: 1, slides: [image()], pinnedAsset: null, mp4Supported: true });
    expect(alpha.status).toBe("blocked");
    expect(alpha.blockingReason).toContain("alpha");
  });

  it("blocks unavailable encoders and unverifiable high-frame-rate presenter audio", () => {
    const unsupported = assessOutputReadiness(DEFAULT_SETTINGS, { slideCount: 1, slides: [image()], pinnedAsset: null, mp4Supported: false });
    expect(unsupported.checks.find((check) => check.id === "encoder")?.status).toBe("blocked");

    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.presenter.enabled = true;
    settings.presenter.assetId = "presenter";
    settings.presenter.muted = false;
    settings.output.fps = 60;
    const audio = assessOutputReadiness(settings, { slideCount: 1, slides: [image()], pinnedAsset: presenter(), mp4Supported: true });
    expect(audio.checks.find((check) => check.id === "audio")?.status).toBe("blocked");
  });

  it("keeps deterministic but open-ended cuts exportable with a visible warning", () => {
    const readiness = assessOutputReadiness(DEFAULT_SETTINGS, { slideCount: 2, slides: [image("a"), image("b")], pinnedAsset: null, mp4Supported: true });
    expect(readiness.status).toBe("warning");
    expect(readiness.checks.find((check) => check.id === "loop")?.label).toBe("Open-ended cut");
  });
});
