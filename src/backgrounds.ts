import type { BackgroundSettings, BackgroundStyle, StudioSettings } from "./model";
import type { AtmosphereSettings } from "./core/project/schema";

export type OpaqueBackgroundStyle = Exclude<BackgroundStyle, "transparent">;

export const BACKGROUND_COMPOSITIONS_PER_FAMILY = 8;
export const BACKGROUND_FAMILY_COUNT = 9;
export const BACKGROUND_COMPOSITION_COUNT = BACKGROUND_COMPOSITIONS_PER_FAMILY * BACKGROUND_FAMILY_COUNT;
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
  "cutting-map": "Cutting map",
  grid: "Quiet grid",
  wave: "Tidal wave",
  atelier: "Atelier studies",
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
  "cutting-map": [
    { id: "contour-notes", name: "Contour notes", description: "Fine topographic traces gathering around the reading corridor." },
    { id: "folded-atlas", name: "Folded atlas", description: "A restrained map fold with offset regions and a softened spine." },
    { id: "route-thread", name: "Route thread", description: "One patient route line crossing a field of quieter local marks." },
    { id: "parcel-lines", name: "Parcel lines", description: "Irregular survey divisions held below the deck's visual pressure." },
    { id: "registration-field", name: "Registration field", description: "Printer's crosses and trim marks drifting inside generous margins." },
    { id: "coastline-proof", name: "Coastline proof", description: "A single eroded boundary with faint depth lines behind it." },
    { id: "crop-window", name: "Crop window", description: "Editorial crop corners and a quiet off-centre proofing window." },
    { id: "survey-drift", name: "Survey drift", description: "Measured bearings and contour arcs moving like handled field notes." },
  ],
  grid: [
    { id: "modular-field", name: "Modular field", description: "A low-contrast modular grid with one gently weighted interval." },
    { id: "offset-ledger", name: "Offset ledger", description: "Two registration systems meeting with a small deliberate offset." },
    { id: "quiet-thirds", name: "Quiet thirds", description: "Broad compositional thirds with thin secondary subdivisions." },
    { id: "baseline-rhythm", name: "Baseline rhythm", description: "Horizontal editorial rules interrupted by sparse vertical measures." },
    { id: "coordinate-crosses", name: "Coordinate crosses", description: "Small coordinate crosses placed on a generous invisible lattice." },
    { id: "broken-matrix", name: "Broken matrix", description: "A modular field with selected lines withheld to create breathing room." },
    { id: "contact-columns", name: "Contact columns", description: "Tall photographic columns and slim gutters shaped for either axis." },
    { id: "perspective-register", name: "Perspective register", description: "A shallow receding register that stays architectural, never game-like." },
  ],
  wave: [
    { id: "tidal-horizon", name: "Tidal horizon", description: "One slow horizon swell with a faintly luminous leading edge." },
    { id: "nested-swell", name: "Nested swell", description: "Several broad nested curves rising at different patient tempos." },
    { id: "interference-bed", name: "Interference bed", description: "Two quiet wave systems meeting without hard moire or flicker." },
    { id: "ribbon-current", name: "Ribbon current", description: "A soft current ribbon folding through the background plane." },
    { id: "standing-wave", name: "Standing wave", description: "A restrained standing wave breathing around a stable centre line." },
    { id: "radial-echo", name: "Radial echo", description: "Off-centre circular echoes diffused into photographic atmosphere." },
    { id: "contour-current", name: "Contour current", description: "Flow lines bending around the focal corridor like water around stone." },
    { id: "undertow-lines", name: "Undertow lines", description: "Long submerged bands pulling gently beneath a calm upper field." },
  ],
  atelier: [
    { id: "saffron-anatomy", name: "Saffron anatomy", description: "A sunlit pigment bloom crossed by radial ink filaments, marginal notes, and sparse drips." },
    { id: "verdigris-fresco", name: "Verdigris fresco", description: "Mineral glaze, plaster tooth, architectural arches, and one hairline seam weathered into the wall." },
    { id: "ultramarine-ledger", name: "Ultramarine ledger", description: "A pooled blue wash held against old-paper rules, a dry stroke, and a quiet editorial margin." },
    { id: "rose-madder-bloom", name: "Rose madder bloom", description: "Five translucent lobes with pooled pigment edges, fine veins, and a faded secondary wash." },
    { id: "charcoal-cartography", name: "Charcoal cartography", description: "Graphite smudge, topographic contours, and one confident hand-drawn route across pale cloth." },
    { id: "gilded-palimpsest", name: "Gilded palimpsest", description: "Faded blocks of old gold, interrupted manuscript rules, and an overwritten calligraphic arc." },
    { id: "indigo-botanical", name: "Indigo botanical", description: "A night-blue glaze carrying one restrained stem, alternating leaves, veins, and a ghosted bloom." },
    { id: "oxide-gesture", name: "Oxide gesture", description: "Dry terracotta bands, a broken orbital mark, and sparse pigment runs over warm plaster." },
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
  { id: "saffron-manuscript", name: "Saffron manuscript", description: "Sun-warmed saffron, burnt orange pigment and dry umber ink.", colorA: "#d8ba3a", colorB: "#d95d2b", accent: "#2e241f" },
  { id: "verdigris-plaster", name: "Verdigris plaster", description: "Aged lime plaster, mineral green and one oxidised red trace.", colorA: "#d5ceb2", colorB: "#4c756d", accent: "#87483a" },
  { id: "ultramarine-ledger", name: "Ultramarine ledger", description: "Old cotton paper, deep blue pigment and near-black editorial ink.", colorA: "#e1d7bb", colorB: "#285287", accent: "#28251f" },
  { id: "rose-madder-paper", name: "Rose madder paper", description: "Warm rag stock, transparent madder red and bruised plum linework.", colorA: "#e4d2bb", colorB: "#a94e48", accent: "#52343a" },
  { id: "graphite-cloth", name: "Graphite cloth", description: "Pale woven stock, rubbed graphite and decisive charcoal black.", colorA: "#d7d2c5", colorB: "#68645e", accent: "#262626" },
  { id: "gilded-vellum", name: "Gilded vellum", description: "Handled vellum, muted old gold and dark manuscript brown.", colorA: "#d7c790", colorB: "#8a672f", accent: "#2d231a" },
  { id: "indigo-herbarium", name: "Indigo herbarium", description: "Inky night blue, mineral teal and a faded botanical gold.", colorA: "#111a30", colorB: "#28516a", accent: "#d4c78e" },
  { id: "oxide-fresco", name: "Oxide fresco", description: "Warm plaster, iron-oxide red and a dry earthen line.", colorA: "#d6c2a6", colorB: "#a54832", accent: "#4b3028" },
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

/**
 * Project V4 stores the authored composition name and deterministic recut seed
 * separately. The legacy draw graph has one numeric slot, so this is the only
 * codec allowed to bridge those representations.
 */
export function backgroundSeedForAtmosphere(atmosphere: AtmosphereSettings): number {
  if (atmosphere.composition === "legacy-v1") return atmosphere.seedOffset;
  const family = atmosphere.family as OpaqueBackgroundStyle;
  const compositions = BACKGROUND_COMPOSITIONS[family];
  const composition = compositions?.findIndex((entry) => entry.id === atmosphere.composition) ?? -1;
  return encodeBackgroundSeed(Math.max(0, composition), atmosphere.seedOffset);
}

export function backgroundCompositionForSeed(
  family: string,
  seed: number,
): string {
  const compositions = BACKGROUND_COMPOSITIONS[family as OpaqueBackgroundStyle];
  return compositions?.[backgroundCompositionIndex(seed)]?.id ?? "pure-field";
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

  makeStudy("contour-notes-study", "Contour Notes", "cutting-map", "Editorial", "Fine survey traces gathered around a warm, legible reading corridor.", "daylight-paper", 0, 11, 0.42, 0.07, 0.14, 0.16),
  makeStudy("folded-atlas-study", "Folded Atlas", "cutting-map", "Travel", "A dusk atlas opened along one softened off-centre fold.", "desert-film", 1, 36, 0.5, 0.08, 0.12, 0.28),
  makeStudy("route-thread-study", "Route Thread", "cutting-map", "Journey", "One coral route carried through a field of quiet bearings.", "coral-broadcast", 2, 62, 0.46, 0.1, 0.1, 0.22),
  makeStudy("parcel-lines-study", "Parcel Lines", "cutting-map", "Documentary", "Survey parcels receding into a graphite editorial ground.", "newsprint", 3, 27, 0.36, 0.05, 0.2, 0.34),
  makeStudy("registration-field-study", "Registration Field", "cutting-map", "Print", "Sparse printer's marks held inside an old-paper proofing field.", "bone-ink", 4, 49, 0.38, 0.06, 0.16, 0.26),
  makeStudy("coastline-proof-study", "Coastline Proof", "cutting-map", "Archive", "A cold eroded boundary with barely visible depth contours.", "alpine-blue", 5, 78, 0.44, 0.09, 0.12, 0.32),
  makeStudy("crop-window-study", "Crop Window", "cutting-map", "Art direction", "An off-centre crop proof with disciplined negative space.", "silver-gelatin", 6, 18, 0.32, 0.04, 0.16, 0.38),
  makeStudy("survey-drift-study", "Survey Drift", "cutting-map", "Field notes", "Measured arcs and bearings moving through moss-dark stock.", "forest-negative", 7, 91, 0.48, 0.11, 0.16, 0.42),

  makeStudy("modular-field-study", "Modular Field", "grid", "Editorial", "A warm modular system with one interval quietly carrying weight.", "daylight-paper", 0, 15, 0.34, 0.05, 0.12, 0.12),
  makeStudy("offset-ledger-study", "Offset Ledger", "grid", "Archive", "Two silver registration systems meeting just out of alignment.", "silver-gelatin", 1, 41, 0.4, 0.07, 0.18, 0.36),
  makeStudy("quiet-thirds-study", "Quiet Thirds", "grid", "Composition", "Broad thirds and faint subdivisions held behind the work.", "bone-ink", 2, 70, 0.3, 0.04, 0.1, 0.18),
  makeStudy("baseline-rhythm-study", "Baseline Rhythm", "grid", "Typography", "Editorial baselines crossing a compressed grey ink field.", "newsprint", 3, 25, 0.38, 0.06, 0.2, 0.32),
  makeStudy("coordinate-crosses-study", "Coordinate Crosses", "grid", "Technical", "Small cyan coordinates floating through deep-blue space.", "midnight-cyan", 4, 57, 0.42, 0.09, 0.1, 0.46),
  makeStudy("broken-matrix-study", "Broken Matrix", "grid", "Experimental", "A violet matrix with deliberate absences and long pauses.", "noir-violet", 5, 83, 0.46, 0.08, 0.12, 0.44),
  makeStudy("contact-columns-study", "Contact Columns", "grid", "Photography", "Tall silver columns divided by slim, evidence-like gutters.", "silver-gelatin", 6, 32, 0.36, 0.05, 0.2, 0.4),
  makeStudy("perspective-register-study", "Perspective Register", "grid", "Architecture", "A shallow oxide register receding without synthetic spectacle.", "oxide-red", 7, 96, 0.4, 0.07, 0.12, 0.48),

  makeStudy("tidal-horizon-study", "Tidal Horizon", "wave", "Ocean", "One sea-glass swell crossing a nearly still dark horizon.", "ocean-emulsion", 0, 13, 0.48, 0.1, 0.1, 0.34),
  makeStudy("nested-swell-study", "Nested Swell", "wave", "Tender", "Broad rose curves arriving at different patient tempos.", "rose-glass", 1, 39, 0.44, 0.12, 0.08, 0.24),
  makeStudy("interference-bed-study", "Interference Bed", "wave", "Sound", "Two ultraviolet wave beds meeting as soft spectral pressure.", "ultraviolet", 2, 65, 0.46, 0.11, 0.08, 0.4),
  makeStudy("ribbon-current-study", "Ribbon Current", "wave", "Travel", "A warm current folding slowly through blue desert shadow.", "desert-film", 3, 30, 0.5, 0.14, 0.1, 0.26),
  makeStudy("standing-wave-study", "Standing Wave", "wave", "Minimal", "A pale standing wave breathing around a stable centre line.", "alpine-blue", 4, 54, 0.36, 0.08, 0.08, 0.3),
  makeStudy("radial-echo-study", "Radial Echo", "wave", "Memory", "Off-centre silver echoes fading into photographic black.", "silver-gelatin", 5, 86, 0.42, 0.1, 0.14, 0.52),
  makeStudy("contour-current-study", "Contour Current", "wave", "Documentary", "Moss-green flow lines bending around an open reading corridor.", "forest-negative", 6, 21, 0.4, 0.09, 0.12, 0.38),
  makeStudy("undertow-lines-study", "Undertow Lines", "wave", "Noir", "Long sodium bands pulling quietly beneath an asphalt-dark field.", "sodium-night", 7, 74, 0.44, 0.12, 0.14, 0.5),

  makeStudy("saffron-anatomy-study", "Saffron Anatomy", "atelier", "Generative painting", "A bright living-paper field, translucent orange wash, radial ink filaments, marginal marks, and restrained pigment drips.", "saffron-manuscript", 0, 37, 0.54, 0.07, 0.1, 0.14),
  makeStudy("verdigris-fresco-study", "Verdigris Fresco", "atelier", "Classical", "Mineral-green glaze, plaster weather, quiet architectural arches, and one oxidised seam.", "verdigris-plaster", 1, 62, 0.52, 0.055, 0.12, 0.16),
  makeStudy("ultramarine-ledger-study", "Ultramarine Ledger", "atelier", "Editorial", "Pooled blue pigment meeting old-paper rules, a dry brush trace, and one ink-dark margin.", "ultramarine-ledger", 2, 18, 0.55, 0.06, 0.1, 0.12),
  makeStudy("rose-madder-bloom-study", "Rose Madder Bloom", "atelier", "Romance", "A translucent five-lobed bloom with pooled edges and vein-like ink held below the deck.", "rose-madder-paper", 3, 83, 0.54, 0.05, 0.11, 0.13),
  makeStudy("charcoal-cartography-study", "Charcoal Cartography", "atelier", "Field notes", "Rubbed graphite, fine topography, and one loose route gesture across quiet cloth.", "graphite-cloth", 4, 29, 0.5, 0.045, 0.13, 0.17),
  makeStudy("gilded-palimpsest-study", "Gilded Palimpsest", "atelier", "Archive", "Old-gold blocks, interrupted manuscript rules, and a slowly breathing calligraphic arc.", "gilded-vellum", 5, 71, 0.5, 0.04, 0.1, 0.15),
  makeStudy("indigo-botanical-study", "Indigo Botanical", "atelier", "Botanical", "A restrained gold herbarium drawing surfacing through layered indigo and mineral-blue glaze.", "indigo-herbarium", 6, 46, 0.5, 0.065, 0.12, 0.34),
  makeStudy("oxide-gesture-study", "Oxide Gesture", "atelier", "Abstract", "Dry terracotta bands, one broken orbit, and sparse runs painted over warm plaster.", "oxide-fresco", 7, 94, 0.54, 0.075, 0.11, 0.18),
];

/**
 * The authored first shelf. It is deliberately small enough to scan in one
 * inspector view and broad enough to reveal the range of Drift's worlds.
 * The complete atlas remains available behind an explicit Browse all action.
 */
export const CURATED_BACKGROUND_STUDY_IDS = Object.freeze([
  "black-leader",
  "cotton-rag",
  "road-memory-field",
  "projector-bloom",
  "contact-sheet",
  "breathing-slit-study",
  "contour-notes-study",
  "quiet-thirds-study",
  "tidal-horizon-study",
  "verdigris-fresco-study",
  "rose-madder-bloom-study",
  "charcoal-cartography-study",
] as const);

const CURATED_BACKGROUND_STUDIES = Object.freeze(CURATED_BACKGROUND_STUDY_IDS.map((id) => {
  const study = BACKGROUND_STUDIES.find((candidate) => candidate.id === id);
  if (!study) throw new Error(`Unknown curated background study: ${id}`);
  return study;
}));

/** Current choice first, then the authored shelf, with no duplicate cards. */
export function curatedBackgroundStudies(
  current: BackgroundStudy | null,
  limit: number = CURATED_BACKGROUND_STUDY_IDS.length,
): readonly BackgroundStudy[] {
  const safeLimit = Number.isSafeInteger(limit)
    ? Math.max(0, Math.min(CURATED_BACKGROUND_STUDY_IDS.length, limit))
    : CURATED_BACKGROUND_STUDY_IDS.length;
  if (safeLimit === 0) return Object.freeze([]);
  const studies = current
    ? [current, ...CURATED_BACKGROUND_STUDIES.filter((study) => study.id !== current.id)]
    : [...CURATED_BACKGROUND_STUDIES];
  return Object.freeze(studies.slice(0, safeLimit));
}

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
