import { DEFAULT_SETTINGS, type LensProfileId, type OpticsSettings, type StudioSettings } from "./model";

export interface LensProfile {
  id: Exclude<LensProfileId, "custom">;
  name: string;
  eyebrow: string;
  description: string;
  optics: Omit<OpticsSettings, "profile" | "enabled" | "protectPresenter">;
}

function profile(
  id: LensProfile["id"],
  name: string,
  eyebrow: string,
  description: string,
  optics: LensProfile["optics"],
): LensProfile {
  return { id, name, eyebrow, description, optics };
}

export const LENS_PROFILES: LensProfile[] = [
  profile(
    "clean-gate",
    "Clean Gate",
    "Sharp · restrained",
    "A nearly invisible optical finish: minute grain, gentle vignette, no cosmetic fog.",
    {
      softFocus: 0.02,
      edgeSoftness: 0.04,
      motionBlur: 0.05,
      chromaticAberration: 0.015,
      bloom: 0.015,
      halation: 0.01,
      flare: 0,
      barrelDistortion: 0,
      vignette: 0.04,
      grain: 0.035,
      gateWeave: 0,
      breathing: 0,
    },
  ),
  profile(
    "soft-print",
    "Soft Print",
    "Celluloid · forgiving",
    "Low-contrast softness, warm highlight bleed, and enough grain to take the digital edge off.",
    {
      softFocus: 0.18,
      edgeSoftness: 0.24,
      motionBlur: 0.14,
      chromaticAberration: 0.1,
      bloom: 0.1,
      halation: 0.12,
      flare: 0.03,
      barrelDistortion: 0.02,
      vignette: 0.08,
      grain: 0.08,
      gateWeave: 0.02,
      breathing: 0.03,
    },
  ),
  profile(
    "anamorphic-night",
    "Anamorphic Night",
    "Wide glass · electric edges",
    "Directional smear, cyan-red edge split, and a thin horizontal flare that wakes up around highlights.",
    {
      softFocus: 0.12,
      edgeSoftness: 0.32,
      motionBlur: 0.28,
      chromaticAberration: 0.34,
      bloom: 0.22,
      halation: 0.12,
      flare: 0.42,
      barrelDistortion: 0.18,
      vignette: 0.2,
      grain: 0.07,
      gateWeave: 0.015,
      breathing: 0.1,
    },
  ),
  profile(
    "dream-glass",
    "Dream Glass",
    "Bloom · defocus",
    "A soft, floating lens for tenderness and memory. The centre holds; the edges fall away.",
    {
      softFocus: 0.42,
      edgeSoftness: 0.58,
      motionBlur: 0.12,
      chromaticAberration: 0.14,
      bloom: 0.34,
      halation: 0.32,
      flare: 0.08,
      barrelDistortion: -0.05,
      vignette: 0.12,
      grain: 0.055,
      gateWeave: 0.025,
      breathing: 0.08,
    },
  ),
  profile(
    "bleach-bypass",
    "Bleach Bypass",
    "Hard silver · nervous grain",
    "Crisp centre, dirty gate, hard vignette, and just enough channel misregistration to feel chemically unstable.",
    {
      softFocus: 0.035,
      edgeSoftness: 0.1,
      motionBlur: 0.09,
      chromaticAberration: 0.12,
      bloom: 0.015,
      halation: 0.025,
      flare: 0.015,
      barrelDistortion: 0.04,
      vignette: 0.34,
      grain: 0.2,
      gateWeave: 0.08,
      breathing: 0.02,
    },
  ),
  profile(
    "night-terror",
    "Night Terror",
    "Unstable · predatory",
    "Uneven defocus, pronounced red-cyan separation, breathing, and gate movement without unreadable sludge.",
    {
      softFocus: 0.22,
      edgeSoftness: 0.62,
      motionBlur: 0.38,
      chromaticAberration: 0.54,
      bloom: 0.08,
      halation: 0.28,
      flare: 0.05,
      barrelDistortion: 0.3,
      vignette: 0.48,
      grain: 0.18,
      gateWeave: 0.18,
      breathing: 0.22,
    },
  ),
];

export function getLensProfile(id: LensProfileId): LensProfile | null {
  return LENS_PROFILES.find((entry) => entry.id === id) ?? null;
}

export function applyLensProfile(current: StudioSettings, id: LensProfile["id"]): StudioSettings {
  const selected = getLensProfile(id);
  if (!selected) return current;
  return {
    ...current,
    optics: {
      ...DEFAULT_SETTINGS.optics,
      ...selected.optics,
      enabled: true,
      profile: selected.id,
      protectPresenter: current.optics.protectPresenter,
    },
  };
}

export function patchCustomOptics(
  current: StudioSettings,
  patch: Partial<Omit<OpticsSettings, "profile">>,
): StudioSettings {
  return {
    ...current,
    optics: {
      ...current.optics,
      ...patch,
      profile: "custom",
    },
  };
}

export function hasVisibleOptics(optics: OpticsSettings): boolean {
  if (!optics.enabled) return false;
  return optics.softFocus > 0.0001
    || optics.edgeSoftness > 0.0001
    || optics.motionBlur > 0.0001
    || optics.chromaticAberration > 0.0001
    || optics.bloom > 0.0001
    || optics.halation > 0.0001
    || optics.flare > 0.0001
    || Math.abs(optics.barrelDistortion) > 0.0001
    || optics.vignette > 0.0001
    || optics.grain > 0.0001
    || optics.gateWeave > 0.0001
    || optics.breathing > 0.0001;
}
