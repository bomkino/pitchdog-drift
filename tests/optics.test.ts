import { describe, expect, it } from "vitest";
import { cloneSettings, DEFAULT_SETTINGS, LENS_PROFILE_IDS } from "../src/model";
import { LENS_PROFILES, applyLensProfile, getLensProfile, hasVisibleOptics, patchCustomOptics } from "../src/optics";

const UNIT_INTERVAL_FIELDS = [
  "softFocus",
  "edgeSoftness",
  "motionBlur",
  "chromaticAberration",
  "bloom",
  "halation",
  "flare",
  "vignette",
  "gateWeave",
  "breathing",
] as const;

describe("authored lens profiles", () => {
  it("exposes six distinct recipes plus the custom state", () => {
    expect(LENS_PROFILES).toHaveLength(6);
    expect(LENS_PROFILES.map((profile) => profile.id)).toEqual(LENS_PROFILE_IDS.filter((id) => id !== "custom"));
    expect(new Set(LENS_PROFILES.map((profile) => profile.id)).size).toBe(6);
    expect(getLensProfile("custom")).toBeNull();
  });

  it("keeps every recipe inside the strict control contract", () => {
    for (const profile of LENS_PROFILES) {
      for (const field of UNIT_INTERVAL_FIELDS) {
        expect(profile.optics[field]).toBeGreaterThanOrEqual(0);
        expect(profile.optics[field]).toBeLessThanOrEqual(1);
      }
      expect(profile.optics.grain).toBeGreaterThanOrEqual(0);
      expect(profile.optics.grain).toBeLessThanOrEqual(0.5);
      expect(profile.optics.barrelDistortion).toBeGreaterThanOrEqual(-1);
      expect(profile.optics.barrelDistortion).toBeLessThanOrEqual(1);
    }
  });

  it("applies a recipe without resetting composition, output, or presenter protection", () => {
    const current = cloneSettings(DEFAULT_SETTINGS);
    current.motion.speed = 0.77;
    current.output.duration = 17;
    current.optics.protectPresenter = false;

    const next = applyLensProfile(current, "anamorphic-night");
    expect(next.optics.profile).toBe("anamorphic-night");
    expect(next.optics.chromaticAberration).toBeGreaterThan(current.optics.chromaticAberration);
    expect(next.optics.protectPresenter).toBe(false);
    expect(next.motion.speed).toBe(0.77);
    expect(next.output.duration).toBe(17);
  });

  it("marks manual optical direction as custom", () => {
    const current = cloneSettings(DEFAULT_SETTINGS);
    const next = patchCustomOptics(current, { softFocus: 0.73, enabled: false });
    expect(next.optics.profile).toBe("custom");
    expect(next.optics.softFocus).toBe(0.73);
    expect(next.optics.enabled).toBe(false);
  });

  it("bypasses the full-frame target when every optical effect is truly absent", () => {
    const optics = structuredClone(DEFAULT_SETTINGS.optics);
    optics.enabled = true;
    optics.softFocus = 0;
    optics.edgeSoftness = 0;
    optics.motionBlur = 0;
    optics.chromaticAberration = 0;
    optics.bloom = 0;
    optics.halation = 0;
    optics.flare = 0;
    optics.barrelDistortion = 0;
    optics.vignette = 0;
    optics.grain = 0;
    optics.gateWeave = 0;
    optics.breathing = 0;
    expect(hasVisibleOptics(optics)).toBe(false);
    optics.grain = 0.001;
    expect(hasVisibleOptics(optics)).toBe(true);
    optics.enabled = false;
    expect(hasVisibleOptics(optics)).toBe(false);
  });
});
