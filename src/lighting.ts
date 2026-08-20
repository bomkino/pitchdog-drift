import {
  LIGHTING_VERSION,
  type LightGobo,
  type LightingMotion,
  type LightingPresetId,
  type LightingSettings,
} from "./model";

export type AuthoredLightingPresetId = Exclude<LightingPresetId, "custom">;

export interface LightingPreset {
  id: AuthoredLightingPresetId;
  name: string;
  eyebrow: string;
  description: string;
  bestFor: string;
  lighting: LightingSettings;
}

type PresetLighting = Omit<LightingSettings, "version" | "preset">;

function definePreset(
  id: AuthoredLightingPresetId,
  name: string,
  eyebrow: string,
  description: string,
  bestFor: string,
  lighting: PresetLighting,
): LightingPreset {
  return {
    id,
    name,
    eyebrow,
    description,
    bestFor,
    lighting: {
      version: LIGHTING_VERSION,
      preset: id,
      ...lighting,
    },
  };
}

export const LIGHTING_PRESETS: readonly LightingPreset[] = [
  definePreset(
    "studio-soft",
    "Studio Soft",
    "Large source · faithful colour",
    "A broad warm key, quiet cool fill, and short contact-rich shadow. It gives the deck physical presence without re-grading it.",
    "Dialogue, editorial, founder-led work, dense typography",
    {
      enabled: true,
      space: "stage",
      motionMode: "breathe",
      motionSpeed: 1,
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
      artworkProtection: 0.82,
      heroProtection: 0.82,
      shadowOpacity: 0.34,
      shadowSoftness: 52,
      shadowDistance: 54,
      contactStrength: 0.58,
      backgroundSpill: 0.28,
      spillFocus: 0.78,
      goboStrength: 0.08,
      breath: 0.1,
      gobo: "softbox",
    },
  ),
  definePreset(
    "window-rake",
    "Window Rake",
    "Low side key · long afternoon",
    "Warm directional light crosses the stage like a nearby window. A cool fill keeps faces, titles, and detail readable.",
    "Travel, memory, domestic drama, warm documentary",
    {
      enabled: true,
      space: "stage",
      motionMode: "sweep",
      motionSpeed: 1,
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
      artworkProtection: 0.72,
      heroProtection: 0.78,
      shadowOpacity: 0.48,
      shadowSoftness: 38,
      shadowDistance: 118,
      contactStrength: 0.72,
      backgroundSpill: 0.54,
      spillFocus: 0.66,
      goboStrength: 0.32,
      breath: 0.16,
      gobo: "window",
    },
  ),
  definePreset(
    "projector-haze",
    "Projector Haze",
    "Frontal pool · optical memory",
    "A contained frontal pool with soft falloff. The world feels projected rather than gradient-filled, while the slide stays legible.",
    "Archive, evidence, screenings, documentary history",
    {
      enabled: true,
      space: "stage",
      motionMode: "flicker",
      motionSpeed: 2,
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
      artworkProtection: 0.78,
      heroProtection: 0.88,
      shadowOpacity: 0.32,
      shadowSoftness: 72,
      shadowDistance: 42,
      contactStrength: 0.56,
      backgroundSpill: 0.7,
      spillFocus: 0.5,
      goboStrength: 0.24,
      breath: 0.22,
      gobo: "projector",
    },
  ),
  definePreset(
    "noir-slice",
    "Noir Slice",
    "Hard cut · deep negative fill",
    "A low hard source, near-black fill, and narrow atmospheric slash. It creates dread without swallowing the hero slide.",
    "Horror, thriller, noir, psychological tension",
    {
      enabled: true,
      space: "stage",
      motionMode: "static",
      motionSpeed: 1,
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
      artworkProtection: 0.54,
      heroProtection: 0.82,
      shadowOpacity: 0.72,
      shadowSoftness: 18,
      shadowDistance: 164,
      contactStrength: 0.9,
      backgroundSpill: 0.64,
      spillFocus: 0.3,
      goboStrength: 0.46,
      breath: 0.04,
      gobo: "slit",
    },
  ),
  definePreset(
    "golden-hour",
    "Golden Hour",
    "Low amber key · violet air",
    "A low warm source with restrained violet fill, generous penumbra, and a slowly travelling horizon glow.",
    "Romance, tenderness, nostalgia, family stories",
    {
      enabled: true,
      space: "stage",
      motionMode: "sweep",
      motionSpeed: 1,
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
      artworkProtection: 0.68,
      heroProtection: 0.82,
      shadowOpacity: 0.5,
      shadowSoftness: 58,
      shadowDistance: 172,
      contactStrength: 0.66,
      backgroundSpill: 0.58,
      spillFocus: 0.9,
      goboStrength: 0.24,
      breath: 0.18,
      gobo: "sunset",
    },
  ),
  definePreset(
    "electric-rim",
    "Electric Rim",
    "Cyan edge · ultraviolet fill",
    "A cyan edge and ultraviolet fill for nocturnal worlds, with bounded gloss so typography remains the subject.",
    "Music, speculative fiction, nightlife, technology",
    {
      enabled: true,
      space: "card",
      motionMode: "orbit",
      motionSpeed: 2,
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
      artworkProtection: 0.62,
      heroProtection: 0.76,
      shadowOpacity: 0.44,
      shadowSoftness: 46,
      shadowDistance: 92,
      contactStrength: 0.5,
      backgroundSpill: 0.5,
      spillFocus: 0.58,
      goboStrength: 0.28,
      breath: 0.32,
      gobo: "edge",
    },
  ),
  definePreset(
    "overcast-window",
    "Overcast Window",
    "Cloud-soft daylight · almost shadowless",
    "Broad cool daylight and barely-there cast shadow. It gives quiet dimension while protecting every authored colour decision.",
    "Drama, documentary, architecture, restrained editorial",
    {
      enabled: true,
      space: "stage",
      motionMode: "breathe",
      motionSpeed: 1,
      keyColor: "#e8f0ff",
      fillColor: "#d8d2c5",
      shadowColor: "#151820",
      azimuth: 118,
      elevation: 64,
      keyIntensity: 0.62,
      fillIntensity: 0.72,
      rimIntensity: 0.05,
      sheen: 0.05,
      roughness: 0.9,
      artworkProtection: 0.94,
      heroProtection: 0.94,
      shadowOpacity: 0.18,
      shadowSoftness: 112,
      shadowDistance: 30,
      contactStrength: 0.34,
      backgroundSpill: 0.38,
      spillFocus: 1.18,
      goboStrength: 0.08,
      breath: 0.06,
      gobo: "overcast",
    },
  ),
  definePreset(
    "moon-pool",
    "Moon Pool",
    "Cold circle · deep blue air",
    "A high cool pool with a slow orbital drift, soft enough for dream logic and severe enough for night.",
    "Fantasy, dream, night exteriors, solitude",
    {
      enabled: true,
      space: "stage",
      motionMode: "orbit",
      motionSpeed: 1,
      keyColor: "#cadcff",
      fillColor: "#24345e",
      shadowColor: "#02040d",
      azimuth: -104,
      elevation: 74,
      keyIntensity: 0.88,
      fillIntensity: 0.18,
      rimIntensity: 0.34,
      sheen: 0.22,
      roughness: 0.6,
      artworkProtection: 0.7,
      heroProtection: 0.86,
      shadowOpacity: 0.46,
      shadowSoftness: 82,
      shadowDistance: 44,
      contactStrength: 0.52,
      backgroundSpill: 0.74,
      spillFocus: 0.46,
      goboStrength: 0.3,
      breath: 0.2,
      gobo: "moon",
    },
  ),
  definePreset(
    "sodium-vapor",
    "Sodium Vapor",
    "Street amber · hard urban cast",
    "A narrow amber street source with dirty green fill and an assertive cast. Industrial, lonely, and materially specific.",
    "Crime, urban night, road films, industrial work",
    {
      enabled: true,
      space: "stage",
      motionMode: "flicker",
      motionSpeed: 2,
      keyColor: "#ffac38",
      fillColor: "#6d7d62",
      shadowColor: "#170b02",
      azimuth: 152,
      elevation: 34,
      keyIntensity: 1.18,
      fillIntensity: 0.18,
      rimIntensity: 0.08,
      sheen: 0.2,
      roughness: 0.52,
      artworkProtection: 0.58,
      heroProtection: 0.74,
      shadowOpacity: 0.58,
      shadowSoftness: 28,
      shadowDistance: 126,
      contactStrength: 0.78,
      backgroundSpill: 0.66,
      spillFocus: 0.42,
      goboStrength: 0.42,
      breath: 0.22,
      gobo: "sodium",
    },
  ),
  definePreset(
    "lantern-flicker",
    "Lantern Flicker",
    "Warm local source · imperfect pulse",
    "A small warm source bound to each card, with deterministic asymmetric flicker and a soft intimate falloff.",
    "Folklore, ritual, historical drama, intimate horror",
    {
      enabled: true,
      space: "card",
      motionMode: "flicker",
      motionSpeed: 3,
      keyColor: "#ffb05a",
      fillColor: "#6b3441",
      shadowColor: "#1a0805",
      azimuth: 58,
      elevation: 38,
      keyIntensity: 1.22,
      fillIntensity: 0.24,
      rimIntensity: 0.16,
      sheen: 0.12,
      roughness: 0.68,
      artworkProtection: 0.66,
      heroProtection: 0.8,
      shadowOpacity: 0.52,
      shadowSoftness: 48,
      shadowDistance: 86,
      contactStrength: 0.7,
      backgroundSpill: 0.46,
      spillFocus: 0.38,
      goboStrength: 0.34,
      breath: 0.34,
      gobo: "lantern",
    },
  ),
  definePreset(
    "fluorescent-flat",
    "Fluorescent Flat",
    "Ceiling strip · institutional unease",
    "Cool overhead light, broad shallow shadow, and a nearly static ceiling field. Clinical rather than glossy.",
    "Workplace, hospital, bureaucracy, procedural stories",
    {
      enabled: true,
      space: "stage",
      motionMode: "flicker",
      motionSpeed: 4,
      keyColor: "#d8ffe8",
      fillColor: "#b4c7d8",
      shadowColor: "#11181a",
      azimuth: 90,
      elevation: 82,
      keyIntensity: 0.74,
      fillIntensity: 0.68,
      rimIntensity: 0.02,
      sheen: 0.04,
      roughness: 0.92,
      artworkProtection: 0.9,
      heroProtection: 0.92,
      shadowOpacity: 0.24,
      shadowSoftness: 68,
      shadowDistance: 22,
      contactStrength: 0.46,
      backgroundSpill: 0.5,
      spillFocus: 1.12,
      goboStrength: 0.16,
      breath: 0.12,
      gobo: "ceiling",
    },
  ),
  definePreset(
    "headlight-sweep",
    "Headlight Sweep",
    "Twin beams · travelling urgency",
    "Two hard travelling beams rake across the stage with a long directional cast. Built for momentum rather than ambience.",
    "Thriller, chase, road night, kinetic suspense",
    {
      enabled: true,
      space: "stage",
      motionMode: "sweep",
      motionSpeed: 3,
      keyColor: "#fff7df",
      fillColor: "#48627f",
      shadowColor: "#020409",
      azimuth: -8,
      elevation: 12,
      keyIntensity: 1.38,
      fillIntensity: 0.14,
      rimIntensity: 0.22,
      sheen: 0.26,
      roughness: 0.46,
      artworkProtection: 0.52,
      heroProtection: 0.8,
      shadowOpacity: 0.68,
      shadowSoftness: 24,
      shadowDistance: 178,
      contactStrength: 0.84,
      backgroundSpill: 0.8,
      spillFocus: 0.32,
      goboStrength: 0.54,
      breath: 0.42,
      gobo: "headlights",
    },
  ),
];

const COMPARED_LIGHTING_KEYS: readonly (keyof LightingSettings)[] = [
  "version",
  "space",
  "motionMode",
  "motionSpeed",
  "keyColor",
  "fillColor",
  "shadowColor",
  "azimuth",
  "elevation",
  "keyIntensity",
  "fillIntensity",
  "rimIntensity",
  "sheen",
  "roughness",
  "artworkProtection",
  "heroProtection",
  "shadowOpacity",
  "shadowSoftness",
  "shadowDistance",
  "contactStrength",
  "backgroundSpill",
  "spillFocus",
  "goboStrength",
  "breath",
  "gobo",
];

export function getLightingPreset(id: LightingPresetId): LightingPreset {
  return LIGHTING_PRESETS.find((preset) => preset.id === id) ?? LIGHTING_PRESETS[0]!;
}

export function applyLightingPreset(
  current: LightingSettings,
  id: LightingPresetId,
): LightingSettings {
  if (id === "custom") return { ...current };
  const enabled = current.enabled;
  return { ...getLightingPreset(id).lighting, enabled };
}

export function isLightingCustomized(settings: LightingSettings): boolean {
  if (settings.preset === "custom") return true;
  const authored = getLightingPreset(settings.preset).lighting;
  return COMPARED_LIGHTING_KEYS.some((key) => settings[key] !== authored[key]);
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
  fieldCenter: [number, number];
  phase: number;
  intensity: number;
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
  overcast: 6,
  moon: 7,
  sodium: 8,
  lantern: 9,
  ceiling: 10,
  headlights: 11,
};

const MOTION_SPEED: Record<LightingSettings["motionSpeed"], number> = {
  1: 0.18,
  2: 0.31,
  3: 0.52,
  4: 0.82,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalise2(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
}

function normalise3(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

export function lightingNeedsContinuousFrames(
  settings: LightingSettings,
  reduced: boolean,
): boolean {
  return settings.enabled
    && !reduced
    && settings.motionMode !== "static"
    && settings.breath > 0;
}

function resolvedPhase(settings: LightingSettings, timeline: LightingTimeline): number {
  if (!lightingNeedsContinuousFrames(settings, timeline.reduced)) return 0;
  const speed = MOTION_SPEED[settings.motionSpeed];
  if (timeline.seamless) {
    const progress = timeline.time / Math.max(0.001, timeline.duration);
    return progress * TAU * Math.max(1, Math.round(timeline.loops)) * settings.motionSpeed;
  }
  return Math.max(0, timeline.time) * speed;
}

function resolveMotion(
  mode: LightingMotion,
  phase: number,
  amount: number,
): {
  azimuth: number;
  elevation: number;
  intensity: number;
  fieldCenter: [number, number];
} {
  if (mode === "static" || amount <= 0) {
    return { azimuth: 0, elevation: 0, intensity: 1, fieldCenter: [0, 0] };
  }

  switch (mode) {
    case "breathe":
      return {
        azimuth: Math.sin(phase) * amount * 4.5,
        elevation: Math.sin(phase * 2 + 0.4) * amount * 1.8,
        intensity: 1 + Math.sin(phase * 2) * amount * 0.025,
        fieldCenter: [
          Math.cos(phase) * amount * 0.025,
          Math.sin(phase * 2) * amount * 0.018,
        ],
      };
    case "sweep":
      return {
        azimuth: Math.sin(phase) * amount * 18,
        elevation: Math.cos(phase * 2) * amount * 2.5,
        intensity: 1 + Math.cos(phase) * amount * 0.03,
        fieldCenter: [
          Math.sin(phase) * amount * 0.34,
          Math.cos(phase * 2) * amount * 0.05,
        ],
      };
    case "flicker": {
      const harmonic = (
        Math.sin(phase * 3) * 0.56
        + Math.sin(phase * 7 + 0.8) * 0.29
        + Math.sin(phase * 11 + 1.7) * 0.15
      );
      return {
        azimuth: Math.sin(phase * 2) * amount * 2,
        elevation: Math.sin(phase * 5) * amount * 0.8,
        intensity: 1 + harmonic * amount * 0.12,
        fieldCenter: [
          Math.sin(phase * 5) * amount * 0.02,
          Math.cos(phase * 7) * amount * 0.014,
        ],
      };
    }
    case "orbit":
      return {
        azimuth: Math.sin(phase) * amount * 14,
        elevation: Math.cos(phase) * amount * 5,
        intensity: 1 + Math.sin(phase * 2) * amount * 0.025,
        fieldCenter: [
          Math.cos(phase) * amount * 0.14,
          Math.sin(phase) * amount * 0.1,
        ],
      };
    default:
      return { azimuth: 0, elevation: 0, intensity: 1, fieldCenter: [0, 0] };
  }
}

/**
 * Compiles director controls into one deterministic frame. Preview and export
 * share this function. Every animated mode is built from integer harmonics, so
 * a seamless master returns to the exact same light, shadow, and field centre.
 */
export function resolveLightingFrame(
  settings: LightingSettings,
  timeline: LightingTimeline,
): ResolvedLightingFrame {
  const phase = resolvedPhase(settings, timeline);
  const amount = clamp(settings.breath, 0, 1);
  const motion = resolveMotion(settings.motionMode, phase, amount);
  const azimuthDegrees = clamp(settings.azimuth + motion.azimuth, -180, 180);
  const elevationDegrees = clamp(settings.elevation + motion.elevation, 5, 85);
  const azimuth = azimuthDegrees * Math.PI / 180;
  const elevation = elevationDegrees * Math.PI / 180;
  const planar = Math.cos(elevation);
  const direction = normalise3(
    Math.cos(azimuth) * planar,
    Math.sin(azimuth) * planar,
    Math.max(0.06, Math.sin(elevation)),
  );
  const screenDirection = normalise2(direction[0], direction[1]);
  const castDirection = normalise2(-screenDirection[0], -screenDirection[1]);
  const elevationScale = 0.34 + Math.cos(elevation) * 0.66;
  const distance = Math.min(settings.shadowDistance, settings.shadowDistance * elevationScale);

  return {
    direction,
    screenDirection,
    shadowOffset: [castDirection[0] * distance, castDirection[1] * distance],
    fieldCenter: [
      clamp(screenDirection[0] * 0.18 + motion.fieldCenter[0], -0.45, 0.45),
      clamp(screenDirection[1] * 0.18 + motion.fieldCenter[1], -0.45, 0.45),
    ],
    phase,
    intensity: clamp(motion.intensity, 0.82, 1.18),
    goboMode: GOBO_MODES[settings.gobo],
  };
}
