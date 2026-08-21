import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import { migrateLegacyStudioProject, type LegacyAssetDescriptor } from "../src/core/project/migrateLegacy";
import {
  reconcileStudioProject,
  studioSettingsFromDriftProject,
} from "../src/core/project/studioProjection";
import type { AssetDescriptor } from "../src/core/project/schema";

const slideA: LegacyAssetDescriptor = {
  id: "slide-a",
  name: "A.png",
  kind: "image",
  mimeType: "image/png",
  width: 1920,
  height: 1080,
  hash: "a".repeat(64),
  byteLength: 1_024,
};

const slideB: AssetDescriptor = {
  id: "slide-b",
  name: "B.png",
  kind: "image",
  mimeType: "image/png",
  width: 1080,
  height: 1920,
  hash: "b".repeat(64),
  byteLength: 2_048,
};

const presenter: AssetDescriptor = {
  id: "presenter",
  name: "Presenter.mp4",
  kind: "video",
  mimeType: "video/mp4",
  width: 1080,
  height: 1920,
  duration: 8,
  hash: "c".repeat(64),
  byteLength: 4_096,
};

function legacyProject() {
  const settings = cloneSettings(DEFAULT_SETTINGS);
  settings.themeId = "dread";
  settings.motion.axis = "horizontal";
  settings.motion.direction = 1;
  settings.motion.flow = "tunnel";
  settings.motion.speed = 0.27;
  settings.motion.gap = 0.31;
  settings.motion.curvature = 0.62;
  settings.motion.depth = 0.44;
  settings.motion.tilt = 7;
  settings.motion.distortion = 0.38;
  settings.motion.focusScale = 0.12;
  settings.motion.edgeFade = 0.41;
  settings.motion.seamless = true;
  settings.motion.seamlessLoops = 2;
  settings.slide.fit = "contain";
  settings.slide.focalX = 0.23;
  settings.slide.focalY = 0.71;
  settings.background.style = "void";
  settings.background.seed = 37;
  settings.output.width = 1920;
  settings.output.height = 1080;
  settings.output.fps = 24;
  settings.output.duration = 12;

  return {
    settings,
    project: migrateLegacyStudioProject({
      projectId: "project-a",
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
      settings,
      slideAssets: [slideA],
    }),
  };
}

describe("Project V3 studio projection", () => {
  it("round-trips every legacy-rendered field without reapplying a mutable world", () => {
    const { settings, project } = legacyProject();
    const projected = studioSettingsFromDriftProject(project);

    expect(project.provenance.world).toMatchObject({
      id: "dread",
      version: 1,
      fingerprint: "legacy-theme:dread",
    });
    expect(project.lens.enabled).toBe(false);
    expect(project.sound.exportEnabled).toBe(false);
    expect(project.slides["slide-a"]).toMatchObject({
      fit: "contain",
      focalX: 0.23,
      focalY: 0.71,
    });

    expect(projected.themeId).toBe(settings.themeId);
    expect(projected.stage).toEqual({ width: 1920, height: 1080, transparent: false });
    expect(projected.motion).toMatchObject({
      axis: "horizontal",
      direction: 1,
      speed: 0.27,
      flow: "tunnel",
      gap: 0.31,
      curvature: 0.62,
      depth: 0.44,
      tilt: 7,
      distortion: 0.38,
      focusScale: 0.12,
      edgeFade: 0.41,
      seamless: true,
      seamlessLoops: 2,
    });
    expect(projected.slide).toMatchObject({
      fit: "contain",
      focalX: 0.23,
      focalY: 0.71,
    });
    expect(projected.background).toMatchObject({ style: "void", seed: 37 });
    expect(projected.output).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 24,
      duration: 12,
    });
  });

  it("updates supported studio domains while preserving richer hidden direction", () => {
    const { settings, project } = legacyProject();
    project.lens = {
      ...project.lens,
      enabled: true,
      characterId: "night-terror",
      presence: 0.74,
      bloom: 0.28,
    };
    project.sound = {
      ...project.sound,
      source: "recorded",
      material: "paper",
      grammar: "organic",
      texture: 0.83,
      exportEnabled: true,
    };
    project.lighting.presetId = "noir-slice";
    project.lighting.keyColor = "#e8f0ff";
    project.slides["slide-a"]!.scaleOffset = 0.18;

    const edited = cloneSettings(settings);
    edited.themeId = "road-memory";
    edited.slide.fit = "cover";
    edited.slide.focalX = 0.82;
    edited.slide.focalY = 0.15;
    edited.slide.shadowOpacity = 0.57;
    edited.slide.shadowSoftness = 67;
    edited.background.style = "gradient";
    edited.background.colorA = "#101820";
    edited.background.colorB = "#4a6a78";
    edited.background.accent = "#ffcc88";
    edited.output.width = 1080;
    edited.output.height = 1350;
    edited.presenter.enabled = true;
    edited.presenter.assetId = presenter.id;
    edited.presenter.muted = false;

    const reconciled = reconcileStudioProject({
      project,
      settings: edited,
      slideAssets: [project.media.assets["slide-a"]!, slideB],
      presenterAsset: presenter,
      updatedAt: "2026-08-21T01:00:00.000Z",
    });

    expect(reconciled.updatedAt).toBe("2026-08-21T01:00:00.000Z");
    expect(reconciled.composition).toMatchObject({ width: 1080, height: 1350, alphaMode: "opaque" });
    expect(reconciled.media.order).toEqual(["slide-a", "slide-b"]);
    expect(reconciled.media.presenterAssetId).toBe("presenter");
    expect(Object.keys(reconciled.media.assets).sort()).toEqual(["presenter", "slide-a", "slide-b"]);

    expect(reconciled.slides["slide-a"]).toMatchObject({
      fit: "contain",
      focalX: 0.23,
      focalY: 0.71,
      scaleOffset: 0.18,
    });
    expect(reconciled.slides["slide-b"]).toMatchObject({
      fit: "cover",
      focalX: 0.82,
      focalY: 0.15,
      scaleOffset: 0,
    });

    expect(reconciled.lens).toMatchObject({
      enabled: true,
      characterId: "night-terror",
      presence: 0.74,
      bloom: 0.28,
    });
    expect(reconciled.sound).toMatchObject({
      material: "paper",
      grammar: "organic",
      texture: 0.83,
      exportEnabled: true,
    });
    expect(reconciled.lighting).toMatchObject({
      presetId: "noir-slice",
      keyColor: "#e8f0ff",
      shadowOpacity: 0.57,
      shadowSoftness: 67,
    });
    expect(reconciled.atmosphere).toMatchObject({
      family: "gradient",
      colourA: "#101820",
      colourB: "#4a6a78",
      accent: "#ffcc88",
    });
    expect(reconciled.presenter.enabled).toBe(true);
    expect(reconciled.provenance.world).toMatchObject({
      id: "road-memory",
      fingerprint: "legacy-theme:road-memory",
    });
  });

  it("falls back visibly when a future path or atmosphere has no legacy renderer", () => {
    const { project } = legacyProject();
    project.motion.path.id = "figure-eight";
    project.atmosphere.family = "emulsion";
    const projected = studioSettingsFromDriftProject(project);

    expect(projected.motion.flow).toBe("straight");
    expect(projected.background.style).toBe("aura");
    expect(project.motion.path.id).toBe("figure-eight");
    expect(project.atmosphere.family).toBe("emulsion");
  });
});
