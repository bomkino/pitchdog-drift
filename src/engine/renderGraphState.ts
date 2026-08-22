import type { PerformanceLifecycleAuthoring } from "../core/timeline/performanceLifecycle";
import type {
  Axis,
  Direction,
  DriftProjectV4,
  ImageFit,
  PresenterSettingsV4,
} from "../core/project/schema";
import { backgroundSeedForAtmosphere } from "../backgrounds";

/**
 * Ephemeral renderer input. It is derived from one validated project snapshot
 * and is never persisted or edited independently.
 */
export interface DrawGraphState {
  stage: {
    width: number;
    height: number;
    transparent: boolean;
  };
  motion: {
    axis: Axis;
    direction: Direction;
    autoplay: boolean;
    speed: number;
    flow: string;
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
  };
  slide: {
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
  };
  background: {
    style: string;
    colorA: string;
    colorB: string;
    accent: string;
    intensity: number;
    motion: number;
    grain: number;
    vignette: number;
    seed: number;
  };
  presenter: PresenterSettingsV4;
  performance: PerformanceLifecycleAuthoring;
  output: {
    width: number;
    height: number;
    fps: 24 | 25 | 30 | 50 | 60;
    duration: number;
    videoBitrate: number;
    audioBitrate: number;
  };
}

function firstDirective(project: DriftProjectV4) {
  for (const assetId of project.media.order) {
    const directive = project.slides[assetId];
    if (directive) return directive;
  }
  return null;
}

function sourceAspect(project: DriftProjectV4): { width: number; height: number } | null {
  if (project.presenter.aspectMode !== "source" || project.presenter.assetId === null) return null;
  const asset = project.media.assets[project.presenter.assetId];
  if (!asset) return null;
  let left = asset.width;
  let right = asset.height;
  while (right !== 0) [left, right] = [right, left % right];
  const divisor = Math.max(1, left);
  let width = asset.width / divisor;
  let height = asset.height / divisor;
  const scale = Math.max(width, height) / 64;
  if (scale > 1) {
    width /= scale;
    height /= scale;
  }
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

/** Direct Project V4 → draw-graph derivation. No legacy studio projection. */
export function drawGraphStateFromProject(project: DriftProjectV4): DrawGraphState {
  const directive = firstDirective(project);
  const presenterAspect = sourceAspect(project);
  const transparent = project.composition.alphaMode === "transparent" || !project.atmosphere.enabled;
  return {
    stage: {
      width: project.composition.width,
      height: project.composition.height,
      transparent,
    },
    motion: {
      axis: project.motion.transport.axis,
      direction: project.motion.transport.direction,
      autoplay: true,
      speed: project.motion.transport.slidesPerSecond,
      flow: project.motion.path.id,
      gap: project.motion.path.gap,
      curvature: project.motion.path.curvature,
      depth: project.motion.path.depth,
      tilt: project.motion.path.banking,
      distortion: project.material.flex,
      focusScale: project.motion.path.focusScale,
      edgeFade: project.motion.path.edgeFade,
      // Interaction sensitivity is session state in V2, never saved creative
      // truth. One is the neutral physical mapping until that controller lands.
      dragSensitivity: 1,
      seamless: project.motion.seamless.enabled,
      seamlessLoops: project.motion.seamless.loops,
      reducedMotionOutput: project.master.reducedMotion,
    },
    slide: {
      aspectWidth: project.card.aspectWidth,
      aspectHeight: project.card.aspectHeight,
      scale: project.card.scale,
      fit: directive?.fit ?? project.card.defaultFit,
      focalX: directive?.focalX ?? 0.5,
      focalY: directive?.focalY ?? 0.5,
      radius: project.card.radius,
      smoothing: project.card.smoothing,
      borderWidth: project.card.borderWidth,
      borderColor: project.card.borderColor,
      borderOpacity: project.card.borderOpacity,
      shadowOpacity: project.lighting.enabled ? project.lighting.shadowOpacity : 0,
      shadowSoftness: project.lighting.shadowSoftness,
    },
    background: {
      style: transparent ? "transparent" : project.atmosphere.family,
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
      ...project.presenter,
      aspectWidth: presenterAspect?.width ?? project.presenter.aspectWidth,
      aspectHeight: presenterAspect?.height ?? project.presenter.aspectHeight,
    },
    performance: structuredClone(project.performance),
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
