import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  SHADER_VERSION,
  THEME_VERSION,
  type BackgroundStyle,
  type Flow,
  type StudioSettings,
  type ThemeId,
} from "../../model";
import { validateDriftProjectV3, validateDriftProjectV4 } from "./validation";
import {
  cloneDriftProject,
  cloneDriftProjectV4,
  type AssetDescriptor,
  type DriftProjectV3,
  type DriftProjectV4,
  type SlideDirective,
} from "./schema";

type CompatibleDriftProject = DriftProjectV3 | DriftProjectV4;

const LEGACY_FLOWS: readonly Flow[] = ["straight", "arc", "ribbon", "cylinder", "tunnel"];
const LEGACY_BACKGROUNDS: readonly BackgroundStyle[] = [
  "transparent",
  "solid",
  "gradient",
  "aura",
  "paper",
  "void",
];
const LEGACY_THEMES: readonly ThemeId[] = [
  "editorial-drift",
  "road-memory",
  "dread",
  "noir-contact",
  "tender-light",
  "chrome-dream",
];

function legacyFlow(value: string): Flow {
  return LEGACY_FLOWS.includes(value as Flow) ? value as Flow : "straight";
}

function legacyTheme(project: CompatibleDriftProject): ThemeId {
  const candidate = project.provenance.world?.id;
  return candidate && LEGACY_THEMES.includes(candidate as ThemeId)
    ? candidate as ThemeId
    : "editorial-drift";
}

function legacyBackground(project: CompatibleDriftProject): BackgroundStyle {
  if (project.composition.alphaMode === "transparent" || !project.atmosphere.enabled) return "transparent";
  return LEGACY_BACKGROUNDS.includes(project.atmosphere.family as BackgroundStyle)
    ? project.atmosphere.family as BackgroundStyle
    : "aura";
}

function firstVisibleDirective(project: CompatibleDriftProject): SlideDirective | null {
  for (const assetId of project.media.order) {
    const directive = project.slides[assetId];
    if (directive) return directive;
  }
  return null;
}

/**
 * Projects the V3 creative tree, including its V4 compatibility envelope,
 * through the renderer capabilities that exist on the
 * current integration head. It is deliberately one-way and explicit: hidden
 * creative domains remain authoritative and are never deleted merely because
 * the legacy renderer cannot display them yet.
 */
export function studioSettingsFromDriftProject(projectInput: CompatibleDriftProject): StudioSettings {
  const project = projectInput.formatVersion === 4
    ? validateDriftProjectV4(projectInput)
    : validateDriftProjectV3(projectInput);
  const background = legacyBackground(project);
  const presenterAssetId = project.media.presenterAssetId;
  const firstDirective = firstVisibleDirective(project);
  return {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    shaderVersion: SHADER_VERSION,
    themeId: legacyTheme(project),
    stage: {
      width: project.composition.width,
      height: project.composition.height,
      transparent: project.composition.alphaMode === "transparent",
    },
    motion: {
      axis: project.motion.transport.axis,
      direction: project.motion.transport.direction,
      autoplay: true,
      speed: project.motion.transport.slidesPerSecond,
      flow: legacyFlow(project.motion.path.id),
      gap: project.motion.path.gap,
      curvature: project.motion.path.curvature,
      depth: project.motion.path.depth,
      tilt: project.motion.path.banking,
      distortion: project.material.flex,
      focusScale: project.motion.path.focusScale,
      edgeFade: project.motion.path.edgeFade,
      dragSensitivity: 1,
      seamless: project.motion.seamless.enabled,
      seamlessLoops: project.motion.seamless.loops,
      reducedMotionOutput: project.master.reducedMotion,
    },
    slide: {
      aspectWidth: project.card.aspectWidth,
      aspectHeight: project.card.aspectHeight,
      scale: project.card.scale,
      fit: firstDirective?.fit ?? project.card.defaultFit,
      focalX: firstDirective?.focalX ?? 0.5,
      focalY: firstDirective?.focalY ?? 0.5,
      radius: project.card.radius,
      smoothing: project.card.smoothing,
      borderWidth: project.card.borderWidth,
      borderColor: project.card.borderColor,
      borderOpacity: project.card.borderOpacity,
      shadowOpacity: project.lighting.enabled ? project.lighting.shadowOpacity : 0,
      shadowSoftness: project.lighting.shadowSoftness,
    },
    background: {
      style: background,
      colorA: project.atmosphere.colourA,
      colorB: project.atmosphere.colourB,
      accent: project.atmosphere.accent,
      intensity: project.atmosphere.intensity,
      motion: project.atmosphere.motion,
      grain: project.atmosphere.grain,
      vignette: project.atmosphere.vignette,
      seed: project.atmosphere.seedOffset,
    },
    presenter: {
      enabled: project.presenter.enabled && presenterAssetId !== null,
      assetId: presenterAssetId,
      x: project.presenter.x,
      y: project.presenter.y,
      width: project.presenter.width,
      aspectWidth: project.presenter.aspectWidth,
      aspectHeight: project.presenter.aspectHeight,
      fit: project.presenter.fit,
      radius: project.presenter.radius,
      smoothing: project.presenter.smoothing,
      borderWidth: project.presenter.borderWidth,
      borderColor: project.presenter.borderColor,
      borderOpacity: project.presenter.borderOpacity,
      shadowOpacity: project.lighting.enabled ? project.lighting.shadowOpacity : 0,
      muted: project.presenter.muted,
      gain: project.presenter.gain,
      trimStart: project.presenter.trimStart,
      startAt: project.presenter.startAt,
    },
    output: {
      width: project.composition.width,
      height: project.composition.height,
      fps: project.master.fps,
      duration: project.master.duration,
      videoBitrate: project.master.video.bitrate,
      audioBitrate: project.master.audio.bitrate,
    },
  };
}

function copyAsset(asset: AssetDescriptor): AssetDescriptor {
  return { ...asset };
}

function directiveFor(
  project: CompatibleDriftProject,
  assetId: string,
  settings: StudioSettings,
): SlideDirective {
  const existing = project.slides[assetId];
  if (existing) return { ...existing };
  return {
    assetId,
    fit: settings.slide.fit,
    focalX: settings.slide.focalX,
    focalY: settings.slide.focalY,
    scaleOffset: 0,
  };
}

interface ReconcileStudioProjectInputBase {
  settings: StudioSettings;
  slideAssets: readonly AssetDescriptor[];
  presenterAsset?: AssetDescriptor | null;
  updatedAt: string;
}

export interface ReconcileStudioProjectV3Input extends ReconcileStudioProjectInputBase {
  project: DriftProjectV3;
}

export interface ReconcileStudioProjectV4Input extends ReconcileStudioProjectInputBase {
  project: DriftProjectV4;
}

export type ReconcileStudioProjectInput =
  | ReconcileStudioProjectV3Input
  | ReconcileStudioProjectV4Input;

/**
 * Reconciles the current studio's supported controls and media into Project V3
 * or Project V4
 * without flattening domains that the legacy renderer cannot display yet.
 * Existing per-slide directives survive; newly imported slides receive the
 * visible global crop as their initial direction.
 */
export function reconcileStudioProject(input: ReconcileStudioProjectV3Input): DriftProjectV3;
export function reconcileStudioProject(input: ReconcileStudioProjectV4Input): DriftProjectV4;
export function reconcileStudioProject(input: ReconcileStudioProjectInput): CompatibleDriftProject {
  const next: CompatibleDriftProject = input.project.formatVersion === 4
    ? cloneDriftProjectV4(validateDriftProjectV4(input.project))
    : cloneDriftProject(validateDriftProjectV3(input.project));
  const { settings } = input;
  const presenter = input.presenterAsset ?? null;
  const allAssets = [...input.slideAssets, ...(presenter ? [presenter] : [])];
  const assets = Object.fromEntries(allAssets.map((asset) => [asset.id, copyAsset(asset)]));
  const order = input.slideAssets.map((asset) => asset.id);

  next.updatedAt = input.updatedAt;
  next.composition = {
    width: settings.output.width,
    height: settings.output.height,
    alphaMode: settings.stage.transparent || settings.background.style === "transparent"
      ? "transparent"
      : "opaque",
    colourSpace: "srgb-rec709",
  };
  next.media = {
    order,
    presenterAssetId: presenter?.id ?? null,
    assets,
  };
  next.slides = Object.fromEntries(order.map((assetId) => [
    assetId,
    directiveFor(next, assetId, settings),
  ]));

  next.motion.transport = {
    axis: settings.motion.axis,
    direction: settings.motion.direction,
    slidesPerSecond: settings.motion.speed,
  };
  next.motion.path = {
    ...next.motion.path,
    id: settings.motion.flow,
    gap: settings.motion.gap,
    curvature: settings.motion.curvature,
    depth: settings.motion.depth,
    banking: settings.motion.tilt,
    focusScale: settings.motion.focusScale,
    edgeFade: settings.motion.edgeFade,
  };
  next.motion.seamless = {
    enabled: settings.motion.seamless,
    loops: settings.motion.seamlessLoops,
  };

  next.card = {
    aspectWidth: settings.slide.aspectWidth,
    aspectHeight: settings.slide.aspectHeight,
    scale: settings.slide.scale,
    defaultFit: settings.slide.fit,
    radius: settings.slide.radius,
    smoothing: settings.slide.smoothing,
    borderWidth: settings.slide.borderWidth,
    borderColor: settings.slide.borderColor,
    borderOpacity: settings.slide.borderOpacity,
  };
  next.material.flex = settings.motion.distortion;
  next.material.finish.localSmear = settings.motion.distortion;

  next.lighting.shadowOpacity = settings.slide.shadowOpacity;
  next.lighting.shadowSoftness = settings.slide.shadowSoftness;

  next.atmosphere.enabled = next.composition.alphaMode === "opaque";
  next.atmosphere.family = settings.background.style;
  next.atmosphere.intensity = settings.background.intensity;
  next.atmosphere.motion = settings.background.motion;
  next.atmosphere.grain = settings.background.grain;
  next.atmosphere.vignette = settings.background.vignette;
  next.atmosphere.colourA = settings.background.colorA;
  next.atmosphere.colourB = settings.background.colorB;
  next.atmosphere.accent = settings.background.accent;
  next.atmosphere.seedOffset = Math.max(0, Math.round(settings.background.seed));

  next.presenter = {
    enabled: settings.presenter.enabled && presenter !== null,
    x: settings.presenter.x,
    y: settings.presenter.y,
    width: settings.presenter.width,
    aspectWidth: settings.presenter.aspectWidth,
    aspectHeight: settings.presenter.aspectHeight,
    fit: settings.presenter.fit,
    radius: settings.presenter.radius,
    smoothing: settings.presenter.smoothing,
    borderWidth: settings.presenter.borderWidth,
    borderColor: settings.presenter.borderColor,
    borderOpacity: settings.presenter.borderOpacity,
    muted: settings.presenter.muted,
    gain: settings.presenter.gain,
    trimStart: settings.presenter.trimStart,
    startAt: settings.presenter.startAt,
  };
  next.master = {
    fps: settings.output.fps,
    duration: settings.output.duration,
    reducedMotion: settings.motion.reducedMotionOutput,
    video: {
      format: "h264",
      bitrate: settings.output.videoBitrate,
    },
    audio: {
      enabled: presenter !== null && settings.presenter.enabled && !settings.presenter.muted,
      bitrate: settings.output.audioBitrate,
    },
  };

  if (LEGACY_THEMES.includes(settings.themeId)) {
    next.provenance.world = {
      id: settings.themeId,
      version: 1,
      fingerprint: `legacy-theme:${settings.themeId}`,
    };
  }

  return next.formatVersion === 4
    ? validateDriftProjectV4(next)
    : validateDriftProjectV3(next);
}

/** Current archive metadata remains explicit while the portable envelope moves. */
export const STUDIO_PROJECTION_ENGINE_VERSION = ENGINE_VERSION;
export const STUDIO_PROJECTION_THEME_VERSION = THEME_VERSION;
