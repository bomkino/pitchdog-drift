import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings, type StoredAssetDescriptor } from "../src/model";
import { createDefaultDriftProject } from "../src/core/project/defaults";
import { migrateLegacyStudioProject } from "../src/core/project/migrateLegacy";
import { ProjectValidationError, validateDriftProjectV3 } from "../src/core/project/validation";

const NOW = "2026-08-21T00:00:00.000Z";

function image(id: string): StoredAssetDescriptor & { byteLength: number } {
  return {
    id,
    name: `${id}.png`,
    kind: "image",
    mimeType: "image/png",
    width: 1920,
    height: 1080,
    hash: "a".repeat(64),
    byteLength: 1024,
  };
}

describe("Project V3", () => {
  it("creates a strict valid empty project", () => {
    const project = createDefaultDriftProject("project-1", NOW, 42);
    expect(validateDriftProjectV3(project)).toEqual(project);
    expect(project.formatVersion).toBe(3);
    expect(project.sound.exportEnabled).toBe(false);
  });

  it("rejects unknown fields instead of silently repairing them", () => {
    const project = createDefaultDriftProject("project-1", NOW);
    (project as unknown as Record<string, unknown>).surprise = true;
    expect(() => validateDriftProjectV3(project)).toThrow(ProjectValidationError);
    expect(() => validateDriftProjectV3(project)).toThrow(/unknown field surprise/u);
  });

  it("rejects dangling slide references", () => {
    const project = createDefaultDriftProject("project-1", NOW);
    project.media.order = ["missing"];
    expect(() => validateDriftProjectV3(project)).toThrow(/references missing asset missing/u);
  });

  it("migrates the current studio settings without changing delivery or crop intent", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.axis = "horizontal";
    settings.motion.direction = 1;
    settings.motion.speed = 0.42;
    settings.motion.flow = "arc";
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 2;
    settings.slide.fit = "contain";
    settings.slide.focalX = 0.2;
    settings.slide.focalY = 0.8;
    settings.output.width = 1920;
    settings.output.height = 1080;
    settings.output.duration = 12;

    const migrated = migrateLegacyStudioProject({
      projectId: "legacy-project",
      createdAt: NOW,
      updatedAt: NOW,
      settings,
      slideAssets: [image("slide-1")],
    });

    expect(migrated.composition).toMatchObject({ width: 1920, height: 1080 });
    expect(migrated.motion.transport).toEqual({ axis: "horizontal", direction: 1, slidesPerSecond: 0.42 });
    expect(migrated.motion.path.id).toBe("arc");
    expect(migrated.motion.seamless).toEqual({ enabled: true, loops: 2 });
    expect(migrated.slides["slide-1"]).toMatchObject({ fit: "contain", focalX: 0.2, focalY: 0.8 });
    expect(migrated.master.duration).toBe(12);
    expect(migrated.sound.previewEnabled).toBe(false);
    expect(migrated.sound.exportEnabled).toBe(false);
  });
});
