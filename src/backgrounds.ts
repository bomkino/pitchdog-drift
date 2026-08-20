import type { BackgroundSettings, BackgroundStyle, StudioSettings } from "./model";

export type OpaqueBackgroundStyle = Exclude<BackgroundStyle, "transparent">;

export const BACKGROUND_COMPOSITIONS_PER_FAMILY = 8;
export const BACKGROUND_COMPOSITION_COUNT = BACKGROUND_COMPOSITIONS_PER_FAMILY * 5;
export const BACKGROUND_ATLAS_SEED_BASE = 10_000;
export const BACKGROUND_VARIATION_COUNT = 100;

export interface BackgroundComposition {
  id: string;
  name: string;
  description: string;
}

export interface BackgroundPalette {
  id: string;
  name: string;
  description: string;
  colorA: string;
  colorB: string;
  accent: string;
}

export interface BackgroundStudy {
  id: string;
  name: string;
  family: OpaqueBackgroundStyle;
  genre: string;
  description: string;
  paletteId: string;
  composition: number;
  variation: number;
  background: BackgroundSettings;
}

export const BACKGROUND_FAMILY_LABELS: Readonly<Record<OpaqueBackgroundStyle, string>> = {
  solid: "Solid field",
  gradient: "Gradient weather",
  aura: "Luminous aura",
  paper: "Printed matter",
  void: "Darkroom void",
};

export const BACKGROUND_COMPOSITIONS: Readonly<Record<OpaqueBackgroundStyle, readonly BackgroundComposition[]>> = {
  solid: [
    { id: "pure-field", name: "Pure field", description: "A disciplined, nearly unmodulated colour plane." },
    { id: "projector-wash", name: "Projector wash", description: "A broad off-axis wash, like light leaking across a cinema wall." },
    { id: "edge-light", name: "Edge light", description: "A narrow luminous edge with a long, soft falloff." },
    { id: "duotone-floor", name: "Duotone floor", description: "A low horizon that lets one colour quietly occupy the room." },
    { id: "soft-burn", name: "Soft burn", description: "An overexposed bloom held inside a darker chemical edge." },
    { id: "paper-tooth", name: "Paper tooth", description: "A restrained tactile field with directional fibres and tooth." },
    { id: "low-halo", name: "Low halo", description: "A submerged oval of light beneath the slide track." },
    { id: "night-exposure", name: "Night exposure", description: "A long exposure gradient with a clipped band of nocturnal light." },
  ],
  gradient: [
    { id: "legacy-horizon", name: "Legacy horizon", description: "The original Drift horizon, retained for old projects." },
    { id: "horizon-melt", name: "Horizon melt", description: "A weathered horizon whose edge slowly liquefies." },
    { id: "diagonal-weather", name: "Diagonal weather", description: "A seeded diagonal front with broad atmospheric turbulence." },
    { id: "radial-dusk", name: "Radial dusk", description: "A deep radial falloff that reads like the last light of day." },
    { id: "prism-bands", name: "Prism bands", description: "Three broad spectral bands crossing without becoming neon wallpaper." },
    { id: "twin-suns", name: "Twin suns", description: "Two slow celestial blooms suspended over a grounded horizon." },
    { id: "split-signal", name: "Split signal", description: "A softened two-tone cut with a displaced luminous seam." },
    { id: "road-mirage", name: "Road mirage", description: "A low heat horizon with trembling, filmic refraction." },
  ],
  aura: [
    { id: "orbiting-bloom", name: "Orbiting bloom", description: "The original two-bloom Drift aura, retained for compatibility." },
    { id: "projector-halo", name: "Projector halo", description: "A large annular projector halo with a dim breathing core." },
    { id: "aurora-veil", name: "Aurora veil", description: "Layered vertical veils carried by closed harmonic motion." },
    { id: "stained-light", name: "Stained light", description: "Overlapping panes of coloured light with irregular seeded edges." },
    { id: "liquid-caustic", name: "Liquid caustic", description: "Ridged, aqueous light without texture files or simulation state." },
    { id: "rose-chamber", name: "Rose chamber", description: "Two soft elliptical chambers that almost touch." },
    { id: "ice-bloom", name: "Ice bloom", description: "A radial crystalline bloom softened into photographic light." },
    { id: "mandorla", name: "Mandorla", description: "An almond-shaped overlap of two luminous fields." },
  ],
  paper: [
    { id: "long-fibres", name: "Long fibres", description: "The original vertical fibre field, retained for old projects." },
    { id: "contact-sheet", name: "Contact sheet", description: "A disciplined photographic grid under silver-gelatin texture." },
    { id: "risograph-cloud", name: "Risograph cloud", description: "Misregistered colour clouds and coarse printed dots." },
    { id: "linen-drift", name: "Linen drift", description: "Cross-woven fibres with a soft directional change in exposure." },
    { id: "newsprint", name: "Newsprint", description: "Compressed ink, diagonal screen and a faint editorial fold." },
    { id: "silver-emulsion", name: "Silver emulsion", description: "Dense emulsion grain, dust and a restrained light leak." },
    { id: "halftone-field", name: "Halftone field", description: "A large-screen halftone that opens and closes with the field." },
    { id: "dust-archive", name: "Dust archive", description: "Scratches, dust motes and uneven archival exposure." },
  ],
  void: [
    { id: "breathing-slit", name: "Breathing slit", description: "The original Drift light slit, retained for old projects." },
    { id: "eclipse", name: "Eclipse", description: "A near-black disc with one quiet, displaced corona." },
    { id: "ember-smoke", name: "Ember smoke", description: "Low smoke crossed by sparse, deterministic embers." },
    { id: "abyssal-rays", name: "Abyssal rays", description: "Underwater rays entering a black field from beyond the frame." },
    { id: "mineral-fog", name: "Mineral fog", description: "Ridged mineral strata dissolving into fog." },
    { id: "rain-negative", name: "Rain negative", description: "Long diagonal rain scratches over a photographic negative." },
    { id: "chemical-burn", name: "Chemical burn", description: "An irregular emulsion burn with a luminous reaction edge." },
    { id: "black-tide", name: "Black tide", description: "Several submerged wave fronts rising through darkness." },
  ],
};

export const BACKGROUND_PALETTES: readonly BackgroundPalette[] = [
  { id: "bone-ink", name: "Bone & ink", description: "Warm black, old paper and a narrow bone-white light.", colorA: "#0d0d0c", colorB: "#332e29", accent: "#e7dcc9" },
  { id: "tungsten-archive", name: "Tungsten archive", description: "Low amber, oxblood and projector tungsten.", colorA: "#120f0c", colorB: "#2c1516", accent: "#c26d3f" },
  { id: "desert-film", name: "Desert film", description: "Faded blue shadow, baked oxide and sun-struck cream.", colorA: "#192b32", colorB: "#a8502f", accent: "#efc47d" },
  { id: "rose-glass", name: "Rose glass", description: "Bruised rose, warm plum and quiet skin light.", colorA: "#28171f", colorB: "#6d3945", accent: "#f0b59d" },
  { id: "midnight-cyan", name: "Midnight cyan", description: "Ink blue, electric indigo and a cold cyan flare.", colorA: "#050714", colorB: "#161a4f", accent: "#4dd9ff" },
  { id: "ultraviolet", name: "Ultraviolet", description: "Black violet, spectral purple and magenta light.", colorA: "#09051a", colorB: "#35126d", accent: "#d66cff" },
  { id: "forest-negative", name: "Forest negative", description: "Wet black-green, moss shadow and pale chlorophyll.", colorA: "#07110d", colorB: "#173b2c", accent: "#8dcf9f" },
  { id: "oxide-red", name: "Oxide red", description: "Charcoal, dried blood and a clipped red exposure.", colorA: "#100807", colorB: "#461011", accent: "#d73b2c" },
  { id: "snow-line", name: "Snow line", description: "Cold grey, white atmosphere and a clean blown highlight.", colorA: "#c9cbd0", colorB: "#edf0f0", accent: "#ffffff" },
  { id: "ocean-emulsion", name: "Ocean emulsion", description: "Deep teal-black, oxidised water and sea-glass light.", colorA: "#04131a", colorB: "#0d4050", accent: "#72d4cf" },
  { id: "sodium-night", name: "Sodium night", description: "Black asphalt, brown shadow and sodium-vapour orange.", colorA: "#100b08", colorB: "#4a2312", accent: "#ff9e42" },
  { id: "daybreak-comedy", name: "Daybreak comedy", description: "Apricot paper, coral warmth and a soft yellow lift.", colorA: "#f3d6b4", colorB: "#ef7d61", accent: "#fff1b5" },
  { id: "newsprint", name: "Newsprint", description: "Compressed black, grey ink and aged stock.", colorA: "#151515", colorB: "#3a3936", accent: "#d7d2c8" },
  { id: "silver-gelatin", name: "Silver gelatin", description: "True black, graphite and photographic silver.", colorA: "#060606", colorB: "#242424", accent: "#d9d8d4" },
  { id: "alpine-blue", name: "Alpine blue", description: "Mountain night, glacial blue and cold morning air.", colorA: "#071521", colorB: "#1d4f67", accent: "#bfe9f4" },
  { id: "ritual-ember", name: "Ritual ember", description: "Ash black, burnt umber and a live ember edge.", colorA: "#090503", colorB: "#38130b", accent: "#ff6b2c" },
  { id: "chemical-green", name: "Chemical green", description: "Darkroom green, oxidised olive and acidic chartreuse.", colorA: "#071009", colorB: "#213e20", accent: "#c6ff4a" },
  { id: "noir-violet", name: "Noir violet", description: "Black plum, violet shadow and a faded lavender sign.", colorA: "#050407", colorB: "#1d1327", accent: "#a874cb" },
  { id: "coral-broadcast", name: "Coral broadcast", description: "Wine shadow, broadcast coral and soft peach light.", colorA: "#2d1216", colorB: "#a9434d", accent: "#ffd1bb" },
  { id: "daylight-paper", name: "Daylight paper", description: "Warm stock, pale cream and clean window light.", colorA: "#d8cfbd", colorB: "#f2eadb", accent: "#fef9ed" },
];

function whole(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function backgroundCompositionIndex(seed: number): number {
  const normalized = whole(seed, 0, 1_000_000);
  if (normalized < BACKGROUND_ATLAS_SEED_BASE) return 0;
  return (normalized - BACKGROUND_ATLAS_SEED_BASE) % BACKGROUND_COMPOSITIONS_PER_FAMILY;
}

export function backgroundVariation(seed: number): number {
  const normalized = whole(seed, 0, 1_000_000);
  if (normalized < BACKGROUND_ATLAS_SEED_BASE) return normalized % BACKGROUND_VARIATION_COUNT;
  return Math.floor((normalized - BACKGROUND_ATLAS_SEED_BASE) / BACKGROUND_COMPOSITIONS_PER_FAMILY) % BACKGROUND_VARIATION_COUNT;
}

export function encodeBackgroundSeed(composition: number, variation: number): number {
  const safeComposition = whole(composition, 0, BACKGROUND_COMPOSITIONS_PER_FAMILY - 1);
  const safeVariation = whole(variation, 0, BACKGROUND_VARIATION_COUNT - 1);
  return BACKGROUND_ATLAS_SEED_BASE + safeVariation * BACKGROUND_COMPOSITIONS_PER_FAMILY + safeComposition;
}

export function withBackgroundComposition(
  background: BackgroundSettings,
  composition: number,
): BackgroundSettings {
  return {
    ...background,
    seed: encodeBackgroundSeed(composition, backgroundVariation(background.seed)),
  };
}

export function withBackgroundVariation(
  background: BackgroundSettings,
  variation: number,
): BackgroundSettings {
  return {
    ...background,
    seed: encodeBackgroundSeed(backgroundCompositionIndex(background.seed), variation),
  };
}

export function withBackgroundPalette(
  background: BackgroundSettings,
  palette: BackgroundPalette,
): BackgroundSettings {
  return {
    ...background,
    colorA: palette.colorA,
    colorB: palette.colorB,
    accent: palette.accent,
  };
}

export function matchingBackgroundPalette(background: BackgroundSettings): BackgroundPalette | null {
  return BACKGROUND_PALETTES.find((palette) => (
    palette.colorA === background.colorA
    && palette.colorB === background.colorB
    && palette.accent === background.accent
  )) ?? null;
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

export const BACKGROUND_STUDIES: readonly BackgroundStudy[] = [
  makeStudy("black-leader", "Black Leader", "solid", "Minimal", "A severe black field with photographic silver held almost entirely in reserve.", "silver-gelatin", 0, 7, 0.28, 0.04, 0.08, 0.42),
  makeStudy("tungsten-wash", "Tungsten Wash", "solid", "Archive", "A warm projector wash crossing an old dark room.", "tungsten-archive", 1, 19, 0.72, 0.22, 0.12, 0.46),
  makeStudy("exit-light", "Exit Light", "solid", "Thriller", "A clipped red edge that never overwhelms the deck.", "oxide-red", 2, 43, 0.78, 0.14, 0.15, 0.62),
  makeStudy("desert-floor", "Desert Floor", "solid", "Travel", "A low sun-baked floor under blue evening shadow.", "desert-film", 3, 28, 0.68, 0.12, 0.11, 0.28),
  makeStudy("celluloid-burn", "Celluloid Burn", "solid", "Experimental", "A soft emulsion burn held inside ash-black stock.", "ritual-ember", 4, 61, 0.88, 0.26, 0.2, 0.66),
  makeStudy("cotton-rag", "Cotton Rag", "solid", "Editorial", "Warm daylight paper with barely visible directional tooth.", "daylight-paper", 5, 12, 0.34, 0.05, 0.18, 0.14),
  makeStudy("moon-halo", "Moon Halo", "solid", "Tender", "A submerged cold halo beneath a quiet blue field.", "alpine-blue", 6, 35, 0.62, 0.16, 0.08, 0.44),
  makeStudy("night-exposure", "Night Exposure", "solid", "Noir", "A sodium band stretched across long black exposure.", "sodium-night", 7, 52, 0.74, 0.18, 0.16, 0.68),

  makeStudy("road-memory-field", "Road Memory", "gradient", "Travel", "The open-road palette pushed through Drift's retained horizon grammar.", "desert-film", 0, 31, 0.84, 0.2, 0.16, 0.34),
  makeStudy("horizon-melt", "Horizon Melt", "gradient", "Dream", "A rose horizon that slowly gives up its edge.", "rose-glass", 1, 17, 0.76, 0.24, 0.1, 0.3),
  makeStudy("storm-glass", "Storm Glass", "gradient", "Drama", "A diagonal blue weather front with deep pressure behind it.", "midnight-cyan", 2, 68, 0.82, 0.32, 0.12, 0.56),
  makeStudy("dusk-aperture", "Dusk Aperture", "gradient", "Romance", "A radial coral dusk opening around the centre of the frame.", "coral-broadcast", 3, 24, 0.7, 0.18, 0.08, 0.24),
  makeStudy("prism-weather", "Prism Weather", "gradient", "Music", "Broad ultraviolet bands moving with measured spectral confidence.", "ultraviolet", 4, 77, 0.92, 0.38, 0.1, 0.42),
  makeStudy("twin-suns", "Twin Suns", "gradient", "Science fiction", "Two warm celestial sources over a pale unfamiliar world.", "daybreak-comedy", 5, 9, 0.78, 0.2, 0.06, 0.22),
  makeStudy("split-signal", "Split Signal", "gradient", "Thriller", "A red signal seam displaced inside near-black space.", "oxide-red", 6, 47, 0.86, 0.28, 0.14, 0.64),
  makeStudy("heat-mirage", "Heat Mirage", "gradient", "Travel", "A low sodium horizon trembling over asphalt-dark ground.", "sodium-night", 7, 56, 0.8, 0.34, 0.16, 0.5),

  makeStudy("orbiting-bloom-study", "Orbiting Bloom", "aura", "Editorial", "Drift's original two-bloom atmosphere, recut with a deeper tungsten palette.", "tungsten-archive", 0, 17, 0.72, 0.34, 0.12, 0.48),
  makeStudy("projector-bloom", "Projector Bloom", "aura", "Cinema", "A broad bone-white projector halo breathing behind the slide track.", "bone-ink", 1, 38, 0.78, 0.2, 0.1, 0.46),
  makeStudy("aurora-veil", "Aurora Veil", "aura", "Wonder", "Cold veils crossing like weather seen through glass.", "alpine-blue", 2, 73, 0.84, 0.32, 0.08, 0.36),
  makeStudy("stained-light", "Stained Light", "aura", "Fantasy", "Irregular violet panes of light with no literal window in view.", "ultraviolet", 3, 29, 0.9, 0.26, 0.1, 0.44),
  makeStudy("liquid-caustic", "Liquid Caustic", "aura", "Ocean", "Sea-glass caustics slowed into an ambient field.", "ocean-emulsion", 4, 64, 0.82, 0.3, 0.08, 0.38),
  makeStudy("rose-chamber", "Rose Chamber", "aura", "Romance", "Two rose chambers approaching without quite touching.", "rose-glass", 5, 21, 0.7, 0.16, 0.06, 0.26),
  makeStudy("ice-bloom", "Ice Bloom", "aura", "Alpine", "A pale crystalline flower diffused into cold air.", "snow-line", 6, 88, 0.52, 0.18, 0.06, 0.2),
  makeStudy("sacred-lens", "Sacred Lens", "aura", "Ritual", "A mandorla of ember light held inside ash-black space.", "ritual-ember", 7, 45, 0.88, 0.2, 0.12, 0.58),

  makeStudy("long-fibre", "Long Fibre", "paper", "Editorial", "Warm stock with long fibres and a quiet change in exposure.", "daylight-paper", 0, 6, 0.44, 0.08, 0.26, 0.18),
  makeStudy("contact-sheet", "Contact Sheet", "paper", "Documentary", "A silver contact grid that behaves like evidence rather than decoration.", "silver-gelatin", 1, 32, 0.56, 0.06, 0.3, 0.42),
  makeStudy("riso-dawn", "Riso Dawn", "paper", "Comedy", "Misregistered coral and yellow ink on warm stock.", "daybreak-comedy", 2, 74, 0.68, 0.12, 0.24, 0.16),
  makeStudy("linen-field", "Linen Field", "paper", "Craft", "Cross-woven bone and ink with a handmade surface.", "bone-ink", 3, 14, 0.48, 0.08, 0.28, 0.26),
  makeStudy("newsprint-night", "Newsprint Night", "paper", "Journalism", "Compressed grey ink with a faint folded-page logic.", "newsprint", 4, 53, 0.54, 0.05, 0.34, 0.5),
  makeStudy("silver-emulsion", "Silver Emulsion", "paper", "Archive", "Dense photographic grain, dust and a restrained white leak.", "silver-gelatin", 5, 81, 0.62, 0.1, 0.38, 0.56),
  makeStudy("halftone-heat", "Halftone Heat", "paper", "Pop", "A large coral screen opening toward a peach highlight.", "coral-broadcast", 6, 26, 0.74, 0.14, 0.22, 0.22),
  makeStudy("dust-ledger", "Dust Ledger", "paper", "Memory", "Tungsten dust and vertical scratches across an old ledger field.", "tungsten-archive", 7, 67, 0.58, 0.08, 0.4, 0.48),

  makeStudy("breathing-slit-study", "Breathing Slit", "void", "Horror", "Drift's original slit, tightened into a red-black darkroom.", "oxide-red", 0, 66, 0.9, 0.13, 0.22, 0.76),
  makeStudy("eclipse-room", "Eclipse Room", "void", "Science fiction", "A violet corona displaced around a nearly invisible body.", "noir-violet", 1, 23, 0.84, 0.14, 0.12, 0.72),
  makeStudy("ember-ritual", "Ember Ritual", "void", "Horror", "Low smoke with sparse embers that never become a screensaver.", "ritual-ember", 2, 71, 0.9, 0.2, 0.2, 0.74),
  makeStudy("abyssal-rays", "Abyssal Rays", "void", "Ocean", "Cold underwater rays entering from outside the frame.", "ocean-emulsion", 3, 37, 0.82, 0.18, 0.12, 0.7),
  makeStudy("mineral-fog", "Mineral Fog", "void", "Mystery", "Green mineral strata dissolving into near-black fog.", "forest-negative", 4, 84, 0.78, 0.16, 0.18, 0.66),
  makeStudy("rain-negative", "Rain Negative", "void", "Noir", "Cyan rain scratches cutting through a blue-black negative.", "midnight-cyan", 5, 42, 0.86, 0.3, 0.24, 0.78),
  makeStudy("chemical-burn", "Chemical Burn", "void", "Experimental", "An acidic emulsion reaction opening inside darkroom green.", "chemical-green", 6, 58, 0.94, 0.22, 0.2, 0.72),
  makeStudy("black-tide", "Black Tide", "void", "Dread", "Several black wave fronts carrying a faint silver edge.", "silver-gelatin", 7, 95, 0.76, 0.12, 0.18, 0.82),
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

export function applyBackgroundStudy(settings: StudioSettings, study: BackgroundStudy): StudioSettings {
  return {
    ...settings,
    stage: { ...settings.stage, transparent: false },
    background: { ...study.background },
  };
}
