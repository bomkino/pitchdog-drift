import type { StudioAsset, StudioSettings } from "../model";

export type PacingRecipeId = "linger" | "editorial" | "kinetic" | "trailer";

export interface PacingRecipe {
  id: PacingRecipeId;
  name: string;
  eyebrow: string;
  description: string;
  secondsPerSlide: number;
  fps: StudioSettings["output"]["fps"];
}

export interface MasterMetrics {
  slideCount: number;
  passes: number;
  totalSlideBeats: number;
  duration: number;
  frames: number;
  slidesPerSecond: number;
  secondsPerSlide: number;
  seamless: boolean;
}

export interface MasterChapter {
  key: string;
  slideIndex: number;
  passIndex: number;
  time: number;
  progress: number;
  label: string;
}

export type PreflightSeverity = "blocker" | "warning" | "note";

export interface PreflightItem {
  id: string;
  severity: PreflightSeverity;
  title: string;
  detail: string;
}

export interface JourneyStep {
  id: "media" | "world" | "pace" | "review" | "export";
  label: string;
  detail: string;
  complete: boolean;
}

export const PACING_RECIPES: readonly PacingRecipe[] = [
  {
    id: "linger",
    name: "Linger",
    eyebrow: "1.75 s / slide",
    description: "Patient enough for text-heavy or emotionally loaded slides.",
    secondsPerSlide: 1.75,
    fps: 24,
  },
  {
    id: "editorial",
    name: "Editorial",
    eyebrow: "1.05 s / slide",
    description: "A measured social cut: readable, alive, and not frantic.",
    secondsPerSlide: 1.05,
    fps: 30,
  },
  {
    id: "kinetic",
    name: "Kinetic",
    eyebrow: "0.62 s / slide",
    description: "Fast visual argument for image-led decks and short reels.",
    secondsPerSlide: 0.62,
    fps: 30,
  },
  {
    id: "trailer",
    name: "Trailer",
    eyebrow: "0.38 s / slide",
    description: "A sharp burst. Use only when the images can survive the pace.",
    secondsPerSlide: 0.38,
    fps: 30,
  },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getMovingSlides(assets: readonly StudioAsset[]): StudioAsset[] {
  return assets.filter((asset) => asset.kind === "image");
}

export function getMasterMetrics(settings: StudioSettings, slideCount: number): MasterMetrics {
  const safeSlides = Math.max(0, Math.floor(slideCount));
  const duration = Math.max(0.001, settings.output.duration);
  const passes = settings.motion.seamless
    ? Math.max(1, Math.round(settings.motion.seamlessLoops))
    : 1;
  const slidesPerSecond = settings.motion.seamless && safeSlides > 0
    ? (safeSlides * passes) / duration
    : Math.max(0, settings.motion.speed);
  return {
    slideCount: safeSlides,
    passes,
    totalSlideBeats: safeSlides * passes,
    duration,
    frames: Math.max(1, Math.round(duration * settings.output.fps)),
    slidesPerSecond,
    secondsPerSlide: slidesPerSecond > 0 ? 1 / slidesPerSecond : Number.POSITIVE_INFINITY,
    seamless: settings.motion.seamless,
  };
}

export function getMasterChapters(settings: StudioSettings, slideCount: number): MasterChapter[] {
  const metrics = getMasterMetrics(settings, slideCount);
  if (metrics.slideCount <= 0) return [];
  const beatCount = metrics.seamless ? metrics.totalSlideBeats : metrics.slideCount;
  return Array.from({ length: beatCount }, (_, beatIndex) => {
    const passIndex = Math.floor(beatIndex / metrics.slideCount);
    const localIndex = beatIndex % metrics.slideCount;
    const slideIndex = settings.motion.direction === 1
      ? localIndex
      : (metrics.slideCount - localIndex) % metrics.slideCount;
    const progress = beatCount <= 0 ? 0 : beatIndex / beatCount;
    return {
      key: `${passIndex}-${slideIndex}`,
      slideIndex,
      passIndex,
      time: progress * metrics.duration,
      progress,
      label: metrics.passes > 1
        ? `Slide ${slideIndex + 1}, pass ${passIndex + 1}`
        : `Slide ${slideIndex + 1}`,
    };
  });
}

export function applyPacingRecipe(
  settings: StudioSettings,
  slideCount: number,
  recipeId: PacingRecipeId,
): StudioSettings {
  const recipe = PACING_RECIPES.find((entry) => entry.id === recipeId) ?? PACING_RECIPES[1]!;
  const safeSlides = Math.max(1, Math.floor(slideCount));
  const duration = clamp(safeSlides * recipe.secondsPerSlide, 3, 30);
  const slidesPerSecond = safeSlides / duration;
  return {
    ...settings,
    motion: {
      ...settings.motion,
      autoplay: true,
      seamless: true,
      seamlessLoops: 1,
      speed: clamp(slidesPerSecond, 0, 1.5),
    },
    output: {
      ...settings.output,
      duration,
      fps: recipe.fps,
    },
  };
}

export function getPresenterCoverage(
  settings: StudioSettings,
  assets: readonly StudioAsset[],
): { present: boolean; available: number; required: number; deficit: number } {
  const presenter = settings.presenter.assetId
    ? assets.find((asset) => asset.id === settings.presenter.assetId) ?? null
    : null;
  if (!settings.presenter.enabled || !presenter || presenter.kind !== "video") {
    return { present: false, available: 0, required: 0, deficit: 0 };
  }
  const available = Math.max(0, (presenter.duration ?? 0) - settings.presenter.trimStart);
  const required = Math.max(0, settings.output.duration - settings.presenter.startAt);
  return {
    present: true,
    available,
    required,
    deficit: Math.max(0, required - available),
  };
}

export function getDirectorPreflight(
  settings: StudioSettings,
  assets: readonly StudioAsset[],
): PreflightItem[] {
  const slides = getMovingSlides(assets);
  const metrics = getMasterMetrics(settings, slides.length);
  const presenter = getPresenterCoverage(settings, assets);
  const items: PreflightItem[] = [];

  if (slides.length === 0) {
    items.push({
      id: "no-slides",
      severity: "blocker",
      title: "No moving slides",
      detail: "Import at least one image before exporting a carousel.",
    });
  } else if (slides.length === 1) {
    items.push({
      id: "single-slide",
      severity: "warning",
      title: "Only one moving slide",
      detail: "The loop will repeat one image. Add more slides unless repetition is intentional.",
    });
  }

  if (metrics.slidesPerSecond > 2.4) {
    items.push({
      id: "pace-fast",
      severity: "warning",
      title: "Very fast reading pace",
      detail: `${metrics.slidesPerSecond.toFixed(2)} slides/s leaves ${metrics.secondsPerSlide.toFixed(2)} s per slide.`,
    });
  } else if (Number.isFinite(metrics.secondsPerSlide) && metrics.secondsPerSlide > 2.4) {
    items.push({
      id: "pace-slow",
      severity: "note",
      title: "Long holds",
      detail: `${metrics.secondsPerSlide.toFixed(2)} s per slide. Good for copy-heavy frames; test for drag.`,
    });
  }

  if (presenter.present && presenter.deficit > 0.04) {
    items.push({
      id: "presenter-short",
      severity: "warning",
      title: "Presenter clip ends early",
      detail: `The clip is ${presenter.deficit.toFixed(2)} s shorter than the master after trim and start offset.`,
    });
  }

  if (
    settings.presenter.enabled
    && !settings.presenter.muted
    && (settings.output.fps === 50 || settings.output.fps === 60)
  ) {
    items.push({
      id: "audio-high-fps",
      severity: "blocker",
      title: "Presenter audio cannot ship at this frame rate",
      detail: "Use 24, 25, or 30 fps, or mute the pinned presenter before video export.",
    });
  }

  if (settings.stage.transparent || settings.background.style === "transparent") {
    items.push({
      id: "alpha-format",
      severity: "note",
      title: "Transparent master",
      detail: "Use a PNG still or PNG sequence. H.264 video does not preserve alpha.",
    });
  }

  if (settings.output.width < 1080 && settings.output.height < 1080) {
    items.push({
      id: "small-output",
      severity: "warning",
      title: "Small output",
      detail: `${settings.output.width} × ${settings.output.height} may soften after social-platform recompression.`,
    });
  }

  if (!items.some((item) => item.severity === "blocker" || item.severity === "warning")) {
    items.push({
      id: "ready",
      severity: "note",
      title: "Master looks ready",
      detail: `${metrics.frames} frames · ${metrics.duration.toFixed(1)} s · ${metrics.slidesPerSecond.toFixed(2)} slides/s.`,
    });
  }
  return items;
}

export function getJourneySteps(
  settings: StudioSettings,
  assets: readonly StudioAsset[],
  reviewed: boolean,
): JourneyStep[] {
  const slides = getMovingSlides(assets);
  const preflight = getDirectorPreflight(settings, assets);
  const blockers = preflight.filter((item) => item.severity === "blocker").length;
  return [
    {
      id: "media",
      label: "Slides",
      detail: slides.length > 0 ? `${slides.length} moving` : "Import images",
      complete: slides.length > 0,
    },
    {
      id: "world",
      label: "World",
      detail: settings.themeId.replaceAll("-", " "),
      complete: Boolean(settings.themeId),
    },
    {
      id: "pace",
      label: "Pace",
      detail: `${settings.output.duration.toFixed(1)} s master`,
      complete: settings.output.duration >= 3,
    },
    {
      id: "review",
      label: "Review",
      detail: reviewed ? "Timeline scrubbed" : "Scrub the master",
      complete: reviewed,
    },
    {
      id: "export",
      label: "Export",
      detail: blockers === 0 ? "No blockers" : `${blockers} blocker${blockers === 1 ? "" : "s"}`,
      complete: blockers === 0 && slides.length > 0,
    },
  ];
}

export function buildMasterBrief(
  settings: StudioSettings,
  assets: readonly StudioAsset[],
): string {
  const slides = getMovingSlides(assets);
  const metrics = getMasterMetrics(settings, slides.length);
  const preflight = getDirectorPreflight(settings, assets);
  return [
    "DRIFT MASTER BRIEF",
    "",
    `World: ${settings.themeId}`,
    `Track: ${settings.motion.axis} · ${settings.motion.flow} · ${settings.motion.direction === 1 ? "forward" : "reverse"}`,
    `Slides: ${slides.length}`,
    `Master: ${settings.output.width} × ${settings.output.height} · ${settings.output.fps} fps · ${settings.output.duration.toFixed(2)} s`,
    `Pace: ${metrics.slidesPerSecond.toFixed(2)} slides/s · ${Number.isFinite(metrics.secondsPerSlide) ? metrics.secondsPerSlide.toFixed(2) : "∞"} s/slide`,
    `Loop: ${settings.motion.seamless ? `${metrics.passes} authored deck pass${metrics.passes === 1 ? "" : "es"}` : "unlocked"}`,
    `Background: ${settings.background.style} · seed ${settings.background.seed}`,
    `Pinned frame: ${settings.presenter.enabled ? "on" : "off"}`,
    "",
    "Preflight:",
    ...preflight.map((item) => `- ${item.severity.toUpperCase()}: ${item.title} — ${item.detail}`),
  ].join("\n");
}
