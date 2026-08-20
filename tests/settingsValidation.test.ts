import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  SHADER_VERSION,
  clearPinnedAssetIfRemoved,
  cloneSettings,
  type StudioSettings,
} from "../src/model";
import { THEMES } from "../src/themes";
import {
  STUDIO_SETTINGS_LIMITS,
  SettingsValidationError,
  validateStudioSettings,
} from "../src/lib/settingsValidation";

function settings(): Record<string, any> {
  return cloneSettings(DEFAULT_SETTINGS) as unknown as Record<string, any>;
}

function setPath(target: Record<string, any>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) cursor = cursor[part] as Record<string, any>;
  cursor[parts.at(-1)!] = value;
}

function expectInvalid(candidate: unknown, path: string): SettingsValidationError {
  try {
    validateStudioSettings(candidate);
  } catch (error) {
    expect(error).toBeInstanceOf(SettingsValidationError);
    expect(error).toMatchObject({
      name: "SettingsValidationError",
      code: "INVALID_STUDIO_SETTINGS",
      path: `settings.${path}`,
    });
    return error as SettingsValidationError;
  }
  throw new Error("Expected settings validation to fail");
}

describe("validateStudioSettings", () => {
  it("only clears pinned settings when the removed media owns the pin", () => {
    const pinnedSlide = cloneSettings(DEFAULT_SETTINGS);
    pinnedSlide.presenter.enabled = true;
    pinnedSlide.presenter.assetId = "slide-one";

    expect(clearPinnedAssetIfRemoved(pinnedSlide, "stored-presenter-video")).toBe(pinnedSlide);
    expect(clearPinnedAssetIfRemoved(pinnedSlide, "slide-one")).toMatchObject({
      presenter: { enabled: false, assetId: null },
    });
  });

  it("accepts and deeply clones the complete default schema", () => {
    const source = cloneSettings(DEFAULT_SETTINGS);
    const result = validateStudioSettings(source);

    expect(result).toEqual(DEFAULT_SETTINGS);
    expect(result).not.toBe(source);
    expect(result.motion).not.toBe(source.motion);
    expect(result.slide).not.toBe(source.slide);

    result.motion.speed = 0;
    expect(source.motion.speed).toBe(DEFAULT_SETTINGS.motion.speed);
  });

  it("accepts all six current film-world themes", () => {
    expect(THEMES).toHaveLength(6);
    for (const theme of THEMES) {
      expect(validateStudioSettings(theme.settings)).toEqual(theme.settings);
    }
  });

  it("accepts every current enum and frame-rate choice", () => {
    const choices: Array<[string, readonly (string | number)[]]> = [
      ["themeId", ["editorial-drift", "road-memory", "dread", "noir-contact", "tender-light", "chrome-dream"]],
      ["motion.axis", ["horizontal", "vertical"]],
      ["motion.direction", [-1, 1]],
      ["motion.flow", ["straight", "arc", "ribbon", "cylinder", "tunnel"]],
      ["slide.fit", ["cover", "contain"]],
      ["background.style", ["transparent", "solid", "gradient", "aura", "paper", "void"]],
      ["presenter.fit", ["cover", "contain"]],
      ["output.fps", [24, 25, 30, 50, 60]],
    ];

    for (const [path, values] of choices) {
      for (const value of values) {
        const source = settings();
        setPath(source, path, value);
        if (path === "background.style") source.stage.transparent = value === "transparent";
        expect(validateStudioSettings(source)).toBeDefined();
      }
    }
  });

  it("accepts every lower UI boundary", () => {
    const source = settings();
    Object.assign(source.stage, { width: 256, height: 256 });
    Object.assign(source.output, {
      width: 256,
      height: 256,
      fps: 24,
      duration: 3,
      videoBitrate: STUDIO_SETTINGS_LIMITS.videoBitrate,
      audioBitrate: STUDIO_SETTINGS_LIMITS.audioBitrate,
    });
    Object.assign(source.motion, {
      speed: 0,
      gap: 0,
      curvature: 0,
      depth: 0,
      tilt: 0,
      distortion: 0,
      focusScale: 0,
      edgeFade: 0,
      dragSensitivity: 0,
      seamlessLoops: 1,
    });
    Object.assign(source.slide, {
      aspectWidth: 1,
      aspectHeight: 1,
      scale: 0.24,
      focalX: 0,
      focalY: 0,
      radius: 0,
      smoothing: 0,
      borderWidth: 0,
      borderOpacity: 0,
      shadowOpacity: 0,
      shadowSoftness: 4,
    });
    Object.assign(source.background, {
      intensity: 0,
      motion: 0,
      grain: 0,
      vignette: 0,
      seed: 0,
    });
    Object.assign(source.presenter, {
      x: 0,
      y: 0,
      width: 0.14,
      aspectWidth: 1,
      aspectHeight: 1,
      radius: 0,
      smoothing: 0,
      borderWidth: 0,
      borderOpacity: 0,
      shadowOpacity: 0,
      gain: STUDIO_SETTINGS_LIMITS.presenterGain,
      trimStart: STUDIO_SETTINGS_LIMITS.presenterTrimStart,
      startAt: STUDIO_SETTINGS_LIMITS.presenterStartAt,
    });

    expect(validateStudioSettings(source)).toEqual(source);
  });

  it("accepts every upper UI and safety boundary", () => {
    const source = settings();
    Object.assign(source.stage, { width: 8_192, height: 8_192 });
    Object.assign(source.output, {
      width: 8_192,
      height: 8_192,
      fps: 60,
      duration: 30,
      videoBitrate: STUDIO_SETTINGS_LIMITS.videoBitrate,
      audioBitrate: STUDIO_SETTINGS_LIMITS.audioBitrate,
    });
    Object.assign(source.motion, {
      speed: 1.5,
      gap: 1.2,
      curvature: 1,
      depth: 0.8,
      tilt: 18,
      distortion: 1,
      focusScale: 0.24,
      edgeFade: 1,
      dragSensitivity: 4,
      seamlessLoops: 6,
    });
    Object.assign(source.slide, {
      aspectWidth: 64,
      aspectHeight: 64,
      scale: 1.1,
      focalX: 1,
      focalY: 1,
      radius: 180,
      smoothing: 1,
      borderWidth: 16,
      borderOpacity: 1,
      shadowOpacity: 0.8,
      shadowSoftness: 96,
    });
    Object.assign(source.background, {
      intensity: 1,
      motion: 1,
      grain: 0.6,
      vignette: 1,
      seed: 1_000_000,
    });
    Object.assign(source.presenter, {
      x: 1,
      y: 1,
      width: 0.82,
      aspectWidth: 64,
      aspectHeight: 64,
      radius: 180,
      smoothing: 1,
      borderWidth: 16,
      borderOpacity: 1,
      shadowOpacity: 0.8,
      gain: STUDIO_SETTINGS_LIMITS.presenterGain,
      trimStart: STUDIO_SETTINGS_LIMITS.presenterTrimStart,
      startAt: STUDIO_SETTINGS_LIMITS.presenterStartAt,
    });

    expect(validateStudioSettings(source)).toEqual(source);
  });

  it("rejects unsupported schema, engine, and shader versions", () => {
    for (const [path, bad] of [
      ["schemaVersion", SCHEMA_VERSION + 1],
      ["engineVersion", `${ENGINE_VERSION}-future`],
      ["shaderVersion", `${SHADER_VERSION}-future`],
    ] as const) {
      const source = settings();
      setPath(source, path, bad);
      expectInvalid(source, path);
    }
  });

  it("rejects every invalid enum surface", () => {
    for (const path of [
      "themeId",
      "motion.axis",
      "motion.flow",
      "slide.fit",
      "background.style",
      "presenter.fit",
    ]) {
      const source = settings();
      setPath(source, path, "__invalid__");
      expectInvalid(source, path);
    }

    const direction = settings();
    setPath(direction, "motion.direction", 0);
    expectInvalid(direction, "motion.direction");
  });

  it("rejects non-finite values at every numeric field", () => {
    const numericPaths = [
      "stage.width", "stage.height",
      "motion.speed", "motion.gap", "motion.curvature", "motion.depth", "motion.tilt",
      "motion.distortion", "motion.focusScale", "motion.edgeFade", "motion.dragSensitivity",
      "motion.seamlessLoops",
      "slide.aspectWidth", "slide.aspectHeight", "slide.scale", "slide.focalX", "slide.focalY",
      "slide.radius", "slide.smoothing", "slide.borderWidth", "slide.borderOpacity",
      "slide.shadowOpacity", "slide.shadowSoftness",
      "background.intensity", "background.motion", "background.grain", "background.vignette",
      "background.seed",
      "presenter.x", "presenter.y", "presenter.width", "presenter.aspectWidth",
      "presenter.aspectHeight", "presenter.radius", "presenter.smoothing", "presenter.borderWidth",
      "presenter.borderOpacity", "presenter.shadowOpacity", "presenter.gain", "presenter.trimStart",
      "presenter.startAt",
      "output.width", "output.height", "output.duration", "output.videoBitrate", "output.audioBitrate",
    ];

    for (const [index, path] of numericPaths.entries()) {
      const source = settings();
      setPath(source, path, [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY][index % 3]);
      expectInvalid(source, path);
    }
  });

  it("rejects out-of-range UI fields rather than clamping or defaulting", () => {
    const cases: Array<[string, number]> = [
      ["motion.speed", 1.500_001],
      ["motion.gap", -0.001],
      ["motion.curvature", 1.001],
      ["motion.depth", 0.801],
      ["motion.tilt", 18.001],
      ["motion.distortion", -0.001],
      ["motion.focusScale", 0.241],
      ["motion.edgeFade", 1.001],
      ["motion.dragSensitivity", 4.001],
      ["motion.seamlessLoops", 7],
      ["slide.aspectWidth", 0.999],
      ["slide.aspectHeight", 64.001],
      ["slide.scale", 0.239],
      ["slide.focalX", -0.001],
      ["slide.focalY", 1.001],
      ["slide.radius", 180.001],
      ["slide.smoothing", 1.001],
      ["slide.borderWidth", 16.001],
      ["slide.borderOpacity", -0.001],
      ["slide.shadowOpacity", 0.801],
      ["slide.shadowSoftness", 3.999],
      ["background.intensity", 1.001],
      ["background.motion", -0.001],
      ["background.grain", 0.601],
      ["background.vignette", 1.001],
      ["background.seed", 1_000_001],
      ["presenter.x", -0.001],
      ["presenter.y", 1.001],
      ["presenter.width", 0.139],
      ["presenter.aspectWidth", 65],
      ["presenter.aspectHeight", 0],
      ["presenter.radius", 181],
      ["presenter.smoothing", -0.001],
      ["presenter.borderWidth", 17],
      ["presenter.borderOpacity", 1.001],
      ["presenter.shadowOpacity", 0.801],
      ["presenter.gain", STUDIO_SETTINGS_LIMITS.presenterGain + 0.001],
      ["presenter.trimStart", STUDIO_SETTINGS_LIMITS.presenterTrimStart + 0.001],
      ["presenter.startAt", STUDIO_SETTINGS_LIMITS.presenterStartAt + 0.001],
    ];

    for (const [path, bad] of cases) {
      const source = settings();
      setPath(source, path, bad);
      expectInvalid(source, path);
    }
  });

  it("rejects unsafe, odd, fractional, or mismatched stage/output dimensions", () => {
    for (const [path, bad] of [
      ["stage.width", 254],
      ["stage.height", 8_194],
      ["stage.width", 1_081],
      ["output.height", 1_919],
      ["stage.width", 1_080.5],
    ] as const) {
      const source = settings();
      setPath(source, path, bad);
      expectInvalid(source, path);
    }

    const mismatch = settings();
    mismatch.output.width = 1_920;
    expectInvalid(mismatch, "output");
  });

  it("rejects contradictory transparent-stage and background states", () => {
    const opaqueStyleOnTransparentStage = settings();
    opaqueStyleOnTransparentStage.stage.transparent = true;
    expectInvalid(opaqueStyleOnTransparentStage, "stage.transparent");

    const transparentStyleOnOpaqueStage = settings();
    transparentStyleOnOpaqueStage.background.style = "transparent";
    expectInvalid(transparentStyleOnOpaqueStage, "stage.transparent");
  });

  it("rejects contradictory pinned-frame enabled and asset states", () => {
    const enabledWithoutMedia = settings();
    enabledWithoutMedia.presenter.enabled = true;
    expectInvalid(enabledWithoutMedia, "presenter.enabled");

    const disabledWithMedia = settings();
    disabledWithMedia.presenter.assetId = "slide-one";
    expectInvalid(disabledWithMedia, "presenter.enabled");
  });

  it("rejects unsupported frame rates, duration escapes, and unsurfaced bitrate values", () => {
    for (const [path, bad] of [
      ["output.fps", 29],
      ["output.duration", 2.999],
      ["output.duration", 30.001],
      ["output.videoBitrate", STUDIO_SETTINGS_LIMITS.videoBitrate - 1],
      ["output.videoBitrate", STUDIO_SETTINGS_LIMITS.videoBitrate + 1],
      ["output.audioBitrate", STUDIO_SETTINGS_LIMITS.audioBitrate - 1],
      ["output.audioBitrate", STUDIO_SETTINGS_LIMITS.audioBitrate + 1],
      ["output.videoBitrate", 16_000_000.5],
    ] as const) {
      const source = settings();
      setPath(source, path, bad);
      expectInvalid(source, path);
    }
  });

  it("rejects malformed colours, booleans, asset ids, missing keys, and non-object sections", () => {
    for (const [path, bad] of [
      ["slide.borderColor", "#fff"],
      ["background.colorA", "red"],
      ["background.colorB", "#00000000"],
      ["background.accent", "<script>"],
      ["presenter.borderColor", "#gggggg"],
      ["stage.transparent", 0],
      ["motion.autoplay", "true"],
      ["presenter.enabled", 1],
      ["presenter.muted", null],
      ["presenter.assetId", "bad\u0000id"],
      ["presenter.assetId", "x".repeat(STUDIO_SETTINGS_LIMITS.presenterAssetIdLength + 1)],
      ["slide", []],
      ["background", null],
    ] as const) {
      const source = settings();
      setPath(source, path, bad);
      expectInvalid(source, path);
    }

    const missing = settings();
    delete missing.motion.speed;
    expectInvalid(missing, "motion.speed");
  });

  it("ignores unknown keys without touching their values or leaking prototypes", () => {
    const source = settings();
    source.futureRoot = { deeply: { nested: true } };
    source.motion.futureMotion = "ignored";
    Object.assign(source, JSON.parse('{"__proto__":{"polluted":true},"constructor":{"polluted":true}}'));
    Object.defineProperty(source, "hostileGetter", {
      enumerable: true,
      get: () => {
        throw new Error("unknown fields must not be read");
      },
    });

    const result = validateStudioSettings(source) as StudioSettings & Record<string, unknown>;
    expect(result).toEqual(DEFAULT_SETTINGS);
    expect(result).not.toHaveProperty("futureRoot");
    expect(result.motion).not.toHaveProperty("futureMotion");
    expect(result).not.toHaveProperty("__proto__.polluted");
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });

  it("exposes a stable, inspectable validation error", () => {
    const source = settings();
    source.output.fps = 120;
    const error = expectInvalid(source, "output.fps");

    expect(error.message).toContain("settings.output.fps");
    expect(error.message).toContain("24, 25, 30, 50, 60");
  });
});
