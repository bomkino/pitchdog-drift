import { DEFAULT_SETTINGS, type StudioSettings, type ThemeId } from "./model";

export interface ThemePreset {
  id: ThemeId;
  name: string;
  eyebrow: string;
  description: string;
  settings: StudioSettings;
}

function makeTheme(
  id: ThemeId,
  name: string,
  eyebrow: string,
  description: string,
  patch: {
    motion?: Partial<StudioSettings["motion"]>;
    slide?: Partial<StudioSettings["slide"]>;
    background?: Partial<StudioSettings["background"]>;
  },
): ThemePreset {
  return {
    id,
    name,
    eyebrow,
    description,
    settings: {
      ...structuredClone(DEFAULT_SETTINGS),
      themeId: id,
      motion: { ...DEFAULT_SETTINGS.motion, ...patch.motion },
      slide: { ...DEFAULT_SETTINGS.slide, ...patch.slide },
      background: { ...DEFAULT_SETTINGS.background, ...patch.background },
    },
  };
}

export const THEMES: ThemePreset[] = [
  makeTheme(
    "editorial-drift",
    "Editorial Drift",
    "Long breath · warm paper",
    "Measured vertical rhythm. Slides arrive like pages held under low lamplight.",
    {
      motion: { axis: "vertical", direction: -1, speed: 0.34, flow: "ribbon", gap: 0.3, curvature: 0.3, depth: 0.14, tilt: 3.5, distortion: 0.18, focusScale: 0.075, edgeFade: 0.3 },
      slide: { scale: 0.76, fit: "cover", radius: 32, smoothing: 0.6, borderWidth: 0, borderOpacity: 0, shadowOpacity: 0.24, shadowSoftness: 112 },
      background: { style: "paper", colorA: "#0d0d0c", colorB: "#332e29", accent: "#e7dcc9", intensity: 0.38, motion: 0.06, grain: 0.053, vignette: 0.22, seed: 17 },
    },
  ),
  makeTheme(
    "road-memory",
    "Road Memory",
    "Travel · sun-struck lateral",
    "A wide, unhurried procession with heat-haze bend and faded horizon colour.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.28, flow: "arc", gap: 0.3, curvature: 0.46, depth: 0.28, tilt: 2.2, distortion: 0.22 },
      slide: { scale: 0.72, radius: 28, borderWidth: 0, borderOpacity: 0, shadowOpacity: 0.24 },
      background: { style: "gradient", colorA: "#1a2d39", colorB: "#a64d2d", accent: "#efc47d", intensity: 0.84, motion: 0.2, grain: 0.07, vignette: 0.34, seed: 31 },
    },
  ),
  makeTheme(
    "dread",
    "Dread",
    "Horror · upward unease",
    "Slow vertical crawl, clipped crimson light, and enough optical unease to tighten the room.",
    {
      motion: { axis: "vertical", direction: -1, speed: 0.17, flow: "tunnel", gap: 0.44, curvature: 0.72, depth: 0.56, tilt: 8.5, distortion: 0.48, focusScale: 0.04, edgeFade: 0.46 },
      slide: { scale: 0.73, radius: 18, smoothing: 0.18, borderWidth: 0, borderOpacity: 0, shadowOpacity: 0.62, shadowSoftness: 48 },
      background: { style: "void", colorA: "#020202", colorB: "#160607", accent: "#7c0d13", intensity: 0.9, motion: 0.13, grain: 0.09, vignette: 0.76, seed: 66 },
    },
  ),
  makeTheme(
    "noir-contact",
    "Noir Contact",
    "Documentary · hard evidence",
    "A disciplined contact sheet: monochrome, clean borders, precise pace, no melodrama.",
    {
      motion: { axis: "horizontal", direction: 1, speed: 0.42, flow: "straight", gap: 0.16, curvature: 0, depth: 0.08, tilt: 0.8, distortion: 0.12, focusScale: 0.02 },
      slide: { scale: 0.66, radius: 6, smoothing: 0, borderWidth: 1, borderColor: "#d9d4ca", borderOpacity: 1, shadowOpacity: 0.18 },
      background: { style: "paper", colorA: "#101010", colorB: "#292929", accent: "#d7d2c8", intensity: 0.48, motion: 0.08, grain: 0.08, vignette: 0.4, seed: 9 },
    },
  ),
  makeTheme(
    "tender-light",
    "Tender Light",
    "Romance · soft orbit",
    "Close, luminous movement with quiet rose light and almost-touching frames.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.2, flow: "ribbon", gap: 0.08, curvature: 0.28, depth: 0.14, tilt: 2.8, distortion: 0.16, focusScale: 0.11, edgeFade: 0.2 },
      slide: { scale: 0.8, radius: 54, smoothing: 0.78, borderWidth: 0, borderOpacity: 0, shadowOpacity: 0.28, shadowSoftness: 52 },
      background: { style: "aura", colorA: "#2a1920", colorB: "#6d3945", accent: "#f0b59d", intensity: 0.68, motion: 0.18, grain: 0.04, vignette: 0.28, seed: 42 },
    },
  ),
  makeTheme(
    "chrome-dream",
    "Chrome Dream",
    "Music · electric tunnel",
    "Fast, glossy depth and ultraviolet atmosphere without sacrificing the slide itself.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.58, flow: "cylinder", gap: 0.26, curvature: 0.68, depth: 0.48, tilt: 9, distortion: 0.58, focusScale: 0.14, edgeFade: 0.32 },
      slide: { scale: 0.62, radius: 32, smoothing: 0.62, borderWidth: 0, borderOpacity: 0, shadowOpacity: 0.5 },
      background: { style: "aura", colorA: "#080619", colorB: "#191352", accent: "#4dd9ff", intensity: 0.95, motion: 0.52, grain: 0.05, vignette: 0.5, seed: 93 },
    },
  ),
];

export function getTheme(id: ThemeId): ThemePreset {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]!;
}

export function applyTheme(current: StudioSettings, theme: ThemePreset): StudioSettings {
  return {
    ...structuredClone(theme.settings),
    // A theme owns the rendered atmosphere, including whether that atmosphere
    // is transparent. Preserve the user's canvas dimensions, but never carry a
    // stale transparency flag into an opaque theme.
    stage: {
      ...theme.settings.stage,
      width: current.stage.width,
      height: current.stage.height,
      transparent: theme.settings.background.style === "transparent",
    },
    output: { ...current.output },
    motion: {
      ...theme.settings.motion,
      reducedMotionOutput: current.motion.reducedMotionOutput,
    },
    presenter: { ...current.presenter },
    performance: {
      ...structuredClone(current.performance),
      reducedMotion: current.motion.reducedMotionOutput,
    },
  };
}
