import { deepFreeze, type DeepReadonly } from "./immutability";

export const ATMOSPHERE_FAMILY_COUNT = 8 as const;
export const ATMOSPHERE_COMPOSITIONS_PER_FAMILY = 8 as const;
export const ATMOSPHERE_COMPOSITION_COUNT = 64 as const;
export const ATMOSPHERE_HERO_COUNT = 12 as const;

export type AtmosphereFamilyId =
  | "solid"
  | "gradient"
  | "aura"
  | "paper"
  | "void"
  | "cutting-map"
  | "grid"
  | "wave";

export interface AtmosphereCompositionDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface AtmosphereFamilyDefinition {
  readonly id: AtmosphereFamilyId;
  readonly name: string;
  readonly character: string;
  readonly compositions: readonly AtmosphereCompositionDefinition[];
}

/**
 * Eight structural languages shared with the curated Background Atlas.
 * Colour, treatment, and recut stay independent; these IDs describe space.
 */
export const ATMOSPHERE_FAMILIES = deepFreeze([
  {
    id: "solid",
    name: "Solid Field",
    character: "Severe colour planes shaped by one disciplined source of light.",
    compositions: [
      { id: "pure-field", name: "Pure Field", description: "A nearly unmodulated plane that gives the deck the whole room." },
      { id: "projector-wash", name: "Projector Wash", description: "A broad off-axis wash, like light crossing a cinema wall." },
      { id: "edge-light", name: "Edge Light", description: "One narrow luminous edge with a long, soft falloff." },
      { id: "duotone-floor", name: "Duotone Floor", description: "A low horizon where one colour quietly occupies the floor." },
      { id: "soft-burn", name: "Soft Burn", description: "An overexposed bloom held inside a darker chemical edge." },
      { id: "paper-tooth", name: "Paper Tooth", description: "A restrained tactile plane with directional fibre and tooth." },
      { id: "low-halo", name: "Low Halo", description: "A submerged oval of light beneath the slide track." },
      { id: "night-exposure", name: "Night Exposure", description: "A long exposure field crossed by one clipped nocturnal band." },
    ],
  },
  {
    id: "gradient",
    name: "Gradient Weather",
    character: "Large atmospheric fronts and horizons, composed as weather rather than wallpaper.",
    compositions: [
      { id: "legacy-horizon", name: "Legacy Horizon", description: "The original Drift horizon, retained as a structural starting point." },
      { id: "horizon-melt", name: "Horizon Melt", description: "A weathered horizon whose edge slowly gives up its shape." },
      { id: "diagonal-weather", name: "Diagonal Weather", description: "A seeded diagonal front with broad atmospheric turbulence." },
      { id: "radial-dusk", name: "Radial Dusk", description: "A deep radial falloff carrying the last light of day." },
      { id: "prism-bands", name: "Prism Bands", description: "Three broad spectral bands that never become neon wallpaper." },
      { id: "twin-suns", name: "Twin Suns", description: "Two slow celestial blooms suspended over a grounded horizon." },
      { id: "split-signal", name: "Split Signal", description: "A softened two-tone cut with a displaced luminous seam." },
      { id: "road-mirage", name: "Road Mirage", description: "A low heat horizon with restrained filmic refraction." },
    ],
  },
  {
    id: "aura",
    name: "Luminous Aura",
    character: "Contained optical chambers that breathe behind the work without becoming the subject.",
    compositions: [
      { id: "orbiting-bloom", name: "Orbiting Bloom", description: "Two low blooms tracing one closed, patient orbit." },
      { id: "projector-halo", name: "Projector Halo", description: "A large annular projector halo with a dim breathing core." },
      { id: "aurora-veil", name: "Aurora Veil", description: "Layered vertical veils carried by closed harmonic motion." },
      { id: "stained-light", name: "Stained Light", description: "Overlapping panes of coloured light with seeded irregular edges." },
      { id: "liquid-caustic", name: "Liquid Caustic", description: "Ridged aqueous light without texture files or simulation state." },
      { id: "rose-chamber", name: "Rose Chamber", description: "Two soft elliptical chambers that almost touch." },
      { id: "ice-bloom", name: "Ice Bloom", description: "A crystalline radial bloom softened into photographic light." },
      { id: "mandorla", name: "Mandorla", description: "An almond-shaped overlap of two quiet luminous fields." },
    ],
  },
  {
    id: "paper",
    name: "Printed Matter",
    character: "Handled fibres, print structures, and photographic emulsion with no fake-stock cosplay.",
    compositions: [
      { id: "long-fibres", name: "Long Fibres", description: "Long directional fibres under a quiet change in exposure." },
      { id: "contact-sheet", name: "Contact Sheet", description: "A disciplined photographic grid under silver-gelatin texture." },
      { id: "risograph-cloud", name: "Risograph Cloud", description: "Misregistered colour clouds and coarse printed dots." },
      { id: "linen-drift", name: "Linen Drift", description: "Cross-woven fibres with a soft directional exposure shift." },
      { id: "newsprint", name: "Newsprint", description: "Compressed ink, diagonal screen, and a faint editorial fold." },
      { id: "silver-emulsion", name: "Silver Emulsion", description: "Dense emulsion grain, dust, and one restrained light leak." },
      { id: "halftone-field", name: "Halftone Field", description: "A large-screen halftone that opens and closes with the field." },
      { id: "dust-archive", name: "Dust Archive", description: "Sparse scratches, dust, and uneven archival exposure." },
    ],
  },
  {
    id: "void",
    name: "Darkroom Void",
    character: "Near-black rooms where one event, edge, or weather system earns the darkness.",
    compositions: [
      { id: "breathing-slit", name: "Breathing Slit", description: "One low slit of light held inside a deep darkroom." },
      { id: "eclipse", name: "Eclipse", description: "A near-black disc with one quiet displaced corona." },
      { id: "ember-smoke", name: "Ember Smoke", description: "Low smoke crossed by sparse deterministic embers." },
      { id: "abyssal-rays", name: "Abyssal Rays", description: "Underwater rays entering a black field from beyond the frame." },
      { id: "mineral-fog", name: "Mineral Fog", description: "Ridged mineral strata dissolving into near-black fog." },
      { id: "rain-negative", name: "Rain Negative", description: "Long diagonal rain scratches over a photographic negative." },
      { id: "chemical-burn", name: "Chemical Burn", description: "An irregular emulsion burn with a luminous reaction edge." },
      { id: "black-tide", name: "Black Tide", description: "Several submerged wave fronts carrying a faint silver edge." },
    ],
  },
  {
    id: "cutting-map",
    name: "Cutting Map",
    character: "Survey traces, crop marks, and route lines handled as quiet editorial evidence.",
    compositions: [
      { id: "contour-notes", name: "Contour Notes", description: "Fine topographic traces gathering around the reading corridor." },
      { id: "folded-atlas", name: "Folded Atlas", description: "A restrained map fold with offset regions and a softened spine." },
      { id: "route-thread", name: "Route Thread", description: "One patient route line crossing a field of quieter local marks." },
      { id: "parcel-lines", name: "Parcel Lines", description: "Irregular survey divisions held below the deck's visual pressure." },
      { id: "registration-field", name: "Registration Field", description: "Printer's crosses and trim marks drifting inside generous margins." },
      { id: "coastline-proof", name: "Coastline Proof", description: "A single eroded boundary with faint depth lines behind it." },
      { id: "crop-window", name: "Crop Window", description: "Editorial crop corners and a quiet off-centre proofing window." },
      { id: "survey-drift", name: "Survey Drift", description: "Measured bearings and contour arcs moving like handled field notes." },
    ],
  },
  {
    id: "grid",
    name: "Quiet Grid",
    character: "Editorial measures and modular registers with enough absence to keep the work sovereign.",
    compositions: [
      { id: "modular-field", name: "Modular Field", description: "A low-contrast modular grid with one gently weighted interval." },
      { id: "offset-ledger", name: "Offset Ledger", description: "Two registration systems meeting with a small deliberate offset." },
      { id: "quiet-thirds", name: "Quiet Thirds", description: "Broad compositional thirds with thin secondary subdivisions." },
      { id: "baseline-rhythm", name: "Baseline Rhythm", description: "Horizontal editorial rules interrupted by sparse vertical measures." },
      { id: "coordinate-crosses", name: "Coordinate Crosses", description: "Small coordinate crosses placed on a generous invisible lattice." },
      { id: "broken-matrix", name: "Broken Matrix", description: "A modular field with selected lines withheld to create breathing room." },
      { id: "contact-columns", name: "Contact Columns", description: "Tall photographic columns and slim gutters shaped for either axis." },
      { id: "perspective-register", name: "Perspective Register", description: "A shallow receding register that stays architectural, never game-like." },
    ],
  },
  {
    id: "wave",
    name: "Tidal Wave",
    character: "Patient currents and soft interference that move as atmosphere, never a loud screensaver.",
    compositions: [
      { id: "tidal-horizon", name: "Tidal Horizon", description: "One slow horizon swell with a faintly luminous leading edge." },
      { id: "nested-swell", name: "Nested Swell", description: "Several broad nested curves rising at different patient tempos." },
      { id: "interference-bed", name: "Interference Bed", description: "Two quiet wave systems meeting without hard moire or flicker." },
      { id: "ribbon-current", name: "Ribbon Current", description: "A soft current ribbon folding through the background plane." },
      { id: "standing-wave", name: "Standing Wave", description: "A restrained standing wave breathing around a stable centre line." },
      { id: "radial-echo", name: "Radial Echo", description: "Off-centre circular echoes diffused into photographic atmosphere." },
      { id: "contour-current", name: "Contour Current", description: "Flow lines bending around the focal corridor like water around stone." },
      { id: "undertow-lines", name: "Undertow Lines", description: "Long submerged bands pulling gently beneath a calm upper field." },
    ],
  },
] as const satisfies readonly AtmosphereFamilyDefinition[]);

export type AtmosphereCompositionId = (typeof ATMOSPHERE_FAMILIES)[number]["compositions"][number]["id"];

export interface AtmosphereHeroStudy {
  readonly id: string;
  readonly name: string;
  readonly familyId: AtmosphereFamilyId;
  readonly compositionId: AtmosphereCompositionId;
  readonly direction: string;
}

/** Candidate first-shelf metadata. The full atlas remains available through the family registry. */
export const ATMOSPHERE_HERO_STUDIES = deepFreeze([
  { id: "hero-pure-field", name: "Pure Field", familyId: "solid", compositionId: "pure-field", direction: "Severe field; typography and negative space hold authority." },
  { id: "hero-projector-wash", name: "Projector Wash", familyId: "solid", compositionId: "projector-wash", direction: "Warm off-axis light with enough falloff to feel projected." },
  { id: "hero-horizon-melt", name: "Horizon Melt", familyId: "gradient", compositionId: "horizon-melt", direction: "Patient weather and a dissolving line, useful for travel and memory." },
  { id: "hero-radial-dusk", name: "Radial Dusk", familyId: "gradient", compositionId: "radial-dusk", direction: "Last light held behind the focal corridor." },
  { id: "hero-orbiting-bloom", name: "Orbiting Bloom", familyId: "aura", compositionId: "orbiting-bloom", direction: "Two dim sources breathe around the deck, never across it." },
  { id: "hero-stained-light", name: "Stained Light", familyId: "aura", compositionId: "stained-light", direction: "Irregular colour panes with no literal window effect." },
  { id: "hero-aurora-veil", name: "Aurora Veil", familyId: "aura", compositionId: "aurora-veil", direction: "Vertical light weather authored for portrait movement." },
  { id: "hero-long-fibres", name: "Long Fibres", familyId: "paper", compositionId: "long-fibres", direction: "Quiet handled stock for essays, notes, and founder-led work." },
  { id: "hero-contact-sheet", name: "Contact Sheet", familyId: "paper", compositionId: "contact-sheet", direction: "Photographic evidence grid; disciplined, not nostalgic decoration." },
  { id: "hero-silver-emulsion", name: "Silver Emulsion", familyId: "paper", compositionId: "silver-emulsion", direction: "Dense print texture with sparse wear and a controlled leak." },
  { id: "hero-eclipse", name: "Eclipse", familyId: "void", compositionId: "eclipse", direction: "One displaced corona; almost everything else stays black." },
  { id: "hero-mineral-fog", name: "Mineral Fog", familyId: "void", compositionId: "mineral-fog", direction: "Strata and fog held below the deck's reading pressure." },
] as const satisfies readonly AtmosphereHeroStudy[]);

export const ATMOSPHERE_COMPOSITIONS: DeepReadonly<readonly AtmosphereCompositionDefinition[]> = deepFreeze(
  ATMOSPHERE_FAMILIES.reduce<AtmosphereCompositionDefinition[]>((compositions, family) => {
    compositions.push(...family.compositions);
    return compositions;
  }, []),
);

export function atmosphereCompositions(): typeof ATMOSPHERE_COMPOSITIONS {
  return ATMOSPHERE_COMPOSITIONS;
}

export function atmosphereFamily(id: string): (typeof ATMOSPHERE_FAMILIES)[number] | null {
  return ATMOSPHERE_FAMILIES.find((family) => family.id === id) ?? null;
}

export function atmosphereComposition(id: string): DeepReadonly<AtmosphereCompositionDefinition> | null {
  return atmosphereCompositions().find((composition) => composition.id === id) ?? null;
}
