import type { BackgroundSettings, BackgroundStyle, StudioSettings } from "./model";

export interface BackgroundScene {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  settings: BackgroundSettings;
}

function makeScene(
  id: string,
  name: string,
  eyebrow: string,
  description: string,
  style: BackgroundStyle,
  colorA: string,
  colorB: string,
  accent: string,
  intensity: number,
  motion: number,
  grain: number,
  vignette: number,
  seed: number,
): BackgroundScene {
  return {
    id,
    name,
    eyebrow,
    description,
    settings: { style, colorA, colorB, accent, intensity, motion, grain, vignette, seed },
  };
}

/**
 * Each opaque shader family owns four authored recipes. The seed's modulo-four
 * selects the recipe; adding four re-cuts its deterministic noise field without
 * changing the scene's identity. This keeps projects portable and avoids a new
 * schema field merely to remember a preset label.
 */
export const BACKGROUND_SCENES = [
  makeScene(
    "clear-stage",
    "Clear Stage",
    "Alpha · compositing",
    "Nothing behind the deck. Built for transparent PNG masters and later compositing.",
    "transparent",
    "#000000",
    "#000000",
    "#ffffff",
    0,
    0,
    0,
    0,
    0,
  ),

  makeScene(
    "ink-matte",
    "Ink Matte",
    "Solid · black velvet",
    "A nearly black room with a faint centre lift. Quiet enough for dense writing.",
    "solid",
    "#050505",
    "#171717",
    "#a9a39a",
    0.38,
    0.08,
    0.08,
    0.48,
    100,
  ),
  makeScene(
    "oxblood-room",
    "Oxblood Room",
    "Solid · low red light",
    "A dark red chamber with a buried practical glow and no visible gradient banding.",
    "solid",
    "#0d0607",
    "#2b0d12",
    "#9f2d36",
    0.62,
    0.12,
    0.12,
    0.56,
    101,
  ),
  makeScene(
    "moon-milk",
    "Moon Milk",
    "Solid · pale diffusion",
    "Soft chalk light with cool falloff. Bright, restrained, and unusually good with dark slides.",
    "solid",
    "#d7d5ce",
    "#aaaeb2",
    "#f6f0dc",
    0.48,
    0.06,
    0.06,
    0.28,
    102,
  ),
  makeScene(
    "petrol-black",
    "Petrol Black",
    "Solid · oily undertone",
    "Black with a submerged blue-green roll. It reads solid until it moves.",
    "solid",
    "#020706",
    "#0b2425",
    "#2b7171",
    0.54,
    0.1,
    0.1,
    0.62,
    103,
  ),

  makeScene(
    "sodium-horizon",
    "Sodium Horizon",
    "Gradient · road dusk",
    "A low amber horizon under cooling blue. Heat and distance, not travel-ad sunshine.",
    "gradient",
    "#10232d",
    "#8f3b23",
    "#f0b86a",
    0.82,
    0.2,
    0.13,
    0.36,
    200,
  ),
  makeScene(
    "polar-dawn",
    "Polar Dawn",
    "Gradient · cold daylight",
    "Blue-grey air opening into a thin mineral sunrise. Clean, spacious, unsentimental.",
    "gradient",
    "#17242e",
    "#8998a3",
    "#e8cda6",
    0.64,
    0.12,
    0.08,
    0.3,
    201,
  ),
  makeScene(
    "after-rain",
    "After Rain",
    "Gradient · wet window",
    "A blurred storm field with slow vertical rain traces and dim city colour underneath.",
    "gradient",
    "#07141d",
    "#273d4b",
    "#b7c8d1",
    0.7,
    0.26,
    0.14,
    0.52,
    202,
  ),
  makeScene(
    "road-heat",
    "Road Heat",
    "Gradient · mirage",
    "Sunburnt ochre, distant asphalt, and a soft mirage that never turns into a screensaver.",
    "gradient",
    "#28150e",
    "#a24e2b",
    "#efc27b",
    0.78,
    0.3,
    0.16,
    0.4,
    203,
  ),

  makeScene(
    "projector-bloom",
    "Projector Bloom",
    "Aura · warm gate light",
    "A soft projector cone, suspended dust, and warm halation around the brightest field.",
    "aura",
    "#090806",
    "#2b1a12",
    "#e3a05b",
    0.78,
    0.18,
    0.16,
    0.58,
    300,
  ),
  makeScene(
    "rose-chamber",
    "Rose Chamber",
    "Aura · skin-close light",
    "Two slow pools of rose and amber light. Romantic without becoming bridal.",
    "aura",
    "#211219",
    "#65323f",
    "#efaa8e",
    0.72,
    0.16,
    0.08,
    0.3,
    301,
  ),
  makeScene(
    "cobalt-room",
    "Cobalt Room",
    "Aura · underwater blue",
    "Dense cobalt with refracted cyan movement, as if the room were lit through water.",
    "aura",
    "#05091a",
    "#101f55",
    "#49c7e8",
    0.9,
    0.34,
    0.1,
    0.54,
    302,
  ),
  makeScene(
    "celadon-haze",
    "Celadon Haze",
    "Aura · mineral fog",
    "Pale green-grey vapour with a warm core. Airy, strange, and still readable.",
    "aura",
    "#14201e",
    "#60766d",
    "#d8c9a4",
    0.58,
    0.14,
    0.08,
    0.34,
    303,
  ),

  makeScene(
    "silver-gelatin",
    "Silver Gelatin",
    "Paper · photographic emulsion",
    "Cool monochrome fibres, emulsion clouds, and a barely visible darkroom edge.",
    "paper",
    "#111214",
    "#4a4c50",
    "#c8c4b9",
    0.54,
    0.08,
    0.26,
    0.48,
    400,
  ),
  makeScene(
    "paper-moon",
    "Paper Moon",
    "Paper · warm stock",
    "Warm uncoated paper under a circular pool of light. A tactile editorial neutral.",
    "paper",
    "#2a241c",
    "#81735f",
    "#ead6ad",
    0.48,
    0.06,
    0.2,
    0.3,
    401,
  ),
  makeScene(
    "archive-dust",
    "Archive Dust",
    "Paper · found footage",
    "Age, dust, restrained scratches, and uneven exposure without fake VHS cosplay.",
    "paper",
    "#17140f",
    "#5e513b",
    "#c6a66c",
    0.68,
    0.1,
    0.34,
    0.58,
    402,
  ),
  makeScene(
    "contact-burn",
    "Contact Burn",
    "Paper · darkroom accident",
    "A black contact sheet with oxidised edges and a brief amber-red chemical burn.",
    "paper",
    "#080706",
    "#2a2019",
    "#c34e2f",
    0.82,
    0.12,
    0.28,
    0.72,
    403,
  ),

  makeScene(
    "velvet-eclipse",
    "Velvet Eclipse",
    "Void · occult ring",
    "A near-black field with one dim eclipsed ring and slow breathing falloff.",
    "void",
    "#010102",
    "#100b16",
    "#6f4b7d",
    0.72,
    0.1,
    0.14,
    0.78,
    500,
  ),
  makeScene(
    "ember-fog",
    "Ember Fog",
    "Void · smoke and heat",
    "Black smoke crossed by low ember light. Menace with depth, not a red gradient.",
    "void",
    "#030201",
    "#1b0704",
    "#9c2f15",
    0.86,
    0.16,
    0.18,
    0.8,
    501,
  ),
  makeScene(
    "deep-sea",
    "Deep Sea",
    "Void · submerged light",
    "A dark blue trench with one moving caustic slit and soft particulate depth.",
    "void",
    "#01050a",
    "#061b2c",
    "#2a8ba7",
    0.78,
    0.2,
    0.12,
    0.74,
    502,
  ),
  makeScene(
    "liquid-chrome",
    "Liquid Chrome",
    "Void · metallic ribbon",
    "Black chrome folds catching violet and cyan light. Electric, but never arcade neon.",
    "void",
    "#020207",
    "#15103d",
    "#57d6df",
    0.94,
    0.38,
    0.1,
    0.62,
    503,
  ),
] as const satisfies readonly BackgroundScene[];

export type BackgroundSceneId = (typeof BACKGROUND_SCENES)[number]["id"];

export function getBackgroundScene(id: BackgroundSceneId | string): BackgroundScene {
  return BACKGROUND_SCENES.find((scene) => scene.id === id) ?? BACKGROUND_SCENES[0]!;
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.000_001;
}

function recipeVariant(seed: number): number {
  return ((Math.round(seed) % 4) + 4) % 4;
}

export function activeBackgroundSceneId(background: BackgroundSettings): BackgroundSceneId | null {
  const scene = BACKGROUND_SCENES.find((candidate) => {
    const settings = candidate.settings;
    return settings.style === background.style
      && settings.colorA.toLowerCase() === background.colorA.toLowerCase()
      && settings.colorB.toLowerCase() === background.colorB.toLowerCase()
      && settings.accent.toLowerCase() === background.accent.toLowerCase()
      && close(settings.intensity, background.intensity)
      && close(settings.motion, background.motion)
      && close(settings.grain, background.grain)
      && close(settings.vignette, background.vignette)
      && recipeVariant(settings.seed) === recipeVariant(background.seed);
  });
  return scene ? (scene.id as BackgroundSceneId) : null;
}

export function applyBackgroundScene(
  current: StudioSettings,
  scene: BackgroundScene,
): StudioSettings {
  const transparent = scene.settings.style === "transparent";
  return {
    ...current,
    stage: { ...current.stage, transparent },
    background: { ...scene.settings },
  };
}

/** Deterministic re-cut: new noise field, same authored modulo-four recipe. */
export function recutBackgroundSeed(seed: number): number {
  const current = Math.max(0, Math.min(1_000_000, Math.round(seed)));
  const variant = recipeVariant(current);
  const mixed = (Math.imul(current + 1, 1_664_525) + 1_013_904_223) >>> 0;
  const bucket = mixed % 250_000;
  const next = variant + bucket * 4;
  return next === current ? variant + ((bucket + 1) % 250_000) * 4 : next;
}
