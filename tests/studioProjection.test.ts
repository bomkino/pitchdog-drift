import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import {
  migrateLegacyStudioProject,
  migrateLegacyStudioProjectToV4,
  type LegacyAssetDescriptor,
} from "../src/core/project/migrateLegacy";
import { migrateDriftProjectV3ToV4 } from "../src/core/project/migrateV3ToV4";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import {
  reconcileStudioProject,
  studioSettingsFromDriftProject,
} from "../src/core/project/studioProjection";
import type { AssetDescriptor } from "../src/core/project/schema";
import { applyEditorialDriftFoundation } from "../src/core/worlds";
import { resetPinnedFrameComposition } from "../src/core/presenter/activation";
import { resolveMovingTrackAssets } from "../src/engine/CinematicCarousel";
import { createDriftProjectPayload, parseStudioProjectPayload } from "../src/lib/studioProjectPayload";
import type { StudioAsset } from "../src/model";

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

describe("Project V3/V4 studio projection", () => {
  it("keeps the V4 compatibility envelope intact through a visible studio edit", () => {
    const { settings, project } = legacyProject();
    const v4 = migrateDriftProjectV3ToV4(project);
    v4.extensions = { "dog.pitch.test": { note: "preserve me" } };

    expect(studioSettingsFromDriftProject(v4)).toMatchObject({
      themeId: settings.themeId,
      motion: { flow: settings.motion.flow },
    });

    const reconciled = reconcileStudioProject({
      project: v4,
      settings: { ...settings, motion: { ...settings.motion, speed: 0.52 } },
      slideAssets: [v4.media.assets["slide-a"]!],
      updatedAt: "2026-08-21T00:30:00.000Z",
    });
    expect(reconciled).toMatchObject({
      formatVersion: 4,
      renderContract: "drift-v1-compat/1",
      migration: { sourceFormat: "project-v3", migrator: "drift-project-v4/1" },
      extensions: { "dog.pitch.test": { note: "preserve me" } },
      motion: { transport: { slidesPerSecond: 0.52 } },
      performance: {
        entry: { enabled: true },
        body: { durationSeconds: 12 - 0.72 - 0.56, tempo: { kind: "preset", preset: "fast-slow-fast" } },
        exit: { enabled: true },
      },
    });
  });

  it("round-trips authored V4 lifecycle while V3 projection stays compatibility-only", () => {
    const { project } = legacyProject();
    expect(studioSettingsFromDriftProject(project).performance).toMatchObject({
      entry: { enabled: false },
      body: { durationSeconds: 12, tempo: { kind: "preset", preset: "even" } },
      exit: { enabled: false },
    });

    const v4 = migrateDriftProjectV3ToV4(project);
    const settings = studioSettingsFromDriftProject(v4);
    settings.performance = structuredClone(DEFAULT_SETTINGS.performance);
    settings.output.duration = 8;
    const reconciled = reconcileStudioProject({
      project: v4,
      settings,
      slideAssets: [v4.media.assets["slide-a"]!],
      updatedAt: "2026-08-21T00:45:00.000Z",
    });
    expect(reconciled.performance).toEqual(DEFAULT_SETTINGS.performance);
    expect(reconciled.master.duration).toBe(8);
    expect(studioSettingsFromDriftProject(reconciled).performance).toEqual(DEFAULT_SETTINGS.performance);
  });

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

  it("applies visible deck-wide direction while preserving richer hidden values", () => {
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
      fit: "cover",
      focalX: 0.82,
      focalY: 0.15,
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

  it("preserves distinct per-slide direction when the deck-wide controls did not change", () => {
    const { project } = legacyProject();
    project.media.order.push(slideB.id);
    project.media.assets[slideB.id] = slideB;
    project.slides[slideB.id] = {
      assetId: slideB.id,
      fit: "cover",
      focalX: 0.91,
      focalY: 0.12,
      scaleOffset: -0.08,
    };
    const settings = studioSettingsFromDriftProject(project);
    settings.motion.speed = 0.48;

    const reconciled = reconcileStudioProject({
      project,
      settings,
      slideAssets: [project.media.assets[slideA.id]!, slideB],
      updatedAt: "2026-08-21T01:10:00.000Z",
    });

    expect(reconciled.slides[slideA.id]).toEqual(project.slides[slideA.id]);
    expect(reconciled.slides[slideB.id]).toEqual(project.slides[slideB.id]);
  });

  it("falls back visibly without overwriting dormant future direction on an unrelated edit", () => {
    const { project } = legacyProject();
    project.motion.path.id = "figure-eight";
    project.atmosphere.family = "emulsion";
    project.provenance.world = {
      id: "future-world",
      version: 7,
      fingerprint: "future-world:7",
    };
    const v4 = migrateDriftProjectV3ToV4(project);
    const projected = studioSettingsFromDriftProject(v4);

    expect(projected.motion.flow).toBe("straight");
    expect(projected.background.style).toBe("aura");
    expect(projected.themeId).toBe("editorial-drift");

    const unrelatedEdit = cloneSettings(projected);
    unrelatedEdit.motion.speed = 0.42;
    const preserved = reconcileStudioProject({
      project: v4,
      settings: unrelatedEdit,
      slideAssets: [v4.media.assets["slide-a"]!],
      updatedAt: "2026-08-21T02:00:00.000Z",
    });
    expect(preserved.motion.path.id).toBe("figure-eight");
    expect(preserved.atmosphere.family).toBe("emulsion");
    expect(preserved.provenance.world?.id).toBe("future-world");

    const explicitDirection = cloneSettings(projected);
    explicitDirection.motion.flow = "ribbon";
    explicitDirection.background.style = "paper";
    explicitDirection.themeId = "tender-light";
    const replaced = reconcileStudioProject({
      project: v4,
      settings: explicitDirection,
      slideAssets: [v4.media.assets["slide-a"]!],
      updatedAt: "2026-08-21T02:00:00.000Z",
    });
    expect(replaced.motion.path.id).toBe("ribbon");
    expect(replaced.atmosphere.family).toBe("paper");
    expect(replaced.provenance.world?.id).toBe("tender-light");
  });

  it("dissolves drifted World provenance while retaining truthful untouched recipes", () => {
    const world = applyEditorialDriftFoundation(
      createDefaultDriftProjectV4("world-custom", "2026-08-21T02:30:00.000Z"),
      "9:16",
      "2026-08-21T02:30:00.000Z",
    );
    const settings = studioSettingsFromDriftProject(world);
    settings.motion.speed += 0.07;

    const reconciled = reconcileStudioProject({
      project: world,
      settings,
      slideAssets: [],
      updatedAt: "2026-08-21T02:31:00.000Z",
    });

    expect(world.provenance.recipes.motion).not.toBeNull();
    expect(reconciled.provenance.recipes.motion).toBeNull();
    expect(reconciled.provenance.recipes.card).toEqual(world.provenance.recipes.card);
    expect(reconciled.provenance.world).toBeNull();
    expect(reconciled.provenance.worldVariant).toBe("custom");
  });

  it("preserves authored World identity through a no-op studio projection", () => {
    const world = applyEditorialDriftFoundation(
      createDefaultDriftProjectV4("world-round-trip", "2026-08-21T02:40:00.000Z"),
      "9:16",
      "2026-08-21T02:40:00.000Z",
    );
    const reconciled = reconcileStudioProject({
      project: world,
      settings: studioSettingsFromDriftProject(world),
      slideAssets: [],
      updatedAt: world.updatedAt,
    });

    expect(reconciled.provenance.world).toEqual(world.provenance.world);
    expect(reconciled.provenance.worldVariant).toBe("restrained");
    expect(reconciled.provenance.recipes).toEqual(world.provenance.recipes);
    expect(reconciled.material.finish.localSmear).toBe(0.04);
  });

  it("preserves authored World identity when only the slide-media tuple changes", () => {
    const world = applyEditorialDriftFoundation(
      createDefaultDriftProjectV4("world-new-media", "2026-08-21T02:45:00.000Z"),
      "9:16",
      "2026-08-21T02:45:00.000Z",
    );
    const reconciled = reconcileStudioProject({
      project: world,
      settings: studioSettingsFromDriftProject(world),
      slideAssets: [slideB],
      updatedAt: "2026-08-21T02:46:00.000Z",
    });

    expect(reconciled.media.order).toEqual([slideB.id]);
    expect(reconciled.provenance.world).toEqual(world.provenance.world);
    expect(reconciled.provenance.worldVariant).toBe("restrained");
    expect(reconciled.provenance.recipes).toEqual(world.provenance.recipes);
    expect(reconciled.atmosphere).toEqual(world.atmosphere);
    expect(reconciled.material).toEqual(world.material);
  });

  it("does not let pin controls flatten unrelated authored World domains", () => {
    const foundation = applyEditorialDriftFoundation(
      createDefaultDriftProjectV4("world-pin", "2026-08-21T02:47:00.000Z"),
      "9:16",
      "2026-08-21T02:47:00.000Z",
    );
    const withMedia = reconcileStudioProject({
      project: foundation,
      settings: studioSettingsFromDriftProject(foundation),
      slideAssets: [slideB],
      updatedAt: "2026-08-21T02:48:00.000Z",
    });
    const settings = studioSettingsFromDriftProject(withMedia);
    settings.presenter = {
      ...settings.presenter,
      enabled: true,
      assetId: slideB.id,
      x: 0.91,
      y: 0.62,
      width: 0.28,
    };

    const pinned = reconcileStudioProject({
      project: withMedia,
      settings,
      slideAssets: [slideB],
      updatedAt: "2026-08-21T02:49:00.000Z",
    });

    expect(pinned.presenter).toMatchObject({ enabled: true, assetId: slideB.id, x: 0.91, y: 0.62, width: 0.28 });
    expect(pinned.provenance).toEqual(withMedia.provenance);
    for (const domain of ["motion", "card", "material", "lighting", "atmosphere", "lens"] as const) {
      expect(pinned[domain]).toEqual(withMedia[domain]);
    }
  });

  it("makes an unchanged hydrated V4 tuple lossless even when visible controls hide authored values", () => {
    const project = createDefaultDriftProjectV4(
      "lossless-hydration",
      "2026-08-21T02:50:00.000Z",
    );
    project.media = {
      order: [slideB.id],
      presenterAssetId: presenter.id,
      assets: {
        [slideB.id]: slideB,
        [presenter.id]: presenter,
      },
    };
    project.slides[slideB.id] = {
      assetId: slideB.id,
      fit: "contain",
      focalX: 0.37,
      focalY: 0.61,
      scaleOffset: 0.08,
    };
    project.card.defaultFit = "cover";
    project.composition.alphaMode = "opaque";
    project.atmosphere.enabled = false;
    project.atmosphere.family = "void";
    project.lighting.enabled = false;
    project.lighting.shadowOpacity = 0.73;
    project.presenter = {
      ...project.presenter,
      enabled: false,
      assetId: presenter.id,
      aspectMode: "source",
      aspectWidth: 7,
      aspectHeight: 3,
    };

    const projected = studioSettingsFromDriftProject(project);
    expect(projected).toMatchObject({
      stage: { transparent: false },
      slide: { fit: "contain", shadowOpacity: 0 },
      background: { style: "transparent" },
      presenter: { aspectWidth: 9, aspectHeight: 16 },
    });

    const updatedAt = "2026-08-21T02:51:00.000Z";
    const reconciled = reconcileStudioProject({
      project,
      settings: projected,
      slideAssets: [slideB],
      presenterAsset: presenter,
      updatedAt,
    });
    const expected = structuredClone(project);
    expected.updatedAt = updatedAt;
    expect(reconciled).toEqual(expected);

    const addedSlide: AssetDescriptor = {
      ...slideB,
      id: "slide-c",
      name: "C.png",
      hash: "d".repeat(64),
    };
    const mediaOnly = reconcileStudioProject({
      project,
      settings: projected,
      slideAssets: [slideB, addedSlide],
      presenterAsset: presenter,
      updatedAt: "2026-08-21T02:52:00.000Z",
    });
    expect(mediaOnly.media.order).toEqual([slideB.id, addedSlide.id]);
    expect(mediaOnly.slides[addedSlide.id]).toMatchObject({ fit: "contain" });
    expect(mediaOnly.composition.alphaMode).toBe("opaque");
    expect(mediaOnly.atmosphere).toMatchObject({ enabled: false, family: "void" });
    expect(mediaOnly.card.defaultFit).toBe("cover");
    expect(mediaOnly.lighting).toMatchObject({ enabled: false, shadowOpacity: 0.73 });
    expect(mediaOnly.presenter).toMatchObject({
      aspectMode: "source",
      aspectWidth: 7,
      aspectHeight: 3,
    });
  });

  it("keeps an ordered image pinned when a separate presenter video also exists", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.presenter.enabled = true;
    settings.presenter.assetId = slideA.id;
    settings.presenter.shadowOpacity = 0.63;

    const migrated = migrateLegacyStudioProjectToV4({
      projectId: "legacy-image-pin",
      createdAt: "2026-08-21T03:00:00.000Z",
      updatedAt: "2026-08-21T03:00:00.000Z",
      settings,
      slideAssets: [slideA],
      presenterAsset: presenter,
    });

    expect(migrated.media.presenterAssetId).toBe(presenter.id);
    expect(migrated.presenter).toMatchObject({
      enabled: true,
      assetId: slideA.id,
      trackMode: "moving-and-pinned",
      layoutMode: "legacy-perspective",
      aspectMode: "custom",
      shadowOpacity: 0.63,
      shadowSoftness: 48,
      shadowOffsetX: 12,
      shadowOffsetY: 18,
      matteOpacity: 1,
    });
    expect(migrated.master.audio.enabled).toBe(false);
    expect(studioSettingsFromDriftProject(migrated).presenter.assetId).toBe(slideA.id);
  });

  it("repairs a restored V3-era hybrid only after Reset and persists the safe pin without flattening the project", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.stage = { width: 1080, height: 1920, transparent: false };
    settings.output.width = 1080;
    settings.output.height = 1920;
    settings.slide.aspectWidth = 16;
    settings.slide.aspectHeight = 9;
    settings.slide.scale = 0.78;
    settings.presenter = {
      ...settings.presenter,
      enabled: true,
      assetId: slideA.id,
      trackMode: "moving-and-pinned",
      layoutMode: "safe-overlay",
      aspectMode: "custom",
      aspectWidth: 9,
      aspectHeight: 16,
      x: 0.94,
      y: 0.62,
      width: 0.42,
      fit: "contain",
      focalX: 0.17,
      focalY: 0.63,
      radius: 37,
      smoothing: 0.61,
      borderWidth: 3,
      borderColor: "#123456",
      borderOpacity: 0.7,
    };
    const migrated = migrateLegacyStudioProjectToV4({
      projectId: "restored-v3-hybrid",
      createdAt: "2026-08-22T14:31:00.000Z",
      updatedAt: "2026-08-22T14:32:00.000Z",
      settings,
      slideAssets: [slideA],
    });
    migrated.migration = {
      sourceFormat: "project-v3",
      migrator: "drift-project-v4/1",
    };
    migrated.presenter = {
      ...migrated.presenter,
      layoutMode: "safe-overlay",
      focalX: 0.17,
      focalY: 0.63,
    };

    const receipt = [{
      id: slideA.id,
      name: slideA.name,
      type: slideA.mimeType,
      size: 1_024,
      sha256: slideA.hash,
    }];
    const restored = parseStudioProjectPayload(createDriftProjectPayload(migrated), {
      projectId: migrated.projectId,
      createdAt: migrated.createdAt,
      updatedAt: migrated.updatedAt,
      engineVersion: "1.0.0",
      themeVersion: "1.0.0",
      assets: receipt,
    }).project;
    const beforeReset = structuredClone(restored);
    const projected = studioSettingsFromDriftProject(restored);

    expect(restored).toEqual(beforeReset);
    expect(projected.presenter).toMatchObject({
      trackMode: "moving-and-pinned",
      layoutMode: "safe-overlay",
      aspectMode: "custom",
      aspectWidth: 9,
      aspectHeight: 16,
      fit: "contain",
      focalX: 0.17,
      focalY: 0.63,
      borderWidth: 3,
      borderOpacity: 0.7,
    });

    const recoveredSettings = resetPinnedFrameComposition(projected, slideA);
    const recoveredAt = "2026-08-22T14:40:00.000Z";
    const autosaved = reconcileStudioProject({
      project: restored,
      settings: recoveredSettings,
      slideAssets: [restored.media.assets[slideA.id]!],
      updatedAt: recoveredAt,
    });
    const reloaded = parseStudioProjectPayload(createDriftProjectPayload(autosaved), {
      projectId: autosaved.projectId,
      createdAt: autosaved.createdAt,
      updatedAt: recoveredAt,
      engineVersion: "1.0.0",
      themeVersion: "1.0.0",
      assets: receipt,
    }).project;
    const reloadedSettings = studioSettingsFromDriftProject(reloaded);

    expect(reloaded.renderContract).toBe(beforeReset.renderContract);
    expect(reloaded.migration).toEqual(beforeReset.migration);
    expect(reloaded.card).toEqual(beforeReset.card);
    expect(reloaded.media).toEqual(beforeReset.media);
    expect(reloaded.slides).toEqual(beforeReset.slides);
    expect(reloaded.presenter).toMatchObject({
      enabled: true,
      assetId: slideA.id,
      trackMode: "pinned-only",
      layoutMode: "safe-overlay",
      aspectMode: "source",
      fit: "contain",
      focalX: 0.17,
      focalY: 0.63,
      radius: 37,
      smoothing: 0.61,
      borderWidth: 3,
      borderColor: "#123456",
      borderOpacity: 0.7,
    });
    expect(reloadedSettings.presenter).toMatchObject({
      trackMode: "pinned-only",
      layoutMode: "safe-overlay",
      aspectMode: "source",
      aspectWidth: 16,
      aspectHeight: 9,
    });

    const pinnedSlide: StudioAsset = {
      ...slideA,
      blob: new Blob(["slide"], { type: slideA.mimeType }),
      objectUrl: `blob:${slideA.id}`,
    };
    expect(resolveMovingTrackAssets([pinnedSlide], pinnedSlide, reloadedSettings.presenter)).toEqual([]);
  });

  it("retains a disabled image selection and re-enables that exact pin", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.presenter.enabled = true;
    settings.presenter.assetId = slideA.id;
    const migrated = migrateLegacyStudioProjectToV4({
      projectId: "remember-image-pin",
      createdAt: "2026-08-21T04:00:00.000Z",
      updatedAt: "2026-08-21T04:00:00.000Z",
      settings,
      slideAssets: [slideA],
      presenterAsset: presenter,
    });
    migrated.presenter.enabled = false;
    migrated.master.audio.enabled = false;

    const projected = studioSettingsFromDriftProject(migrated);
    expect(projected.presenter).toMatchObject({ enabled: false, assetId: slideA.id });
    projected.presenter.enabled = true;

    const reconciled = reconcileStudioProject({
      project: migrated,
      settings: projected,
      slideAssets: [migrated.media.assets[slideA.id]!],
      presenterAsset: migrated.media.assets[presenter.id]!,
      updatedAt: "2026-08-21T04:15:00.000Z",
    });
    expect(reconciled.presenter).toMatchObject({ enabled: true, assetId: slideA.id });
    expect(reconciled.media.presenterAssetId).toBe(presenter.id);
    expect(reconciled.master.audio.enabled).toBe(false);
  });

  it("round-trips presenter shadow direction independently from moving-card lighting", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.presenter.enabled = true;
    settings.presenter.assetId = presenter.id;
    settings.presenter.shadowOpacity = 0.61;
    settings.slide.shadowOpacity = 0.22;
    const migrated = migrateLegacyStudioProjectToV4({
      projectId: "independent-shadow",
      createdAt: "2026-08-21T05:00:00.000Z",
      updatedAt: "2026-08-21T05:00:00.000Z",
      settings,
      slideAssets: [slideA],
      presenterAsset: presenter,
    });

    const projected = studioSettingsFromDriftProject(migrated);
    expect(projected.presenter.shadowOpacity).toBe(0.61);
    expect(projected.slide.shadowOpacity).toBe(0.22);
    projected.presenter.shadowOpacity = 0.47;
    projected.slide.shadowOpacity = 0.13;

    const reconciled = reconcileStudioProject({
      project: migrated,
      settings: projected,
      slideAssets: [migrated.media.assets[slideA.id]!],
      presenterAsset: migrated.media.assets[presenter.id]!,
      updatedAt: "2026-08-21T05:15:00.000Z",
    });
    expect(reconciled.presenter).toMatchObject({
      shadowOpacity: 0.47,
      shadowSoftness: 48,
      shadowOffsetX: 12,
      shadowOffsetY: 18,
    });
    expect(reconciled.lighting.shadowOpacity).toBe(0.13);
  });
});
