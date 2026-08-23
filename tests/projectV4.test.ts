import { describe, expect, it } from "vitest";
import { createDefaultDriftProject, createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { migrateDriftProjectV3ToV4 } from "../src/core/project/migrateV3ToV4";
import {
  DRIFT_PROJECT_V4_MIGRATOR,
  DRIFT_V2_RENDER_CONTRACT,
  DRIFT_V1_COMPAT_RENDER_CONTRACT,
  type DriftProjectV3,
  type DriftProjectV4,
} from "../src/core/project/schema";
import { ProjectValidationError, validateDriftProjectV3, validateDriftProjectV4 } from "../src/core/project/validation";
import { createPerformanceLifecycle } from "../src/core/timeline/performanceLifecycle";

const NOW = "2026-08-22T00:00:00.000Z";

function asV3(project: DriftProjectV4): DriftProjectV3 {
  const {
    renderContract: _renderContract,
    migration: _migration,
    extensions: _extensions,
    performance: _performance,
    presenter: presenterV4,
    ...v4
  } = project;
  const {
    assetId: _assetId,
    trackMode: _trackMode,
    layoutMode: _layoutMode,
    aspectMode: _aspectMode,
    focalX: _focalX,
    focalY: _focalY,
    safeInset: _safeInset,
    shadowOpacity: _shadowOpacity,
    shadowSoftness: _shadowSoftness,
    shadowOffsetX: _shadowOffsetX,
    shadowOffsetY: _shadowOffsetY,
    matteColor: _matteColor,
    matteOpacity: _matteOpacity,
    ...presenter
  } = presenterV4;
  return { ...v4, presenter, formatVersion: 3 };
}

function withField(project: DriftProjectV4, field: string, value: unknown): unknown {
  return { ...project, [field]: value };
}

describe("Project V4", () => {
  it("adds the V4 envelope and authored safe-overlay defaults without mutating V3 defaults", () => {
    const v3 = createDefaultDriftProject("project-v4", NOW, 42);
    const v4 = createDefaultDriftProjectV4("project-v4", NOW, 42);

    expect(validateDriftProjectV4(v4)).toEqual(v4);
    expect(v4).toMatchObject({
      formatVersion: 4,
      renderContract: DRIFT_V1_COMPAT_RENDER_CONTRACT,
      migration: null,
      presenter: {
        assetId: null,
        trackMode: "pinned-only",
        layoutMode: "safe-overlay",
        aspectMode: "source",
        safeInset: 0.04,
      },
      extensions: {},
    });
    const { presenter: _v3Presenter, ...v3Rest } = v3;
    const { presenter: _v4Presenter, ...v4Rest } = asV3(v4);
    expect(v4Rest).toEqual(v3Rest);
    expect(v4.presenter).toMatchObject({ x: 1, y: 1, width: 0.32, radius: 28 });
    expect(v4.performance).toMatchObject({
      entry: { enabled: true, durationSeconds: 0.72, includePresenter: false },
      body: { durationSeconds: 6.72, tempo: { kind: "preset", preset: "fast-slow-fast" } },
      exit: { enabled: true, durationSeconds: 0.56, includePresenter: false },
      repeat: { mode: "off" },
      reducedMotion: false,
    });
    expect(createPerformanceLifecycle(v4.performance).totalDuration).toBe(8);
    expect(validateDriftProjectV3(v3)).toEqual(v3);
  });

  it("admits an explicit V2 render contract without changing the compatibility default", () => {
    const compatibility = createDefaultDriftProjectV4("project-v4-compat", NOW, 42);
    const v2 = createDefaultDriftProjectV4("project-v4-v2", NOW, 42, DRIFT_V2_RENDER_CONTRACT);

    expect(compatibility.renderContract).toBe(DRIFT_V1_COMPAT_RENDER_CONTRACT);
    expect(v2.renderContract).toBe(DRIFT_V2_RENDER_CONTRACT);
    expect(validateDriftProjectV4(v2)).toEqual(v2);
  });

  it("migrates a validated V3 candidate purely and preserves dormant creative values exactly", () => {
    const v3 = createDefaultDriftProject("migrated-v4", NOW, 7);
    v3.motion.path = { ...v3.motion.path, curvature: 0.91, banking: -12.5 };
    v3.card = { ...v3.card, radius: 73, smoothing: 0.37, borderOpacity: 0.44 };
    v3.atmosphere = { ...v3.atmosphere, grain: 0.73, recut: 19 };
    v3.lens = { ...v3.lens, gateWeave: 0.28, cameraGrain: 0.67 };
    v3.sound = { ...v3.sound, source: "procedural", grammar: "organic", texture: 0.81 };
    const before = structuredClone(v3);

    const migrated = migrateDriftProjectV3ToV4(v3);

    expect(v3).toEqual(before);
    expect(asV3(migrated)).toEqual(v3);
    expect(migrated.createdAt).toBe(NOW);
    expect(migrated.updatedAt).toBe(NOW);
    expect(migrated.migration).toEqual({
      sourceFormat: "project-v3",
      migrator: DRIFT_PROJECT_V4_MIGRATOR,
    });
    expect(migrated.renderContract).toBe(DRIFT_V1_COMPAT_RENDER_CONTRACT);
    expect(migrated.presenter).toMatchObject({
      assetId: null,
      trackMode: "moving-and-pinned",
      layoutMode: "legacy-perspective",
      aspectMode: "custom",
      focalX: 0.5,
      focalY: 0.5,
      safeInset: 0,
      shadowOpacity: v3.lighting.shadowOpacity,
      shadowSoftness: 48,
      shadowOffsetX: 12,
      shadowOffsetY: 18,
      matteOpacity: 1,
    });
    expect(migrated.performance).toEqual({
      transitionPreset: "quiet-lift",
      entry: { enabled: false },
      body: { durationSeconds: 8, tempo: { kind: "preset", preset: "even" } },
      exit: { enabled: false },
      repeat: { mode: "off" },
      reducedMotion: false,
    });
  });

  it("records the legacy source boundary when a validated legacy-to-V3 candidate is promoted", () => {
    const migrated = migrateDriftProjectV3ToV4(
      createDefaultDriftProject("legacy-candidate", NOW),
      "legacy-studio-v1",
    );
    expect(migrated.migration).toEqual({
      sourceFormat: "legacy-studio-v1",
      migrator: DRIFT_PROJECT_V4_MIGRATOR,
    });
  });

  it("promotes an active V3 presenter without changing its V3 creative tree", () => {
    const v3 = createDefaultDriftProject("v3-presenter", NOW);
    const presenterId = "presenter-video";
    v3.media.presenterAssetId = presenterId;
    v3.media.assets[presenterId] = {
      id: presenterId,
      name: "Presenter.mp4",
      kind: "video",
      mimeType: "video/mp4",
      hash: "c".repeat(64),
      byteLength: 4_096,
      width: 1080,
      height: 1920,
      duration: 8,
    };
    v3.presenter.enabled = true;
    v3.presenter.muted = false;
    v3.master.audio.enabled = true;
    const before = validateDriftProjectV3(v3);

    const migrated = migrateDriftProjectV3ToV4(v3);
    expect(asV3(migrated)).toEqual(before);
    expect(migrated.presenter).toMatchObject({
      enabled: true,
      assetId: presenterId,
      trackMode: "moving-and-pinned",
      layoutMode: "legacy-perspective",
      aspectMode: "custom",
    });
    expect(migrated.master.audio.enabled).toBe(true);
  });

  it("rejects unknown, future, and invalid compatibility fields", () => {
    const project = createDefaultDriftProjectV4("strict-v4", NOW);
    expect(() => validateDriftProjectV4({ ...project, surprise: true })).toThrow(/unknown field surprise/u);
    expect(() => validateDriftProjectV4(withField(project, "formatVersion", 5))).toThrow(/must be 4/u);
    expect(() => validateDriftProjectV4(withField(project, "renderContract", "drift-v2"))).toThrow(
      /must be one of drift-v1-compat\/1, drift-v2\/1/u,
    );
    expect(() => validateDriftProjectV4(withField(project, "migration", {
      sourceFormat: "project-v3",
      migrator: DRIFT_PROJECT_V4_MIGRATOR,
      surprise: true,
    }))).toThrow(/unknown field surprise/u);
    expect(() => validateDriftProjectV4(withField(project, "migration", {
      sourceFormat: "project-v2",
      migrator: DRIFT_PROJECT_V4_MIGRATOR,
    }))).toThrow(ProjectValidationError);
    expect(() => validateDriftProjectV3(project)).toThrow(/unknown field renderContract/u);
    expect(() => validateDriftProjectV4({
      ...project,
      performance: { ...project.performance, surprise: true },
    })).toThrow(/project\.performance.*unknown field surprise/u);
    expect(() => validateDriftProjectV4({
      ...project,
      performance: {
        ...project.performance,
        body: { ...project.performance.body, tempo: { kind: "preset", preset: "not-real" } },
      },
    })).toThrow(/project\.performance/u);
    expect(() => validateDriftProjectV4({
      ...project,
      performance: {
        ...project.performance,
        body: { ...project.performance.body, durationSeconds: 5 },
      },
    })).toThrow(/derived total duration must equal project\.master\.duration/u);
  });

  it("requires export audio to come from the active unmuted pinned video", () => {
    const project = createDefaultDriftProjectV4("pin-audio-v4", NOW);
    const slideId = "slide";
    const videoId = "presenter";
    project.media = {
      order: [slideId],
      presenterAssetId: videoId,
      assets: {
        [slideId]: {
          id: slideId,
          name: "Slide.png",
          kind: "image",
          mimeType: "image/png",
          hash: "a".repeat(64),
          byteLength: 1_024,
          width: 1920,
          height: 1080,
        },
        [videoId]: {
          id: videoId,
          name: "Presenter.mp4",
          kind: "video",
          mimeType: "video/mp4",
          hash: "b".repeat(64),
          byteLength: 4_096,
          width: 1080,
          height: 1920,
          duration: 8,
        },
      },
    };
    project.slides = {
      [slideId]: { assetId: slideId, fit: "cover", focalX: 0.5, focalY: 0.5, scaleOffset: 0 },
    };

    project.presenter = { ...project.presenter, enabled: true, assetId: slideId };
    expect(validateDriftProjectV4(project).presenter.assetId).toBe(slideId);
    expect(() => validateDriftProjectV4({
      ...project,
      master: { ...project.master, audio: { ...project.master.audio, enabled: true } },
    })).toThrow(/presenter audio or exported sound/u);

    project.sound.exportEnabled = true;
    project.master.audio.enabled = true;
    expect(validateDriftProjectV4(project).master.audio.enabled).toBe(true);
    project.sound.exportEnabled = false;

    project.presenter = { ...project.presenter, enabled: true, assetId: videoId, muted: false };
    project.master.audio.enabled = true;
    expect(validateDriftProjectV4(project).master.audio.enabled).toBe(true);
    expect(() => validateDriftProjectV4({
      ...project,
      presenter: { ...project.presenter, enabled: false },
    })).toThrow(/presenter audio or exported sound/u);
    expect(() => validateDriftProjectV4({
      ...project,
      presenter: { ...project.presenter, muted: true },
    })).toThrow(ProjectValidationError);
  });

  it("rejects inherited and accessor-backed creative data before V3 cloning can change its meaning", () => {
    const project = createDefaultDriftProjectV4("plain-v4", NOW);
    const inheritedCard = Object.create(project.card) as object;
    expect(() => validateDriftProjectV4({ ...project, card: inheritedCard })).toThrow(/must be a plain object/u);

    const accessorCard = { ...project.card };
    Object.defineProperty(accessorCard, "radius", { enumerable: true, get: () => 36 });
    expect(() => validateDriftProjectV4({ ...project, card: accessorCard })).toThrow(/enumerable data field/u);

    const accessorPresenter = { ...project.presenter };
    Object.defineProperty(accessorPresenter, "assetId", { enumerable: true, get: () => null });
    expect(() => validateDriftProjectV4({ ...project, presenter: accessorPresenter })).toThrow(
      /enumerable data field/u,
    );
    expect(() => validateDriftProjectV4({
      ...project,
      presenter: { ...project.presenter, trackMode: "ghost-track" },
    })).toThrow(/project\.presenter\.trackMode/u);

    let deep: unknown = true;
    for (let index = 0; index < 20_000; index += 1) deep = { next: deep };
    expect(() => validateDriftProjectV4({
      ...project,
      card: { ...project.card, surprise: deep },
    })).toThrow(/must not exceed 64 data levels/u);
  });

  it("preserves namespaced JSON extensions while canonicalizing object keys", () => {
    const project = createDefaultDriftProjectV4("extensions-v4", NOW);
    project.extensions = {
      "org.example.second": { z: 3, a: { z: true, a: null }, ordered: ["z", "a"] },
      "com.pitchdog.first": { beta: -0, alpha: "kept" },
    };

    const validated = validateDriftProjectV4(project);
    expect(Object.keys(validated.extensions)).toEqual(["com.pitchdog.first", "org.example.second"]);
    expect(Object.keys(validated.extensions["com.pitchdog.first"] as object)).toEqual(["alpha", "beta"]);
    expect(Object.keys((validated.extensions["org.example.second"] as Record<string, object>).a!)).toEqual(["a", "z"]);
    expect((validated.extensions["org.example.second"] as Record<string, unknown>).ordered).toEqual(["z", "a"]);
    expect(JSON.stringify(validateDriftProjectV4(validated))).toBe(JSON.stringify(validated));
    expect(JSON.stringify(validated.extensions)).not.toContain("-0");
  });

  it("bounds extension namespaces, depth, node count, bytes, and JSON shape", () => {
    const project = createDefaultDriftProjectV4("bounded-v4", NOW);
    const namespaces = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`com.example.n${index}`, index]),
    );
    expect(() => validateDriftProjectV4({ ...project, extensions: namespaces })).toThrow(/at most 64 namespaces/u);

    let deep: unknown = "end";
    for (let index = 0; index < 34; index += 1) deep = { next: deep };
    expect(() => validateDriftProjectV4({ ...project, extensions: { "com.example.deep": deep } })).toThrow(
      /must not exceed 32 levels/u,
    );

    expect(() => validateDriftProjectV4({
      ...project,
      extensions: { "com.example.nodes": Array.from({ length: 10_001 }, () => null) },
    })).toThrow(/at most 10000 JSON values/u);

    expect(() => validateDriftProjectV4({
      ...project,
      extensions: { "com.example.bytes": "é".repeat(140_000) },
    })).toThrow(/at most 262144 UTF-8 bytes/u);

    expect(() => validateDriftProjectV4({
      ...project,
      extensions: {
        "com.example.cumulative": Array.from({ length: 10 }, () => "a".repeat(30_000)),
      },
    })).toThrow(/at most 262144 UTF-8 bytes/u);

    expect(() => validateDriftProjectV4({ ...project, extensions: { invalid: true } })).toThrow(/reverse-DNS/u);
    expect(() => validateDriftProjectV4({
      ...project,
      extensions: { "com.example.value": Number.POSITIVE_INFINITY },
    })).toThrow(/finite JSON number/u);

    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => validateDriftProjectV4({ ...project, extensions: { "com.example.cycle": cycle } })).toThrow(/cycle/u);

    const poisoned = JSON.parse('{"constructor":{"polluted":true}}') as unknown;
    expect(() => validateDriftProjectV4({
      ...project,
      extensions: { "com.example.poison": poisoned },
    })).toThrow(/not a permitted extension key/u);
  });
});
