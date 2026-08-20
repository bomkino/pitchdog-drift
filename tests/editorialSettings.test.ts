import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import { SettingsValidationError, validateStudioSettings } from "../src/lib/settingsValidation";

describe("editorial cadence settings contract", () => {
  it("accepts editorial cadence without a schema migration", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.flow = "editorial";
    settings.motion.curvature = 0.78;
    settings.motion.edgeFade = 0.64;

    expect(validateStudioSettings(settings)).toEqual(settings);
    expect(settings.schemaVersion).toBe(DEFAULT_SETTINGS.schemaVersion);
  });

  it("keeps all existing projects on their original motion path", () => {
    const existing = validateStudioSettings(cloneSettings(DEFAULT_SETTINGS));
    expect(existing.motion.flow).toBe("ribbon");
  });

  it("still rejects unknown motion grammars at the trust boundary", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS) as unknown as Record<string, any>;
    settings.motion.flow = "editorial-but-untrusted";
    expect(() => validateStudioSettings(settings)).toThrowError(SettingsValidationError);
  });
});
