import { describe, expect, it } from "vitest";
import { cloneSettings, DEFAULT_SETTINGS } from "../src/model";
import { validateStudioSettings } from "../src/lib/settingsValidation";
import { WORKFLOW_PRESETS, applyWorkflowPreset } from "../src/workflows";

describe("authored starting cuts", () => {
  it("offers six materially distinct, valid workflows", () => {
    expect(WORKFLOW_PRESETS).toHaveLength(6);
    expect(new Set(WORKFLOW_PRESETS.map((preset) => preset.id)).size).toBe(WORKFLOW_PRESETS.length);
    expect(new Set(WORKFLOW_PRESETS.map((preset) => [
      preset.themeId,
      preset.stage.width,
      preset.stage.height,
      preset.output.duration,
      preset.motion.axis,
      preset.motion.flow,
      preset.presenter,
    ].join("|"))).size).toBe(WORKFLOW_PRESETS.length);

    for (const preset of WORKFLOW_PRESETS) {
      const source = cloneSettings(DEFAULT_SETTINGS);
      const result = applyWorkflowPreset(source, preset);
      expect(validateStudioSettings(result)).toEqual(result);
      expect(result.stage.width).toBe(result.output.width);
      expect(result.stage.height).toBe(result.output.height);
      expect(source).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("features existing pinned media without inventing a missing presenter", () => {
    const withoutMedia = applyWorkflowPreset(DEFAULT_SETTINGS, WORKFLOW_PRESETS[1]!);
    expect(withoutMedia.presenter).toMatchObject({ enabled: false, assetId: null });

    const source = cloneSettings(DEFAULT_SETTINGS);
    source.presenter.enabled = true;
    source.presenter.assetId = "presenter-one";
    const withMedia = applyWorkflowPreset(source, WORKFLOW_PRESETS[1]!);
    expect(withMedia.presenter).toMatchObject({
      enabled: true,
      assetId: "presenter-one",
      x: 0.74,
      y: 0.24,
      width: 0.32,
    });
  });

  it("makes deck-only recipes explicitly unpin presenter media", () => {
    const source = cloneSettings(DEFAULT_SETTINGS);
    source.presenter.enabled = true;
    source.presenter.assetId = "presenter-one";
    for (const preset of WORKFLOW_PRESETS.filter((candidate) => candidate.presenter === "off")) {
      const result = applyWorkflowPreset(source, preset);
      expect(result.presenter).toMatchObject({ enabled: false, assetId: null });
    }
  });
});
