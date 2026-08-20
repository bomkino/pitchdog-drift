import type { Flow, StudioSettings } from "../model";

export interface SlideGeometry {
  width: number;
  height: number;
  stride: number;
  axisExtent: number;
  crossExtent: number;
}

export interface CarouselGeometry extends SlideGeometry {
  viewportWidth: number;
  viewportHeight: number;
  slideWidth: number;
  slideHeight: number;
  visibleRadius: number;
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

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function positiveModulo(value: number, modulus: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) return 0;
  return ((value % modulus) + modulus) % modulus;
}

export function getSlideGeometry(settings: StudioSettings): SlideGeometry {
  const aspect = settings.slide.aspectWidth / Math.max(0.01, settings.slide.aspectHeight);
  const width = settings.stage.width * clamp(settings.slide.scale, 0.2, 1.25);
  const height = width / aspect;
  const extent = settings.motion.axis === "horizontal" ? width : height;
  const stride = extent * (1 + clamp(settings.motion.gap, 0, 1.5));
  return {
    width,
    height,
    stride,
    axisExtent: settings.motion.axis === "horizontal" ? settings.stage.width : settings.stage.height,
    crossExtent: settings.motion.axis === "horizontal" ? settings.stage.height : settings.stage.width,
  };
}

export function deriveCarouselGeometry(
  settings: StudioSettings,
  viewportWidth: number,
  viewportHeight: number,
): CarouselGeometry {
  const widthPx = Math.max(1, viewportWidth);
  const heightPx = Math.max(1, viewportHeight);
  const aspect = settings.slide.aspectWidth / Math.max(0.01, settings.slide.aspectHeight);
  const width = widthPx * clamp(settings.slide.scale, 0.2, 1.25);
  const height = width / aspect;
  const extent = settings.motion.axis === "horizontal" ? width : height;
  const stride = extent * (1 + clamp(settings.motion.gap, 0, 1.5));
  const axisExtent = settings.motion.axis === "horizontal" ? widthPx : heightPx;
  const crossExtent = settings.motion.axis === "horizontal" ? heightPx : widthPx;
  return {
    width,
    height,
    stride,
    axisExtent,
    crossExtent,
    viewportWidth: widthPx,
    viewportHeight: heightPx,
    slideWidth: width,
    slideHeight: height,
    visibleRadius: axisExtent / 2 + stride,
  };
}

export function getLogicalSlotCount(assetCount: number, geometry: SlideGeometry): number {
  if (assetCount <= 0) return 0;
  const minimum = Math.ceil(geometry.axisExtent / Math.max(1, geometry.stride)) + 5;
  return Math.max(assetCount, Math.ceil(minimum / assetCount) * assetCount);
}

export function distanceAtTime(
  settings: StudioSettings,
  time: number,
  slotCount: number,
  stride: number,
  exportMode: boolean,
): number {
  if (settings.motion.reducedMotionOutput && exportMode) return 0;
  if (exportMode && settings.motion.seamless && slotCount > 0) {
    const phase = time / Math.max(0.001, settings.output.duration);
    return settings.motion.direction
      * slotCount
      * stride
      * Math.max(1, Math.round(settings.motion.seamlessLoops))
      * phase;
  }
  return settings.motion.direction * settings.motion.speed * stride * Math.max(0, time);
}

export function velocityAtTime(
  settings: StudioSettings,
  slotCount: number,
  stride: number,
  exportMode: boolean,
): number {
  if (exportMode && settings.motion.reducedMotionOutput) return 0;
  if (exportMode && settings.motion.seamless && slotCount > 0) {
    return settings.motion.direction
      * slotCount
      * stride
      * Math.max(1, Math.round(settings.motion.seamlessLoops))
      / Math.max(0.001, settings.output.duration);
  }
  return settings.motion.direction * settings.motion.speed * stride;
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
  const crossScale = crossExtent * c * 0.16;

  switch (flow) {
    case "straight":
      return { cross: 0, z: -d * 0.22 * n * n };
    case "arc":
      return {
        cross: -crossScale * 0.56 * n * n,
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
    default:
      return { cross: 0, z: 0 };
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
  const length = Math.hypot(primary, cross, z) || 1;

  const prior = pathPoint(flow, normalized - DERIVATIVE_STEP * 2, curvature, depth, crossExtent);
  const next = pathPoint(flow, normalized + DERIVATIVE_STEP * 2, curvature, depth, crossExtent);
  const secondCross = (next.cross - 2 * center.cross + prior.cross) / Math.pow(DERIVATIVE_STEP * 2, 2);
  const secondZ = (next.z - 2 * center.z + prior.z) / Math.pow(DERIVATIVE_STEP * 2, 2);
  const bend = clamp(Math.hypot(secondCross, secondZ) / Math.max(1, primaryScale * 8), 0, 1);

  return {
    primary: primary / length,
    cross: cross / length,
    z: z / length,
    bend,
  };
}

export function evaluateSlide(
  index: number,
  slotCount: number,
  distance: number,
  settings: StudioSettings,
  geometry: SlideGeometry,
): EvaluatedSlide;
export function evaluateSlide(
  index: number,
  distance: number,
  itemCount: number,
  settings: StudioSettings,
  geometry: CarouselGeometry,
): EvaluatedSlide;
export function evaluateSlide(
  index: number,
  second: number,
  third: number,
  settings: StudioSettings,
  geometry: SlideGeometry | CarouselGeometry,
): EvaluatedSlide {
  const derivedCall = "visibleRadius" in geometry;
  const itemCount = derivedCall ? third : second;
  const distance = derivedCall ? second : third;
  if (itemCount <= 0) {
    return {
      primary: 0,
      cross: 0,
      z: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      scale: 1,
      opacity: 0,
      normalized: 0,
      tangentPrimary: 1,
      tangentCross: 0,
      tangentZ: 0,
      pathBend: 0,
    };
  }

  const loopLength = itemCount * geometry.stride;
  let primary = positiveModulo(index * geometry.stride - distance + loopLength / 2, loopLength) - loopLength / 2;
  if (Object.is(primary, -0)) primary = 0;

  const visibleRadius = derivedCall
    ? (geometry as CarouselGeometry).visibleRadius
    : geometry.axisExtent / 2 + geometry.stride;
  const normalized = clamp(primary / Math.max(1, visibleRadius), -1.4, 1.4);
  const abs = Math.abs(normalized);
  const depth = clamp(settings.motion.depth, 0, 1.5) * geometry.crossExtent;
  const path = pathPoint(settings.motion.flow, normalized, settings.motion.curvature, depth, geometry.crossExtent);
  const tangent = pathDerivative(
    settings.motion.flow,
    normalized,
    settings.motion.curvature,
    depth,
    geometry.crossExtent,
    visibleRadius,
  );

  const tilt = Math.max(0, settings.motion.tilt) * DEG;
  const bank = clamp(settings.motion.bank, 0, 1);
  const tangentLimit = (4 + Math.max(0, settings.motion.tilt) * 1.5) * DEG;
  const tangentRoll = Math.atan2(tangent.cross, Math.max(0.001, tangent.primary));
  const tangentPitch = Math.atan2(-tangent.z, Math.max(0.001, tangent.primary));
  const softTwist = Math.sin(normalized * Math.PI) * tilt * 0.18;
  const bankedRoll = clamp(tangentRoll, -tangentLimit, tangentLimit) * bank;
  const bankedPitch = clamp(tangentPitch, -tangentLimit, tangentLimit) * bank;
  const combinedLimit = tilt + tangentLimit * bank;

  let rotationX = 0;
  let rotationY = 0;
  let rotationZ = bankedRoll + softTwist;
  if (settings.motion.axis === "vertical") {
    rotationX = bankedPitch;
  } else {
    rotationY = -bankedPitch;
  }
  if (settings.motion.flow === "helix" || settings.motion.flow === "orbit") {
    rotationZ += Math.sin(normalized * Math.PI * 1.15) * tangentLimit * 0.34 * bank;
  }
  rotationX = clamp(rotationX, -combinedLimit, combinedLimit);
  rotationY = clamp(rotationY, -combinedLimit, combinedLimit);
  rotationZ = clamp(rotationZ, -combinedLimit, combinedLimit);

  const focus = 1 - clamp(abs, 0, 1);
  const depthScale = clamp(1 + path.z / Math.max(1, visibleRadius) * 0.34, 0.62, 1.08);
  const scale = depthScale * (1 + settings.motion.focusScale * focus);
  const opacity = clamp(1 - settings.motion.edgeFade * Math.pow(abs, 1.6), 0.08, 1);
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

export function isPotentiallyVisible(evaluated: EvaluatedSlide, geometry: SlideGeometry): boolean {
  return Math.abs(evaluated.primary) <= geometry.axisExtent / 2 + geometry.stride * 1.25;
}

export function selectRenderableItems<T extends { evaluated: Pick<EvaluatedSlide, "primary" | "z"> }>(
  items: readonly T[],
  maximum: number,
): T[] {
  if (!Number.isSafeInteger(maximum) || maximum <= 0) return [];
  const selected = items.length <= maximum
    ? [...items]
    : [...items]
        .sort((a, b) => Math.abs(a.evaluated.primary) - Math.abs(b.evaluated.primary))
        .slice(0, maximum);
  return selected.sort((a, b) => a.evaluated.z - b.evaluated.z);
}
