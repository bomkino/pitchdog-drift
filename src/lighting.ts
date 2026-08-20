import type {
  LightGobo,
  LightingPresetId,
  LightingSettings,
} from "./model";

export type AuthoredLightingPresetId = Exclude<LightingPresetId, "custom">;

export interface LightingPreset {
  id: AuthoredLightingPresetId;
  name: string;
  eyebrow: string;
  description: string;
  lighting: LightingSettings;
}

function definePreset(
  id: AuthoredLightingPresetId,
  name: string,
  eyebrow: string,
  description: string,
  lighting: Omit<LightingSettings, "preset">,
): LightingPreset {
  return { id, name, eyebrow, description, lighting: { preset: id, ...lighting } };
}

export const LIGHTING_PRESETS: readonly LightingPreset[] = [
  definePreset(
    "studio-soft",
    "Studio Soft",
    "Large source · readable skin",
    "A broad neutral key, quiet cool fill, and a short contact-rich shadow. The safest authored starting point.",
    {
      enabled: true,
      keyColor: "#fff1dc",
      fillColor: "#b9c9e8",
      shadowColor: "#100c12",
      azimuth: 42,
      elevation: 56,
      keyIntensity: 0.78,
      fillIntensity: 0.54,
      rimIntensity: 0.14,
      sheen: 0.16,
      roughness: 0.72,
      shadowOpacity: 0.34,
      shadowSoftness: 52,
      shadowDistance: 54,
      contactStrength: 0.58,
      backgroundSpill: 0.28,
      spillFocus: 0.78,
      breath: 0.1,
      gobo: "softbox",
    },
  ),
  definePreset(
    "window-rake",
    "Window Rake",
    "Low side key · long afternoon",
    "Warm directional light crosses the deck like a nearby window, with a legible cool fill and a longer cast shadow.",
    {
      enabled: true,
      keyColor: "#ffd39b",
      fillColor: "#8fa8d8",
      shadowColor: "#160e12",
      azimuth: 142,
      elevation: 28,
      keyIntensity: 1.08,
      fillIntensity: 0.3,
      rimIntensity: 0.2,
      sheen: 0.18,
      roughness: 0.58,
      shadowOpacity: 0.48,
      shadowSoftness: 38,
      shadowDistance: 118,
      contactStrength: 0.72,
      backgroundSpill: 0.54,
      spillFocus: 0.66,
      breath: 0.16,
      gobo: "window",
    },
  ),
  definePreset(
    "projector-haze",
    "Projector Haze",
    "Frontal pool · dust in the beam",
    "A restrained frontal pool with soft falloff. It feels projected rather than digitally gradient-filled.",
    {
      enabled: true,
      keyColor: "#ffe2b2",
      fillColor: "#566789",
      shadowColor: "#09090f",
      azimuth: 94,
      elevation: 68,
      keyIntensity: 0.86,
      fillIntensity: 0.38,
      rimIntensity: 0.08,
      sheen: 0.1,
      roughness: 0.78,
      shadowOpacity: 0.32,
      shadowSoftness: 72,
      shadowDistance: 42,
      contactStrength: 0.56,
      backgroundSpill: 0.7,
      spillFocus: 0.5,
      breath: 0.22,
      gobo: "projector",
    },
  ),
  definePreset(
    "noir-slice",
    "Noir Slice",
    "Hard cut · deep negative fill",
    "A low hard source, near-black fill, and a narrow atmospheric slash. Designed for dread without hiding the slide.",
    {
      enabled: true,
      keyColor: "#edf4ff",
      fillColor: "#161a2a",
      shadowColor: "#000000",
      azimuth: 164,
      elevation: 18,
      keyIntensity: 1.34,
      fillIntensity: 0.08,
      rimIntensity: 0.07,
      sheen: 0.28,
      roughness: 0.4,
      shadowOpacity: 0.72,
      shadowSoftness: 18,
      shadowDistance: 164,
      contactStrength: 0.9,
      backgroundSpill: 0.64,
      spillFocus: 0.3,
      breath: 0.04,
      gobo: "slit",
    },
  ),
  definePreset(
    "golden-hour",
    "Golden Hour",
    "Low amber key · violet air",
    "A low warm source with a restrained violet fill, generous penumbra, and a softly moving horizon glow.",
    {
      enabled: true,
      keyColor: "#ffbd66",
      fillColor: "#777fba",
      shadowColor: "#31170f",
      azimuth: 24,
      elevation: 16,
      keyIntensity: 1.08,
      fillIntensity: 0.31,
      rimIntensity: 0.26,
      sheen: 0.2,
      roughness: 0.54,
      shadowOpacity: 0.5,
      shadowSoftness: 58,
      shadowDistance: 172,
      contactStrength: 0.66,
      backgroundSpill: 0.58,
      spillFocus: 0.9,
      breath: 0.18,
      gobo: "sunset",
    },
  ),
  definePreset(
    "electric-rim",
    "Electric Rim",
    "Cyan edge · ultraviolet fill",
    "A glossy cyan edge and ultraviolet fill for music and speculative worlds, kept bounded so typography remains readable.",
    {
      enabled: true,
      keyColor: "#8feeff",
      fillColor: "#d081ff",
      shadowColor: "#070311",
      azimuth: -28,
      elevation: 42,
      keyIntensity: 0.84,
      fillIntensity: 0.35,
      rimIntensity: 0.74,
      sheen: 0.36,
      roughness: 0.34,
      shadowOpacity: 0.44,
      shadowSoftness: 46,
      shadowDistance: 92,
      contactStrength: 0.5,
      backgroundSpill: 0.5,
      spillFocus: 0.58,
      breath: 0.32,
      gobo: "edge",
    },
  ),
];

export function getLightingPreset(id: LightingPresetId): LightingPreset {
  return LIGHTING_PRESETS.find((preset) => preset.id === id) ?? LIGHTING_PRESETS[0]!;
}

export function applyLightingPreset(
  current: LightingSettings,
  id: LightingPresetId,
): LightingSettings {
  if (id === "custom") return { ...current, preset: "custom" };
  return { ...getLightingPreset(id).lighting };
}

export interface LightingTimeline {
  time: number;
  reduced: boolean;
  seamless: boolean;
  duration: number;
  loops: number;
}

export interface ResolvedLightingFrame {
  direction: [number, number, number];
  screenDirection: [number, number];
  shadowOffset: [number, number];
  phase: number;
  goboMode: number;
}

const TAU = Math.PI * 2;
const GOBO_MODES: Record<LightGobo, number> = {
  softbox: 0,
  window: 1,
  projector: 2,
  slit: 3,
  sunset: 4,
  edge: 5,
};

function normalise2(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
}

function normalise3(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/**
 * Resolves authored controls into a deterministic frame. The same function is
 * used by preview and export; seamless output closes the light's subtle sway
 * over an exact number of master loops, while reduced motion freezes it.
 */
export function resolveLightingFrame(
  settings: LightingSettings,
  timeline: LightingTimeline,
): ResolvedLightingFrame {
  const duration = Math.max(0.001, timeline.duration);
  const loops = Math.max(1, Math.round(timeline.loops));
  const animated = settings.enabled && settings.breath > 0 && !timeline.reduced;
  const phase = !animated
    ? 0
    : timeline.seamless
      ? (timeline.time / duration) * TAU * loops
      : timeline.time * 0.31;

  const breathedAzimuth = settings.azimuth + Math.sin(phase) * settings.breath * 2.4;
  const azimuth = breathedAzimuth * Math.PI / 180;
  const elevation = settings.elevation * Math.PI / 180;
  const planar = Math.cos(elevation);
  const direction = normalise3(
    Math.cos(azimuth) * planar,
    Math.sin(azimuth) * planar,
    Math.max(0.06, Math.sin(elevation)),
  );
  const screenDirection = normalise2(direction[0], direction[1]);
  const castDirection = normalise2(-screenDirection[0], -screenDirection[1]);
  const elevationScale = 0.34 + Math.cos(elevation) * 0.66;
  const pulse = 1 + Math.sin(phase * 2) * settings.breath * 0.035;
  const distance = Math.min(settings.shadowDistance, settings.shadowDistance * elevationScale * pulse);

  return {
    direction,
    screenDirection,
    shadowOffset: [castDirection[0] * distance, castDirection[1] * distance],
    phase,
    goboMode: GOBO_MODES[settings.gobo],
  };
}
