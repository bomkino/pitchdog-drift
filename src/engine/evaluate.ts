import type { StudioSettings } from "../model";
import {
  editorialRegistration,
  evaluateEditorialCadence,
  remapEditorialDistance,
  type EditorialCadenceState,
} from "./editorialCadence";

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
  transitionPulse: number;
  anticipation: number;
  landingImpact: number;
  settle: number;
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

export function getLoopStrideCount(
  settings: StudioSettings,
  sourceCount: number,
  slotCount: number,
): number {
  const safeSourceCount = Number.isSafeInteger(sourceCount) && sourceCount > 0 ? sourceCount : 0;
  const safeSlotCount = Number.isSafeInteger(slotCount) && slotCount > 0 ? slotCount : 0;
  if (settings.motion.flow === "editorial") return safeSourceCount;
  return safeSlotCount;
}

export function deliverySlidesPerSecond(
  settings: StudioSettings,
  loopStrideCount: number,
  exportMode: boolean,
): number {
  if (exportMode && settings.motion.reducedMotionOutput) return 0;
  const safeLoopStrideCount = Number.isSafeInteger(loopStrideCount) && loopStrideCount > 0
    ? loopStrideCount
    : 0;
  const loops = Number.isFinite(settings.motion.seamlessLoops)
    ? Math.max(1, Math.round(settings.motion.seamlessLoops))
    : 1;
  const duration = Number.isFinite(settings.output.duration)
    ? Math.max(0.001, settings.output.duration)
    : 0.001;
  const authoredSpeed = Number.isFinite(settings.motion.speed)
    ? Math.max(0, settings.motion.speed)
    : 0;
  if (settings.motion.flow === "editorial" && settings.motion.seamless && safeLoopStrideCount > 0) {
    return safeLoopStrideCount
      * loops
      / duration;
  }
  if (exportMode && settings.motion.seamless && safeLoopStrideCount > 0) {
    return safeLoopStrideCount * loops / duration;
  }
  return authoredSpeed;
}

export function distanceAtTime(settings: StudioSettings, time: number, loopStrideCount: number, stride: number, exportMode: boolean): number {
  if (settings.motion.reducedMotionOutput && exportMode) return 0;
  if (!Number.isFinite(time) || !Number.isFinite(stride)) return 0;
  const speed = deliverySlidesPerSecond(settings, loopStrideCount, exportMode);
  if (speed === 0) return 0;
  return settings.motion.direction * speed * stride * Math.max(0, time);
}

export function velocityAtTime(
  settings: StudioSettings,
  loopStrideCount: number,
  stride: number,
  exportMode: boolean,
): number {
  if (!Number.isFinite(stride)) return 0;
  const speed = deliverySlidesPerSecond(settings, loopStrideCount, exportMode);
  if (speed === 0) return 0;
  return settings.motion.direction * speed * stride;
}

/**
 * A source-deck-owned atmosphere phase. It freezes inside editorial holds and
 * repeats exactly when the source deck repeats, independent of virtual meshes.
 */
export function editorialDeckPhase(
  settings: StudioSettings,
  distance: number,
  stride: number,
  sourceCount: number,
): number {
  if (
    settings.motion.flow !== "editorial"
    || !Number.isFinite(distance)
    || !Number.isFinite(stride)
    || Math.abs(stride) < 1e-6
    || !Number.isSafeInteger(sourceCount)
    || sourceCount <= 0
  ) return 0;
  const safeStride = Math.abs(stride);
  const visibleDistance = remapEditorialDistance(
    distance,
    safeStride,
    settings.motion.speed,
    settings.motion.curvature,
    settings.motion.edgeFade,
  );
  const loopLength = sourceCount * safeStride;
  return (positiveModulo(visibleDistance, loopLength) / loopLength) * Math.PI * 2;
}

function editorialCadenceForDistance(
  distance: number,
  settings: StudioSettings,
  geometry: SlideGeometry,
): EditorialCadenceState | null {
  if (settings.motion.flow !== "editorial") return null;
  return evaluateEditorialCadence(
    distance,
    geometry.stride,
    settings.motion.speed,
    settings.motion.curvature,
    settings.motion.edgeFade,
  );
}

export function evaluateSlide(
  index: number,
  slotCount: number,
  distance: number,
  settings: StudioSettings,
  geometry: SlideGeometry,
  sourceIndex = index,
): EvaluatedSlide {
  if (slotCount <= 0) {
    return { primary: 0, cross: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scale: 1, opacity: 0, normalized: 0, transitionPulse: 0, anticipation: 0, landingImpact: 0, settle: 0 };
  }

  const cadence = editorialCadenceForDistance(distance, settings, geometry);
  const evaluatedDistance = cadence
    ? (cadence.cycle + cadence.progress) * Math.abs(geometry.stride)
    : distance;
  const loopLength = slotCount * geometry.stride;
  const wrappedDistance = positiveModulo(evaluatedDistance, loopLength);
  let primary = positiveModulo(index * geometry.stride - wrappedDistance + loopLength / 2, loopLength) - loopLength / 2;
  if (Math.abs(primary) < 1e-9 || Object.is(primary, -0)) primary = 0;

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
    case "editorial": {
      const registration = editorialRegistration(sourceIndex);
      const transitionPulse = cadence?.transitionPulse ?? 0;
      const anticipation = cadence?.anticipation ?? 0;
      const landingImpact = cadence?.landingImpact ?? 0;
      const settle = cadence?.settle ?? 0;
      const travel = settings.motion.direction;
      // Beat hold owns timing only. Tactile registration follows the hinge
      // control so a director can change rhythm without moving the layout.
      const paperEnergy = clamp(settings.motion.tilt / 9, 0, 1);
      const paperOffset = registration * paperEnergy * geometry.crossExtent * 0.012;
      const focalArc = Math.sin(normalized * Math.PI) * paperEnergy * geometry.crossExtent * 0.018;
      const settleAngle = settle * tilt * 0.34 * travel;
      const anticipationAngle = -travel * anticipation * tilt * 0.11;
      const landingAngle = travel * landingImpact * tilt * 0.075;

      cross = paperOffset + focalArc;
      z = -depth * (0.06 + 0.94 * Math.pow(abs, 1.45))
        + anticipation * depth * 0.035
        - transitionPulse * depth * 0.08
        - landingImpact * depth * 0.045;
      rotationZ = registration * tilt * 0.055
        - normalized * tilt * 0.16
        + anticipationAngle
        + landingAngle
        + settleAngle;
      rotationY = settings.motion.axis === "horizontal"
        ? -normalized * tilt * 0.48
          + travel * transitionPulse * tilt * 0.08
          + anticipationAngle * 0.2
        : settleAngle * 0.18 + landingAngle * 0.12;
      rotationX = settings.motion.axis === "vertical"
        ? normalized * tilt * 0.48
          - travel * transitionPulse * tilt * 0.08
          - anticipationAngle * 0.2
        : settleAngle * 0.16 + landingAngle * 0.1;
      break;
    }
    case "straight":
    default:
      z = -depth * normalized * normalized * 0.28;
      rotationZ = -normalized * tilt * 0.12;
      break;
  }

  const focus = 1 - clamp(abs, 0, 1);
  const landingLift = settings.motion.flow === "editorial"
    ? (cadence?.landingImpact ?? 0) * settings.motion.focusScale * focus * 0.2
    : 0;
  const scale = 1 + settings.motion.focusScale * focus + landingLift;
  const opacity = clamp(1 - settings.motion.edgeFade * Math.pow(abs, 1.6), 0.08, 1);
  return {
    primary,
    cross,
    z,
    rotationX,
    rotationY,
    rotationZ,
    scale,
    opacity,
    normalized,
    transitionPulse: cadence?.transitionPulse ?? 0,
    anticipation: cadence?.anticipation ?? 0,
    landingImpact: cadence?.landingImpact ?? 0,
    settle: cadence?.settle ?? 0,
  };
}

export function isPotentiallyVisible(evaluated: EvaluatedSlide, geometry: SlideGeometry): boolean {
  return Math.abs(evaluated.primary) <= geometry.axisExtent / 2 + geometry.stride * 1.25;
}
