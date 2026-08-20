import { applyTheme, getTheme } from "./themes";
import type { StudioSettings, ThemeId } from "./model";

export type WorkflowId =
  | "deck-reel"
  | "presenter-cut"
  | "contact-sheet"
  | "travel-diary"
  | "horror-tease"
  | "wide-trailer";

export interface WorkflowPreset {
  id: WorkflowId;
  name: string;
  eyebrow: string;
  description: string;
  themeId: ThemeId;
  stage: { width: number; height: number };
  output: { duration: number; fps: StudioSettings["output"]["fps"] };
  motion: Partial<StudioSettings["motion"]>;
  slide?: Partial<StudioSettings["slide"]>;
  presenter: "off" | "preserve" | "feature";
}

export const WORKFLOW_PRESETS = [
  {
    id: "deck-reel",
    name: "Deck Reel",
    eyebrow: "9:16 · complete loop",
    description: "A legible vertical cut that carries every slide through one clean, editorial loop.",
    themeId: "editorial-drift",
    stage: { width: 1080, height: 1920 },
    output: { duration: 8, fps: 30 },
    motion: {
      axis: "vertical",
      direction: -1,
      flow: "ribbon",
      speed: 0.34,
      gap: 0.2,
      seamless: true,
      seamlessLoops: 1,
    },
    slide: { aspectWidth: 16, aspectHeight: 9, scale: 0.78 },
    presenter: "off",
  },
  {
    id: "presenter-cut",
    name: "Presenter + Deck",
    eyebrow: "9:16 · talking head",
    description: "A calmer lateral deck with a clean upper-right presenter frame and room for captions.",
    themeId: "tender-light",
    stage: { width: 1080, height: 1920 },
    output: { duration: 15, fps: 30 },
    motion: {
      axis: "horizontal",
      direction: -1,
      flow: "arc",
      speed: 0.22,
      gap: 0.16,
      curvature: 0.3,
      depth: 0.16,
      seamless: false,
    },
    slide: { aspectWidth: 16, aspectHeight: 9, scale: 0.7 },
    presenter: "feature",
  },
  {
    id: "contact-sheet",
    name: "Contact Sheet",
    eyebrow: "4:5 · evidence",
    description: "A disciplined horizontal procession for documentary, research, and image-heavy decks.",
    themeId: "noir-contact",
    stage: { width: 1080, height: 1350 },
    output: { duration: 10, fps: 24 },
    motion: {
      axis: "horizontal",
      direction: 1,
      flow: "straight",
      speed: 0.4,
      gap: 0.14,
      seamless: true,
      seamlessLoops: 1,
    },
    slide: { aspectWidth: 16, aspectHeight: 9, scale: 0.68 },
    presenter: "off",
  },
  {
    id: "travel-diary",
    name: "Travel Diary",
    eyebrow: "9:16 · sun-struck",
    description: "A wide, unhurried memory stream with heat, distance, and enough air around every frame.",
    themeId: "road-memory",
    stage: { width: 1080, height: 1920 },
    output: { duration: 12, fps: 30 },
    motion: {
      axis: "horizontal",
      direction: -1,
      flow: "arc",
      speed: 0.28,
      gap: 0.3,
      seamless: true,
      seamlessLoops: 1,
    },
    slide: { aspectWidth: 16, aspectHeight: 9, scale: 0.72 },
    presenter: "preserve",
  },
  {
    id: "horror-tease",
    name: "Horror Tease",
    eyebrow: "9:16 · slow dread",
    description: "A deliberate upward crawl with a single closed loop and no frantic template energy.",
    themeId: "dread",
    stage: { width: 1080, height: 1920 },
    output: { duration: 12, fps: 24 },
    motion: {
      axis: "vertical",
      direction: -1,
      flow: "tunnel",
      speed: 0.17,
      gap: 0.42,
      seamless: true,
      seamlessLoops: 1,
    },
    slide: { aspectWidth: 16, aspectHeight: 9, scale: 0.73 },
    presenter: "off",
  },
  {
    id: "wide-trailer",
    name: "Wide Trailer",
    eyebrow: "16:9 · electric",
    description: "A cinematic landscape master with depth, speed, and a restrained cylindrical procession.",
    themeId: "chrome-dream",
    stage: { width: 1920, height: 1080 },
    output: { duration: 12, fps: 24 },
    motion: {
      axis: "horizontal",
      direction: -1,
      flow: "cylinder",
      speed: 0.46,
      gap: 0.24,
      seamless: true,
      seamlessLoops: 1,
    },
    slide: { aspectWidth: 16, aspectHeight: 9, scale: 0.62 },
    presenter: "preserve",
  },
] as const satisfies readonly WorkflowPreset[];

export function getWorkflowPreset(id: WorkflowId | string): WorkflowPreset {
  return WORKFLOW_PRESETS.find((preset) => preset.id === id) ?? WORKFLOW_PRESETS[0]!;
}

export function applyWorkflowPreset(
  current: StudioSettings,
  preset: WorkflowPreset,
): StudioSettings {
  const themed = applyTheme(current, getTheme(preset.themeId));
  const hasPinnedMedia = Boolean(current.presenter.assetId);
  const presenter = preset.presenter === "off"
    ? { ...current.presenter, enabled: false, assetId: null }
    : preset.presenter === "feature"
      ? {
          ...current.presenter,
          enabled: hasPinnedMedia,
          assetId: hasPinnedMedia ? current.presenter.assetId : null,
          x: 0.74,
          y: 0.24,
          width: 0.32,
          aspectWidth: 9,
          aspectHeight: 16,
          radius: 42,
          smoothing: 0.6,
        }
      : { ...current.presenter };

  return {
    ...themed,
    stage: {
      width: preset.stage.width,
      height: preset.stage.height,
      transparent: themed.background.style === "transparent",
    },
    motion: { ...themed.motion, ...preset.motion },
    slide: { ...themed.slide, ...preset.slide },
    presenter,
    output: {
      ...current.output,
      width: preset.stage.width,
      height: preset.stage.height,
      duration: preset.output.duration,
      fps: preset.output.fps,
    },
  };
}
