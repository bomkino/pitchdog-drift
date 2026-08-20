import { applyMotionSession, captureMotionSession } from "./lookFields";
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
      motion: { axis: "vertical", direction: -1, speed: 0.32, flow: "ribbon", curvature: 0.36, depth: 0.18, tilt: 4.5, distortion: 0.34 },
      slide: { scale: 0.78, radius: 36, smoothing: 0.6, borderColor: "#f0e6d4", borderOpacity: 0.42 },
      background: { style: "aura", colorA: "#120f0c", colorB: "#2c1516", accent: "#c26d3f", motion: 0.34, grain: 0.1, seed: 17 },
    },
  ),
  makeTheme(
    "road-memory",
    "Road Memory",
    "Travel · sun-struck lateral",
    "A wide, unhurried procession with heat-haze bend and faded horizon colour.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.28, flow: "arc", gap: 0.3, curvature: 0.46, depth: 0.28, tilt: 2.2, distortion: 0.28 },
      slide: { scale: 0.72, radius: 28, borderColor: "#f7dfbd", borderOpacity: 0.5, shadowOpacity: 0.24 },
      background: { style: "gradient", colorA: "#1a2d39", colorB: "#a64d2d", accent: "#efc47d", intensity: 0.84, motion: 0.2, grain: 0.14, vignette: 0.34, seed: 31 },
    },
  ),
  makeTheme(
    "dread",
    "Dread",
    "Horror · upward unease",
    "Slow vertical crawl, clipped crimson light, and enough optical unease to tighten the room.",
    {
      motion: { axis: "vertical", direction: -1, speed: 0.17, flow: "tunnel", gap: 0.44, curvature: 0.72, depth: 0.56, tilt: 8.5, distortion: 0.62, focusScale: 0.04, edgeFade: 0.46 },
      slide: { scale: 0.73, radius: 18, smoothing: 0.18, borderColor: "#9d302b", borderOpacity: 0.66, shadowOpacity: 0.62, shadowSoftness: 48 },
      background: { style: "void", colorA: "#020202", colorB: "#160607", accent: "#7c0d13", intensity: 0.9, motion: 0.13, grain: 0.2, vignette: 0.76, seed: 66 },
    },
  ),
  makeTheme(
    "noir-contact",
    "Noir Contact",
    "Documentary · hard evidence",
    "A disciplined contact sheet: monochrome, clean borders, precise pace, no melodrama.",
    {
      motion: { axis: "horizontal", direction: 1, speed: 0.42, flow: "straight", gap: 0.16, curvature: 0, depth: 0.08, tilt: 0.8, distortion: 0.14, focusScale: 0.02 },
      slide: { scale: 0.66, radius: 6, smoothing: 0, borderWidth: 3, borderColor: "#e9e5dc", borderOpacity: 0.9, shadowOpacity: 0.18 },
      background: { style: "paper", colorA: "#101010", colorB: "#292929", accent: "#d7d2c8", intensity: 0.48, motion: 0.08, grain: 0.28, vignette: 0.4, seed: 9 },
    },
  ),
  makeTheme(
    "tender-light",
    "Tender Light",
    "Romance · soft orbit",
    "Close, luminous movement with quiet rose light and almost-touching frames.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.2, flow: "orbit", gap: 0.08, curvature: 0.28, depth: 0.14, tilt: 2.8, distortion: 0.28, focusScale: 0.11, edgeFade: 0.2 },
      slide: { scale: 0.8, radius: 54, smoothing: 0.78, borderColor: "#ffe9dc", borderOpacity: 0.52, shadowOpacity: 0.28, shadowSoftness: 52 },
      background: { style: "aura", colorA: "#2a1920", colorB: "#6d3945", accent: "#f0b59d", intensity: 0.68, motion: 0.18, grain: 0.07, vignette: 0.28, seed: 42 },
    },
  ),
  makeTheme(
    "chrome-dream",
    "Chrome Dream",
    "Music · electric helix",
    "Glossy depth, ultraviolet atmosphere, and a fast spiral that never buries the slide.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.58, flow: "helix", gap: 0.26, curvature: 0.68, depth: 0.48, tilt: 9, distortion: 0.58, focusScale: 0.14, edgeFade: 0.32 },
      slide: { scale: 0.62, radius: 32, smoothing: 0.62, borderColor: "#cfe8ff", borderOpacity: 0.7, shadowOpacity: 0.5 },
      background: { style: "aura", colorA: "#080619", colorB: "#191352", accent: "#4dd9ff", intensity: 0.95, motion: 0.52, grain: 0.09, vignette: 0.5, seed: 93 },
    },
  ),
  makeTheme(
    "projector-bloom",
    "Projector Bloom",
    "Classic cinema · milky light",
    "A slow reel through warm projector flare, softened blacks, and gentle frame drift.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.24, flow: "cascade", gap: 0.2, curvature: 0.2, depth: 0.12, tilt: 1.6, distortion: 0.42, focusScale: 0.06, edgeFade: 0.3 },
      slide: { scale: 0.74, radius: 14, smoothing: 0.22, borderColor: "#f5dfbc", borderOpacity: 0.58, shadowOpacity: 0.3, shadowSoftness: 58 },
      background: { style: "gradient", colorA: "#1b120b", colorB: "#6a3a1f", accent: "#ffd39a", intensity: 0.82, motion: 0.16, grain: 0.18, vignette: 0.5, seed: 104 },
    },
  ),
  makeTheme(
    "midnight-run",
    "Midnight Run",
    "Thriller · wet asphalt",
    "A tense lateral chase through sodium light, blue-black depth, and restrained speed smear.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.48, flow: "tunnel", gap: 0.34, curvature: 0.5, depth: 0.5, tilt: 6.5, distortion: 0.52, focusScale: 0.08, edgeFade: 0.4 },
      slide: { scale: 0.68, radius: 20, smoothing: 0.38, borderColor: "#b9d5df", borderOpacity: 0.38, shadowOpacity: 0.58, shadowSoftness: 54 },
      background: { style: "void", colorA: "#02070b", colorB: "#0b2130", accent: "#d27734", intensity: 0.86, motion: 0.4, grain: 0.12, vignette: 0.68, seed: 121 },
    },
  ),
  makeTheme(
    "salt-air",
    "Salt Air",
    "Coastal travel · pale horizon",
    "Open spacing, sea-glass colour, and a slow ribbon with the softness of remembered weather.",
    {
      motion: { axis: "vertical", direction: -1, speed: 0.23, flow: "ribbon", gap: 0.38, curvature: 0.3, depth: 0.16, tilt: 2, distortion: 0.24, focusScale: 0.07, edgeFade: 0.24 },
      slide: { scale: 0.75, radius: 40, smoothing: 0.68, borderColor: "#e5eee8", borderOpacity: 0.48, shadowOpacity: 0.2, shadowSoftness: 44 },
      background: { style: "aura", colorA: "#102329", colorB: "#4c7676", accent: "#d8d7bd", intensity: 0.7, motion: 0.15, grain: 0.06, vignette: 0.24, seed: 138 },
    },
  ),
  makeTheme(
    "winter-celluloid",
    "Winter Celluloid",
    "Holiday · blue hour glow",
    "A quiet vertical cascade of frost-blue shadow, amber windows, and soft old-film bloom.",
    {
      motion: { axis: "vertical", direction: -1, speed: 0.18, flow: "cascade", gap: 0.2, curvature: 0.22, depth: 0.2, tilt: 2.4, distortion: 0.34, focusScale: 0.08, edgeFade: 0.3 },
      slide: { scale: 0.79, radius: 30, smoothing: 0.56, borderColor: "#e8edf1", borderOpacity: 0.54, shadowOpacity: 0.36, shadowSoftness: 56 },
      background: { style: "gradient", colorA: "#08131e", colorB: "#29465f", accent: "#e0a25b", intensity: 0.76, motion: 0.12, grain: 0.13, vignette: 0.5, seed: 155 },
    },
  ),
  makeTheme(
    "folklore-ember",
    "Folklore Ember",
    "Fantasy · smoke and firelight",
    "An orbit through soot, moss, and ember glow—mythic without collapsing into spectacle.",
    {
      motion: { axis: "horizontal", direction: 1, speed: 0.22, flow: "orbit", gap: 0.28, curvature: 0.62, depth: 0.36, tilt: 5, distortion: 0.4, focusScale: 0.1, edgeFade: 0.34 },
      slide: { scale: 0.7, radius: 26, smoothing: 0.42, borderColor: "#dcc69a", borderOpacity: 0.5, shadowOpacity: 0.54, shadowSoftness: 62 },
      background: { style: "aura", colorA: "#0a100b", colorB: "#263321", accent: "#c36b2f", intensity: 0.84, motion: 0.22, grain: 0.14, vignette: 0.62, seed: 172 },
    },
  ),
  makeTheme(
    "acid-matinee",
    "Acid Matinee",
    "Comedy · candy collision",
    "Bright, quick, and slightly unruly: saturated colour with a buoyant helix and clean faces.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.5, flow: "helix", gap: 0.16, curvature: 0.46, depth: 0.26, tilt: 5.5, distortion: 0.38, focusScale: 0.12, edgeFade: 0.18 },
      slide: { scale: 0.69, radius: 48, smoothing: 0.78, borderColor: "#fff4b8", borderOpacity: 0.7, shadowOpacity: 0.32, shadowSoftness: 36 },
      background: { style: "gradient", colorA: "#2b0f48", colorB: "#d64273", accent: "#e9ef55", intensity: 0.98, motion: 0.5, grain: 0.05, vignette: 0.2, seed: 189 },
    },
  ),
  makeTheme(
    "archival-blue",
    "Archival Blue",
    "History · cyanotype evidence",
    "A spare vertical record: cool paper, measured gaps, and enough texture to feel handled.",
    {
      motion: { axis: "vertical", direction: -1, speed: 0.21, flow: "straight", gap: 0.32, curvature: 0.04, depth: 0.08, tilt: 1.2, distortion: 0.16, focusScale: 0.03, edgeFade: 0.36 },
      slide: { scale: 0.7, radius: 4, smoothing: 0, borderWidth: 2.5, borderColor: "#d9e2dc", borderOpacity: 0.82, shadowOpacity: 0.22, shadowSoftness: 28 },
      background: { style: "paper", colorA: "#09151e", colorB: "#173a50", accent: "#98bcc4", intensity: 0.58, motion: 0.06, grain: 0.3, vignette: 0.46, seed: 206 },
    },
  ),
  makeTheme(
    "desert-heat",
    "Desert Heat",
    "Western · mirage line",
    "Wide lateral movement, scorched colour, and a horizon that bends without becoming a gimmick.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.31, flow: "arc", gap: 0.4, curvature: 0.58, depth: 0.22, tilt: 3.4, distortion: 0.46, focusScale: 0.06, edgeFade: 0.28 },
      slide: { scale: 0.67, radius: 10, smoothing: 0.12, borderColor: "#e8c38f", borderOpacity: 0.5, shadowOpacity: 0.42, shadowSoftness: 46 },
      background: { style: "gradient", colorA: "#2c1309", colorB: "#a34c20", accent: "#f1b86d", intensity: 0.92, motion: 0.27, grain: 0.16, vignette: 0.42, seed: 223 },
    },
  ),
  makeTheme(
    "lunar-signal",
    "Lunar Signal",
    "Science fiction · quiet telemetry",
    "A measured vertical helix through cobalt shadow and pale signal light—future tense, not neon soup.",
    {
      motion: { axis: "vertical", direction: 1, speed: 0.29, flow: "helix", gap: 0.3, curvature: 0.54, depth: 0.5, tilt: 7, distortion: 0.48, focusScale: 0.1, edgeFade: 0.4 },
      slide: { scale: 0.65, radius: 24, smoothing: 0.5, borderColor: "#b6e1e6", borderOpacity: 0.58, shadowOpacity: 0.52, shadowSoftness: 50 },
      background: { style: "void", colorA: "#02050c", colorB: "#0c1b43", accent: "#6ce0de", intensity: 0.88, motion: 0.32, grain: 0.08, vignette: 0.7, seed: 240 },
    },
  ),
  makeTheme(
    "velvet-crime",
    "Velvet Crime",
    "Crime · bruised luxury",
    "Slow cylinder movement, oxblood shadow, and a polished surface with something rotten underneath.",
    {
      motion: { axis: "horizontal", direction: 1, speed: 0.35, flow: "cylinder", gap: 0.18, curvature: 0.48, depth: 0.38, tilt: 5.8, distortion: 0.44, focusScale: 0.09, edgeFade: 0.38 },
      slide: { scale: 0.72, radius: 34, smoothing: 0.64, borderColor: "#d6b7a4", borderOpacity: 0.46, shadowOpacity: 0.6, shadowSoftness: 64 },
      background: { style: "aura", colorA: "#090507", colorB: "#35141e", accent: "#8f5d45", intensity: 0.78, motion: 0.18, grain: 0.12, vignette: 0.68, seed: 257 },
    },
  ),
  makeTheme(
    "body-static",
    "Body Static",
    "Experimental horror · damaged signal",
    "A near-still descent with bruised chroma, surgical gaps, and optical instability at the edge of vision.",
    {
      motion: { axis: "vertical", direction: -1, speed: 0.13, flow: "cascade", gap: 0.52, curvature: 0.78, depth: 0.62, tilt: 11, distortion: 0.78, focusScale: 0.02, edgeFade: 0.56 },
      slide: { scale: 0.71, radius: 8, smoothing: 0.05, borderWidth: 1, borderColor: "#b8b7a8", borderOpacity: 0.32, shadowOpacity: 0.72, shadowSoftness: 70 },
      background: { style: "void", colorA: "#010202", colorB: "#111414", accent: "#735647", intensity: 0.96, motion: 0.1, grain: 0.24, vignette: 0.86, seed: 274 },
    },
  ),
  makeTheme(
    "daylight-intimacy",
    "Daylight Intimacy",
    "Human drama · honest room tone",
    "Clean, slow, almost invisible movement with warm daylight and no pressure to perform cinema.",
    {
      motion: { axis: "horizontal", direction: -1, speed: 0.16, flow: "straight", gap: 0.12, curvature: 0.06, depth: 0.08, tilt: 0.6, distortion: 0.12, focusScale: 0.05, edgeFade: 0.2 },
      slide: { scale: 0.82, radius: 22, smoothing: 0.44, borderColor: "#f1eadb", borderOpacity: 0.46, shadowOpacity: 0.2, shadowSoftness: 42 },
      background: { style: "paper", colorA: "#c8bda8", colorB: "#8e806d", accent: "#f1d8ae", intensity: 0.4, motion: 0.04, grain: 0.14, vignette: 0.2, seed: 291 },
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
    motion: applyMotionSession(theme.settings.motion, captureMotionSession(current.motion)),
    output: { ...current.output },
    presenter: { ...current.presenter },
  };
}
