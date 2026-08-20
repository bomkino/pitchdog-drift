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
    optics?: Partial<StudioSettings["optics"]>;
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
      optics: { ...DEFAULT_SETTINGS.optics, ...patch.optics },
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
      motion: { axis: "vertical", direction: -1, speed: 0.34, flow: "ribbon", curvature: 0.36, depth: 0.18, tilt: 4.5 },
      slide: { scale: 0.78, radius: 36, smoothing: 0.6, borderColor: "#f0e6d4", borderOpacity: 0.42 },
      background: { style: "aura", colorA: "#120f0c", colorB: "#2c1516", accent: "#c26d3f", motion: 0.34, grain: 0.12, softness: 0.76, complexity: 0.34, parallax: 0.28 },
      optics: { profile: "soft-print", softFocus: 0.18, edgeSoftness: 0.24, motionBlur: 0.14, chromaticAberration: 0.1, bloom: 0.1, halation: 0.12, flare: 0.03, barrelDistortion: 0.02, vignette: 0.08, grain: 0.08, gateWeave: 0.02, breathing: 0.03 },
    },
  ),
  makeTheme(
    "road-memory",
    "Road Memory",
    "Travel · sun-struck lateral",
    "A wide, unhurried procession with heat-haze bend and a horizon that keeps moving after the cut.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.28, flow: "arc", gap: 0.3, curvature: 0.46, depth: 0.28, tilt: 2.2, distortion: 0.22 },
      slide: { scale: 0.72, radius: 28, borderColor: "#f7dfbd", borderOpacity: 0.5, shadowOpacity: 0.24 },
      background: { style: "horizon", colorA: "#172b39", colorB: "#a4492e", accent: "#f2c87f", intensity: 0.84, motion: 0.2, grain: 0.16, vignette: 0.34, scale: 0.86, softness: 0.56, complexity: 0.44, parallax: 0.62, seed: 31 },
      optics: { profile: "soft-print", softFocus: 0.16, edgeSoftness: 0.26, motionBlur: 0.18, chromaticAberration: 0.08, bloom: 0.18, halation: 0.2, flare: 0.18, barrelDistortion: 0.03, vignette: 0.08, grain: 0.1, gateWeave: 0.025, breathing: 0.06 },
    },
  ),
  makeTheme(
    "dread",
    "Dread",
    "Horror · upward unease",
    "Slow vertical crawl, clipped crimson light, and enough optical instability to tighten the room.",
    {
      motion: { axis: "vertical", direction: -1, speed: 0.17, flow: "tunnel", gap: 0.44, curvature: 0.72, depth: 0.56, tilt: 8.5, distortion: 0.48, focusScale: 0.04, edgeFade: 0.46 },
      slide: { scale: 0.73, radius: 18, smoothing: 0.18, borderColor: "#9d302b", borderOpacity: 0.66, shadowOpacity: 0.62, shadowSoftness: 48 },
      background: { style: "void", colorA: "#020202", colorB: "#160607", accent: "#7c0d13", intensity: 0.9, motion: 0.13, grain: 0.22, vignette: 0.76, scale: 1.2, softness: 0.3, complexity: 0.72, parallax: 0.5, seed: 66 },
      optics: { profile: "night-terror", softFocus: 0.22, edgeSoftness: 0.62, motionBlur: 0.38, chromaticAberration: 0.54, bloom: 0.08, halation: 0.28, flare: 0.05, barrelDistortion: 0.3, vignette: 0.48, grain: 0.18, gateWeave: 0.18, breathing: 0.22 },
    },
  ),
  makeTheme(
    "noir-contact",
    "Noir Contact",
    "Documentary · hard evidence",
    "A disciplined contact sheet: monochrome, clean borders, precise pace, no melodrama.",
    {
      motion: { axis: "horizontal", direction: 1, speed: 0.42, flow: "straight", gap: 0.16, curvature: 0, depth: 0.08, tilt: 0.8, distortion: 0.12, focusScale: 0.02 },
      slide: { scale: 0.66, radius: 6, smoothing: 0, borderWidth: 3, borderColor: "#e9e5dc", borderOpacity: 0.9, shadowOpacity: 0.18 },
      background: { style: "paper", colorA: "#101010", colorB: "#292929", accent: "#d7d2c8", intensity: 0.48, motion: 0.08, grain: 0.3, vignette: 0.4, scale: 1.32, softness: 0.18, complexity: 0.42, parallax: 0.08, seed: 9 },
      optics: { profile: "bleach-bypass", softFocus: 0.035, edgeSoftness: 0.1, motionBlur: 0.09, chromaticAberration: 0.12, bloom: 0.015, halation: 0.025, flare: 0.015, barrelDistortion: 0.04, vignette: 0.34, grain: 0.2, gateWeave: 0.08, breathing: 0.02 },
    },
  ),
  makeTheme(
    "tender-light",
    "Tender Light",
    "Romance · soft orbit",
    "Close, luminous movement with quiet rose light and almost-touching frames.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.2, flow: "ribbon", gap: 0.08, curvature: 0.28, depth: 0.14, tilt: 2.8, distortion: 0.16, focusScale: 0.11, edgeFade: 0.2 },
      slide: { scale: 0.8, radius: 54, smoothing: 0.78, borderColor: "#ffe9dc", borderOpacity: 0.52, shadowOpacity: 0.28, shadowSoftness: 52 },
      background: { style: "velvet", colorA: "#29171f", colorB: "#6a3948", accent: "#f1b79f", intensity: 0.68, motion: 0.18, grain: 0.08, vignette: 0.28, scale: 0.92, softness: 0.9, complexity: 0.34, parallax: 0.24, seed: 42 },
      optics: { profile: "dream-glass", softFocus: 0.42, edgeSoftness: 0.58, motionBlur: 0.12, chromaticAberration: 0.14, bloom: 0.34, halation: 0.32, flare: 0.08, barrelDistortion: -0.05, vignette: 0.12, grain: 0.055, gateWeave: 0.025, breathing: 0.08 },
    },
  ),
  makeTheme(
    "chrome-dream",
    "Chrome Dream",
    "Music · electric tunnel",
    "Fast, glossy depth and ultraviolet atmosphere without sacrificing the slide itself.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.58, flow: "cylinder", gap: 0.26, curvature: 0.68, depth: 0.48, tilt: 9, distortion: 0.58, focusScale: 0.14, edgeFade: 0.32 },
      slide: { scale: 0.62, radius: 32, smoothing: 0.62, borderColor: "#cfe8ff", borderOpacity: 0.7, shadowOpacity: 0.5 },
      background: { style: "prism", colorA: "#070619", colorB: "#181251", accent: "#4dd9ff", intensity: 0.95, motion: 0.52, grain: 0.1, vignette: 0.5, scale: 1.16, softness: 0.46, complexity: 0.76, parallax: 0.7, seed: 93 },
      optics: { profile: "anamorphic-night", softFocus: 0.12, edgeSoftness: 0.32, motionBlur: 0.28, chromaticAberration: 0.34, bloom: 0.22, halation: 0.12, flare: 0.42, barrelDistortion: 0.18, vignette: 0.2, grain: 0.07, gateWeave: 0.015, breathing: 0.1 },
    },
  ),
  makeTheme(
    "sunstruck-atlas",
    "Sunstruck Atlas",
    "Travel · bleached latitude",
    "Hot air, pale flare, faded pigments, and a lateral drift with the patience of a long road.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.24, flow: "ribbon", gap: 0.34, curvature: 0.2, depth: 0.16, tilt: 1.8, distortion: 0.2, focusScale: 0.06, edgeFade: 0.22 },
      slide: { scale: 0.7, radius: 22, smoothing: 0.42, borderColor: "#f5dfb3", borderOpacity: 0.46, shadowOpacity: 0.2 },
      background: { style: "horizon", colorA: "#244057", colorB: "#c55f39", accent: "#ffd38d", intensity: 0.94, motion: 0.24, grain: 0.12, vignette: 0.2, scale: 0.72, softness: 0.64, complexity: 0.52, parallax: 0.78, seed: 118 },
      optics: { profile: "soft-print", softFocus: 0.22, edgeSoftness: 0.3, motionBlur: 0.16, chromaticAberration: 0.08, bloom: 0.26, halation: 0.3, flare: 0.34, barrelDistortion: 0.02, vignette: 0.06, grain: 0.09, gateWeave: 0.025, breathing: 0.08 },
    },
  ),
  makeTheme(
    "blue-hour",
    "Blue Hour",
    "Drama · coastal dusk",
    "Cool tidal light, broad negative space, and a slow horizontal glide that feels one cut away from rain.",
    {
      motion: { axis: "horizontal", direction: 1, speed: 0.19, flow: "arc", gap: 0.28, curvature: 0.3, depth: 0.24, tilt: 2.4, distortion: 0.14, focusScale: 0.08, edgeFade: 0.24 },
      slide: { scale: 0.74, radius: 30, smoothing: 0.58, borderColor: "#d8e5ea", borderOpacity: 0.4, shadowOpacity: 0.34 },
      background: { style: "tidal", colorA: "#071522", colorB: "#173d50", accent: "#9fcad4", intensity: 0.72, motion: 0.2, grain: 0.09, vignette: 0.44, scale: 1.1, softness: 0.84, complexity: 0.44, parallax: 0.54, seed: 204 },
      optics: { profile: "dream-glass", softFocus: 0.22, edgeSoftness: 0.4, motionBlur: 0.12, chromaticAberration: 0.08, bloom: 0.18, halation: 0.16, flare: 0.03, barrelDistortion: -0.02, vignette: 0.18, grain: 0.06, gateWeave: 0.015, breathing: 0.06 },
    },
  ),
  makeTheme(
    "velvet-fever",
    "Velvet Fever",
    "Fashion · saturated pulse",
    "Slow glamour with folds of saturated colour, a close camera, and glass that refuses clinical sharpness.",
    {
      motion: { axis: "vertical", direction: -1, speed: 0.26, flow: "ribbon", gap: 0.12, curvature: 0.48, depth: 0.28, tilt: 6.2, distortion: 0.34, focusScale: 0.13, edgeFade: 0.22 },
      slide: { scale: 0.82, radius: 62, smoothing: 0.86, borderColor: "#ffdfe9", borderOpacity: 0.34, shadowOpacity: 0.42, shadowSoftness: 62 },
      background: { style: "velvet", colorA: "#170610", colorB: "#641f45", accent: "#f178a2", intensity: 0.9, motion: 0.36, grain: 0.08, vignette: 0.42, scale: 1.34, softness: 0.82, complexity: 0.62, parallax: 0.46, seed: 314 },
      optics: { profile: "dream-glass", softFocus: 0.34, edgeSoftness: 0.52, motionBlur: 0.18, chromaticAberration: 0.18, bloom: 0.32, halation: 0.38, flare: 0.16, barrelDistortion: -0.04, vignette: 0.16, grain: 0.06, gateWeave: 0.02, breathing: 0.1 },
    },
  ),
  makeTheme(
    "celluloid-archive",
    "Celluloid Archive",
    "History · projector dust",
    "A tactile vertical reel with faded emulsion, breathing exposure, and the small instability of handled film.",
    {
      motion: { axis: "vertical", direction: -1, speed: 0.22, flow: "straight", gap: 0.2, curvature: 0.08, depth: 0.1, tilt: 1.2, distortion: 0.08, focusScale: 0.04, edgeFade: 0.34 },
      slide: { scale: 0.76, radius: 10, smoothing: 0.08, borderWidth: 2.5, borderColor: "#e6d2ad", borderOpacity: 0.7, shadowOpacity: 0.3 },
      background: { style: "emulsion", colorA: "#0c0a08", colorB: "#443626", accent: "#d5a66e", intensity: 0.72, motion: 0.12, grain: 0.28, vignette: 0.62, scale: 1.5, softness: 0.24, complexity: 0.76, parallax: 0.18, seed: 1948 },
      optics: { profile: "bleach-bypass", softFocus: 0.11, edgeSoftness: 0.24, motionBlur: 0.08, chromaticAberration: 0.06, bloom: 0.08, halation: 0.14, flare: 0.04, barrelDistortion: 0.08, vignette: 0.36, grain: 0.22, gateWeave: 0.15, breathing: 0.12 },
    },
  ),
  makeTheme(
    "night-run",
    "Night Run",
    "Thriller · sodium velocity",
    "A low, fast cylinder through wet asphalt colour, with directional blur and anxious anamorphic edges.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.72, flow: "cylinder", gap: 0.22, curvature: 0.76, depth: 0.62, tilt: 11, distortion: 0.64, focusScale: 0.1, edgeFade: 0.38 },
      slide: { scale: 0.6, radius: 18, smoothing: 0.34, borderColor: "#f5c779", borderOpacity: 0.46, shadowOpacity: 0.58 },
      background: { style: "night-drive", colorA: "#02060a", colorB: "#17232d", accent: "#ff8b36", intensity: 0.96, motion: 0.72, grain: 0.12, vignette: 0.66, scale: 1.24, softness: 0.42, complexity: 0.84, parallax: 0.88, seed: 807 },
      optics: { profile: "anamorphic-night", softFocus: 0.1, edgeSoftness: 0.38, motionBlur: 0.52, chromaticAberration: 0.38, bloom: 0.26, halation: 0.22, flare: 0.56, barrelDistortion: 0.2, vignette: 0.3, grain: 0.1, gateWeave: 0.04, breathing: 0.12 },
    },
  ),
  makeTheme(
    "eclipse-ritual",
    "Eclipse Ritual",
    "Fantasy · sacred dark",
    "An ember-lit tunnel with slow orbital weight, velvet blacks, and light that feels discovered rather than generated.",
    {
      motion: { axis: "vertical", direction: 1, speed: 0.14, flow: "tunnel", gap: 0.4, curvature: 0.82, depth: 0.66, tilt: 7.6, distortion: 0.38, focusScale: 0.07, edgeFade: 0.5 },
      slide: { scale: 0.68, radius: 42, smoothing: 0.68, borderColor: "#c98b4f", borderOpacity: 0.52, shadowOpacity: 0.66, shadowSoftness: 66 },
      background: { style: "ember", colorA: "#030202", colorB: "#1a0805", accent: "#cf5f24", intensity: 0.92, motion: 0.16, grain: 0.16, vignette: 0.78, scale: 1.12, softness: 0.7, complexity: 0.86, parallax: 0.64, seed: 717 },
      optics: { profile: "night-terror", softFocus: 0.18, edgeSoftness: 0.52, motionBlur: 0.16, chromaticAberration: 0.28, bloom: 0.18, halation: 0.36, flare: 0.04, barrelDistortion: 0.2, vignette: 0.42, grain: 0.14, gateWeave: 0.08, breathing: 0.18 },
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
    optics: {
      ...theme.settings.optics,
      protectPresenter: current.optics.protectPresenter,
    },
  };
}
