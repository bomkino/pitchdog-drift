import {
  createPerformanceLifecycle,
  TRANSITION_PRESETS,
  type PerformanceLifecycleAuthoring,
} from "./core/timeline/performanceLifecycle";
import { DRIFT_AAC_BITRATE, DRIFT_H264_BITRATE } from "./core/project/masterContract";

export const SCHEMA_VERSION = 1 as const;
export const ENGINE_VERSION = "1.0.0";
export const SHADER_VERSION = "1.0.0";
export const THEME_VERSION = "1.0.0";

export type Axis = "horizontal" | "vertical";
export type Direction = 1 | -1;
export type Flow = "straight" | "arc" | "ribbon" | "cylinder" | "tunnel";
export type ImageFit = "cover" | "contain";
export type PresenterTrackMode = "pinned-only" | "moving-and-pinned";
export type PresenterLayoutMode = "safe-overlay" | "legacy-perspective";
export type PresenterAspectMode = "source" | "custom";
export type BackgroundStyle =
  | "transparent"
  | "solid"
  | "gradient"
  | "aura"
  | "paper"
  | "void"
  | "cutting-map"
  | "grid"
  | "wave"
  | "atelier";
export type ThemeId = "editorial-drift" | "road-memory" | "dread" | "noir-contact" | "tender-light" | "chrome-dream";

export interface StageSettings {
  width: number;
  height: number;
  transparent: boolean;
}

export interface MotionSettings {
  axis: Axis;
  direction: Direction;
  autoplay: boolean;
  speed: number;
  flow: Flow;
  gap: number;
  curvature: number;
  depth: number;
  tilt: number;
  distortion: number;
  focusScale: number;
  edgeFade: number;
  dragSensitivity: number;
  seamless: boolean;
  seamlessLoops: number;
  reducedMotionOutput: boolean;
}

export interface SlideSettings {
  aspectWidth: number;
  aspectHeight: number;
  scale: number;
  fit: ImageFit;
  focalX: number;
  focalY: number;
  radius: number;
  smoothing: number;
  borderWidth: number;
  borderColor: string;
  borderOpacity: number;
  shadowOpacity: number;
  shadowSoftness: number;
}

export interface BackgroundSettings {
  style: BackgroundStyle;
  colorA: string;
  colorB: string;
  accent: string;
  intensity: number;
  motion: number;
  grain: number;
  vignette: number;
  seed: number;
}

export interface PresenterSettings {
  enabled: boolean;
  assetId: string | null;
  trackMode: PresenterTrackMode;
  layoutMode: PresenterLayoutMode;
  aspectMode: PresenterAspectMode;
  x: number;
  y: number;
  width: number;
  aspectWidth: number;
  aspectHeight: number;
  fit: ImageFit;
  focalX: number;
  focalY: number;
  safeInset: number;
  radius: number;
  smoothing: number;
  borderWidth: number;
  borderColor: string;
  borderOpacity: number;
  shadowOpacity: number;
  shadowSoftness: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  matteColor: string;
  matteOpacity: number;
  muted: boolean;
  gain: number;
  trimStart: number;
  startAt: number;
}

export interface OutputSettings {
  width: number;
  height: number;
  fps: 24 | 25 | 30 | 50 | 60;
  duration: number;
  videoBitrate: number;
  audioBitrate: number;
}

export interface StudioSettings {
  schemaVersion: typeof SCHEMA_VERSION;
  engineVersion: string;
  shaderVersion: string;
  themeId: ThemeId;
  stage: StageSettings;
  motion: MotionSettings;
  slide: SlideSettings;
  background: BackgroundSettings;
  presenter: PresenterSettings;
  performance: PerformanceLifecycleAuthoring;
  output: OutputSettings;
}

export function createCompatibilityPerformanceLifecycle(
  durationSeconds: number,
  reducedMotion = false,
): PerformanceLifecycleAuthoring {
  return createPerformanceLifecycle({
    transitionPreset: "quiet-lift",
    entry: { enabled: false },
    body: { durationSeconds, tempo: { kind: "preset", preset: "even" } },
    exit: { enabled: false },
    repeat: { mode: "off" },
    reducedMotion,
  }).authoring;
}

export function createDefaultPerformanceLifecycle(
  reducedMotion = false,
): PerformanceLifecycleAuthoring {
  return createPerformanceLifecycle({
    transitionPreset: "quiet-lift",
    entry: TRANSITION_PRESETS["quiet-lift"].entry,
    body: {
      durationSeconds: 6.72,
      tempo: { kind: "preset", preset: "fast-slow-fast" },
    },
    exit: TRANSITION_PRESETS["quiet-lift"].exit,
    repeat: { mode: "off" },
    reducedMotion,
  }).authoring;
}

/**
 * Keeps authoring intact while making its derived runtime equal an externally
 * edited master duration. Repetition changes divisor, never semantics.
 */
export function fitPerformanceLifecycleToDuration(
  performance: PerformanceLifecycleAuthoring,
  totalDuration: number,
  reducedMotion: boolean,
): PerformanceLifecycleAuthoring {
  const timeline = createPerformanceLifecycle(performance);
  const canonical = timeline.authoring;
  if (
    Math.abs(timeline.totalDuration - totalDuration) <= 1e-9
    && canonical.reducedMotion === reducedMotion
  ) {
    return canonical;
  }
  const entryDuration = canonical.entry.enabled ? canonical.entry.durationSeconds : 0;
  const exitDuration = canonical.exit.enabled ? canonical.exit.durationSeconds : 0;
  let bodyDuration: number;
  switch (canonical.repeat.mode) {
    case "off":
      bodyDuration = totalDuration - entryDuration - exitDuration;
      break;
    case "body":
      bodyDuration = (totalDuration - entryDuration - exitDuration) / canonical.repeat.count;
      break;
    case "full-scene":
      bodyDuration = totalDuration / canonical.repeat.count - entryDuration - exitDuration;
      break;
  }
  return createPerformanceLifecycle({
    ...canonical,
    body: { ...canonical.body, durationSeconds: bodyDuration },
    reducedMotion,
  }).authoring;
}

export interface StudioAsset {
  id: string;
  name: string;
  kind: "image" | "video";
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  duration?: number;
  hash?: string;
  objectUrl: string;
  demo?: boolean;
}

export interface StoredAssetDescriptor {
  id: string;
  name: string;
  kind: "image" | "video";
  mimeType: string;
  width: number;
  height: number;
  duration?: number;
  hash: string;
  demo?: boolean;
}

export interface ExportProgress {
  phase: "preparing" | "audio" | "render" | "encode" | "finalize" | "verify" | "commit" | "complete";
  completed: number;
  total: number;
  frameIndex: number | null;
  message: string;
  unit: "frames" | "seconds" | "steps";
  determinate: boolean;
  elapsedSeconds: number;
  etaSeconds: number | null;
  ratePerSecond: number | null;
  stallKind: "first-frame" | "inactivity" | null;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  shaderVersion: SHADER_VERSION,
  themeId: "editorial-drift",
  stage: {
    width: 1080,
    height: 1920,
    transparent: false,
  },
  motion: {
    axis: "vertical",
    direction: -1,
    autoplay: true,
    speed: 0.34,
    flow: "ribbon",
    gap: 0.3,
    curvature: 0.3,
    depth: 0.14,
    tilt: 3.5,
    distortion: 0.18,
    focusScale: 0.075,
    edgeFade: 0.3,
    dragSensitivity: 1,
    seamless: false,
    seamlessLoops: 1,
    reducedMotionOutput: false,
  },
  slide: {
    aspectWidth: 16,
    aspectHeight: 9,
    scale: 0.76,
    fit: "cover",
    focalX: 0.5,
    focalY: 0.5,
    radius: 32,
    smoothing: 0.6,
    borderWidth: 0,
    borderColor: "#f0e6d4",
    borderOpacity: 0,
    shadowOpacity: 0.24,
    shadowSoftness: 112,
  },
  background: {
    style: "paper",
    colorA: "#0d0d0c",
    colorB: "#332e29",
    accent: "#e7dcc9",
    intensity: 0.38,
    motion: 0.06,
    grain: 0.053,
    vignette: 0.22,
    seed: 17,
  },
  presenter: {
    enabled: false,
    assetId: null,
    trackMode: "pinned-only",
    layoutMode: "safe-overlay",
    aspectMode: "source",
    x: 1,
    y: 1,
    width: 0.32,
    aspectWidth: 9,
    aspectHeight: 16,
    fit: "cover",
    focalX: 0.5,
    focalY: 0.5,
    safeInset: 0.04,
    radius: 28,
    smoothing: 0.6,
    borderWidth: 0,
    borderColor: "#f4ead8",
    borderOpacity: 0,
    shadowOpacity: 0.22,
    shadowSoftness: 36,
    shadowOffsetX: 0,
    shadowOffsetY: 12,
    matteColor: "#000000",
    matteOpacity: 0,
    muted: false,
    gain: 1,
    trimStart: 0,
    startAt: 0,
  },
  performance: createDefaultPerformanceLifecycle(false),
  output: {
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 8,
    videoBitrate: DRIFT_H264_BITRATE,
    audioBitrate: DRIFT_AAC_BITRATE,
  },
};

export function cloneSettings(settings: StudioSettings): StudioSettings {
  return structuredClone(settings);
}

export function clearPinnedAssetIfRemoved(
  settings: StudioSettings,
  removedAssetId: string | null,
): StudioSettings {
  if (!removedAssetId || settings.presenter.assetId !== removedAssetId) return settings;
  return {
    ...settings,
    presenter: { ...settings.presenter, enabled: false, assetId: null },
  };
}

export function stageAspect(settings: Pick<StudioSettings, "stage">): number {
  return settings.stage.width / settings.stage.height;
}

export function slideAspect(settings: Pick<StudioSettings, "slide">): number {
  return settings.slide.aspectWidth / settings.slide.aspectHeight;
}
