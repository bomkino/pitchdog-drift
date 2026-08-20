MODEL = r'''export const SCHEMA_VERSION = 1 as const;
export const ENGINE_VERSION = "1.0.0";
export const SHADER_VERSION = "1.0.0";
export const THEME_VERSION = "1.0.0";

export type Axis = "horizontal" | "vertical";
export type Direction = 1 | -1;
export type Flow =
  | "straight"
  | "arc"
  | "ribbon"
  | "cylinder"
  | "tunnel"
  | "helix"
  | "orbit"
  | "cascade"
  | "lemniscate"
  | "switchback";
export type DynamicsMode = "direct" | "weighted" | "spring" | "drift";
export type SurfaceMode = "card" | "paper" | "silk" | "gel";
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
  dynamics: DynamicsMode;
  gap: number;
  curvature: number;
  depth: number;
  tilt: number;
  bank: number;
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
  surface: SurfaceMode;
  thickness: number;
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
    dynamics: "weighted",
    gap: 0.22,
    curvature: 0.36,
    depth: 0.18,
    tilt: 4.5,
    bank: 0.58,
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
    surface: "paper",
    thickness: 6,
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
'''

SPATIAL_DYNAMICS = r'''import type { DynamicsMode, StudioSettings, SurfaceMode } from "../model";

const TAU = Math.PI * 2;
const MAX_STEP = 1 / 120;

export interface MotionState {
  position: number;
  velocity: number;
  acceleration: number;
}

export interface DynamicsProfile {
  response: number;
  accelerationDamping: number;
  coastDrag: number;
  impulseGain: number;
  maximumVelocity: number;
  maximumAcceleration: number;
}

export const DYNAMICS_PROFILES: Readonly<Record<DynamicsMode, DynamicsProfile>> = Object.freeze({
  direct: Object.freeze({
    response: 22,
    accelerationDamping: 28,
    coastDrag: 18,
    impulseGain: 0.72,
    maximumVelocity: 3.2,
    maximumAcceleration: 28,
  }),
  weighted: Object.freeze({
    response: 8.4,
    accelerationDamping: 10.5,
    coastDrag: 3.2,
    impulseGain: 0.94,
    maximumVelocity: 4.2,
    maximumAcceleration: 22,
  }),
  spring: Object.freeze({
    response: 12.8,
    accelerationDamping: 6.2,
    coastDrag: 1.8,
    impulseGain: 1.12,
    maximumVelocity: 4.8,
    maximumAcceleration: 30,
  }),
  drift: Object.freeze({
    response: 3.6,
    accelerationDamping: 5.4,
    coastDrag: 0.72,
    impulseGain: 1.04,
    maximumVelocity: 5.2,
    maximumAcceleration: 16,
  }),
});

export interface SurfaceProfile {
  index: number;
  edgeTone: number;
  edgeOpacity: number;
}

export const SURFACE_PROFILES: Readonly<Record<SurfaceMode, SurfaceProfile>> = Object.freeze({
  card: Object.freeze({ index: 0, edgeTone: 0.62, edgeOpacity: 0.72 }),
  paper: Object.freeze({ index: 1, edgeTone: 0.5, edgeOpacity: 0.62 }),
  silk: Object.freeze({ index: 2, edgeTone: 0.42, edgeOpacity: 0.48 }),
  gel: Object.freeze({ index: 3, edgeTone: 0.7, edgeOpacity: 0.78 }),
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Semi-implicit, bounded, fixed-substep integration for interactive preview.
 * Export never depends on this state; export distance stays analytic.
 */
export function integrateMotionState(
  state: MotionState,
  targetVelocity: number,
  deltaSeconds: number,
  mode: DynamicsMode,
  stride: number,
): MotionState {
  const profile = DYNAMICS_PROFILES[mode];
  const safeStride = Math.max(1, Math.abs(finite(stride, 1)));
  const duration = clamp(finite(deltaSeconds), 0, 0.05);
  if (duration <= 0) return { ...state };

  const steps = Math.max(1, Math.ceil(duration / MAX_STEP));
  const step = duration / steps;
  const maximumVelocity = profile.maximumVelocity * safeStride;
  const maximumAcceleration = profile.maximumAcceleration * safeStride;
  let position = finite(state.position);
  let velocity = clamp(finite(state.velocity), -maximumVelocity, maximumVelocity);
  let acceleration = clamp(finite(state.acceleration), -maximumAcceleration, maximumAcceleration);
  const target = clamp(finite(targetVelocity), -maximumVelocity, maximumVelocity);

  for (let index = 0; index < steps; index += 1) {
    const accelerationTarget = clamp((target - velocity) * profile.response, -maximumAcceleration, maximumAcceleration);
    const accelerationResponse = 1 - Math.exp(-profile.accelerationDamping * step);
    acceleration += (accelerationTarget - acceleration) * accelerationResponse;
    velocity += acceleration * step;
    if (Math.abs(target) < safeStride * 0.000_001) {
      velocity *= Math.exp(-profile.coastDrag * step);
    }
    velocity = clamp(velocity, -maximumVelocity, maximumVelocity);
    position += velocity * step;
  }

  return { position, velocity, acceleration };
}

/** Applies a direct-manipulation displacement plus a bounded release impulse. */
export function applyMotionImpulse(
  state: MotionState,
  displacement: number,
  deltaSeconds: number,
  mode: DynamicsMode,
  stride: number,
): MotionState {
  const profile = DYNAMICS_PROFILES[mode];
  const safeStride = Math.max(1, Math.abs(finite(stride, 1)));
  const duration = clamp(finite(deltaSeconds), 1 / 240, 0.08);
  const movement = clamp(finite(displacement), -safeStride * 2.5, safeStride * 2.5);
  const maximumVelocity = profile.maximumVelocity * safeStride;
  const maximumAcceleration = profile.maximumAcceleration * safeStride;
  const priorVelocity = clamp(finite(state.velocity), -maximumVelocity, maximumVelocity);
  const releaseVelocity = clamp((movement / duration) * profile.impulseGain, -maximumVelocity, maximumVelocity);
  const velocity = clamp(priorVelocity * 0.28 + releaseVelocity * 0.72, -maximumVelocity, maximumVelocity);
  const acceleration = clamp((velocity - priorVelocity) / duration, -maximumAcceleration, maximumAcceleration);
  return {
    position: finite(state.position) + movement,
    velocity,
    acceleration,
  };
}

export function surfaceModeIndex(surface: SurfaceMode): number {
  return SURFACE_PROFILES[surface].index;
}

/**
 * Surface motion is periodic in seamless export and frozen for reduced motion.
 * Ordinary preview may breathe in wall-clock time without entering export math.
 */
export function surfacePhaseAtTime(
  settings: Pick<StudioSettings, "motion" | "output">,
  time: number,
  exportMode: boolean,
  reducedPreview: boolean,
): number {
  const reduced = exportMode ? settings.motion.reducedMotionOutput : reducedPreview;
  if (reduced) return 0;
  if (exportMode && settings.motion.seamless) {
    const loops = Math.max(1, Math.round(settings.motion.seamlessLoops));
    return (finite(time) / Math.max(0.001, settings.output.duration)) * TAU * loops;
  }
  return finite(time) * 0.82;
}
'''

EVALUATE = r'''import type { Flow, StudioSettings } from "../model";

export interface CarouselGeometry {
  viewportWidth: number;
  viewportHeight: number;
  slideWidth: number;
  slideHeight: number;
  stride: number;
  visibleRadius: number;
  crossExtent: number;
}

export interface EvaluatedSlide {
  primary: number;
  cross: number;
  z: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
  opacity: number;
  normalized: number;
  tangentPrimary: number;
  tangentCross: number;
  tangentZ: number;
  pathBend: number;
}

interface PathPoint {
  cross: number;
  z: number;
}

const DEG = Math.PI / 180;
const DERIVATIVE_STEP = 0.0015;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function wrapCentered(value: number, span: number): number {
  if (!Number.isFinite(span) || span <= 0) return value;
  return ((((value + span / 2) % span) + span) % span) - span / 2;
}

export function deriveCarouselGeometry(settings: StudioSettings, viewportWidth: number, viewportHeight: number): CarouselGeometry {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  const aspect = settings.slide.aspectWidth / settings.slide.aspectHeight;
  const axisExtent = settings.motion.axis === "vertical" ? safeHeight : safeWidth;
  const crossExtent = settings.motion.axis === "vertical" ? safeWidth : safeHeight;
  const limitingWidth = settings.motion.axis === "vertical" ? crossExtent : axisExtent;
  const slideWidth = Math.max(80, limitingWidth * settings.slide.scale);
  const slideHeight = slideWidth / Math.max(0.1, aspect);
  const primarySize = settings.motion.axis === "vertical" ? slideHeight : slideWidth;
  const stride = primarySize * (1 + settings.motion.gap);
  const visibleRadius = axisExtent * 0.58 + primarySize;
  return {
    viewportWidth: safeWidth,
    viewportHeight: safeHeight,
    slideWidth,
    slideHeight,
    stride,
    visibleRadius,
    crossExtent,
  };
}

function pathPoint(
  flow: Flow,
  normalized: number,
  curvature: number,
  depth: number,
  crossExtent: number,
): PathPoint {
  const n = normalized;
  const absN = Math.abs(n);
  const c = clamp(curvature, 0, 1);
  const d = Math.max(0, depth);
  const crossScale = crossExtent * (0.02 + c * 0.145);

  switch (flow) {
    case "straight":
      return { cross: 0, z: -d * 0.22 * n * n };
    case "arc":
      return {
        cross: -Math.sign(n || 1) * crossScale * 0.56 * n * n,
        z: -d * 0.86 * n * n,
      };
    case "ribbon":
      return {
        cross: Math.sin(n * Math.PI * 0.92) * crossScale * 0.74,
        z: -d * (0.18 * absN + 0.82 * n * n),
      };
    case "cylinder": {
      const angle = n * (0.9 + c * 1.55);
      return {
        cross: Math.sin(angle) * crossScale,
        z: -d * (1 - Math.cos(angle)) * 1.12,
      };
    }
    case "tunnel":
      return {
        cross: Math.sin(n * Math.PI * 1.18) * crossScale * 0.32,
        z: -d * Math.pow(absN, 1.35),
      };
    case "helix": {
      const angle = n * Math.PI * (1.25 + c * 2.4);
      return {
        cross: Math.sin(angle) * crossScale * 0.88,
        z: -d * (0.32 * absN + 0.68 * (1 - Math.cos(angle)) * 0.5),
      };
    }
    case "orbit": {
      const angle = n * Math.PI * (0.82 + c * 0.92);
      return {
        cross: Math.sin(angle) * crossScale * 1.08,
        z: -d * (1 - Math.cos(angle)) * 0.92,
      };
    }
    case "cascade": {
      const stair = Math.sin(n * Math.PI * 1.45) + 0.28 * Math.sin(n * Math.PI * 4.35);
      return {
        cross: stair * crossScale * 0.62,
        z: -d * (Math.pow(absN, 1.16) + 0.12 * Math.pow(Math.sin(n * Math.PI * 1.8), 2)),
      };
    }
    case "lemniscate": {
      const angle = n * Math.PI * (0.86 + c * 0.48);
      const sine = Math.sin(angle);
      const cosine = Math.cos(angle);
      const denominator = 1 + cosine * cosine;
      return {
        cross: (sine / denominator) * crossScale * 1.28,
        z: -d * ((1 - Math.cos(angle * 2)) * 0.42 + absN * 0.2),
      };
    }
    case "switchback": {
      const switchWave = Math.sin(n * Math.PI * 1.62) + 0.27 * Math.sin(n * Math.PI * 4.86);
      return {
        cross: switchWave * crossScale * 0.76,
        z: -d * (Math.pow(absN, 1.12) + 0.1 * (1 - Math.cos(n * Math.PI * 3.1))),
      };
    }
  }
}

function pathDerivative(
  flow: Flow,
  normalized: number,
  curvature: number,
  depth: number,
  crossExtent: number,
  primaryScale: number,
): { primary: number; cross: number; z: number; bend: number } {
  const before = pathPoint(flow, normalized - DERIVATIVE_STEP, curvature, depth, crossExtent);
  const center = pathPoint(flow, normalized, curvature, depth, crossExtent);
  const after = pathPoint(flow, normalized + DERIVATIVE_STEP, curvature, depth, crossExtent);
  const divisor = DERIVATIVE_STEP * 2;
  const primary = Math.max(1, primaryScale);
  const cross = (after.cross - before.cross) / divisor;
  const z = (after.z - before.z) / divisor;

  const tangentLength = Math.hypot(primary, cross, z) || 1;
  const tangentPrimary = primary / tangentLength;
  const tangentCross = cross / tangentLength;
  const tangentZ = z / tangentLength;

  const prior = pathPoint(flow, normalized - DERIVATIVE_STEP * 2, curvature, depth, crossExtent);
  const next = pathPoint(flow, normalized + DERIVATIVE_STEP * 2, curvature, depth, crossExtent);
  const secondCross = (next.cross - 2 * center.cross + prior.cross) / Math.pow(DERIVATIVE_STEP * 2, 2);
  const secondZ = (next.z - 2 * center.z + prior.z) / Math.pow(DERIVATIVE_STEP * 2, 2);
  const bend = clamp(Math.hypot(secondCross, secondZ) / Math.max(1, primaryScale * 8), 0, 1);

  return { primary: tangentPrimary, cross: tangentCross, z: tangentZ, bend };
}

export function distanceAtTime(settings: StudioSettings, geometry: CarouselGeometry, time: number): number {
  const baseVelocity = settings.motion.speed * geometry.stride * settings.motion.direction;
  if (settings.motion.reducedMotionOutput) return 0;
  if (settings.motion.seamless) {
    const loopDistance = geometry.stride * Math.max(1, settings.motion.seamlessLoops);
    const normalizedTime = settings.output.duration > 0 ? time / settings.output.duration : 0;
    return normalizedTime * loopDistance * settings.motion.direction;
  }
  return baseVelocity * time;
}

export function velocityAtTime(settings: StudioSettings, geometry: CarouselGeometry): number {
  if (settings.motion.reducedMotionOutput) return 0;
  if (settings.motion.seamless) {
    const loopDistance = geometry.stride * Math.max(1, settings.motion.seamlessLoops);
    return (loopDistance / Math.max(0.001, settings.output.duration)) * settings.motion.direction;
  }
  return settings.motion.speed * geometry.stride * settings.motion.direction;
}

export function evaluateSlide(
  logicalIndex: number,
  distance: number,
  itemCount: number,
  settings: StudioSettings,
  geometry: CarouselGeometry,
): EvaluatedSlide {
  const cycle = geometry.stride * Math.max(1, itemCount);
  const unwrapped = logicalIndex * geometry.stride - distance;
  const primary = itemCount > 1 ? wrapCentered(unwrapped, cycle) : unwrapped;
  const normalized = primary / Math.max(1, geometry.visibleRadius);
  const depth = settings.motion.depth * geometry.visibleRadius;
  const path = pathPoint(settings.motion.flow, normalized, settings.motion.curvature, depth, geometry.crossExtent);
  const tangent = pathDerivative(
    settings.motion.flow,
    normalized,
    settings.motion.curvature,
    depth,
    geometry.crossExtent,
    geometry.visibleRadius,
  );

  const maximumBank = settings.motion.tilt * DEG * (0.42 + settings.motion.bank * 1.58);
  const tangentRoll = Math.atan2(tangent.cross, Math.max(0.001, tangent.primary));
  const tangentPitch = Math.atan2(-tangent.z, Math.max(0.001, tangent.primary));
  const softTwist = Math.sin(normalized * Math.PI) * settings.motion.tilt * DEG * 0.18;
  const bankStrength = 0.28 + settings.motion.bank * 0.72;

  let rotationX = 0;
  let rotationY = 0;
  let rotationZ = clamp(tangentRoll * bankStrength + softTwist, -maximumBank, maximumBank);
  if (settings.motion.axis === "vertical") {
    rotationX = clamp(tangentPitch * bankStrength, -maximumBank, maximumBank);
  } else {
    rotationY = clamp(-tangentPitch * bankStrength, -maximumBank, maximumBank);
  }

  if (settings.motion.flow === "helix" || settings.motion.flow === "orbit") {
    const orbitTwist = Math.sin(normalized * Math.PI * 1.15) * maximumBank * 0.34;
    rotationZ = clamp(rotationZ + orbitTwist, -maximumBank, maximumBank);
  }

  const focus = Math.exp(-Math.pow(normalized / 0.78, 2));
  const depthScale = clamp(1 + path.z / Math.max(1, geometry.visibleRadius) * 0.34, 0.62, 1.08);
  const scale = depthScale * (1 + focus * settings.motion.focusScale);
  const edge = clamp(1 - Math.pow(Math.abs(normalized), 1.55) * settings.motion.edgeFade, 0, 1);
  const opacity = clamp(edge * (0.72 + focus * 0.28), 0, 1);
  const pathBend = clamp(tangent.bend + Math.abs(tangent.z) * 0.46 + Math.abs(tangent.cross) * 0.22, 0, 1);

  return {
    primary,
    cross: path.cross,
    z: path.z,
    rotationX,
    rotationY,
    rotationZ,
    scale,
    opacity,
    normalized,
    tangentPrimary: tangent.primary,
    tangentCross: tangent.cross,
    tangentZ: tangent.z,
    pathBend,
  };
}

export function isPotentiallyVisible(evaluated: EvaluatedSlide, geometry: CarouselGeometry): boolean {
  return Math.abs(evaluated.primary) <= geometry.visibleRadius * 1.35 && evaluated.opacity > 0.015;
}

export function selectRenderableItems<T extends { evaluated: EvaluatedSlide }>(items: T[], maximum: number): T[] {
  return items
    .filter((item) => Number.isFinite(item.evaluated.primary) && Number.isFinite(item.evaluated.z))
    .sort((a, b) => {
      const distanceDifference = Math.abs(a.evaluated.primary) - Math.abs(b.evaluated.primary);
      if (Math.abs(distanceDifference) > 0.000_001) return distanceDifference;
      return b.evaluated.z - a.evaluated.z;
    })
    .slice(0, Math.max(0, maximum));
}
'''

SHADERS = r'''export const slideVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vWarp;
  varying float vSurfaceLight;
  uniform float uVelocity;
  uniform float uDistortion;
  uniform float uAxis;
  uniform float uPhase;
  uniform float uTime;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    float along = mix(position.x, position.y, uAxis);
    float across = mix(position.y, position.x, uAxis);
    float envelope = smoothstep(0.0, 0.16, 0.5 - abs(along));
    float crossEnvelope = smoothstep(0.0, 0.18, 0.5 - abs(across));
    float velocity = clamp(uVelocity, -1.0, 1.0);
    float surface = floor(max(0.0, uPhase));
    float slidePhase = fract(uPhase);
    float energy = clamp(abs(velocity) * 0.82 + 0.12, 0.0, 1.0) * uDistortion;
    float direction = sign(velocity + 0.0001);
    float phase = uTime + slidePhase * 6.28318530718;
    float warp = 0.0;
    float shear = 0.0;

    if (surface < 0.5) {
      // Card: mostly rigid, with a restrained bow and a crisp torsional edge.
      float bow = (1.0 - across * across * 4.0) * (1.0 - along * along * 3.4);
      warp = bow * energy * 19.0 + across * along * direction * energy * 14.0;
      shear = across * direction * energy * 0.004;
    } else if (surface < 1.5) {
      // Paper: cylindrical curl, slight buckle, no rubbery high-frequency wobble.
      float curl = along * along * direction * 74.0;
      float buckle = sin(along * 8.4 + phase) * envelope * 14.0;
      warp = (curl + buckle) * energy * (0.68 + crossEnvelope * 0.32);
      shear = sin(across * 4.2 + phase) * envelope * energy * 0.006;
    } else if (surface < 2.5) {
      // Silk: broad travelling folds with pinned, quiet edges.
      float foldA = sin(along * 10.0 - phase + across * 2.2);
      float foldB = sin(along * 4.4 + phase * 2.0 - across * 7.0) * 0.48;
      float bias = sin(across * 5.0 + phase) * 0.24;
      warp = (foldA + foldB + bias) * envelope * crossEnvelope * energy * 48.0;
      shear = (foldB + bias) * envelope * energy * 0.012;
    } else {
      // Gel: one coherent elastic mass, with a delayed velocity bulge.
      float radius = length(vec2(along * 1.15, across));
      float bulge = cos(radius * 7.4 - phase) * smoothstep(0.72, 0.0, radius);
      float lag = velocity * along * 26.0;
      warp = (bulge * 42.0 + lag) * energy;
      shear = velocity * across * energy * 0.008;
    }

    if (uAxis > 0.5) {
      transformed.x += shear;
    } else {
      transformed.y += shear;
    }
    transformed.z += warp;
    vWarp = warp;
    vSurfaceLight = clamp(0.5 + warp * 0.0065 + across * direction * energy * 0.18, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

export const slideFragmentShader = /* glsl */ `
  #include <common>
  #include <colorspace_pars_fragment>
  uniform sampler2D uTexture;
  uniform vec2 uTextureSize;
  uniform vec2 uPlaneSize;
  uniform vec2 uSizePx;
  uniform vec2 uFocal;
  uniform float uFitMode;
  uniform float uRadiusPx;
  uniform float uSmoothing;
  uniform float uBorderPx;
  uniform vec3 uBorderColor;
  uniform float uBorderOpacity;
  uniform float uOpacity;
  uniform float uVelocity;
  uniform float uDistortion;
  uniform float uPhase;
  varying vec2 vUv;
  varying float vWarp;
  varying float vSurfaceLight;

  float superellipseDistance(vec2 point, vec2 halfSize, float exponent) {
    vec2 normalized = abs(point) / max(halfSize, vec2(0.0001));
    return pow(pow(normalized.x, exponent) + pow(normalized.y, exponent), 1.0 / exponent) - 1.0;
  }

  float hash12(vec2 point) {
    vec3 point3 = fract(vec3(point.xyx) * 0.1031);
    point3 += dot(point3, point3.yzx + 33.33);
    return fract((point3.x + point3.y) * point3.z);
  }

  void main() {
    vec2 uv = vUv;
    float planeAspect = uPlaneSize.x / max(1.0, uPlaneSize.y);
    float textureAspect = uTextureSize.x / max(1.0, uTextureSize.y);
    vec2 coverScale = vec2(1.0);
    if (textureAspect > planeAspect) {
      coverScale.x = planeAspect / textureAspect;
    } else {
      coverScale.y = textureAspect / planeAspect;
    }
    vec2 containScale = vec2(1.0);
    if (textureAspect > planeAspect) {
      containScale.y = textureAspect / planeAspect;
    } else {
      containScale.x = planeAspect / textureAspect;
    }
    vec2 scale = mix(coverScale, containScale, uFitMode);
    vec2 centered = (uv - uFocal) * scale;
    vec2 sampleUv = centered + uFocal;

    float bend = sin((uv.y + uPhase * 0.27) * 3.14159265) * uVelocity * uDistortion * 0.012;
    sampleUv.x += bend;
    vec4 sampled = texture2D(uTexture, clamp(sampleUv, 0.0, 1.0));

    if (uFitMode > 0.5) {
      vec2 halfCoverage = vec2(0.5) / max(containScale, vec2(0.0001));
      vec2 coverageCenter = vec2(0.5);
      float inside = step(abs(sampleUv.x - coverageCenter.x), halfCoverage.x) *
        step(abs(sampleUv.y - coverageCenter.y), halfCoverage.y);
      sampled.a *= inside;
    }

    vec2 pointPx = (vUv - 0.5) * uSizePx;
    vec2 halfSize = uSizePx * 0.5;
    float smoothExponent = mix(2.0, 5.5, clamp(uSmoothing, 0.0, 1.0));
    vec2 roundedHalf = max(vec2(1.0), halfSize - vec2(uRadiusPx));
    float ellipse = superellipseDistance(pointPx, roundedHalf, smoothExponent);
    float cornerDistance = ellipse * max(1.0, uRadiusPx);
    float alphaMask = 1.0 - smoothstep(-1.25, 1.25, cornerDistance);
    float innerDistance = cornerDistance + uBorderPx;
    float innerMask = 1.0 - smoothstep(-1.25, 1.25, innerDistance);
    float borderMask = max(0.0, alphaMask - innerMask);

    float fabricShade = mix(0.955, 1.055, vSurfaceLight);
    float grazing = smoothstep(10.0, 54.0, abs(vWarp)) * 0.035;
    sampled.rgb = sampled.rgb * fabricShade + grazing;

    // Slide-locked grain: tactile, but stable across frames and seamless loops.
    vec2 grainCell = floor(vUv * max(uSizePx, vec2(1.0)));
    float grain = hash12(grainCell + vec2(uPhase * 41.0, uPhase * 73.0)) - 0.5;
    sampled.rgb += grain * 0.012;
    sampled.rgb = mix(sampled.rgb, uBorderColor, borderMask * uBorderOpacity);
    sampled.a *= alphaMask * uOpacity;
    if (sampled.a <= 0.001) discard;
    gl_FragColor = sampled;
    #include <colorspace_fragment>
  }
`;

export const shadowVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const shadowFragmentShader = /* glsl */ `
  uniform vec2 uSizePx;
  uniform float uRadiusPx;
  uniform float uSmoothing;
  uniform float uSoftness;
  uniform float uOpacity;
  varying vec2 vUv;

  float superellipseDistance(vec2 point, vec2 halfSize, float exponent) {
    vec2 normalized = abs(point) / max(halfSize, vec2(0.0001));
    return pow(pow(normalized.x, exponent) + pow(normalized.y, exponent), 1.0 / exponent) - 1.0;
  }

  void main() {
    vec2 size = uSizePx + vec2(uSoftness * 2.0);
    vec2 pointPx = (vUv - 0.5) * size;
    vec2 halfSize = size * 0.5;
    float exponent = mix(2.0, 5.5, clamp(uSmoothing, 0.0, 1.0));
    vec2 roundedHalf = max(vec2(1.0), halfSize - vec2(uRadiusPx + uSoftness * 0.3));
    float distance = superellipseDistance(pointPx, roundedHalf, exponent) * max(1.0, uRadiusPx + uSoftness);
    float alpha = (1.0 - smoothstep(-uSoftness, uSoftness, distance)) * uOpacity;
    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
  }
`;

export const backgroundVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export const backgroundFragmentShader = /* glsl */ `
  #include <common>
  #include <colorspace_pars_fragment>
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uAccent;
  uniform float uStyle;
  uniform float uIntensity;
  uniform float uMotion;
  uniform float uGrain;
  uniform float uVignette;
  uniform float uSeed;
  uniform float uTime;
  uniform float uTransparent;
  varying vec2 vUv;

  float hash12(vec2 point) {
    vec3 point3 = fract(vec3(point.xyx) * 0.1031);
    point3 += dot(point3, point3.yzx + 33.33);
    return fract((point3.x + point3.y) * point3.z);
  }

  void main() {
    if (uTransparent > 0.5 || uStyle < 0.5) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec2 centered = vUv - 0.5;
    float time = uTime * uMotion;
    vec3 color = mix(uColorA, uColorB, vUv.y);
    if (uStyle > 1.5 && uStyle < 2.5) {
      float radial = smoothstep(0.8, 0.08, length(centered - vec2(sin(time * 0.17), cos(time * 0.13)) * 0.12));
      color = mix(color, uAccent, radial * 0.72 * uIntensity);
    } else if (uStyle > 2.5 && uStyle < 3.5) {
      float wave = sin((vUv.x + vUv.y * 0.6 + time * 0.04) * 9.0 + uSeed) * 0.5 + 0.5;
      color = mix(color, uAccent, wave * 0.18 * uIntensity);
    } else if (uStyle > 3.5 && uStyle < 4.5) {
      float dust = pow(hash12(floor(vUv * vec2(180.0, 320.0)) + uSeed), 18.0);
      color += dust * uAccent * 0.35 * uIntensity;
    } else if (uStyle > 4.5) {
      float glow = exp(-length(centered) * 4.6);
      color = mix(uColorA * 0.45, uAccent, glow * 0.42 * uIntensity);
    }
    float vignette = smoothstep(0.82, 0.18, length(centered));
    color *= mix(1.0 - uVignette * 0.65, 1.0, vignette);
    float grain = hash12(gl_FragCoord.xy + vec2(uSeed * 11.0, uTime * 0.2)) - 0.5;
    color += grain * uGrain * 0.085;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;
'''

TESTS = r'''import { describe, expect, it } from "vitest";
import { cloneSettings, DEFAULT_SETTINGS, type DynamicsMode, type Flow, type SurfaceMode } from "../src/model";
import { deriveCarouselGeometry, evaluateSlide } from "../src/engine/evaluate";
import {
  applyMotionImpulse,
  DYNAMICS_PROFILES,
  integrateMotionState,
  surfaceModeIndex,
  surfacePhaseAtTime,
} from "../src/engine/spatialDynamics";
import { slideFragmentShader, slideVertexShader } from "../src/engine/shaders";

const FLOWS: Flow[] = [
  "straight",
  "arc",
  "ribbon",
  "cylinder",
  "tunnel",
  "helix",
  "orbit",
  "cascade",
  "lemniscate",
  "switchback",
];
const DYNAMICS: DynamicsMode[] = ["direct", "weighted", "spring", "drift"];
const SURFACES: SurfaceMode[] = ["card", "paper", "silk", "gel"];

describe("spatial path evaluator", () => {
  it("keeps every path finite across both axes and extreme authored controls", () => {
    for (const axis of ["horizontal", "vertical"] as const) {
      for (const flow of FLOWS) {
        const settings = cloneSettings(DEFAULT_SETTINGS);
        settings.motion.axis = axis;
        settings.motion.flow = flow;
        settings.motion.curvature = 1;
        settings.motion.depth = 1;
        settings.motion.tilt = 18;
        settings.motion.bank = 1;
        const geometry = deriveCarouselGeometry(settings, 1080, 1920);
        for (let distance = -geometry.stride * 10; distance <= geometry.stride * 10; distance += geometry.stride * 0.37) {
          for (let index = 0; index < 12; index += 1) {
            const value = evaluateSlide(index, distance, 12, settings, geometry);
            for (const number of Object.values(value)) expect(Number.isFinite(number)).toBe(true);
            expect(Math.hypot(value.tangentPrimary, value.tangentCross, value.tangentZ)).toBeCloseTo(1, 5);
            expect(value.opacity).toBeGreaterThanOrEqual(0);
            expect(value.opacity).toBeLessThanOrEqual(1);
            expect(value.pathBend).toBeGreaterThanOrEqual(0);
            expect(value.pathBend).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("makes the authored paths materially distinct instead of renaming one curve", () => {
    const signatures = FLOWS.map((flow) => {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      settings.motion.flow = flow;
      settings.motion.curvature = 0.82;
      settings.motion.depth = 0.74;
      const geometry = deriveCarouselGeometry(settings, 1080, 1920);
      return [-2, -1, 1, 2]
        .map((index) => {
          const value = evaluateSlide(index, 0, 8, settings, geometry);
          return `${value.cross.toFixed(2)}:${value.z.toFixed(2)}:${value.rotationZ.toFixed(3)}`;
        })
        .join("|");
    });
    expect(new Set(signatures).size).toBe(FLOWS.length);
  });
});

describe("bounded preview dynamics", () => {
  it("stays close across 60 Hz and 120 Hz integration", () => {
    for (const mode of DYNAMICS) {
      let sixty = { position: 0, velocity: 0, acceleration: 0 };
      let oneTwenty = { position: 0, velocity: 0, acceleration: 0 };
      for (let frame = 0; frame < 60; frame += 1) {
        sixty = integrateMotionState(sixty, 240, 1 / 60, mode, 600);
      }
      for (let frame = 0; frame < 120; frame += 1) {
        oneTwenty = integrateMotionState(oneTwenty, 240, 1 / 120, mode, 600);
      }
      expect(sixty.position).toBeCloseTo(oneTwenty.position, 0);
      expect(sixty.velocity).toBeCloseTo(oneTwenty.velocity, 0);
      expect(Number.isFinite(sixty.acceleration)).toBe(true);
    }
  });

  it("bounds pathological frame gaps and pointer impulses", () => {
    for (const mode of DYNAMICS) {
      const profile = DYNAMICS_PROFILES[mode];
      const impulse = applyMotionImpulse(
        { position: 0, velocity: Number.POSITIVE_INFINITY, acceleration: Number.NaN },
        1_000_000,
        0,
        mode,
        700,
      );
      const next = integrateMotionState(impulse, -1_000_000, 10, mode, 700);
      expect(Math.abs(next.velocity)).toBeLessThanOrEqual(profile.maximumVelocity * 700);
      expect(Math.abs(next.acceleration)).toBeLessThanOrEqual(profile.maximumAcceleration * 700);
      expect(Object.values(next).every(Number.isFinite)).toBe(true);
    }
  });

  it("gives each physics character a distinct response", () => {
    const responses = DYNAMICS.map((mode) => integrateMotionState(
      { position: 0, velocity: 0, acceleration: 0 },
      300,
      1 / 20,
      mode,
      600,
    ).velocity.toFixed(5));
    expect(new Set(responses).size).toBe(DYNAMICS.length);
  });
});

describe("fabric surface contract", () => {
  it("maps four explicit surfaces to four stable shader branches", () => {
    expect(SURFACES.map(surfaceModeIndex)).toEqual([0, 1, 2, 3]);
    expect(slideVertexShader).toContain("Card: mostly rigid");
    expect(slideVertexShader).toContain("Paper: cylindrical curl");
    expect(slideVertexShader).toContain("Silk: broad travelling folds");
    expect(slideVertexShader).toContain("Gel: one coherent elastic mass");
  });

  it("uses stable slide-space grain instead of frame-shimmering grain", () => {
    expect(slideFragmentShader).toContain("Slide-locked grain");
    expect(slideFragmentShader).not.toContain("fract(uTime)");
  });

  it("closes surface motion exactly for seamless export and freezes reduced motion", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 3;
    settings.output.duration = 8;
    const start = surfacePhaseAtTime(settings, 0, true, false);
    const end = surfacePhaseAtTime(settings, settings.output.duration, true, false);
    expect((end - start) / (Math.PI * 2)).toBeCloseTo(3, 10);
    settings.motion.reducedMotionOutput = true;
    expect(surfacePhaseAtTime(settings, 7.25, true, false)).toBe(0);
    expect(surfacePhaseAtTime(settings, 7.25, false, true)).toBe(0);
  });
});
'''

DOC = r'''# Spatial Fabric Dynamics — Gauntlet Record

Branch focus: **3Dness, paths, fabrics, physics. Nothing ornamental.**

## Actual goal

Make a slide carousel feel like matter moving through space—not flat cards receiving decorative wobble. The system must remain director-controllable, deterministic at export, safe at hostile settings, and light enough to preserve the existing bounded renderer.

## What changed

### 1. Coherent spatial paths

The evaluator now treats every flow as a parametric path with a numerical tangent. Slide banking comes from that tangent rather than a disconnected rotation preset. Depth, cross-axis displacement, scale, opacity, and orientation therefore describe one movement.

Ten flows ship: Straight, Arc, Ribbon, Cylinder, Tunnel, Helix, Orbit, Cascade, Figure Eight, and Switchback. `bank` controls how strongly tangent direction becomes slide orientation. All formulas are bounded and finite at minimum and maximum authored values.

### 2. Material characters, not generic wobble

The slide vertex shader contains four deliberately different deformation models:

- **Card:** restrained bow plus torsional edge.
- **Paper:** cylindrical curl and low-frequency buckle.
- **Silk:** broad travelling folds with quiet, pinned edges.
- **Gel:** coherent radial bulge with elastic lag.

Velocity drives deformation energy. `Fabric flex` remains the single amplitude control, preventing a cockpit of meaningless sliders. The fragment shader adds restrained grazing light and frame-stable, slide-space grain. It does not use time-varying slide grain, so exports do not shimmer.

### 3. Real thickness

Each slide has a bounded box shell behind the shader-deformed front plane. `3D thickness` is measured in scene pixels. It produces side faces under path banking, rather than faking every depth cue with a drop shadow. The shell shares the existing bounded pool; it adds no unbounded scene allocation.

### 4. Physics with a hard boundary

Preview motion uses a fixed-substep, semi-implicit second-order integrator. Four characters alter response, damping, coast, and impulse transfer: Direct, Weighted, Spring, and Drift.

Velocity and acceleration are clamped relative to slide stride. Delta time is capped and subdivided. Pointer/wheel impulses are bounded before entering state.

**Export does not integrate preview state.** Export distance and velocity remain analytic functions of settings and timestamp. This prevents frame-rate history, pointer history, and preview jank from changing rendered output.

### 5. Loop and reduced-motion contracts

Fabric phase uses an integer number of turns in seamless export, so the closing frame returns to the opening phase. Reduced-motion output and reduced-motion preview freeze fabric phase and inertial motion while preserving static spatial composition.

## Guardrails

- No cloth solver dependency. A full constraint mesh would multiply state, tuning, failure modes, and export risk for little editorial gain at Instagram scale.
- No GPU-compute dependency. The bounded vertex model gives the material read without requiring WebGPU or floating-point simulation textures.
- No new draw-call growth with asset count. Pool size remains bounded; the shell is one additional pooled mesh per resident slide.
- No background or lens-system expansion. Parallel branches own those concerns.
- Existing settings files remain schema-v1 compatible: missing branch-extension fields hydrate to defaults; malformed supplied fields still fail validation.

## Gauntlet gates

1. Every flow finite across both axes, all indices, large positive/negative travel, and control maxima.
2. Tangents remain normalized and banking remains bounded.
3. Physics remains finite after invalid state, pathological impulses, and 10-second frame gaps.
4. 60 Hz and 120 Hz integration stay materially close.
5. Every surface maps to a distinct shader branch.
6. Fabric phase closes over seamless duration and freezes for reduced motion.
7. Typecheck, unit tests, production build, and end-to-end suite pass before merge.

## Research translated into decisions

The useful pattern from high-end WebGL carousels is not “add Three.js.” It is the coupling of scroll velocity, curved geometry, and shader deformation. Three.js curve/tangent primitives reinforce the same architectural point: orientation should follow the path derivative. GPU computation helpers were reviewed, then rejected for this branch because deterministic bounded deformation solves the actual product need with less runtime and export complexity.

References:

- Codrops, *Building a WebGL Carousel with React Three Fiber and GSAP*: https://tympanus.net/codrops/2023/04/27/building-a-webgl-carousel-with-react-three-fiber-and-gsap/
- Three.js `Curve` and tangent APIs: https://threejs.org/docs/#api/en/extras/core/Curve
- Three.js `TubeGeometry`: https://threejs.org/docs/#api/en/geometries/TubeGeometry
- Three.js `GPUComputationRenderer`: https://threejs.org/docs/#examples/en/misc/GPUComputationRenderer
'''
