import type {
  Axis,
  Direction,
  DriftProjectV4,
  MaterialSettings,
  MotionSettings,
  WorldVariant,
} from "../project/schema";
import { deepFreeze, type DeepReadonly } from "./immutability";

/** Registry version only. No World renderer/UI is claimed by this value. */
export const WORLD_RECIPE_VERSION = 1 as const;

export const WORLD_REGISTRY_IMPLEMENTATION_STATUS = "registry-only" as const;

export const WORLD_IDS = deepFreeze([
  "editorial-drift",
  "noir-contact",
  "sunstruck-atlas",
  "dread",
  "tender-light",
  "velvet-fever",
  "celluloid-archive",
  "night-run",
] as const);
export type WorldId = (typeof WORLD_IDS)[number];

export const WORLD_RATIO_IDS = deepFreeze(["9:16", "4:5", "1:1", "16:9"] as const);
export type WorldRatioId = (typeof WORLD_RATIO_IDS)[number];

export const WORLD_RATIO_DIMENSIONS = deepFreeze({
  "9:16": { width: 1080, height: 1920 },
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
} as const satisfies Readonly<Record<WorldRatioId, { readonly width: number; readonly height: number }>>);

export function worldRatioForDimensions(width: number, height: number): WorldRatioId | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  for (const ratio of WORLD_RATIO_IDS) {
    const authored = WORLD_RATIO_DIMENSIONS[ratio];
    if (width * authored.height === height * authored.width) return ratio;
  }
  return null;
}

export function nearestWorldRatioForDimensions(width: number, height: number): WorldRatioId {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "9:16";
  const requested = width / height;
  return WORLD_RATIO_IDS.reduce((nearest, candidate) => {
    const nearestSize = WORLD_RATIO_DIMENSIONS[nearest];
    const candidateSize = WORLD_RATIO_DIMENSIONS[candidate];
    const nearestDistance = Math.abs(Math.log(requested / (nearestSize.width / nearestSize.height)));
    const candidateDistance = Math.abs(Math.log(requested / (candidateSize.width / candidateSize.height)));
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, "9:16" as WorldRatioId);
}

export const PUBLIC_WORLD_VARIANTS = deepFreeze(["restrained", "directed", "fever"] as const);
export type PublicWorldVariant = Exclude<WorldVariant, "custom">;

export const WORLD_RECIPE_DOMAINS = deepFreeze([
  "motion",
  "card",
  "material",
  "lighting",
  "atmosphere",
  "lens",
] as const);
export type WorldRecipeDomain = (typeof WORLD_RECIPE_DOMAINS)[number];
export type WorldRecipe = Pick<DriftProjectV4, WorldRecipeDomain>;
export type FrozenWorldRecipe = DeepReadonly<WorldRecipe>;

type ScalarDomainOverride<Domain> = {
  readonly [Key in keyof Domain]?: Domain[Key];
};

export type WorldMotionOverride = {
  readonly [Section in keyof MotionSettings]?: ScalarDomainOverride<MotionSettings[Section]>;
};

export type WorldMaterialOverride = ScalarDomainOverride<Omit<MaterialSettings, "finish">> & {
  readonly finish?: ScalarDomainOverride<MaterialSettings["finish"]>;
};

export interface WorldRecipeOverride {
  readonly motion?: WorldMotionOverride;
  readonly card?: ScalarDomainOverride<WorldRecipe["card"]>;
  readonly material?: WorldMaterialOverride;
  readonly lighting?: ScalarDomainOverride<WorldRecipe["lighting"]>;
  readonly atmosphere?: ScalarDomainOverride<WorldRecipe["atmosphere"]>;
  readonly lens?: ScalarDomainOverride<WorldRecipe["lens"]>;
}

export interface WorldVariantMetadata {
  readonly id: PublicWorldVariant;
  readonly name: string;
  readonly pressure: 0 | 1 | 2;
  readonly character: string;
}

export interface WorldAxisSuitability {
  readonly preferredDirection: Direction;
  readonly supportedDirections: readonly Direction[];
  readonly intent: string;
}

export interface WorldIdentity {
  readonly id: WorldId;
  readonly name: string;
  readonly eyebrow: string;
  readonly character: string;
  readonly bestFor: string;
  readonly avoidWhen: string;
  readonly variants: Readonly<Record<PublicWorldVariant, WorldVariantMetadata>>;
  readonly supportedRatios: readonly WorldRatioId[];
  readonly axes: Readonly<Record<Axis, WorldAxisSuitability>>;
  readonly compositionIntent: {
    readonly portrait: string;
    readonly landscape: string;
  };
  /** Null until renderer, UI, preview/export parity, and visual review ship it. */
  readonly authoredRecipeId: null;
}

function variants(
  restrained: string,
  directed: string,
  fever: string,
): WorldIdentity["variants"] {
  return {
    restrained: { id: "restrained", name: "Restrained", pressure: 0, character: restrained },
    directed: { id: "directed", name: "Directed", pressure: 1, character: directed },
    fever: { id: "fever", name: "Fever", pressure: 2, character: fever },
  };
}

function identity(
  world: Omit<WorldIdentity, "variants" | "supportedRatios"> & {
    readonly variants: readonly [string, string, string];
  },
): WorldIdentity {
  return {
    ...world,
    variants: variants(...world.variants),
    supportedRatios: WORLD_RATIO_IDS,
  };
}

export const WORLD_IDENTITIES = deepFreeze([
  identity({
    id: "editorial-drift",
    name: "Editorial Drift",
    eyebrow: "LONG BREATH · INK · WARM PAPER",
    character: "Measured pages moving through a dark editorial room; tactile, lucid, never ornamental.",
    bestFor: "Founder-led essays, treatments, case studies, and decks with writing worth reading.",
    avoidWhen: "The sequence needs maximal spectacle, comic bounce, or hard chase energy.",
    variants: [
      "Paper, air, and long reading rests; lens nearly absent.",
      "Stronger page hinge and firmer editorial transfer without stealing the frame.",
      "Quicker handled-paper phrasing and deeper atmosphere, still legible at rest.",
    ],
    axes: {
      vertical: { preferredDirection: -1, supportedDirections: [-1, 1], intent: "Native page procession with calm focal landings and protected side air." },
      horizontal: { preferredDirection: -1, supportedDirections: [-1, 1], intent: "Wide editorial hand-off with fewer visible cards and longer side falloff." },
    },
    compositionIntent: {
      portrait: "A central reading spine, true vertical travel, generous head and foot room, and an unoccupied presenter lane.",
      landscape: "A low, wide paper procession with one hero, one entering thought, and darkness doing most of the framing.",
    },
    authoredRecipeId: null,
  }),
  identity({
    id: "noir-contact",
    name: "Noir Contact",
    eyebrow: "HARD EVIDENCE · SILVER · BLACK",
    character: "A disciplined contact sheet: photographic proof, clipped light, no melodrama.",
    bestFor: "Documentary, investigation, archive, monochrome photography, and evidence-heavy decks.",
    avoidWhen: "Warm intimacy, playful illustration, or material that depends on lush colour.",
    variants: [
      "Near-neutral silver paper and exact placement.",
      "Harder contact rhythm, darker negative fill, firmer registration.",
      "Compressed evidence rush with controlled print wear, never fake damage.",
    ],
    axes: {
      vertical: { preferredDirection: 1, supportedDirections: [-1, 1], intent: "A descending strip of evidence with alternating clear rests." },
      horizontal: { preferredDirection: 1, supportedDirections: [-1, 1], intent: "A left-to-right contact sheet with strict spacing and almost no banking." },
    },
    compositionIntent: {
      portrait: "A narrow evidence column, source labels kept clear, with texture pushed to the outer field.",
      landscape: "A photographic workbench: one clean row, a hard focal rectangle, and broad black negative space.",
    },
    authoredRecipeId: null,
  }),
  identity({
    id: "sunstruck-atlas",
    name: "Sunstruck Atlas",
    eyebrow: "TRAVEL · HEAT · BLEACHED LATITUDE",
    character: "Long-road patience, pale flare, and faded pigments without travel-ad cheerfulness.",
    bestFor: "Travel, locations, documentary photography, landscape, memory, and open-air stories.",
    avoidWhen: "Colour-critical charts, clinical product detail, or severe indoor tension.",
    variants: [
      "Dry air, long holds, and a nearly still horizon.",
      "A warmer rake, broader arc, and more pronounced sense of distance.",
      "Heat and pace rise together while the focal card remains clean.",
    ],
    axes: {
      vertical: { preferredDirection: -1, supportedDirections: [-1, 1], intent: "Latitude stacked into a climbing portrait route with bright air above." },
      horizontal: { preferredDirection: -1, supportedDirections: [-1, 1], intent: "A patient lateral road line with horizon depth and restrained mirage." },
    },
    compositionIntent: {
      portrait: "A tall latitude study: cards rise through warm lower atmosphere into pale open sky.",
      landscape: "A low horizon, long lateral procession, and enough empty sky for the deck to breathe.",
    },
    authoredRecipeId: null,
  }),
  identity({
    id: "dread",
    name: "Dread",
    eyebrow: "UPWARD UNEASE · CRIMSON · VOID",
    character: "The room tightens slowly; tension comes from withheld light and reluctant movement, not noise.",
    bestFor: "Horror, psychological thrillers, ominous reveals, and uncomfortable evidence.",
    avoidWhen: "Dense data, warm comedy, or decks requiring equal illumination everywhere.",
    variants: [
      "Almost still black space with one watchful slit.",
      "Longer depth, clipped crimson, and held peripheral uncertainty.",
      "Stronger tunnel pressure and optical unease, bounded at every focal rest.",
    ],
    axes: {
      vertical: { preferredDirection: -1, supportedDirections: [-1, 1], intent: "A slow upward crawl through a narrow safe corridor." },
      horizontal: { preferredDirection: 1, supportedDirections: [-1, 1], intent: "A reluctant lateral reveal with the threat held beyond frame." },
    },
    compositionIntent: {
      portrait: "A tall black chamber; cards emerge from below and pause where the light can barely hold them.",
      landscape: "A narrow hard-light route crossing deep negative space, with no decorative darkness.",
    },
    authoredRecipeId: null,
  }),
  identity({
    id: "tender-light",
    name: "Tender Light",
    eyebrow: "CLOSE AIR · ROSE · HUMAN",
    character: "Soft proximity and honest warmth; luminous without turning people into perfume advertising.",
    bestFor: "Romance, family, portraiture, intimate drama, and emotionally quiet work.",
    avoidWhen: "Small charts, hard proof, or scenes needing severity and exact neutrality.",
    variants: [
      "Overcast softness, close cards, and nearly invisible glass.",
      "Rose light gathers around the hero with gentle material overlap.",
      "A fuller luminous chamber and more expressive silk response, never fogging faces.",
    ],
    axes: {
      vertical: { preferredDirection: -1, supportedDirections: [-1, 1], intent: "Slow ascending closeness with generous breathing room around faces." },
      horizontal: { preferredDirection: -1, supportedDirections: [-1, 1], intent: "An intimate lateral dolly where neighbouring frames almost meet." },
    },
    compositionIntent: {
      portrait: "A quiet vertical embrace: one face or line of text owns the centre while warmth lives at the edge.",
      landscape: "Two close frames and a broad soft chamber, with movement paced like listening.",
    },
    authoredRecipeId: null,
  }),
  identity({
    id: "velvet-fever",
    name: "Velvet Fever",
    eyebrow: "FASHION · SATURATED FOLD · CLOSE CAMERA",
    character: "Slow glamour with tactile colour pressure and glass that refuses clinical sharpness.",
    bestFor: "Fashion, music, performance, bold photography, and sensual graphic systems.",
    avoidWhen: "Dense legal copy, fine diagrams, sober evidence, or already saturated slides.",
    variants: [
      "Dark velvet field, clean hero, colour held at the perimeter.",
      "Deeper folds, closer cards, and a stronger but protected luminous response.",
      "Saturated pulse and bolder secondary motion with a stable focal picture.",
    ],
    axes: {
      vertical: { preferredDirection: -1, supportedDirections: [-1, 1], intent: "Portrait-native folds pull upward around a close central hero." },
      horizontal: { preferredDirection: -1, supportedDirections: [-1, 1], intent: "A slow fashion dolly through shallow, saturated depth." },
    },
    compositionIntent: {
      portrait: "A close vertical runway with colour folding around, never over, the focal card.",
      landscape: "A shallow widescreen chamber: large cards, slow lateral pressure, and dark breathing margins.",
    },
    authoredRecipeId: null,
  }),
  identity({
    id: "celluloid-archive",
    name: "Celluloid Archive",
    eyebrow: "HISTORY · PROJECTOR DUST · HANDLED REEL",
    character: "Faded emulsion and small mechanical memory; archival, not a damaged-film filter.",
    bestFor: "History, documentary, found material, cultural memory, and photographic research.",
    avoidWhen: "Clean technology, glossy product films, or work already carrying heavy source damage.",
    variants: [
      "Clean reel motion with stable print tooth and sparse dust.",
      "Projector breath, firmer held frames, and visible but bounded registration.",
      "Hand-cranked cadence and stronger emulsion response without crawling noise.",
    ],
    axes: {
      vertical: { preferredDirection: -1, supportedDirections: [-1, 1], intent: "A true vertical reel with measured frame lines and clean reading rests." },
      horizontal: { preferredDirection: 1, supportedDirections: [-1, 1], intent: "A photographic archive table moving one evidence frame at a time." },
    },
    compositionIntent: {
      portrait: "A tall handled reel: source picture stays sharp while the outer field carries age.",
      landscape: "A projected strip crossing a dark room, with history in the material rather than overlaid damage.",
    },
    authoredRecipeId: null,
  }),
  identity({
    id: "night-run",
    name: "Night Run",
    eyebrow: "THRILLER · SODIUM · WET ASPHALT",
    character: "Urban velocity, anxious edges, and cold road depth with the slide still in command.",
    bestFor: "Thriller, crime, sport, nightlife, music, and kinetic graphic sequences.",
    avoidWhen: "Patient reading, pastoral warmth, delicate portraits, or long passages of small copy.",
    variants: [
      "Blue-black road, low pace, and one sodium practical.",
      "Faster tunnel transfer, firmer directional light, and restrained anamorphic response.",
      "Full chase pressure with short reads and clean focal recovery between gestures.",
    ],
    axes: {
      vertical: { preferredDirection: 1, supportedDirections: [-1, 1], intent: "A descending urban shaft with lights passing outside the reading corridor." },
      horizontal: { preferredDirection: -1, supportedDirections: [-1, 1], intent: "A fast wet-asphalt tunnel with controlled edge smear and a clean hero." },
    },
    compositionIntent: {
      portrait: "A tall nocturnal chute; urgency lives above and below the protected central card.",
      landscape: "A low lateral chase through deep blue-black space and sparse sodium streaks.",
    },
    authoredRecipeId: null,
  }),
] as const satisfies readonly WorldIdentity[]);

/**
 * Schema-shaped Editorial Drift foundation. Applying it is the explicit
 * drift-v2/1 upgrade boundary; imported V1/V3 projects otherwise remain on
 * compatibility rendering. 9:16 is authored as a source composition, never a
 * landscape crop. The recipe alone does not claim the complete World library
 * or an approved V2 visual contract.
 */
export const EDITORIAL_DRIFT_9_16_RECIPE: FrozenWorldRecipe = deepFreeze({
  motion: {
    transport: { axis: "vertical", direction: -1, slidesPerSecond: 0.34 },
    cadence: {
      cutId: "paper-argument",
      read: 0.39,
      anticipation: 0.06,
      carry: 0.25,
      impact: 0.05,
      settle: 0.1,
      land: 0.15,
      poseCadence: "continuous",
    },
    performance: {
      id: "long-take",
      weight: 0.72,
      linger: 0.48,
      release: 0.72,
      runway: 1,
      overlap: 0.22,
      imperfection: 0.04,
      take: 1,
    },
    character: { id: "weighted", amount: 0.62 },
    path: {
      id: "ribbon",
      gap: 0.3,
      curvature: 0.3,
      depth: 0.14,
      banking: 3.5,
      focusScale: 0.075,
      edgeFade: 0.3,
    },
    seamless: { enabled: false, loops: 1 },
  },
  card: {
    aspectWidth: 16,
    aspectHeight: 9,
    scale: 0.76,
    // Cover is the authored default because a transparent Contain gutter plus
    // card shadow reads as a ghost frame. Directors can still choose Contain
    // deliberately when preserving the full source outweighs that boundary.
    defaultFit: "cover",
    radius: 32,
    smoothing: 0.6,
    borderWidth: 0,
    borderColor: "#e7dcc9",
    borderOpacity: 0,
  },
  material: {
    surface: "paper",
    flex: 0.32,
    thickness: 0.028,
    roughness: 0.92,
    sheen: 0.035,
    finish: {
      id: "16mm-breath",
      registration: 0.06,
      localSoftness: 0.025,
      localSmear: 0.04,
      microtexture: 0.12,
    },
  },
  lighting: {
    enabled: true,
    presetId: "studio-soft",
    space: "stage",
    motionMode: "breathe",
    motionSpeed: 1,
    keyColor: "#fff1dc",
    fillColor: "#b9c9e8",
    shadowColor: "#100c12",
    azimuth: 42,
    elevation: 60,
    keyIntensity: 0.74,
    fillIntensity: 0.58,
    rimIntensity: 0.1,
    artworkProtection: 0.9,
    heroProtection: 0.92,
    shadowOpacity: 0.24,
    shadowSoftness: 112,
    shadowDistance: 38,
    contactStrength: 0.48,
    backgroundSpill: 0.22,
    spillFocus: 0.82,
    gobo: "softbox",
    goboStrength: 0.05,
    breath: 0.055,
  },
  atmosphere: {
    enabled: true,
    family: "paper",
    composition: "long-fibres",
    paletteId: "bone-ink",
    treatment: "quiet",
    recut: 0,
    seedOffset: 17,
    presence: "whisper",
    intensity: 0.38,
    motion: 0.06,
    grain: 0.035,
    vignette: 0.22,
    colourA: "#0d0d0c",
    colourB: "#332e29",
    accent: "#e7dcc9",
  },
  lens: {
    enabled: true,
    characterId: "clean-gate",
    presence: 0.1,
    focus: 0.01,
    directionalSmear: 0.025,
    chromaticSeparation: 0.006,
    bloom: 0.012,
    halation: 0.008,
    flare: 0,
    curvature: 0,
    gateWeave: 0,
    cameraGrain: 0.018,
    vignette: 0.025,
    presenterTreatment: "protected",
  },
} as const satisfies WorldRecipe);

/** Schema-shaped ratio patches. Stage dimensions remain outside World ownership. */
export const EDITORIAL_DRIFT_RATIO_OVERRIDES = deepFreeze({
  "4:5": {
    motion: {
      transport: { axis: "vertical", direction: -1, slidesPerSecond: 0.32 },
      path: { id: "ribbon", gap: 0.28, curvature: 0.26, depth: 0.12, banking: 3, focusScale: 0.07, edgeFade: 0.27 },
    },
    card: { scale: 0.72 },
  },
  "1:1": {
    motion: {
      transport: { axis: "horizontal", direction: -1, slidesPerSecond: 0.31 },
      path: { id: "ribbon", gap: 0.24, curvature: 0.22, depth: 0.1, banking: 2.5, focusScale: 0.065, edgeFade: 0.25 },
    },
    card: { scale: 0.68 },
  },
  "16:9": {
    motion: {
      transport: { axis: "horizontal", direction: -1, slidesPerSecond: 0.3 },
      path: { id: "ribbon", gap: 0.22, curvature: 0.2, depth: 0.1, banking: 2.2, focusScale: 0.06, edgeFade: 0.24 },
    },
    card: { scale: 0.62 },
    atmosphere: { vignette: 0.18 },
  },
} as const satisfies Record<Exclude<WorldRatioId, "9:16">, WorldRecipeOverride>);

function mergeMotion(
  base: DeepReadonly<WorldRecipe["motion"]>,
  patch: WorldMotionOverride | undefined,
): WorldRecipe["motion"] {
  if (!patch) return structuredClone(base) as WorldRecipe["motion"];
  return {
    ...base,
    ...patch,
    transport: { ...base.transport, ...patch.transport },
    cadence: { ...base.cadence, ...patch.cadence },
    performance: { ...base.performance, ...patch.performance },
    character: { ...base.character, ...patch.character },
    path: { ...base.path, ...patch.path },
    seamless: { ...base.seamless, ...patch.seamless },
  };
}

export function applyWorldRecipeOverride(
  base: FrozenWorldRecipe,
  patch: WorldRecipeOverride,
): WorldRecipe {
  return {
    motion: mergeMotion(base.motion, patch.motion),
    card: { ...base.card, ...patch.card },
    material: {
      ...base.material,
      ...patch.material,
      finish: { ...base.material.finish, ...patch.material?.finish },
    },
    lighting: { ...base.lighting, ...patch.lighting },
    atmosphere: { ...base.atmosphere, ...patch.atmosphere },
    lens: { ...base.lens, ...patch.lens },
  };
}

export function editorialDriftRecipe(ratio: WorldRatioId): WorldRecipe {
  if (ratio === "9:16") return structuredClone(EDITORIAL_DRIFT_9_16_RECIPE);
  return applyWorldRecipeOverride(EDITORIAL_DRIFT_9_16_RECIPE, EDITORIAL_DRIFT_RATIO_OVERRIDES[ratio]);
}

export function worldIdentity(id: string): DeepReadonly<WorldIdentity> | null {
  return WORLD_IDENTITIES.find((world) => world.id === id) ?? null;
}
