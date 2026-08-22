import type { PerformanceLifecycleAuthoring } from "../timeline/performanceLifecycle";

export const DRIFT_PROJECT_SCHEMA = "dog.pitch.drift/project" as const;
export const DRIFT_PROJECT_VERSION = 3 as const;
export const DRIFT_PROJECT_V4_VERSION = 4 as const;
export const DRIFT_V1_COMPAT_RENDER_CONTRACT = "drift-v1-compat/1" as const;
export const DRIFT_PROJECT_V4_MIGRATOR = "drift-project-v4/1" as const;

export const PROJECT_DOMAINS = [
  "identity",
  "composition",
  "media",
  "slides",
  "motion",
  "card",
  "material",
  "lighting",
  "atmosphere",
  "lens",
  "sound",
  "presenter",
  "master",
  "provenance",
] as const;
export type ProjectDomain = (typeof PROJECT_DOMAINS)[number];

export type Axis = "horizontal" | "vertical";
export type Direction = 1 | -1;
export type ImageFit = "cover" | "contain";
export type PoseCadence = "continuous" | "24fps" | "18fps" | "12fps";
export type MotionCharacterId = "direct" | "weighted" | "spring" | "drift";
export type SurfaceId = "card" | "paper" | "silk" | "gel";
export type LightSpace = "stage" | "card";
export type LightMotion = "static" | "breathe" | "sweep" | "flicker" | "orbit";
export type AtmosphereTreatment = "quiet" | "cinema" | "graphic" | "weathered";
export type AtmospherePresence = "whisper" | "balanced" | "statement";
export type PresenterTreatment = "protected" | "through-lens";
export type PresenterTrackMode = "pinned-only" | "moving-and-pinned";
export type PresenterLayoutMode = "safe-overlay" | "legacy-perspective";
export type PresenterAspectMode = "source" | "custom";
export type SoundSource = "recorded" | "procedural";
export type SoundGrammar = "dry" | "editorial" | "organic";
export type WorldVariant = "restrained" | "directed" | "fever" | "custom";
export type DriftProjectV4SourceFormat = "legacy-studio-v1" | "project-v3";
export type DriftJsonValue =
  | null
  | boolean
  | number
  | string
  | DriftJsonValue[]
  | { [key: string]: DriftJsonValue };

export interface CompositionSettings {
  width: number;
  height: number;
  alphaMode: "opaque" | "transparent";
  colourSpace: "srgb-rec709";
}

export interface AssetDescriptor {
  id: string;
  name: string;
  kind: "image" | "video";
  mimeType: string;
  hash: string;
  byteLength: number;
  width: number;
  height: number;
  duration?: number;
}

export interface MediaManifest {
  order: string[];
  presenterAssetId: string | null;
  assets: Record<string, AssetDescriptor>;
}

export interface SlideDirective {
  assetId: string;
  fit: ImageFit;
  focalX: number;
  focalY: number;
  scaleOffset: number;
}

export interface MotionSettings {
  transport: {
    axis: Axis;
    direction: Direction;
    slidesPerSecond: number;
  };
  cadence: {
    cutId: string;
    read: number;
    anticipation: number;
    carry: number;
    impact: number;
    settle: number;
    land: number;
    poseCadence: PoseCadence;
  };
  performance: {
    id: string;
    weight: number;
    linger: number;
    release: number;
    runway: number;
    overlap: number;
    imperfection: number;
    take: number;
  };
  character: {
    id: MotionCharacterId;
    amount: number;
  };
  path: {
    id: string;
    gap: number;
    curvature: number;
    depth: number;
    banking: number;
    focusScale: number;
    edgeFade: number;
  };
  seamless: {
    enabled: boolean;
    loops: number;
  };
}

export interface CardSettings {
  aspectWidth: number;
  aspectHeight: number;
  scale: number;
  defaultFit: ImageFit;
  radius: number;
  smoothing: number;
  borderWidth: number;
  borderColor: string;
  borderOpacity: number;
}

export interface MaterialSettings {
  surface: SurfaceId;
  flex: number;
  thickness: number;
  roughness: number;
  sheen: number;
  finish: {
    id: string;
    registration: number;
    localSoftness: number;
    localSmear: number;
    microtexture: number;
  };
}

export interface LightingSettings {
  enabled: boolean;
  presetId: string;
  space: LightSpace;
  motionMode: LightMotion;
  motionSpeed: number;
  keyColor: string;
  fillColor: string;
  shadowColor: string;
  azimuth: number;
  elevation: number;
  keyIntensity: number;
  fillIntensity: number;
  rimIntensity: number;
  artworkProtection: number;
  heroProtection: number;
  shadowOpacity: number;
  shadowSoftness: number;
  shadowDistance: number;
  contactStrength: number;
  backgroundSpill: number;
  spillFocus: number;
  gobo: string;
  goboStrength: number;
  breath: number;
}

export interface AtmosphereSettings {
  enabled: boolean;
  family: string;
  composition: string;
  paletteId: string | null;
  treatment: AtmosphereTreatment;
  recut: number;
  seedOffset: number;
  presence: AtmospherePresence;
  intensity: number;
  motion: number;
  grain: number;
  vignette: number;
  colourA: string;
  colourB: string;
  accent: string;
}

export interface LensSettings {
  enabled: boolean;
  characterId: string;
  presence: number;
  focus: number;
  directionalSmear: number;
  chromaticSeparation: number;
  bloom: number;
  halation: number;
  flare: number;
  curvature: number;
  gateWeave: number;
  cameraGrain: number;
  vignette: number;
  presenterTreatment: PresenterTreatment;
}

export interface SoundSettings {
  source: SoundSource;
  material: string;
  grammar: SoundGrammar;
  density: number;
  texture: number;
  take: number;
  masterLevel: number;
  motionLevel: number;
  interfaceLevel: number;
  underVoice: number;
  previewEnabled: boolean;
  exportEnabled: boolean;
}

export interface PresenterSettings {
  enabled: boolean;
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
  muted: boolean;
  gain: number;
  trimStart: number;
  startAt: number;
}

/**
 * Project V4 owns the pinned frame independently from the optional presenter
 * video slot. The V3 fields remain as the exact compatibility surface while
 * these additions describe safe V2 composition without overloading lighting
 * or moving-track state.
 */
export interface PresenterSettingsV4 extends PresenterSettings {
  assetId: string | null;
  trackMode: PresenterTrackMode;
  layoutMode: PresenterLayoutMode;
  aspectMode: PresenterAspectMode;
  focalX: number;
  focalY: number;
  safeInset: number;
  shadowOpacity: number;
  shadowSoftness: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  matteColor: string;
  matteOpacity: number;
}

export interface MasterSettings {
  fps: 24 | 25 | 30 | 50 | 60;
  duration: number;
  reducedMotion: boolean;
  video: {
    format: "h264";
    bitrate: number;
  };
  audio: {
    enabled: boolean;
    bitrate: number;
  };
}

export interface RecipeReference {
  id: string;
  version: number;
  fingerprint: string;
}

export interface RecipeProvenance {
  world: RecipeReference | null;
  worldVariant: WorldVariant;
  recipes: Record<ProjectDomain, RecipeReference | null>;
  lockedDomains: ProjectDomain[];
}

export interface DriftProjectV3 {
  schema: typeof DRIFT_PROJECT_SCHEMA;
  formatVersion: typeof DRIFT_PROJECT_VERSION;
  projectId: string;
  projectSeed: number;
  createdAt: string;
  updatedAt: string;
  composition: CompositionSettings;
  media: MediaManifest;
  slides: Record<string, SlideDirective>;
  motion: MotionSettings;
  card: CardSettings;
  material: MaterialSettings;
  lighting: LightingSettings;
  atmosphere: AtmosphereSettings;
  lens: LensSettings;
  sound: SoundSettings;
  presenter: PresenterSettings;
  master: MasterSettings;
  provenance: RecipeProvenance;
}

export interface DriftProjectMigrationV4 {
  sourceFormat: DriftProjectV4SourceFormat;
  migrator: typeof DRIFT_PROJECT_V4_MIGRATOR;
}

export interface DriftProjectV4 extends Omit<DriftProjectV3, "formatVersion" | "presenter"> {
  formatVersion: typeof DRIFT_PROJECT_V4_VERSION;
  renderContract: typeof DRIFT_V1_COMPAT_RENDER_CONTRACT;
  migration: DriftProjectMigrationV4 | null;
  presenter: PresenterSettingsV4;
  performance: PerformanceLifecycleAuthoring;
  extensions: Record<string, DriftJsonValue>;
}

export function cloneDriftProject(project: DriftProjectV3): DriftProjectV3 {
  return structuredClone(project);
}

export function cloneDriftProjectV4(project: DriftProjectV4): DriftProjectV4 {
  return structuredClone(project);
}
