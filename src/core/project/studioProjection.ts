import {
  createCompatibilityPerformanceLifecycle,
  ENGINE_VERSION,
  fitPerformanceLifecycleToDuration,
  SCHEMA_VERSION,
  SHADER_VERSION,
  THEME_VERSION,
  type BackgroundStyle,
  type Flow,
  type StudioSettings,
  type ThemeId,
} from "../../model";
import {
  backgroundCompositionForSeed,
  backgroundSeedForAtmosphere,
  backgroundVariation,
  matchingBackgroundPalette,
} from "../../backgrounds";
import { validateDriftProjectV3, validateDriftProjectV4 } from "./validation";
import {
  cloneDriftProject,
  cloneDriftProjectV4,
  type AssetDescriptor,
  type DriftProjectV3,
  type DriftProjectV4,
  type SlideDirective,
} from "./schema";
import { recipeFingerprint } from "../recipes/fingerprint";
import { WORLD_RECIPE_DOMAINS } from "../worlds/worldRegistry";

type CompatibleDriftProject = DriftProjectV3 | DriftProjectV4;

const LEGACY_FLOWS: readonly Flow[] = ["straight", "arc", "ribbon", "cylinder", "tunnel"];
const LEGACY_BACKGROUNDS: readonly BackgroundStyle[] = [
  "transparent",
  "solid",
  "gradient",
  "aura",
  "paper",
  "void",
  "cutting-map",
  "grid",
  "wave",
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

function pinnedAssetId(project: CompatibleDriftProject): string | null {
  return project.formatVersion === 4
    ? project.presenter.assetId
    : project.media.presenterAssetId;
}

function sourceAspect(project: CompatibleDriftProject, assetId: string | null): {
  aspectWidth: number;
  aspectHeight: number;
} | null {
  if (project.formatVersion !== 4 || project.presenter.aspectMode !== "source" || assetId === null) return null;
  const asset = project.media.assets[assetId];
  if (!asset) return null;
  let left = asset.width;
  let right = asset.height;
  while (right !== 0) [left, right] = [right, left % right];
  const divisor = Math.max(1, left);
  let aspectWidth = asset.width / divisor;
  let aspectHeight = asset.height / divisor;
  const scale = Math.max(aspectWidth, aspectHeight) / 64;
  if (scale > 1) {
    aspectWidth /= scale;
    aspectHeight /= scale;
  }
  if (aspectWidth < 1) return { aspectWidth: 1, aspectHeight: 64 };
  if (aspectHeight < 1) return { aspectWidth: 64, aspectHeight: 1 };
  return { aspectWidth, aspectHeight };
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
  const presenterAssetId = pinnedAssetId(project);
  const presenterAspect = sourceAspect(project, presenterAssetId);
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
      seed: backgroundSeedForAtmosphere(project.atmosphere),
    },
    presenter: {
      enabled: project.presenter.enabled && presenterAssetId !== null,
      assetId: presenterAssetId,
      trackMode: project.formatVersion === 4 ? project.presenter.trackMode : "moving-and-pinned",
      layoutMode: project.formatVersion === 4 ? project.presenter.layoutMode : "legacy-perspective",
      aspectMode: project.formatVersion === 4 ? project.presenter.aspectMode : "custom",
      x: project.presenter.x,
      y: project.presenter.y,
      width: project.presenter.width,
      aspectWidth: presenterAspect?.aspectWidth ?? project.presenter.aspectWidth,
      aspectHeight: presenterAspect?.aspectHeight ?? project.presenter.aspectHeight,
      fit: project.presenter.fit,
      focalX: project.formatVersion === 4 ? project.presenter.focalX : 0.5,
      focalY: project.formatVersion === 4 ? project.presenter.focalY : 0.5,
      safeInset: project.formatVersion === 4 ? project.presenter.safeInset : 0,
      radius: project.presenter.radius,
      smoothing: project.presenter.smoothing,
      borderWidth: project.presenter.borderWidth,
      borderColor: project.presenter.borderColor,
      borderOpacity: project.presenter.borderOpacity,
      shadowOpacity: project.formatVersion === 4
        ? project.presenter.shadowOpacity
        : project.lighting.enabled ? project.lighting.shadowOpacity : 0,
      shadowSoftness: project.formatVersion === 4 ? project.presenter.shadowSoftness : 48,
      shadowOffsetX: project.formatVersion === 4 ? project.presenter.shadowOffsetX : 12,
      shadowOffsetY: project.formatVersion === 4 ? project.presenter.shadowOffsetY : 18,
      matteColor: project.formatVersion === 4 ? project.presenter.matteColor : "#000000",
      matteOpacity: project.formatVersion === 4 ? project.presenter.matteOpacity : 1,
      muted: project.presenter.muted,
      gain: project.presenter.gain,
      trimStart: project.presenter.trimStart,
      startAt: project.presenter.startAt,
    },
    performance: project.formatVersion === 4
      ? structuredClone(project.performance)
      : createCompatibilityPerformanceLifecycle(project.master.duration, project.master.reducedMotion),
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

function sameAssetDescriptor(left: AssetDescriptor, right: AssetDescriptor): boolean {
  return left.id === right.id
    && left.name === right.name
    && left.kind === right.kind
    && left.mimeType === right.mimeType
    && left.hash === right.hash
    && left.byteLength === right.byteLength
    && left.width === right.width
    && left.height === right.height
    && left.duration === right.duration;
}

function mediaTupleMatchesProject(
  project: CompatibleDriftProject,
  slideAssets: readonly AssetDescriptor[],
  presenterAsset: AssetDescriptor | null,
): boolean {
  if (project.media.order.length !== slideAssets.length) return false;
  if (project.media.order.some((assetId, index) => assetId !== slideAssets[index]?.id)) return false;
  if (project.media.presenterAssetId !== (presenterAsset?.id ?? null)) return false;

  const desiredAssets = new Map<string, AssetDescriptor>();
  for (const asset of slideAssets) desiredAssets.set(asset.id, asset);
  if (presenterAsset) desiredAssets.set(presenterAsset.id, presenterAsset);
  const currentIds = Object.keys(project.media.assets);
  if (currentIds.length !== desiredAssets.size) return false;
  return currentIds.every((assetId) => {
    const desired = desiredAssets.get(assetId);
    const current = project.media.assets[assetId];
    return Boolean(desired && current && sameAssetDescriptor(current, desired));
  });
}

/**
 * A recipe reference may survive only while its resolved domain still hashes
 * to the authored value. Unrelated project-owned edits keep truthful per-domain
 * provenance; any recipe drift dissolves the aggregate World into Custom.
 */
function invalidateDriftedWorldRecipes(project: CompatibleDriftProject): void {
  let drifted = false;
  for (const domain of WORLD_RECIPE_DOMAINS) {
    const reference = project.provenance.recipes[domain];
    if (
      reference
      && recipeFingerprint(reference.id, reference.version, project[domain]) !== reference.fingerprint
    ) {
      project.provenance.recipes[domain] = null;
      drifted = true;
    }
  }
  if (drifted) {
    project.provenance.world = null;
    project.provenance.worldVariant = "custom";
  }
}

function directiveFor(
  project: CompatibleDriftProject,
  assetId: string,
  settings: StudioSettings,
  updateExistingDirection: boolean,
): SlideDirective {
  const existing = project.slides[assetId];
  if (existing) {
    return updateExistingDirection
      ? {
          ...existing,
          fit: settings.slide.fit,
          focalX: settings.slide.focalX,
          focalY: settings.slide.focalY,
        }
      : { ...existing };
  }
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
  const previouslyProjected = studioSettingsFromDriftProject(next);
  const { settings } = input;
  const presenter = input.presenterAsset ?? null;
  const alphaControlsChanged = settings.stage.transparent !== previouslyProjected.stage.transparent
    || settings.background.style !== previouslyProjected.background.style;
  const outputWidthChanged = settings.output.width !== previouslyProjected.output.width;
  const outputHeightChanged = settings.output.height !== previouslyProjected.output.height;
  const presenterMediaChanged = next.media.presenterAssetId !== (presenter?.id ?? null);
  const presenterControlsChanged = settings.presenter.enabled !== previouslyProjected.presenter.enabled
    || settings.presenter.assetId !== previouslyProjected.presenter.assetId
    || settings.presenter.muted !== previouslyProjected.presenter.muted;

  // The compatibility projection is intentionally lossy: disabled effects,
  // per-slide crops, and source-aspect presenters all hide authored Project V4
  // values. Opening or saving an unchanged project must therefore be a literal
  // no-op for creative state. Only its caller-owned timestamp may advance.
  if (
    JSON.stringify(settings) === JSON.stringify(previouslyProjected)
    && mediaTupleMatchesProject(next, input.slideAssets, presenter)
  ) {
    next.updatedAt = input.updatedAt;
    return next.formatVersion === 4
      ? validateDriftProjectV4(next)
      : validateDriftProjectV3(next);
  }

  const performance = fitPerformanceLifecycleToDuration(
    settings.performance,
    settings.output.duration,
    settings.motion.reducedMotionOutput,
  );
  const updateExistingSlideDirection = settings.slide.fit !== previouslyProjected.slide.fit
    || settings.slide.focalX !== previouslyProjected.slide.focalX
    || settings.slide.focalY !== previouslyProjected.slide.focalY;
  const allAssets = [...input.slideAssets, ...(presenter ? [presenter] : [])];
  const assets = Object.fromEntries(allAssets.map((asset) => [asset.id, copyAsset(asset)]));
  const order = input.slideAssets.map((asset) => asset.id);

  next.updatedAt = input.updatedAt;
  next.composition = {
    ...next.composition,
    width: outputWidthChanged ? settings.output.width : next.composition.width,
    height: outputHeightChanged ? settings.output.height : next.composition.height,
    alphaMode: alphaControlsChanged
      ? settings.stage.transparent || settings.background.style === "transparent"
        ? "transparent"
        : "opaque"
      : next.composition.alphaMode,
  };
  next.media = {
    order,
    presenterAssetId: presenter?.id ?? null,
    assets,
  };
  next.slides = Object.fromEntries(order.map((assetId) => [
    assetId,
    directiveFor(next, assetId, settings, updateExistingSlideDirection),
  ]));

  next.motion.transport = {
    axis: settings.motion.axis,
    direction: settings.motion.direction,
    slidesPerSecond: settings.motion.speed,
  };
  next.motion.path = {
    ...next.motion.path,
    id: settings.motion.flow === previouslyProjected.motion.flow
      ? next.motion.path.id
      : settings.motion.flow,
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
    ...next.card,
    aspectWidth: settings.slide.aspectWidth,
    aspectHeight: settings.slide.aspectHeight,
    scale: settings.slide.scale,
    defaultFit: settings.slide.fit !== previouslyProjected.slide.fit
      ? settings.slide.fit
      : next.card.defaultFit,
    radius: settings.slide.radius,
    smoothing: settings.slide.smoothing,
    borderWidth: settings.slide.borderWidth,
    borderColor: settings.slide.borderColor,
    borderOpacity: settings.slide.borderOpacity,
  };
  const distortionChanged = settings.motion.distortion !== previouslyProjected.motion.distortion;
  next.material.flex = settings.motion.distortion;
  // V1 exposed one broad "distortion" control; V2 deliberately separates
  // physical card flex from the finish's local smear. A projection round-trip
  // must not collapse those authored values merely because the legacy control
  // can display only flex. Keep the compatibility coupling only for an actual
  // user edit to that control.
  if (distortionChanged) next.material.finish.localSmear = settings.motion.distortion;

  if (settings.slide.shadowOpacity !== previouslyProjected.slide.shadowOpacity) {
    next.lighting.shadowOpacity = settings.slide.shadowOpacity;
  }
  if (settings.slide.shadowSoftness !== previouslyProjected.slide.shadowSoftness) {
    next.lighting.shadowSoftness = settings.slide.shadowSoftness;
  }

  if (alphaControlsChanged) next.atmosphere.enabled = next.composition.alphaMode === "opaque";
  next.atmosphere.family = settings.background.style === previouslyProjected.background.style
    ? next.atmosphere.family
    : settings.background.style;
  next.atmosphere.composition = backgroundCompositionForSeed(
    next.atmosphere.family,
    settings.background.seed,
  );
  next.atmosphere.intensity = settings.background.intensity;
  next.atmosphere.motion = settings.background.motion;
  next.atmosphere.grain = settings.background.grain;
  next.atmosphere.vignette = settings.background.vignette;
  next.atmosphere.colourA = settings.background.colorA;
  next.atmosphere.colourB = settings.background.colorB;
  next.atmosphere.accent = settings.background.accent;
  next.atmosphere.seedOffset = backgroundVariation(settings.background.seed);
  next.atmosphere.recut = next.atmosphere.seedOffset;
  next.atmosphere.paletteId = matchingBackgroundPalette(settings.background)?.id ?? null;

  const pinId = next.formatVersion === 4
    ? settings.presenter.assetId
    : presenter?.id ?? null;
  const pinAsset = pinId === null ? null : assets[pinId] ?? null;
  const presenterBase = {
    enabled: settings.presenter.enabled && pinAsset !== null,
    x: settings.presenter.x,
    y: settings.presenter.y,
    width: settings.presenter.width,
    aspectWidth: settings.presenter.aspectMode !== previouslyProjected.presenter.aspectMode
      || settings.presenter.aspectWidth !== previouslyProjected.presenter.aspectWidth
      ? settings.presenter.aspectWidth
      : next.presenter.aspectWidth,
    aspectHeight: settings.presenter.aspectMode !== previouslyProjected.presenter.aspectMode
      || settings.presenter.aspectHeight !== previouslyProjected.presenter.aspectHeight
      ? settings.presenter.aspectHeight
      : next.presenter.aspectHeight,
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
  if (next.formatVersion === 4) {
    next.presenter = {
      ...next.presenter,
      ...presenterBase,
      assetId: pinId,
      trackMode: settings.presenter.trackMode,
      layoutMode: settings.presenter.layoutMode,
      aspectMode: settings.presenter.aspectMode,
      focalX: settings.presenter.focalX,
      focalY: settings.presenter.focalY,
      safeInset: settings.presenter.safeInset,
      shadowOpacity: settings.presenter.shadowOpacity,
      shadowSoftness: settings.presenter.shadowSoftness,
      shadowOffsetX: settings.presenter.shadowOffsetX,
      shadowOffsetY: settings.presenter.shadowOffsetY,
      matteColor: settings.presenter.matteColor,
      matteOpacity: settings.presenter.matteOpacity,
    };
    next.performance = performance;
  } else {
    next.presenter = presenterBase;
  }
  next.master = {
    fps: settings.output.fps,
    duration: settings.output.duration,
    reducedMotion: settings.motion.reducedMotionOutput,
    video: {
      format: "h264",
      bitrate: settings.output.videoBitrate,
    },
    audio: {
      enabled: presenterMediaChanged || presenterControlsChanged
        ? next.formatVersion === 4
          ? pinAsset?.kind === "video" && pinId === presenter?.id && settings.presenter.enabled && !settings.presenter.muted
          : presenter !== null && settings.presenter.enabled && !settings.presenter.muted
        : next.master.audio.enabled,
      bitrate: settings.output.audioBitrate,
    },
  };

  invalidateDriftedWorldRecipes(next);

  if (LEGACY_THEMES.includes(settings.themeId) && settings.themeId !== previouslyProjected.themeId) {
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
