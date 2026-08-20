import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
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
    expect(result).not.toHaveProperty("lighting.futureValue");
  });

  it("does not silently repair a supplied but malformed lighting section", () => {
    const missing = candidate();
    delete missing.lighting.keyIntensity;
    expectInvalidCandidate(missing, "settings.lighting.keyIntensity");

    const wrongShape = candidate();
    wrongShape.lighting = [];
    expectInvalidCandidate(wrongShape, "settings.lighting");
  });

  it("accepts every surfaced lower and upper boundary", () => {
    const lower = candidate();
    Object.assign(lower.lighting, {
      preset: "custom",
      enabled: false,
      azimuth: -180,
      elevation: 5,
      keyIntensity: 0,
      fillIntensity: 0,
      rimIntensity: 0,
      sheen: 0,
      roughness: 0,
      shadowOpacity: 0,
      shadowSoftness: 2,
      shadowDistance: 0,
      contactStrength: 0,
      backgroundSpill: 0,
      spillFocus: 0.15,
      breath: 0,
      gobo: "softbox",
    });
    expect(validateStudioSettings(lower)).toEqual(lower);

    const upper = candidate();
    Object.assign(upper.lighting, {
      preset: "electric-rim",
      enabled: true,
      azimuth: 180,
      elevation: 85,
      keyIntensity: 2,
      fillIntensity: 1,
      rimIntensity: 1,
      sheen: 1,
      roughness: 1,
      shadowOpacity: 0.9,
      shadowSoftness: 180,
      shadowDistance: 180,
      contactStrength: 1,
      backgroundSpill: 1,
      spillFocus: 1.5,
      breath: 1,
      gobo: "edge",
    });
    expect(validateStudioSettings(upper)).toEqual(upper);
  });

  it("rejects enum, colour, non-finite, and range escapes", () => {
    for (const [path, value] of [
      ["preset", "palette-swap"],
      ["gobo", "venetian"],
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
      ["shadowOpacity", 0.901],
      ["shadowSoftness", 1.999],
      ["shadowDistance", 180.001],
      ["contactStrength", 1.001],
      ["backgroundSpill", -0.001],
      ["spillFocus", 1.501],
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

    const result = validateStudioSettings(source) as typeof DEFAULT_SETTINGS & Record<string, unknown>;
    expect(result.lighting).toEqual(DEFAULT_SETTINGS.lighting);
    expect(result.lighting).not.toHaveProperty("futureLighting");
    expect(result.lighting).not.toHaveProperty("hostileGetter");
  });
});
