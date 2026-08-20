import type { StudioSettings } from "./model";

export interface OpticsPreset {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  motion: Pick<StudioSettings["motion"], "distortion" | "edgeFade" | "focusScale">;
  slide: Pick<StudioSettings["slide"], "shadowOpacity" | "shadowSoftness">;
}

export const OPTICS_PRESETS = [
  {
    id: "clean-glass",
    name: "Clean Glass",
    eyebrow: "Crisp · restrained",
    description: "Barely-there optical weight. Sharp text, small focus lift, no decorative smear.",
    motion: { distortion: 0.08, edgeFade: 0.1, focusScale: 0.03 },
    slide: { shadowOpacity: 0.22, shadowSoftness: 24 },
  },
  {
    id: "sixteen-mm-breath",
    name: "16mm Breath",
    eyebrow: "Photochemical · alive",
    description: "A little gate softness, directional blur under speed, and a restrained colour fringe.",
    motion: { distortion: 0.34, edgeFade: 0.28, focusScale: 0.08 },
    slide: { shadowOpacity: 0.36, shadowSoftness: 38 },
  },
  {
    id: "dream-glass",
    name: "Dream Glass",
    eyebrow: "Soft · luminous",
    description: "Peripheral defocus and slow chromatic bloom while the focal frame stays readable.",
    motion: { distortion: 0.56, edgeFade: 0.42, focusScale: 0.13 },
    slide: { shadowOpacity: 0.26, shadowSoftness: 58 },
  },
  {
    id: "panic-lens",
    name: "Panic Lens",
    eyebrow: "Fast · unstable",
    description: "Harder velocity response, tighter shadows, and nervous colour separation for dread or music.",
    motion: { distortion: 0.78, edgeFade: 0.5, focusScale: 0.06 },
    slide: { shadowOpacity: 0.5, shadowSoftness: 30 },
  },
  {
    id: "ghost-focus",
    name: "Ghost Focus",
    eyebrow: "Hazy · peripheral",
    description: "A sharp centre surrounded by quiet defocus and a soft shadow field. Slow, not smeary.",
    motion: { distortion: 0.64, edgeFade: 0.68, focusScale: 0.11 },
    slide: { shadowOpacity: 0.18, shadowSoftness: 70 },
  },
] as const satisfies readonly OpticsPreset[];

export type OpticsPresetId = (typeof OPTICS_PRESETS)[number]["id"];

export function getOpticsPreset(id: OpticsPresetId | string): OpticsPreset {
  return OPTICS_PRESETS.find((preset) => preset.id === id) ?? OPTICS_PRESETS[1]!;
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.000_001;
}

export function activeOpticsPresetId(settings: StudioSettings): OpticsPresetId | null {
  const preset = OPTICS_PRESETS.find((candidate) => (
    close(candidate.motion.distortion, settings.motion.distortion)
    && close(candidate.motion.edgeFade, settings.motion.edgeFade)
    && close(candidate.motion.focusScale, settings.motion.focusScale)
    && close(candidate.slide.shadowOpacity, settings.slide.shadowOpacity)
    && close(candidate.slide.shadowSoftness, settings.slide.shadowSoftness)
  ));
  return preset ? (preset.id as OpticsPresetId) : null;
}

export function applyOpticsPreset(
  current: StudioSettings,
  preset: OpticsPreset,
): StudioSettings {
  return {
    ...current,
    motion: { ...current.motion, ...preset.motion },
    slide: { ...current.slide, ...preset.slide },
  };
}
