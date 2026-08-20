export const SCHEMA_VERSION = 1 as const;
export const ENGINE_VERSION = "1.0.0";
export const SHADER_VERSION = "1.0.0";
export const THEME_VERSION = "1.0.0";

export type Axis = "horizontal" | "vertical";
export type Direction = 1 | -1;
export type Flow = "straight" | "arc" | "ribbon" | "cylinder" | "tunnel" | "editorial";
export type ImageFit = "cover" | "contain";
export type BackgroundStyle = "transparent" | "solid" | "gradient" | "aura" | "paper" | "void";
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
  x: number;
  y: number;
  width: number;
  aspectWidth: number;
  aspectHeight: number;
  fit: ImageFit;
  radius: number;
  smoothing: number;
  borderWidth: number;
  borderColor: string;
  borderOpacity: number;
  shadowOpacity: number;
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
  output: OutputSettings;
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
  phase: "preparing" | "audio" | "video" | "frames" | "finalizing" | "complete";
  completed: number;
  total: number;
  message: string;
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
    gap: 0.22,
    curvature: 0.36,
    depth: 0.18,
    tilt: 4.5,
    distortion: 0.32,
    focusScale: 0.08,
    edgeFade: 0.28,
    dragSensitivity: 1,
    seamless: false,
    seamlessLoops: 1,
    reducedMotionOutput: false,
  },
  slide: {
    aspectWidth: 16,
    aspectHeight: 9,
    scale: 0.78,
    fit: "cover",
    focalX: 0.5,
    focalY: 0.5,
    radius: 36,
    smoothing: 0.6,
    borderWidth: 1.5,
    borderColor: "#f0e6d4",
    borderOpacity: 0.42,
    shadowOpacity: 0.34,
    shadowSoftness: 34,
  },
  background: {
    style: "aura",
    colorA: "#120f0c",
    colorB: "#2c1516",
    accent: "#c26d3f",
    intensity: 0.72,
    motion: 0.34,
    grain: 0.12,
    vignette: 0.48,
    seed: 17,
  },
  presenter: {
    enabled: false,
    assetId: null,
    x: 0.72,
    y: 0.28,
    width: 0.34,
    aspectWidth: 9,
    aspectHeight: 16,
    fit: "cover",
    radius: 42,
    smoothing: 0.6,
    borderWidth: 2,
    borderColor: "#f4ead8",
    borderOpacity: 0.55,
    shadowOpacity: 0.48,
    muted: false,
    gain: 1,
    trimStart: 0,
    startAt: 0,
  },
  output: {
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 8,
    videoBitrate: 16_000_000,
    audioBitrate: 192_000,
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
