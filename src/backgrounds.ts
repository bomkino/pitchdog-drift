import { BACKGROUND_STYLES, type BackgroundStyle } from "./model";

export interface BackgroundFamily {
  id: BackgroundStyle;
  name: string;
  description: string;
  mode: number;
  rendered: boolean;
}

function family(
  id: BackgroundStyle,
  name: string,
  description: string,
  mode: number,
  rendered = true,
): BackgroundFamily {
  return { id, name, description, mode, rendered };
}

/**
 * One registry owns the human label, shader mode, and authored intent for each
 * background family. Keeping that contract in one place prevents the inspector,
 * validator, tests, and renderer from quietly drifting apart.
 */
export const BACKGROUND_FAMILIES: readonly BackgroundFamily[] = [
  family("transparent", "Transparent", "No generated field. Slides and optional presenter retain export-safe alpha.", 0, false),
  family("solid", "Solid colour", "A disciplined single-colour field for decks that need no atmospheric alibi.", 0),
  family("gradient", "Directional gradient", "A broad cinematic colour falloff with one restrained pool of accent light.", 1),
  family("aura", "Soft aura", "Layered moving pools of colour, haze, and low-frequency light.", 2),
  family("paper", "Paper field", "Fibres, tooth, and uneven density without a scanned texture or repeating tile.", 3),
  family("void", "Breathing void", "Near-black cloud depth crossed by one narrow, unstable seam of light.", 4),
  family("horizon", "Sun-struck horizon", "A heat-bent horizon, distant sun, and faded latitude for travel and memory.", 5),
  family("fog", "Volumetric fog", "Slow overlapping fog banks with soft lift and no obvious looping smoke sprite.", 6),
  family("prism", "Prismatic glass", "Angular panes, caustic refraction, and spectral light without rainbow wallpaper.", 7),
  family("velvet", "Velvet folds", "Saturated fabric-like folds that catch light and fall into dense shadow.", 8),
  family("emulsion", "Film emulsion", "Stains, dust, scratches, and cloudy chemistry generated from a stable seed.", 9),
  family("night-drive", "Night drive", "Wet-road darkness, sodium streaks, and converging lane light under speed.", 10),
  family("tidal", "Tidal light", "Broad moving swells and submerged caustics for blue-hour and coastal drama.", 11),
  family("ember", "Ember smoke", "Slow smoke plumes and isolated sparks held inside deep warm blacks.", 12),
  family("projector", "Projector gate", "A flickering cone, gate falloff, and floating motes like light finding dust.", 13),
] as const;

const FAMILY_BY_ID = new Map(BACKGROUND_FAMILIES.map((entry) => [entry.id, entry]));

if (BACKGROUND_FAMILIES.length !== BACKGROUND_STYLES.length || FAMILY_BY_ID.size !== BACKGROUND_STYLES.length) {
  throw new Error("Background family registry must cover every background style exactly once.");
}

export function getBackgroundFamily(id: BackgroundStyle): BackgroundFamily {
  const entry = FAMILY_BY_ID.get(id);
  if (!entry) throw new Error(`Unknown background family: ${id}`);
  return entry;
}

export function backgroundMode(id: BackgroundStyle): number {
  return getBackgroundFamily(id).mode;
}
