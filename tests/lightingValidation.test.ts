import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  LIGHTING_VERSION,
  cloneSettings,
} from "../src/model";
import {
  SettingsValidationError,
  validateStudioSettings,
} from "../src/lib/settingsValidation";

function candidate(): Record<string, any> {
  return cloneSettings(DEFAULT_SETTINGS) as unknown as Record<string, any>;
}

function expectInvalidCandidate(source: unknown, path: string): SettingsValidationError {
  try {
    validateStudioSettings(source);
  } catch (error) {
    expect(error).toBeInstanceOf(SettingsValidationError);
    expect(error).toMatchObject({
      name: "SettingsValidationError",
      code: "INVALID_STUDIO_SETTINGS",
      path,
    });
    return error as SettingsValidationError;
  }
  throw new Error(`Expected ${path} to fail validation`);
}

function expectLightingInvalid(path: string, value: unknown): void {
  const source = candidate();
  source.lighting[path] = value;
  expectInvalidCandidate(source, `settings.lighting.${path}`);
}

describe("lighting settings trust boundary", () => {
  it("hydrates pre-lighting schema-v1 projects from their visible legacy shadow values", () => {
    const source = candidate();
    source.slide.shadowOpacity = 0.61;
    source.slide.shadowSoftness = 73;
    delete source.lighting;

    const result = validateStudioSettings(source);
    expect(result.lighting).toEqual({
      ...DEFAULT_SETTINGS.lighting,
      shadowOpacity: 0.61,
      shadowSoftness: 73,
    });
  });

  it("upgrades first-generation lighting objects with only additive v2 fields", () => {
    const source = candidate();
    const firstGeneration = { ...source.lighting };
    for (const key of [
      "version",
      "space",
      "motionMode",
      "motionSpeed",
      "artworkProtection",
      "heroProtection",
      "goboStrength",
    ]) delete firstGeneration[key];
    source.lighting = firstGeneration;

    const result = validateStudioSettings(source);
    expect(result.lighting).toEqual({
      ...firstGeneration,
      version: LIGHTING_VERSION,
      space: DEFAULT_SETTINGS.lighting.space,
      motionMode: DEFAULT_SETTINGS.lighting.motionMode,
      motionSpeed: DEFAULT_SETTINGS.lighting.motionSpeed,
      artworkProtection: DEFAULT_SETTINGS.lighting.artworkProtection,
      heroProtection: DEFAULT_SETTINGS.lighting.heroProtection,
      goboStrength: DEFAULT_SETTINGS.lighting.goboStrength,
    });
  });

  it("does not silently repair supplied malformed fields from either lighting generation", () => {
    const missing = candidate();
    delete missing.lighting.keyIntensity;
    expectInvalidCandidate(missing, "settings.lighting.keyIntensity");

    const malformedVersion = candidate();
    malformedVersion.lighting.version = LIGHTING_VERSION + 1;
    expectInvalidCandidate(malformedVersion, "settings.lighting.version");

    const wrongShape = candidate();
    wrongShape.lighting = [];
    expectInvalidCandidate(wrongShape, "settings.lighting");
  });

  it("accepts every surfaced lower and upper boundary", () => {
    const lower = candidate();
    Object.assign(lower.lighting, {
      version: LIGHTING_VERSION,
      preset: "custom",
      enabled: false,
      space: "stage",
      motionMode: "static",
      motionSpeed: 1,
      azimuth: -180,
      elevation: 5,
      keyIntensity: 0,
      fillIntensity: 0,
      rimIntensity: 0,
      sheen: 0,
      roughness: 0,
      artworkProtection: 0,
      heroProtection: 0,
      shadowOpacity: 0,
      shadowSoftness: 2,
      shadowDistance: 0,
      contactStrength: 0,
      backgroundSpill: 0,
      spillFocus: 0.15,
      goboStrength: 0,
      breath: 0,
      gobo: "softbox",
    });
    expect(validateStudioSettings(lower)).toEqual(lower);

    const upper = candidate();
    Object.assign(upper.lighting, {
      version: LIGHTING_VERSION,
      preset: "headlight-sweep",
      enabled: true,
      space: "card",
      motionMode: "orbit",
      motionSpeed: 4,
      azimuth: 180,
      elevation: 85,
      keyIntensity: 2,
      fillIntensity: 1,
      rimIntensity: 1,
      sheen: 1,
      roughness: 1,
      artworkProtection: 1,
      heroProtection: 1,
      shadowOpacity: 0.9,
      shadowSoftness: 180,
      shadowDistance: 180,
      contactStrength: 1,
      backgroundSpill: 1,
      spillFocus: 1.5,
      goboStrength: 1,
      breath: 1,
      gobo: "headlights",
    });
    expect(validateStudioSettings(upper)).toEqual(upper);
  });

  it("rejects enum, colour, non-finite, integer, and range escapes", () => {
    for (const [path, value] of [
      ["preset", "palette-swap"],
      ["gobo", "venetian"],
      ["space", "world"],
      ["motionMode", "random"],
      ["motionSpeed", 0],
      ["motionSpeed", 2.5],
      ["motionSpeed", 5],
      ["keyColor", "white"],
      ["fillColor", "#fff"],
      ["shadowColor", "#00000000"],
      ["enabled", 1],
      ["azimuth", 181],
      ["elevation", 4.999],
      ["keyIntensity", 2.001],
      ["fillIntensity", -0.001],
      ["rimIntensity", Number.NaN],
      ["sheen", Number.POSITIVE_INFINITY],
      ["roughness", -0.001],
      ["artworkProtection", 1.001],
      ["heroProtection", -0.001],
      ["shadowOpacity", 0.901],
      ["shadowSoftness", 1.999],
      ["shadowDistance", 180.001],
      ["contactStrength", 1.001],
      ["backgroundSpill", -0.001],
      ["spillFocus", 1.501],
      ["goboStrength", 1.001],
      ["breath", 1.001],
    ] as const) expectLightingInvalid(path, value);
  });

  it("drops unknown lighting keys without invoking hostile getters", () => {
    const source = candidate();
    source.lighting.futureLighting = { hidden: true };
    Object.defineProperty(source.lighting, "hostileGetter", {
      enumerable: true,
      get: () => {
        throw new Error("unknown lighting fields must not be read");
      },
    });

    const result = validateStudioSettings(source);
    expect(result.lighting).toEqual(DEFAULT_SETTINGS.lighting);
    expect(result.lighting).not.toHaveProperty("futureLighting");
    expect(result.lighting).not.toHaveProperty("hostileGetter");
  });
});
