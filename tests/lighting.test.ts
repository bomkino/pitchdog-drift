import { describe, expect, it } from "vitest";
import {
  applyLightingPreset,
  getLightingPreset,
  isLightingCustomized,
  LIGHTING_PRESETS,
  lightingNeedsContinuousFrames,
  resolveLightingFrame,
} from "../src/lighting";
import { DEFAULT_SETTINGS, cloneSettings, type LightingSettings } from "../src/model";
import { THEMES } from "../src/themes";
import { validateStudioSettings } from "../src/lib/settingsValidation";

function frame(
  lighting: LightingSettings,
  time: number,
  overrides: Partial<Parameters<typeof resolveLightingFrame>[1]> = {},
) {
  return resolveLightingFrame(lighting, {
    time,
    reduced: false,
    seamless: false,
    duration: 8,
    loops: 1,
    ...overrides,
  });
}

describe("authored lighting direction", () => {
  it("ships twelve structurally distinct rigs rather than palette swaps", () => {
    expect(LIGHTING_PRESETS).toHaveLength(12);
    expect(new Set(LIGHTING_PRESETS.map((preset) => preset.id)).size).toBe(12);
    expect(new Set(LIGHTING_PRESETS.map((preset) => preset.lighting.gobo)).size).toBe(12);

    const signatures = LIGHTING_PRESETS.map(({ lighting }) => JSON.stringify({
      space: lighting.space,
      motion: [lighting.motionMode, lighting.motionSpeed, lighting.breath],
      source: [lighting.azimuth, lighting.elevation, lighting.keyIntensity, lighting.fillIntensity],
      surface: [lighting.rimIntensity, lighting.sheen, lighting.roughness, lighting.artworkProtection],
      shadow: [
        lighting.shadowOpacity,
        lighting.shadowSoftness,
        lighting.shadowDistance,
        lighting.contactStrength,
      ],
      field: [lighting.backgroundSpill, lighting.spillFocus, lighting.goboStrength, lighting.gobo],
    }));
    expect(new Set(signatures).size).toBe(LIGHTING_PRESETS.length);

    for (const preset of LIGHTING_PRESETS) {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      settings.lighting = { ...preset.lighting };
      expect(validateStudioSettings(settings).lighting).toEqual(preset.lighting);
    }
  });

  it("keeps every film world wired to an authored lighting rig", () => {
    for (const theme of THEMES) {
      expect(theme.settings.lighting.preset).not.toBe("custom");
      expect(getLightingPreset(theme.settings.lighting.preset).id)
        .toBe(theme.settings.lighting.preset);
    }
  });

  it("applies a rig without mutating source state or overriding an intentional bypass", () => {
    const current = cloneSettings(DEFAULT_SETTINGS).lighting;
    current.enabled = false;
    const next = applyLightingPreset(current, "moon-pool");

    expect(next).toEqual({
      ...getLightingPreset("moon-pool").lighting,
      enabled: false,
    });
    expect(next).not.toBe(current);
    expect(current.preset).toBe("studio-soft");
  });

  it("tracks tuned rigs without treating the master bypass as customization", () => {
    const authored = { ...getLightingPreset("studio-soft").lighting };
    expect(isLightingCustomized(authored)).toBe(false);

    authored.enabled = false;
    expect(isLightingCustomized(authored)).toBe(false);

    authored.shadowSoftness += 1;
    expect(isLightingCustomized(authored)).toBe(true);

    const reset = applyLightingPreset(authored, authored.preset);
    expect(isLightingCustomized(reset)).toBe(false);
    expect(reset.enabled).toBe(false);
  });

  it("resolves finite normalized directions and bounded fields across every rig", () => {
    for (const preset of LIGHTING_PRESETS) {
      for (const time of [0, 0.125, 3.75, 8, 93.4]) {
        const resolved = frame(preset.lighting, time);
        expect(resolved.direction.every(Number.isFinite)).toBe(true);
        expect(resolved.screenDirection.every(Number.isFinite)).toBe(true);
        expect(resolved.shadowOffset.every(Number.isFinite)).toBe(true);
        expect(resolved.fieldCenter.every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...resolved.direction)).toBeCloseTo(1, 8);
        expect(Math.hypot(...resolved.screenDirection)).toBeCloseTo(1, 8);
        expect(Math.hypot(...resolved.shadowOffset))
          .toBeLessThanOrEqual(preset.lighting.shadowDistance + 1e-8);
        expect(Math.abs(resolved.fieldCenter[0])).toBeLessThanOrEqual(0.45);
        expect(Math.abs(resolved.fieldCenter[1])).toBeLessThanOrEqual(0.45);
        expect(resolved.intensity).toBeGreaterThanOrEqual(0.82);
        expect(resolved.intensity).toBeLessThanOrEqual(1.18);
        expect(resolved.goboMode).toBeGreaterThanOrEqual(0);
        expect(resolved.goboMode).toBeLessThan(12);
      }
    }
  });

  it("closes every animated rig exactly under seamless export", () => {
    for (const preset of LIGHTING_PRESETS) {
      const timeline = {
        reduced: false,
        seamless: true,
        duration: 9,
        loops: 3,
      };
      const start = resolveLightingFrame(preset.lighting, { ...timeline, time: 0 });
      const end = resolveLightingFrame(preset.lighting, { ...timeline, time: 9 });

      for (const key of ["direction", "screenDirection", "shadowOffset", "fieldCenter"] as const) {
        expect(end[key][0]).toBeCloseTo(start[key][0], 10);
        expect(end[key][1]).toBeCloseTo(start[key][1], 10);
      }
      expect(end.direction[2]).toBeCloseTo(start.direction[2], 10);
      expect(end.intensity).toBeCloseTo(start.intensity, 10);
      expect(end.goboMode).toBe(start.goboMode);
    }
  });

  it("freezes the complete state for reduced motion and static light", () => {
    const moving = { ...getLightingPreset("headlight-sweep").lighting };
    const reducedStart = frame(moving, 0, { reduced: true });
    const reducedLater = frame(moving, 1_000_000, { reduced: true });
    expect(reducedLater).toEqual(reducedStart);

    const staticRig = { ...moving, motionMode: "static" as const, breath: 1 };
    expect(frame(staticRig, 0)).toEqual(frame(staticRig, 1_000_000));
  });

  it("requests continuous preview frames only when light can actually move", () => {
    const lighting = { ...DEFAULT_SETTINGS.lighting };
    expect(lightingNeedsContinuousFrames(lighting, false)).toBe(true);
    expect(lightingNeedsContinuousFrames(lighting, true)).toBe(false);
    expect(lightingNeedsContinuousFrames({ ...lighting, enabled: false }, false)).toBe(false);
    expect(lightingNeedsContinuousFrames({ ...lighting, breath: 0 }, false)).toBe(false);
    expect(lightingNeedsContinuousFrames({ ...lighting, motionMode: "static" }, false)).toBe(false);
  });

  it("shortens the cast as the source rises without exceeding authored reach", () => {
    const base = { ...DEFAULT_SETTINGS.lighting, shadowDistance: 180, motionMode: "static" as const };
    const low = frame({ ...base, elevation: 5 }, 0);
    const high = frame({ ...base, elevation: 85 }, 0);

    expect(Math.hypot(...low.shadowOffset)).toBeGreaterThan(Math.hypot(...high.shadowOffset));
    expect(Math.hypot(...low.shadowOffset)).toBeLessThanOrEqual(180);
  });

  it("keeps all four motion speeds deterministic and exactly closing", () => {
    const base = { ...getLightingPreset("lantern-flicker").lighting };
    for (const motionSpeed of [1, 2, 3, 4] as const) {
      const lighting = { ...base, motionSpeed };
      const start = frame(lighting, 0, { seamless: true, duration: 11, loops: 2 });
      const end = frame(lighting, 11, { seamless: true, duration: 11, loops: 2 });
      expect(end.direction[0]).toBeCloseTo(start.direction[0], 10);
      expect(end.direction[1]).toBeCloseTo(start.direction[1], 10);
      expect(end.direction[2]).toBeCloseTo(start.direction[2], 10);
      expect(end.intensity).toBeCloseTo(start.intensity, 10);
    }
  });
});
