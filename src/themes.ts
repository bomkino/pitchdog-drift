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
      motion: {
    dynamics: "weighted",
    bank: 0.58, axis: "vertical", direction: -1, speed: 0.34, flow: "ribbon", curvature: 0.36, depth: 0.18, tilt: 4.5 },
      slide: {
    surface: "paper",
    thickness: 6, scale: 0.78, radius: 36, smoothing: 0.6, borderColor: "#f0e6d4", borderOpacity: 0.42 },
      background: { style: "aura", colorA: "#120f0c", colorB: "#2c1516", accent: "#c26d3f", motion: 0.34, grain: 0.12 },
    },
  ),
  makeTheme(
    "road-memory",
    "Road Memory",
    "Travel · sun-struck lateral",
    "A wide, unhurried procession with heat-haze bend and faded horizon colour.",
    {
      motion: {
    dynamics: "drift",
    bank: 0.46, axis: "horizontal", direction: -1, speed: 0.28, flow: "arc", gap: 0.3, curvature: 0.46, depth: 0.28, tilt: 2.2, distortion: 0.22 },
      slide: {
    surface: "paper",
    thickness: 4, scale: 0.72, radius: 28, borderColor: "#f7dfbd", borderOpacity: 0.5, shadowOpacity: 0.24 },
      background: { style: "gradient", colorA: "#1a2d39", colorB: "#a64d2d", accent: "#efc47d", intensity: 0.84, motion: 0.2, grain: 0.16, vignette: 0.34, seed: 31 },
    },
  ),
  makeTheme(
    "dread",
    "Dread",
    "Horror · upward unease",
    "Slow vertical crawl, clipped crimson light, and enough optical unease to tighten the room.",
    {
      motion: {
    dynamics: "spring",
    bank: 0.82, axis: "vertical", direction: -1, speed: 0.17, flow: "tunnel", gap: 0.44, curvature: 0.72, depth: 0.56, tilt: 8.5, distortion: 0.48, focusScale: 0.04, edgeFade: 0.46 },
      slide: {
    surface: "gel",
    thickness: 11, scale: 0.73, radius: 18, smoothing: 0.18, borderColor: "#9d302b", borderOpacity: 0.66, shadowOpacity: 0.62, shadowSoftness: 48 },
      background: { style: "void", colorA: "#020202", colorB: "#160607", accent: "#7c0d13", intensity: 0.9, motion: 0.13, grain: 0.22, vignette: 0.76, seed: 66 },
    },
  ),
  makeTheme(
    "noir-contact",
    "Noir Contact",
    "Documentary · hard evidence",
    "A disciplined contact sheet: monochrome, clean borders, precise pace, no melodrama.",
    {
      motion: {
    dynamics: "direct",
    bank: 0.28, axis: "horizontal", direction: 1, speed: 0.42, flow: "straight", gap: 0.16, curvature: 0, depth: 0.08, tilt: 0.8, distortion: 0.12, focusScale: 0.02 },
      slide: {
    surface: "card",
    thickness: 2, scale: 0.66, radius: 6, smoothing: 0, borderWidth: 3, borderColor: "#e9e5dc", borderOpacity: 0.9, shadowOpacity: 0.18 },
      background: { style: "paper", colorA: "#101010", colorB: "#292929", accent: "#d7d2c8", intensity: 0.48, motion: 0.08, grain: 0.3, vignette: 0.4, seed: 9 },
    },
  ),
  makeTheme(
    "tender-light",
    "Tender Light",
    "Romance · soft orbit",
    "Close, luminous movement with quiet rose light and almost-touching frames.",
    {
      motion: {
    dynamics: "weighted",
    bank: 0.52, axis: "horizontal", direction: -1, speed: 0.2, flow: "ribbon", gap: 0.08, curvature: 0.28, depth: 0.14, tilt: 2.8, distortion: 0.16, focusScale: 0.11, edgeFade: 0.2 },
      slide: {
    surface: "silk",
    thickness: 3, scale: 0.8, radius: 54, smoothing: 0.78, borderColor: "#ffe9dc", borderOpacity: 0.52, shadowOpacity: 0.28, shadowSoftness: 52 },
      background: { style: "aura", colorA: "#2a1920", colorB: "#6d3945", accent: "#f0b59d", intensity: 0.68, motion: 0.18, grain: 0.08, vignette: 0.28, seed: 42 },
    },
  ),
  makeTheme(
    "chrome-dream",
    "Chrome Dream",
    "Music · electric tunnel",
    "Fast, glossy depth and ultraviolet atmosphere without sacrificing the slide itself.",
    {
      motion: {
    dynamics: "spring",
    bank: 0.88, axis: "horizontal", direction: -1, speed: 0.58, flow: "cylinder", gap: 0.26, curvature: 0.68, depth: 0.48, tilt: 9, distortion: 0.58, focusScale: 0.14, edgeFade: 0.32 },
      slide: {
    surface: "gel",
    thickness: 13, scale: 0.62, radius: 32, smoothing: 0.62, borderColor: "#cfe8ff", borderOpacity: 0.7, shadowOpacity: 0.5 },
      background: { style: "aura", colorA: "#080619", colorB: "#191352", accent: "#4dd9ff", intensity: 0.95, motion: 0.52, grain: 0.1, vignette: 0.5, seed: 93 },
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
    presenter: { ...current.presenter },
  };
}
