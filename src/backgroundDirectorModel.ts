import {
  BACKGROUND_ATLAS_SEED_BASE,
  BACKGROUND_COMPOSITION_COUNT,
  BACKGROUND_COMPOSITIONS,
  BACKGROUND_COMPOSITIONS_PER_FAMILY,
  BACKGROUND_FAMILY_LABELS,
  BACKGROUND_PALETTES as BASE_BACKGROUND_PALETTES,
  BACKGROUND_STUDIES as BASE_BACKGROUND_STUDIES,
  BACKGROUND_VARIATION_COUNT,
  backgroundCompositionIndex,
  backgroundVariation,
  encodeBackgroundSeed,
  withBackgroundComposition,
  withBackgroundVariation,
  type BackgroundPalette,
  type BackgroundStudy as BaseBackgroundStudy,
  type OpaqueBackgroundStyle,
} from "./backgrounds";
import type { BackgroundSettings, StudioSettings } from "./model";

export {
  BACKGROUND_ATLAS_SEED_BASE,
  BACKGROUND_COMPOSITION_COUNT,
  BACKGROUND_COMPOSITIONS,
  BACKGROUND_COMPOSITIONS_PER_FAMILY,
  BACKGROUND_FAMILY_LABELS,
  BACKGROUND_VARIATION_COUNT,
  backgroundCompositionIndex,
  backgroundVariation,
  encodeBackgroundSeed,
  withBackgroundComposition,
  withBackgroundVariation,
};
export type { BackgroundPalette, OpaqueBackgroundStyle };

export type BackgroundFamilyFilter = OpaqueBackgroundStyle | "all";
export type BackgroundStudyEdition = "signature" | "counterpoint";
export type BackgroundLaneId = "all" | "quiet" | "light" | "elemental" | "night" | "tension" | "electric";
export type BackgroundTreatmentId = "quiet" | "cinema" | "graphic" | "weathered";
export type BackgroundPresenceId = "whisper" | "balanced" | "statement";

export const BACKGROUND_TREATMENT_COUNT = 4;
export const BACKGROUND_RECUTS_PER_TREATMENT = BACKGROUND_VARIATION_COUNT / BACKGROUND_TREATMENT_COUNT;

export interface BackgroundStudy extends BaseBackgroundStudy {
  edition: BackgroundStudyEdition;
}

export interface BackgroundTreatment {
  id: BackgroundTreatmentId;
  name: string;
  description: string;
  index: number;
}

export interface BackgroundPresenceProfile {
  id: BackgroundPresenceId;
  name: string;
  description: string;
  intensity: number;
  motion: number;
  grain: number;
  vignette: number;
}

export interface BackgroundLane {
  id: BackgroundLaneId;
  name: string;
  genres: readonly string[];
}

export interface ApplyBackgroundStudyOptions {
  preservePalette?: boolean;
  preserveTreatment?: boolean;
}

export interface BackgroundStudyFilter {
  family?: BackgroundFamilyFilter;
  lane?: BackgroundLaneId;
  query?: string;
}

export const BACKGROUND_TREATMENTS: readonly BackgroundTreatment[] = [
  { id: "quiet", name: "Quiet frame", description: "Protects the focal region and lowers local contrast without flattening the field.", index: 0 },
  { id: "cinema", name: "Cinema print", description: "Adds a restrained S-curve and a warm highlight response.", index: 1 },
  { id: "graphic", name: "Graphic cut", description: "Firms up colour separation with gentle, bounded posterisation.", index: 2 },
  { id: "weathered", name: "Weathered stock", description: "Lifts the blacks, softens saturation and adds uneven exposure.", index: 3 },
];

export const BACKGROUND_PRESENCE_PROFILES: readonly BackgroundPresenceProfile[] = [
  { id: "whisper", name: "Whisper", description: "Background stays almost subliminal.", intensity: 0.42, motion: 0.08, grain: 0.08, vignette: 0.24 },
  { id: "balanced", name: "Balanced", description: "Enough atmosphere to establish a world without competing with the deck.", intensity: 0.72, motion: 0.22, grain: 0.12, vignette: 0.46 },
  { id: "statement", name: "Statement", description: "A stronger field for sparse slides and title moments.", intensity: 0.90, motion: 0.34, grain: 0.18, vignette: 0.66 },
];

export const BACKGROUND_LANES: readonly BackgroundLane[] = [
  { id: "all", name: "All", genres: [] },
  { id: "quiet", name: "Quiet", genres: ["Minimal", "Editorial", "Documentary", "Journalism", "Craft", "Memory", "Tender"] },
  { id: "light", name: "Light", genres: ["Comedy", "Pop", "Travel", "Romance", "Wonder"] },
  { id: "elemental", name: "Elemental", genres: ["Ocean", "Alpine", "Fantasy", "Ritual", "Dream"] },
  { id: "night", name: "Night", genres: ["Noir", "Archive", "Cinema", "Mystery", "Science fiction"] },
  { id: "tension", name: "Tension", genres: ["Horror", "Thriller", "Dread", "Uncanny", "Experimental", "Drama"] },
  { id: "electric", name: "Electric", genres: ["Music", "Pop", "Science fiction", "Experimental"] },
];

const ADDITIONAL_BACKGROUND_PALETTES: readonly BackgroundPalette[] = [
  { id: "cobalt-saffron", name: "Cobalt & saffron", description: "Deep cobalt shadow, mineral blue and a narrow saffron source.", colorA: "#07101f", colorB: "#173e72", accent: "#f2a93b" },
  { id: "butter-stock", name: "Butter stock", description: "Soft ochre paper, butter cream and a clean warm highlight.", colorA: "#e2c98f", colorB: "#fff0c2", accent: "#fff8dc" },
  { id: "verdigris-copper", name: "Verdigris copper", description: "Blackened teal, oxidised copper and a dry metallic flare.", colorA: "#071412", colorB: "#1f5148", accent: "#d67b4a" },
  { id: "lavender-dust", name: "Lavender dust", description: "Ink plum, powdered violet and a pale lavender exposure.", colorA: "#17111f", colorB: "#4a355b", accent: "#d9b9e8" },
  { id: "blue-hour-rose", name: "Blue-hour rose", description: "Blue-black dusk, slate air and one human rose highlight.", colorA: "#09111b", colorB: "#334f6e", accent: "#f1a7a7" },
  { id: "fluorescent-clinic", name: "Fluorescent clinic", description: "Pale institutional green, chalk light and an uncanny mint flare.", colorA: "#d8e2d8", colorB: "#edf4e8", accent: "#9dffcf" },
  { id: "kelp-silver", name: "Kelp silver", description: "Kelp-black water, oxidised green and cold wet silver.", colorA: "#07110f", colorB: "#20332f", accent: "#c4d0ca" },
  { id: "scarlet-cream", name: "Scarlet cream", description: "Deep scarlet shadow, red lacquer and warm cream light.", colorA: "#210709", colorB: "#8a1c1c", accent: "#ffe3c2" },
  { id: "ochre-sea", name: "Ochre sea", description: "Petrol blue, weathered teal and a dry ochre horizon.", colorA: "#10202a", colorB: "#35606d", accent: "#e2af5f" },
  { id: "carbon-pearl", name: "Carbon pearl", description: "Carbon black, blue graphite and restrained pearl light.", colorA: "#0b0b0d", colorB: "#373742", accent: "#ececf0" },
  { id: "plum-gold", name: "Plum gold", description: "Black plum, bruised wine and a quiet old-gold source.", colorA: "#160b17", colorB: "#4e2448", accent: "#e6b85c" },
  { id: "mint-negative", name: "Mint negative", description: "Green-black negative, deep mint shadow and an electric sea-glass edge.", colorA: "#03110e", colorB: "#174b41", accent: "#8fffe4" },
];

export const BACKGROUND_PALETTES: readonly BackgroundPalette[] = [
  ...BASE_BACKGROUND_PALETTES,
  ...ADDITIONAL_BACKGROUND_PALETTES,
];

function whole(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function backgroundTreatmentIndex(seed: number): number {
  if (whole(seed, 0, 1_000_000) < BACKGROUND_ATLAS_SEED_BASE) return 0;
  return Math.floor(backgroundVariation(seed) / BACKGROUND_RECUTS_PER_TREATMENT);
}

export function backgroundRecut(seed: number): number {
  const normalized = whole(seed, 0, 1_000_000);
  if (normalized < BACKGROUND_ATLAS_SEED_BASE) return normalized % BACKGROUND_RECUTS_PER_TREATMENT;
  return backgroundVariation(seed) % BACKGROUND_RECUTS_PER_TREATMENT;
}

export function encodeBackgroundTreatmentVariation(treatment: number, recut: number): number {
  const safeTreatment = whole(treatment, 0, BACKGROUND_TREATMENT_COUNT - 1);
  const safeRecut = whole(recut, 0, BACKGROUND_RECUTS_PER_TREATMENT - 1);
  return safeTreatment * BACKGROUND_RECUTS_PER_TREATMENT + safeRecut;
}

export function withBackgroundTreatment(background: BackgroundSettings, treatment: number): BackgroundSettings {
  return withBackgroundVariation(
    background,
    encodeBackgroundTreatmentVariation(treatment, backgroundRecut(background.seed)),
  );
}

export function withBackgroundRecut(background: BackgroundSettings, recut: number): BackgroundSettings {
  return withBackgroundVariation(
    background,
    encodeBackgroundTreatmentVariation(backgroundTreatmentIndex(background.seed), recut),
  );
}

export function withBackgroundPalette(background: BackgroundSettings, palette: BackgroundPalette): BackgroundSettings {
  return { ...background, colorA: palette.colorA, colorB: palette.colorB, accent: palette.accent };
}

export function matchingBackgroundPalette(background: BackgroundSettings): BackgroundPalette | null {
  return BACKGROUND_PALETTES.find((palette) => (
    palette.colorA === background.colorA
    && palette.colorB === background.colorB
    && palette.accent === background.accent
  )) ?? null;
}

export function matchingBackgroundPresence(background: BackgroundSettings): BackgroundPresenceProfile | null {
  return BACKGROUND_PRESENCE_PROFILES.find((profile) => (
    profile.intensity === background.intensity
    && profile.motion === background.motion
    && profile.grain === background.grain
    && profile.vignette === background.vignette
  )) ?? null;
}

export function applyBackgroundPresence(
  background: BackgroundSettings,
  profile: BackgroundPresenceProfile,
): BackgroundSettings {
  return {
    ...background,
    intensity: profile.intensity,
    motion: profile.motion,
    grain: profile.grain,
    vignette: profile.vignette,
  };
}

function paletteById(id: string): BackgroundPalette {
  const palette = BACKGROUND_PALETTES.find((entry) => entry.id === id);
  if (!palette) throw new Error(`Unknown background palette: ${id}`);
  return palette;
}

function makeStudy(
  id: string,
  name: string,
  family: OpaqueBackgroundStyle,
  genre: string,
  description: string,
  paletteId: string,
  composition: number,
  variation: number,
  intensity: number,
  motion: number,
  grain: number,
  vignette: number,
): BackgroundStudy {
  const palette = paletteById(paletteId);
  return {
    id,
    name,
    family,
    genre,
    description,
    paletteId,
    composition,
    variation,
    edition: "counterpoint",
    background: {
      style: family,
      colorA: palette.colorA,
      colorB: palette.colorB,
      accent: palette.accent,
      intensity,
      motion,
      grain,
      vignette,
      seed: encodeBackgroundSeed(composition, variation),
    },
  };
}

const SIGNATURE_BACKGROUND_STUDIES: readonly BackgroundStudy[] = BASE_BACKGROUND_STUDIES.map((study) => ({
  ...study,
  edition: "signature" as const,
}));

const COUNTERPOINT_BACKGROUND_STUDIES: readonly BackgroundStudy[] = [
  makeStudy("daylight-leader", "Daylight Leader", "solid", "Editorial", "The pure field recast as a pale editorial room with almost no visible effect.", "daylight-paper", 0, 13, 0.22, 0.03, 0.07, 0.08),
  makeStudy("arctic-projection", "Arctic Projection", "solid", "Alpine", "A cold projector wash crossing a bright glacial wall.", "snow-line", 1, 46, 0.58, 0.12, 0.05, 0.18),
  makeStudy("blue-exit", "Blue Exit", "solid", "Noir", "A cyan edge held against carbon-black negative space.", "midnight-cyan", 2, 62, 0.72, 0.1, 0.11, 0.58),
  makeStudy("coral-floor", "Coral Floor", "solid", "Comedy", "A low coral floor under butter-warm daylight.", "daybreak-comedy", 3, 18, 0.54, 0.08, 0.06, 0.12),
  makeStudy("acid-bloom", "Acid Bloom", "solid", "Experimental", "A chemical-green burn opening through old black stock.", "chemical-green", 4, 87, 0.9, 0.22, 0.19, 0.7),
  makeStudy("carbon-stock", "Carbon Stock", "solid", "Documentary", "Blue graphite paper tooth with a pearl edge and very little sentiment.", "carbon-pearl", 5, 55, 0.46, 0.04, 0.2, 0.36),
  makeStudy("rose-pool", "Rose Pool", "solid", "Romance", "A low rose halo suspended under a bruised plum room.", "rose-glass", 6, 33, 0.58, 0.12, 0.06, 0.3),
  makeStudy("polar-exposure", "Polar Exposure", "solid", "Mystery", "A cold long exposure band crossing alpine blue-black.", "alpine-blue", 7, 79, 0.7, 0.14, 0.12, 0.64),
  makeStudy("sea-horizon", "Sea Horizon", "gradient", "Ocean", "The retained horizon grammar submerged in oxidised teal water.", "ocean-emulsion", 0, 14, 0.7, 0.14, 0.1, 0.34),
  makeStudy("bleached-horizon", "Bleached Horizon", "gradient", "Memory", "A pale horizon whose edge feels sun-faded rather than dreamy.", "snow-line", 1, 82, 0.48, 0.12, 0.08, 0.16),
  makeStudy("copper-front", "Copper Front", "gradient", "Drama", "Verdigris weather carrying a dry copper pressure line.", "verdigris-copper", 2, 44, 0.82, 0.28, 0.12, 0.52),
  makeStudy("blue-hour", "Blue Hour", "gradient", "Romance", "Slate dusk opening around one human rose source.", "blue-hour-rose", 3, 20, 0.66, 0.14, 0.06, 0.22),
  makeStudy("broadcast-prism", "Broadcast Prism", "gradient", "Pop", "Coral broadcast bands with a peach-white signal moving through them.", "coral-broadcast", 4, 67, 0.86, 0.3, 0.08, 0.3),
  makeStudy("cold-suns", "Cold Suns", "gradient", "Science fiction", "Twin cobalt suns with a narrow saffron horizon.", "cobalt-saffron", 5, 39, 0.8, 0.16, 0.06, 0.4),
  makeStudy("mint-signal", "Mint Signal", "gradient", "Music", "An electric mint seam splitting deep green-black space.", "mint-negative", 6, 58, 0.9, 0.24, 0.1, 0.56),
  makeStudy("desert-whiteout", "Desert Whiteout", "gradient", "Travel", "A bleached ochre mirage with heat held almost entirely in the horizon.", "butter-stock", 7, 91, 0.58, 0.24, 0.08, 0.2),
  makeStudy("kelp-orbit", "Kelp Orbit", "aura", "Ocean", "Wet silver blooms orbiting inside a kelp-black field.", "kelp-silver", 0, 16, 0.68, 0.24, 0.08, 0.46),
  makeStudy("clinic-halo", "Clinic Halo", "aura", "Uncanny", "A pale institutional halo with mint light that feels almost too clean.", "fluorescent-clinic", 1, 52, 0.62, 0.12, 0.04, 0.22),
  makeStudy("rose-aurora", "Rose Aurora", "aura", "Wonder", "Blue-hour veils carrying a restrained rose edge.", "blue-hour-rose", 2, 35, 0.78, 0.26, 0.06, 0.3),
  makeStudy("copper-chapel", "Copper Chapel", "aura", "Ritual", "Verdigris panes overlapping around a dry copper source.", "verdigris-copper", 3, 76, 0.86, 0.2, 0.1, 0.48),
  makeStudy("mercury-water", "Mercury Water", "aura", "Science fiction", "Pearl caustics slowed into liquid graphite.", "carbon-pearl", 4, 63, 0.82, 0.26, 0.07, 0.44),
  makeStudy("lavender-chamber", "Lavender Chamber", "aura", "Tender", "Two powdered violet rooms approaching in quiet air.", "lavender-dust", 5, 11, 0.58, 0.1, 0.05, 0.18),
  makeStudy("ember-bloom", "Ember Bloom", "aura", "Fantasy", "A warm crystalline bloom diffused through ash-black atmosphere.", "ritual-ember", 6, 41, 0.86, 0.16, 0.08, 0.5),
  makeStudy("pearl-mandorla", "Pearl Mandorla", "aura", "Ritual", "A carbon-and-pearl mandorla with almost liturgical restraint.", "carbon-pearl", 7, 84, 0.74, 0.12, 0.06, 0.5),
  makeStudy("carbon-fibre", "Carbon Fibre", "paper", "Editorial", "Long blue-graphite fibres crossing a pearl-black stock.", "carbon-pearl", 0, 57, 0.42, 0.05, 0.28, 0.34),
  makeStudy("warm-contact", "Warm Contact", "paper", "Documentary", "A tungsten contact sheet with amber evidence marks.", "tungsten-archive", 1, 27, 0.6, 0.05, 0.32, 0.4),
  makeStudy("mint-riso", "Mint Riso", "paper", "Pop", "Misregistered mint ink on a deep green negative.", "mint-negative", 2, 71, 0.72, 0.1, 0.22, 0.22),
  makeStudy("rose-linen", "Rose Linen", "paper", "Craft", "Bruised rose woven through a quiet handmade field.", "rose-glass", 3, 19, 0.46, 0.06, 0.26, 0.2),
  makeStudy("cobalt-newsprint", "Cobalt Newsprint", "paper", "Journalism", "Cobalt ink compressed into a weathered saffron newspaper fold.", "cobalt-saffron", 4, 88, 0.58, 0.04, 0.34, 0.48),
  makeStudy("blue-emulsion", "Blue Emulsion", "paper", "Archive", "Dense cyan emulsion with a restrained cold leak.", "midnight-cyan", 5, 42, 0.66, 0.08, 0.36, 0.58),
  makeStudy("butter-halftone", "Butter Halftone", "paper", "Comedy", "Large warm dots opening across butter-coloured stock.", "butter-stock", 6, 64, 0.6, 0.1, 0.18, 0.14),
  makeStudy("scarlet-archive", "Scarlet Archive", "paper", "Memory", "Cream dust and scratches held over dark scarlet lacquer.", "scarlet-cream", 7, 93, 0.68, 0.06, 0.4, 0.56),
  makeStudy("pearl-slit", "Pearl Slit", "void", "Noir", "A pearl slit breathing through carbon-black space.", "carbon-pearl", 0, 36, 0.78, 0.1, 0.14, 0.72),
  makeStudy("solar-eclipse", "Solar Eclipse", "void", "Science fiction", "A cobalt eclipse carrying one dry saffron corona.", "cobalt-saffron", 1, 61, 0.9, 0.12, 0.1, 0.76),
  makeStudy("green-smoke", "Green Smoke", "void", "Horror", "Chemical-green smoke with sparse acidic sparks.", "chemical-green", 2, 85, 0.92, 0.18, 0.2, 0.8),
  makeStudy("ochre-depths", "Ochre Depths", "void", "Ocean", "Weathered teal depths cut by distant ochre rays.", "ochre-sea", 3, 31, 0.8, 0.14, 0.1, 0.68),
  makeStudy("lavender-mineral", "Lavender Mineral", "void", "Mystery", "Powdered violet strata dissolving into ink-black fog.", "lavender-dust", 4, 54, 0.82, 0.14, 0.16, 0.7),
  makeStudy("sodium-rain", "Sodium Rain", "void", "Thriller", "Long sodium scratches falling through asphalt-black exposure.", "sodium-night", 5, 78, 0.9, 0.26, 0.22, 0.82),
  makeStudy("scarlet-reaction", "Scarlet Reaction", "void", "Experimental", "A cream reaction edge opening inside dark scarlet emulsion.", "scarlet-cream", 6, 47, 0.94, 0.2, 0.18, 0.74),
  makeStudy("kelp-tide", "Kelp Tide", "void", "Dread", "Submerged kelp-black wave fronts carrying a cold silver edge.", "kelp-silver", 7, 96, 0.82, 0.1, 0.16, 0.86),
];

export const BACKGROUND_STUDIES: readonly BackgroundStudy[] = [
  ...SIGNATURE_BACKGROUND_STUDIES,
  ...COUNTERPOINT_BACKGROUND_STUDIES,
];

function backgroundMatches(a: BackgroundSettings, b: BackgroundSettings): boolean {
  return (
    a.style === b.style
    && a.colorA === b.colorA
    && a.colorB === b.colorB
    && a.accent === b.accent
    && a.intensity === b.intensity
    && a.motion === b.motion
    && a.grain === b.grain
    && a.vignette === b.vignette
    && a.seed === b.seed
  );
}

export function matchingBackgroundStudy(background: BackgroundSettings): BackgroundStudy | null {
  return BACKGROUND_STUDIES.find((study) => backgroundMatches(study.background, background)) ?? null;
}

export function matchingBackgroundStudyStructure(background: BackgroundSettings): BackgroundStudy | null {
  if (background.style === "transparent") return null;
  const composition = backgroundCompositionIndex(background.seed);
  const recut = backgroundRecut(background.seed);
  return BACKGROUND_STUDIES.find((study) => (
    study.family === background.style
    && study.composition === composition
    && backgroundRecut(study.background.seed) === recut
  )) ?? null;
}

export function studyMatchesLane(study: BackgroundStudy, laneId: BackgroundLaneId): boolean {
  if (laneId === "all") return true;
  const lane = BACKGROUND_LANES.find((entry) => entry.id === laneId);
  return lane?.genres.includes(study.genre) ?? false;
}

export function filterBackgroundStudies(filter: BackgroundStudyFilter = {}): BackgroundStudy[] {
  const family = filter.family ?? "all";
  const lane = filter.lane ?? "all";
  const query = filter.query?.trim().toLocaleLowerCase() ?? "";
  return BACKGROUND_STUDIES.filter((study) => {
    if (family !== "all" && study.family !== family) return false;
    if (!studyMatchesLane(study, lane)) return false;
    if (!query) return true;
    const haystack = [
      study.name,
      study.genre,
      study.description,
      BACKGROUND_FAMILY_LABELS[study.family],
      BACKGROUND_COMPOSITIONS[study.family][study.composition]?.name ?? "",
      paletteById(study.paletteId).name,
    ].join(" ").toLocaleLowerCase();
    return haystack.includes(query);
  });
}

export function applyBackgroundStudy(
  settings: StudioSettings,
  study: BackgroundStudy,
  options: ApplyBackgroundStudyOptions = {},
): StudioSettings {
  let background = { ...study.background };
  if (options.preservePalette) {
    background = {
      ...background,
      colorA: settings.background.colorA,
      colorB: settings.background.colorB,
      accent: settings.background.accent,
    };
  }
  if (options.preserveTreatment) {
    background = withBackgroundTreatment(background, backgroundTreatmentIndex(settings.background.seed));
  }
  return {
    ...settings,
    stage: { ...settings.stage, transparent: false },
    background,
  };
}

export function cycleBackgroundStudy(
  settings: StudioSettings,
  candidates: readonly BackgroundStudy[],
  direction: 1 | -1,
  options: ApplyBackgroundStudyOptions = {},
): StudioSettings {
  if (candidates.length === 0) return settings;
  const currentId = matchingBackgroundStudyStructure(settings.background)?.id;
  const found = candidates.findIndex((study) => study.id === currentId);
  const nextIndex = found < 0
    ? (direction === 1 ? 0 : candidates.length - 1)
    : (found + direction + candidates.length) % candidates.length;
  return applyBackgroundStudy(settings, candidates[nextIndex]!, options);
}

export function surpriseBackgroundStudy(
  settings: StudioSettings,
  candidates: readonly BackgroundStudy[],
  options: ApplyBackgroundStudyOptions = {},
): StudioSettings {
  if (candidates.length === 0) return settings;
  const currentId = matchingBackgroundStudyStructure(settings.background)?.id;
  const found = candidates.findIndex((study) => study.id === currentId);
  const basis = found < 0
    ? backgroundRecut(settings.background.seed) % candidates.length
    : found;
  const jump = candidates.length > 17 ? 17 : Math.max(1, candidates.length - 1);
  const nextIndex = (basis + jump) % candidates.length;
  return applyBackgroundStudy(settings, candidates[nextIndex]!, options);
}
