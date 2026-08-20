import type { StudioSettings } from "../model";

export interface SlideGeometry {
  width: number;
  height: number;
  stride: number;
  axisExtent: number;
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
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

export function getLogicalSlotCount(assetCount: number, geometry: SlideGeometry): number {
  if (assetCount <= 0) return 0;
  const minimum = Math.ceil(geometry.axisExtent / Math.max(1, geometry.stride)) + 5;
  // The virtual strip must end on a complete asset cycle. Otherwise a padded
  // strip of 9 slots for 8 assets produces ...7,0,0,1... at the wrap seam.
  return Math.max(assetCount, Math.ceil(minimum / assetCount) * assetCount);
}

export function distanceAtTime(settings: StudioSettings, time: number, slotCount: number, stride: number, exportMode: boolean): number {
  if (settings.motion.reducedMotionOutput && exportMode) return 0;
  const direction = settings.motion.direction;
  if (exportMode && settings.motion.seamless && slotCount > 0) {
    const phase = time / Math.max(0.001, settings.output.duration);
    return direction * slotCount * stride * Math.max(1, Math.round(settings.motion.seamlessLoops)) * phase;
  }
  return direction * settings.motion.speed * stride * Math.max(0, time);
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

export function evaluateSlide(
  index: number,
  slotCount: number,
  distance: number,
  settings: StudioSettings,
  geometry: SlideGeometry,
): EvaluatedSlide {
  if (slotCount <= 0) {
    return { primary: 0, cross: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scale: 1, opacity: 0, normalized: 0 };
  }

  const loopLength = slotCount * geometry.stride;
  let primary = positiveModulo(index * geometry.stride - distance + loopLength / 2, loopLength) - loopLength / 2;
  if (Object.is(primary, -0)) primary = 0;

  const visibleRadius = geometry.axisExtent / 2 + geometry.stride;
  const normalized = clamp(primary / Math.max(1, visibleRadius), -1.4, 1.4);
  const abs = Math.abs(normalized);
  const depth = settings.motion.depth * geometry.crossExtent;
  const curve = settings.motion.curvature;
  const tilt = (settings.motion.tilt * Math.PI) / 180;
  let cross = 0;
  let z = 0;
  let rotationX = 0;
  let rotationY = 0;
  let rotationZ = 0;

  switch (settings.motion.flow) {
    case "arc":
      cross = -curve * geometry.crossExtent * 0.07 * normalized * normalized;
      z = -depth * normalized * normalized;
      rotationZ = -normalized * tilt * 0.42;
      rotationY = settings.motion.axis === "horizontal" ? -normalized * tilt : 0;
      rotationX = settings.motion.axis === "vertical" ? normalized * tilt : 0;
      break;
    case "ribbon":
      cross = Math.sin(normalized * Math.PI * 0.9) * curve * geometry.crossExtent * 0.1;
      z = -depth * (0.18 + 0.82 * normalized * normalized);
      rotationZ = Math.sin(normalized * Math.PI) * tilt * 0.45;
      rotationY = settings.motion.axis === "horizontal" ? -normalized * tilt * 0.65 : 0;
      rotationX = settings.motion.axis === "vertical" ? normalized * tilt * 0.65 : 0;
      break;
    case "cylinder": {
      const angle = normalized * curve * 1.45;
      cross = Math.sin(angle) * geometry.crossExtent * 0.08;
      z = -depth * (1 - Math.cos(angle));
      rotationY = settings.motion.axis === "horizontal" ? -angle * 0.62 : Math.sin(angle) * tilt * 0.25;
      rotationX = settings.motion.axis === "vertical" ? angle * 0.62 : 0;
      rotationZ = -normalized * tilt * 0.22;
      break;
    }
    case "tunnel":
      cross = Math.sin(normalized * Math.PI * 1.2) * curve * geometry.crossExtent * 0.045;
      z = -depth * Math.pow(abs, 1.35);
      rotationY = settings.motion.axis === "horizontal" ? -normalized * tilt : normalized * tilt * 0.18;
      rotationX = settings.motion.axis === "vertical" ? normalized * tilt : 0;
      rotationZ = Math.sign(normalized) * tilt * Math.pow(abs, 1.4) * 0.46;
      break;
    case "straight":
    default:
      z = -depth * normalized * normalized * 0.28;
      rotationZ = -normalized * tilt * 0.12;
      break;
  }

  const focus = 1 - clamp(abs, 0, 1);
  const scale = 1 + settings.motion.focusScale * focus;
  const opacity = clamp(1 - settings.motion.edgeFade * Math.pow(abs, 1.6), 0.08, 1);
  return { primary, cross, z, rotationX, rotationY, rotationZ, scale, opacity, normalized };
}

export function isPotentiallyVisible(evaluated: EvaluatedSlide, geometry: SlideGeometry): boolean {
  return Math.abs(evaluated.primary) <= geometry.axisExtent / 2 + geometry.stride * 1.25;
}
