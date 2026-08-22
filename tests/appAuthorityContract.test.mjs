import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const stageSource = readFileSync(new URL("../src/components/Stage.tsx", import.meta.url), "utf8");

describe("App Project V4 authority contract", () => {
  it("constructs and updates the renderer through explicit V2 and V1 authority lanes", () => {
    expect(appSource).toContain('{ kind: "project-v4" as const, project }');
    expect(appSource).toContain('{ kind: "v1-compat" as const, settings: settingsRef.current }');
    expect(appSource).toContain("engine.setV2ProjectState(liveProject, assets)");
    expect(appSource).toContain("engine.setV1CompatibilityState(settings, liveProject, assets)");
    expect(appSource).not.toContain("engine.setProjectState(");
  });

  it("takes V2 stage, pin, and export presentation from the reactive project snapshot", () => {
    expect(appSource).toContain("stagePresentationFromProject(liveProject)");
    expect(appSource).toContain("exportPlanFromProject(liveProject)");
    expect(appSource).toContain("stagePresentation.pinnedAssetId");
    expect(appSource).toContain("session.plan.requireTransparentPixels");
    expect(appSource).toContain("session.plan.presenter.includeAudio");
    expect(appSource).not.toContain("const output = settingsRef.current.output");
    expect(appSource).not.toContain("settingsRef.current.presenter.enabled && pinnedAsset");
  });

  it("keeps Stage free of the legacy StudioSettings projection", () => {
    expect(stageSource).toContain("presentation: StagePresentation");
    expect(stageSource).not.toContain("StudioSettings");
    expect(stageSource).not.toContain("settings.stage");
    expect(stageSource).not.toContain("settings.presenter");
  });
});
