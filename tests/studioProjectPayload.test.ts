import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings, type StoredAssetDescriptor } from "../src/model";
import { migrateLegacyStudioProject } from "../src/core/project/migrateLegacy";
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
const context = { projectId, createdAt, updatedAt, assets: receipts };

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

  it("writes and reads Project V3 without requiring legacy engine or theme equality", () => {
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

    const payload = createDriftProjectPayload(project);
    const parsed = parseStudioProjectPayload(payload, context);

    expect(parsed.sourceFormat).toBe("project-v3");
    expect(parsed.project).toEqual(project);
    expect(parsed.project.lens.characterId).toBe("soft-print");
    expect(parsed.project.sound.grammar).toBe("organic");
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
      createDriftProjectPayload({ ...project, projectId: "other" }),
      context,
    )).toThrow(/identity/i);

    const wrongSize = structuredClone(project);
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

  it("refuses future project payloads instead of misreading them as legacy", () => {
    expect(() => parseStudioProjectPayload({
      project: {
        schema: "dog.pitch.drift/project",
        formatVersion: 4,
      },
    }, { ...context, assets: [] })).toThrow(/studio settings/i);
  });
});
