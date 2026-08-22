import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings, type StoredAssetDescriptor } from "../src/model";
import { migrateLegacyStudioProject } from "../src/core/project/migrateLegacy";
import { migrateDriftProjectV3ToV4 } from "../src/core/project/migrateV3ToV4";
import { createDriftProjectPayload, parseStudioProjectPayload } from "../src/lib/studioProjectPayload";

const createdAt = "2026-08-21T00:00:00.000Z";
const updatedAt = "2026-08-21T00:10:00.000Z";
const projectId = "project-payload";

const slide: StoredAssetDescriptor = {
  id: "slide-a",
  name: "A.png",
  kind: "image",
  mimeType: "image/png",
  width: 1920,
  height: 1080,
  hash: "a".repeat(64),
};
const presenter: StoredAssetDescriptor = {
  id: "presenter",
  name: "Presenter.mp4",
  kind: "video",
  mimeType: "video/mp4",
  width: 1080,
  height: 1920,
  duration: 8,
  hash: "b".repeat(64),
};
const receipts = [
  {
    id: slide.id,
    name: slide.name,
    type: slide.mimeType,
    size: 1_024,
    sha256: slide.hash,
  },
  {
    id: presenter.id,
    name: presenter.name,
    type: presenter.mimeType,
    size: 4_096,
    sha256: presenter.hash,
  },
];
const context = {
  projectId,
  createdAt,
  updatedAt,
  engineVersion: "1.0.0",
  themeVersion: "1.0.0",
  assets: receipts,
};

describe("portable studio payload boundary", () => {
  it("migrates the complete legacy payload only after matching verified assets", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.presenter.enabled = true;
    settings.presenter.assetId = presenter.id;
    settings.slide.focalX = 0.28;
    settings.slide.focalY = 0.67;

    const parsed = parseStudioProjectPayload({
      settings,
      slideAssetIds: [slide.id],
      presenterAssetId: presenter.id,
      descriptors: [slide, presenter],
    }, context);

    expect(parsed.sourceFormat).toBe("legacy-studio-v1");
    expect(parsed.project).toMatchObject({
      formatVersion: 4,
      renderContract: "drift-v1-compat/1",
      migration: {
        sourceFormat: "legacy-studio-v1",
        migrator: "drift-project-v4/1",
      },
      projectId,
      createdAt,
      updatedAt,
      media: {
        order: [slide.id],
        presenterAssetId: presenter.id,
      },
      presenter: { enabled: true },
    });
    expect(parsed.project.media.assets[slide.id]).toMatchObject({
      byteLength: 1_024,
      hash: slide.hash,
    });
    expect(parsed.project.media.assets[presenter.id]).toMatchObject({
      byteLength: 4_096,
      duration: 8,
    });
    expect(parsed.project.slides[slide.id]).toMatchObject({
      focalX: 0.28,
      focalY: 0.67,
    });
    expect(parsed.project.lens.enabled).toBe(false);
    expect(parsed.project.sound.exportEnabled).toBe(false);
  });

  it("migrates Project V3, then writes and reads Project V4 without legacy version coupling", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    const project = migrateLegacyStudioProject({
      projectId,
      createdAt,
      updatedAt,
      settings,
      slideAssets: [{ ...slide, byteLength: 1_024 }],
      presenterAsset: { ...presenter, byteLength: 4_096 },
    });
    project.lens.enabled = true;
    project.lens.characterId = "soft-print";
    project.sound.grammar = "organic";
    project.sound.exportEnabled = true;

    const migrated = parseStudioProjectPayload(
      { project },
      { ...context, engineVersion: "9.0.0", themeVersion: "9.0.0" },
    );

    expect(migrated.sourceFormat).toBe("project-v3");
    expect(migrated.project).toMatchObject({
      formatVersion: 4,
      migration: { sourceFormat: "project-v3", migrator: "drift-project-v4/1" },
      lens: { characterId: "soft-print" },
      sound: { grammar: "organic" },
    });

    migrated.project.extensions = { "dog.pitch.test": { z: 2, a: 1 } };
    const parsed = parseStudioProjectPayload(
      createDriftProjectPayload(migrated.project),
      { ...context, engineVersion: "10.0.0", themeVersion: "10.0.0" },
    );
    expect(parsed.sourceFormat).toBe("project-v4");
    expect(parsed.project.extensions).toEqual({ "dog.pitch.test": { a: 1, z: 2 } });
  });

  it("rejects identity, byte-length, hash, and unreferenced-media contradictions", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    const project = migrateLegacyStudioProject({
      projectId,
      createdAt,
      updatedAt,
      settings,
      slideAssets: [{ ...slide, byteLength: 1_024 }],
      presenterAsset: { ...presenter, byteLength: 4_096 },
    });

    expect(() => parseStudioProjectPayload(
      createDriftProjectPayload(migrateDriftProjectV3ToV4({ ...project, projectId: "other" })),
      context,
    )).toThrow(/identity/i);

    const wrongSize = migrateDriftProjectV3ToV4(project);
    wrongSize.media.assets[slide.id]!.byteLength = 9;
    expect(() => parseStudioProjectPayload(createDriftProjectPayload(wrongSize), context))
      .toThrow(/receipt/i);

    expect(() => parseStudioProjectPayload({
      settings,
      slideAssetIds: [slide.id],
      presenterAssetId: presenter.id,
      descriptors: [{ ...slide, hash: "c".repeat(64) }, presenter],
    }, context)).toThrow(/receipt/i);

    expect(() => parseStudioProjectPayload({
      settings,
      slideAssetIds: [],
      presenterAssetId: presenter.id,
      descriptors: [slide, presenter],
    }, context)).toThrow(/unreferenced/i);
  });

  it("keeps the legacy outer contract frozen while allowing V3 and V4 manifests to evolve", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    const legacy = {
      settings,
      slideAssetIds: [slide.id],
      presenterAssetId: presenter.id,
      descriptors: [slide, presenter],
    };

    expect(() => parseStudioProjectPayload(
      legacy,
      { ...context, engineVersion: "2.0.0" },
    )).toThrow(/Legacy project contract is not supported/i);
    expect(() => parseStudioProjectPayload(
      legacy,
      { ...context, themeVersion: "2.0.0" },
    )).toThrow(/Legacy project contract is not supported/i);
  });

  it("refuses future project payloads instead of misreading them as legacy", () => {
    expect(() => parseStudioProjectPayload({
      project: {
        schema: "dog.pitch.drift/project",
        formatVersion: 5,
      },
    }, { ...context, assets: [] })).toThrow(/Project format 5 is not supported/);
  });
});
