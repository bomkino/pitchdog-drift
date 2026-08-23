import type { StoredAssetDescriptor, StudioSettings } from "../../model";
import { createEmptyRecipeProvenance } from "./defaults";
import { migrateDriftProjectV3ToV4 } from "./migrateV3ToV4";
import { validateDriftProjectV3 } from "./validation";
import {
  DRIFT_PROJECT_SCHEMA,
  DRIFT_PROJECT_VERSION,
  type AssetDescriptor,
  type DriftProjectV3,
  type DriftProjectV4,
  type RecipeReference,
} from "./schema";

export interface LegacyAssetDescriptor extends StoredAssetDescriptor {
  byteLength?: number;
}

export interface LegacyProjectMigrationInput {
  projectId: string;
  createdAt: string;
  updatedAt: string;
  projectSeed?: number;
  settings: StudioSettings;
  slideAssets: readonly LegacyAssetDescriptor[];
  presenterAsset?: LegacyAssetDescriptor | null;
}

function migrateAsset(asset: LegacyAssetDescriptor): AssetDescriptor {
  const output: AssetDescriptor = {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType,
    hash: asset.hash,
    byteLength: asset.byteLength ?? 0,
    width: asset.width,
    height: asset.height,
  };
  if (asset.duration !== undefined) output.duration = asset.duration;
  return output;
}

function legacyWorld(themeId: string): RecipeReference {
  return {
    id: themeId,
    version: 1,
    fingerprint: `legacy-theme:${themeId}`,
  };
}

export function migrateLegacyStudioProject(input: LegacyProjectMigrationInput): DriftProjectV3 {
  const { settings } = input;
  const allAssets = [
    ...input.slideAssets,
    ...(input.presenterAsset ? [input.presenterAsset] : []),
  ];
  const assets = Object.fromEntries(allAssets.map((asset) => [asset.id, migrateAsset(asset)]));
  const provenance = createEmptyRecipeProvenance();
  provenance.world = legacyWorld(settings.themeId);
  provenance.worldVariant = "custom";

  const transparent = settings.stage.transparent || settings.background.style === "transparent";
  const project: DriftProjectV3 = {
    schema: DRIFT_PROJECT_SCHEMA,
    formatVersion: DRIFT_PROJECT_VERSION,
    projectId: input.projectId,
    projectSeed: input.projectSeed ?? Math.max(0, Math.round(settings.background.seed)),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    composition: {
      width: settings.output.width,
      height: settings.output.height,
      alphaMode: transparent ? "transparent" : "opaque",
      colourSpace: "srgb-rec709",
    },
    media: {
      order: input.slideAssets.map((asset) => asset.id),
      presenterAssetId: input.presenterAsset?.id ?? null,
      assets,
    },
    slides: Object.fromEntries(input.slideAssets.map((asset) => [asset.id, {
      assetId: asset.id,
      fit: settings.slide.fit,
      focalX: settings.slide.focalX,
      focalY: settings.slide.focalY,
      scaleOffset: 0,
    }])),
    motion: {
      transport: {
        axis: settings.motion.axis,
        direction: settings.motion.direction,
        slidesPerSecond: settings.motion.speed,
      },
      cadence: {
        cutId: "legacy-linear-v1",
        read: 0,
        anticipation: 0,
        carry: 1,
        impact: 0,
        settle: 0,
        land: 0,
        poseCadence: "continuous",
      },
      performance: {
        id: "legacy-direct-v1",
        weight: 0.6,
        linger: 0,
        release: 0.5,
        runway: 0,
        overlap: 0,
        imperfection: 0,
        take: 1,
      },
      character: {
        id: "direct",
        amount: 0,
      },
      path: {
        id: settings.motion.flow,
        gap: settings.motion.gap,
        curvature: settings.motion.curvature,
        depth: settings.motion.depth,
        banking: settings.motion.tilt,
        focusScale: settings.motion.focusScale,
        edgeFade: settings.motion.edgeFade,
      },
      seamless: {
        enabled: settings.motion.seamless,
        loops: settings.motion.seamlessLoops,
      },
    },
    card: {
      aspectWidth: settings.slide.aspectWidth,
      aspectHeight: settings.slide.aspectHeight,
      scale: settings.slide.scale,
      defaultFit: settings.slide.fit,
      radius: settings.slide.radius,
      smoothing: settings.slide.smoothing,
      borderWidth: settings.slide.borderWidth,
      borderColor: settings.slide.borderColor,
      borderOpacity: settings.slide.borderOpacity,
    },
    material: {
      surface: "card",
      flex: settings.motion.distortion,
      thickness: 0,
      roughness: 0.76,
      sheen: 0,
      finish: {
        id: "legacy-slide-v1",
        registration: 0,
        localSoftness: 0,
        localSmear: settings.motion.distortion,
        microtexture: 0,
      },
    },
    lighting: {
      enabled: true,
      presetId: "legacy-flat-v1",
      space: "stage",
      motionMode: "static",
      motionSpeed: 0,
      keyColor: "#ffffff",
      fillColor: "#ffffff",
      shadowColor: "#000000",
      azimuth: 90,
      elevation: 90,
      keyIntensity: 0,
      fillIntensity: 1,
      rimIntensity: 0,
      artworkProtection: 1,
      heroProtection: 1,
      shadowOpacity: settings.slide.shadowOpacity,
      shadowSoftness: settings.slide.shadowSoftness,
      shadowDistance: 18,
      contactStrength: 0.45,
      backgroundSpill: 0,
      spillFocus: 1,
      gobo: "softbox",
      goboStrength: 0,
      breath: 0,
    },
    atmosphere: {
      enabled: !transparent,
      family: settings.background.style,
      composition: "legacy-v1",
      paletteId: null,
      treatment: "quiet",
      recut: 0,
      seedOffset: Math.max(0, Math.round(settings.background.seed)),
      presence: "balanced",
      intensity: settings.background.intensity,
      motion: settings.background.motion,
      grain: settings.background.grain,
      vignette: settings.background.vignette,
      colourA: settings.background.colorA,
      colourB: settings.background.colorB,
      accent: settings.background.accent,
    },
    lens: {
      enabled: false,
      characterId: "clean-gate",
      presence: 0,
      focus: 0,
      directionalSmear: 0,
      chromaticSeparation: 0,
      bloom: 0,
      halation: 0,
      flare: 0,
      curvature: 0,
      gateWeave: 0,
      cameraGrain: 0,
      vignette: 0,
      presenterTreatment: "protected",
    },
    sound: {
      source: "recorded",
      material: "studio",
      grammar: "dry",
      density: 0,
      texture: 0,
      take: 1,
      masterLevel: 0,
      motionLevel: 0,
      interfaceLevel: 0,
      underVoice: 0,
      previewEnabled: false,
      exportEnabled: false,
    },
    presenter: {
      enabled: settings.presenter.enabled && Boolean(input.presenterAsset),
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
    },
    master: {
      fps: settings.output.fps,
      duration: settings.output.duration,
      reducedMotion: settings.motion.reducedMotionOutput,
      video: {
        format: "h264",
        bitrate: settings.output.videoBitrate,
      },
      audio: {
        enabled: settings.presenter.enabled && !settings.presenter.muted && Boolean(input.presenterAsset),
        bitrate: settings.output.audioBitrate,
      },
    },
    provenance,
  };

  return validateDriftProjectV3(project);
}

/**
 * Promotes a legacy Studio V1 payload without asking Project V3 to carry a
 * pinned-image identity it never owned. Callers opening legacy portable files
 * should use this direct route; the V3 migration above remains byte-for-byte
 * compatible for consumers that still need Project V3.
 */
export function migrateLegacyStudioProjectToV4(input: LegacyProjectMigrationInput): DriftProjectV4 {
  const v3 = migrateLegacyStudioProject(input);
  const pinnedAssetId = input.settings.presenter.assetId;
  const pinnedAsset = pinnedAssetId === null
    ? null
    : [...input.slideAssets, ...(input.presenterAsset ? [input.presenterAsset] : [])]
      .find((asset) => asset.id === pinnedAssetId) ?? null;
  if (pinnedAssetId !== null && pinnedAsset === null) {
    throw new Error("Legacy pinned-frame settings reference missing media.");
  }

  const presenterEnabled = input.settings.presenter.enabled && pinnedAsset !== null;
  return migrateDriftProjectV3ToV4(v3, "legacy-studio-v1", {
    presenter: {
      ...v3.presenter,
      enabled: presenterEnabled,
      assetId: pinnedAssetId,
      trackMode: "moving-and-pinned",
      layoutMode: "legacy-perspective",
      aspectMode: "custom",
      focalX: 0.5,
      focalY: 0.5,
      safeInset: 0,
      shadowOpacity: input.settings.presenter.shadowOpacity,
      shadowSoftness: 48,
      shadowOffsetX: 12,
      shadowOffsetY: 18,
      matteColor: "#000000",
      matteOpacity: 1,
    },
    masterAudioEnabled: presenterEnabled && pinnedAsset?.kind === "video" && !input.settings.presenter.muted,
  });
}
