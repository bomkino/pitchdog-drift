import { describe, expect, it } from "vitest";
import {
  LIGHTING_PRESETS,
  applyLightingPreset,
  resolveLightingFrame,
} from "../src/lighting";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import { THEMES } from "../src/themes";
import { validateStudioSettings } from "../src/lib/settingsValidation";

function expectTupleClose(actual: readonly number[], expected: readonly number[], precision = 10): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, precision));
}

describe("authored cinematic lighting", () => {
  it("ships six materially distinct, valid rigs rather than palette swaps", () => {
    expect(LIGHTING_PRESETS).toHaveLength(6);
    expect(new Set(LIGHTING_PRESETS.map((preset) => preset.id)).size).toBe(6);
    expect(new Set(LIGHTING_PRESETS.map((preset) => preset.lighting.gobo)).size).toBe(6);
    expect(new Set(LIGHTING_PRESETS.map((preset) => preset.lighting.shadowDistance)).size).toBe(6);
    expect(new Set(LIGHTING_PRESETS.map((preset) => preset.lighting.elevation)).size).toBe(6);

    for (const preset of LIGHTING_PRESETS) {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      settings.lighting = { ...preset.lighting };
      expect(validateStudioSettings(settings).lighting).toEqual(preset.lighting);
    }
  });

  it("gives every film world an authored lighting rig", () => {
    expect(THEMES.map((theme) => theme.settings.lighting.preset)).toEqual([
      "studio-soft",
      "window-rake",
      "noir-slice",
      "projector-haze",
      "golden-hour",
      "electric-rim",
    ]);
    expect(new Set(THEMES.map((theme) => theme.settings.lighting.preset)).size).toBe(THEMES.length);
  });

  it("applies a recipe without mutating the previous rig", () => {
    const current = { ...DEFAULT_SETTINGS.lighting };
    const next = applyLightingPreset(current, "noir-slice");

    expect(next).toEqual(LIGHTING_PRESETS.find((preset) => preset.id === "noir-slice")!.lighting);
    expect(next).not.toBe(current);
    expect(current).toEqual(DEFAULT_SETTINGS.lighting);
    expect(applyLightingPreset(current, "custom")).toEqual({ ...current, preset: "custom" });
  });

  it("resolves finite unit vectors and bounded shadow geometry at every control extreme", () => {
    for (const azimuth of [-180, 0, 180]) {
      for (const elevation of [5, 45, 85]) {
        for (const shadowDistance of [0, 180]) {
          const lighting = {
            ...DEFAULT_SETTINGS.lighting,
            azimuth,
            elevation,
            shadowDistance,
            breath: 1,
          };
          const frame = resolveLightingFrame(lighting, {
            time: 1_000_000,
            reduced: false,
            seamless: false,
            duration: 30,
            loops: 6,
          });
          const values = [
            ...frame.direction,
            ...frame.screenDirection,
            ...frame.shadowOffset,
            frame.phase,
            frame.goboMode,
          ];
          expect(values.every(Number.isFinite)).toBe(true);
          expect(Math.hypot(...frame.direction)).toBeCloseTo(1, 12);
          expect(Math.hypot(...frame.screenDirection)).toBeCloseTo(1, 12);
          expect(Math.hypot(...frame.shadowOffset)).toBeLessThanOrEqual(181);
        }
      }
    }
  });

  it("shortens the cast as the source rises", () => {
    const timeline = { time: 0, reduced: false, seamless: false, duration: 8, loops: 1 };
    const low = resolveLightingFrame({ ...DEFAULT_SETTINGS.lighting, elevation: 5, shadowDistance: 180 }, timeline);
    const high = resolveLightingFrame({ ...DEFAULT_SETTINGS.lighting, elevation: 85, shadowDistance: 180 }, timeline);

    expect(Math.hypot(...low.shadowOffset)).toBeGreaterThan(Math.hypot(...high.shadowOffset));
  });

  it("closes the complete light state exactly at a seamless master boundary", () => {
    const lighting = { ...DEFAULT_SETTINGS.lighting, breath: 1 };
    const timeline = { reduced: false, seamless: true, duration: 8, loops: 3 };
    const start = resolveLightingFrame(lighting, { ...timeline, time: 0 });
    const end = resolveLightingFrame(lighting, { ...timeline, time: timeline.duration });

    expectTupleClose(end.direction, start.direction);
    expectTupleClose(end.screenDirection, start.screenDirection);
    expectTupleClose(end.shadowOffset, start.shadowOffset);
    expect(end.goboMode).toBe(start.goboMode);
    expect(end.phase).toBeCloseTo(Math.PI * 2 * timeline.loops, 12);
  });

  it("freezes every animated lighting quantity under reduced motion", () => {
    const lighting = { ...DEFAULT_SETTINGS.lighting, breath: 1 };
    const base = { reduced: true, seamless: false, duration: 8, loops: 1 };
    const first = resolveLightingFrame(lighting, { ...base, time: 0 });
    const later = resolveLightingFrame(lighting, { ...base, time: 999_999 });

    expect(later).toEqual(first);
    expect(first.phase).toBe(0);
  });
});
