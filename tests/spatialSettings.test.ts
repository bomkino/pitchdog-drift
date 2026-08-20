import { describe, expect, it } from "vitest";
import controlSource from "../src/components/ControlPanel.tsx?raw";
import {
  cloneSettings,
  DEFAULT_SETTINGS,
  MAX_SLIDE_THICKNESS,
  type DynamicsMode,
  type SurfaceMode,
} from "../src/model";
import {
  SettingsValidationError,
  validateStudioSettings,
} from "../src/lib/settingsValidation";
import { THEMES } from "../src/themes";

const DYNAMICS: DynamicsMode[] = ["direct", "weighted", "spring", "drift"];
const SURFACES: SurfaceMode[] = ["card", "paper", "silk", "gel"];

describe("spatial settings trust boundary", () => {
  it("hydrates only missing legacy extension fields", () => {
    const legacy = cloneSettings(DEFAULT_SETTINGS) as Record<string, any>;
    delete legacy.motion.dynamics;
    delete legacy.motion.bank;
    delete legacy.slide.surface;
    delete legacy.slide.thickness;
    const validated = validateStudioSettings(legacy);
    expect(validated.motion.dynamics).toBe(DEFAULT_SETTINGS.motion.dynamics);
    expect(validated.motion.bank).toBe(DEFAULT_SETTINGS.motion.bank);
    expect(validated.slide.surface).toBe(DEFAULT_SETTINGS.slide.surface);
    expect(validated.slide.thickness).toBe(DEFAULT_SETTINGS.slide.thickness);
  });

  it("accepts every surfaced physics and material value", () => {
    for (const dynamics of DYNAMICS) {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      settings.motion.dynamics = dynamics;
      expect(validateStudioSettings(settings).motion.dynamics).toBe(dynamics);
    }
    for (const surface of SURFACES) {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      settings.slide.surface = surface;
      expect(validateStudioSettings(settings).slide.surface).toBe(surface);
    }
  });

  it("shares one thickness ceiling between model, UI, and validation", () => {
    const maximum = cloneSettings(DEFAULT_SETTINGS);
    maximum.slide.thickness = MAX_SLIDE_THICKNESS;
    expect(validateStudioSettings(maximum).slide.thickness).toBe(MAX_SLIDE_THICKNESS);

    const escaped = cloneSettings(DEFAULT_SETTINGS);
    escaped.slide.thickness = MAX_SLIDE_THICKNESS + 0.001;
    try {
      validateStudioSettings(escaped);
      throw new Error("Expected thickness validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(SettingsValidationError);
      expect(error).toMatchObject({ path: "settings.slide.thickness" });
    }

    expect(controlSource).toContain("max={MAX_SLIDE_THICKNESS}");
  });

  it("rejects malformed supplied extensions instead of silently defaulting them", () => {
    for (const [section, key, value] of [
      ["motion", "dynamics", "floaty"],
      ["motion", "bank", Number.NaN],
      ["slide", "surface", "vinyl"],
      ["slide", "thickness", -0.001],
    ] as const) {
      const settings = cloneSettings(DEFAULT_SETTINGS) as Record<string, any>;
      settings[section][key] = value;
      expect(() => validateStudioSettings(settings)).toThrow(SettingsValidationError);
    }
  });

  it("keeps every authored film world valid and uses the deeper spatial vocabulary", () => {
    for (const theme of THEMES) {
      expect(validateStudioSettings(theme.settings)).toEqual(theme.settings);
    }
    expect(THEMES.find((theme) => theme.id === "tender-light")?.settings.motion.flow)
      .toBe("orbit");
    expect(THEMES.find((theme) => theme.id === "chrome-dream")?.settings.motion.flow)
      .toBe("helix");
    expect(new Set(THEMES.map((theme) => theme.settings.motion.dynamics)).size)
      .toBeGreaterThanOrEqual(3);
    expect(new Set(THEMES.map((theme) => theme.settings.slide.surface)).size)
      .toBe(SURFACES.length);
  });
});
