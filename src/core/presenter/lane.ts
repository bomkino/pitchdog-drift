import type { Axis } from "../../model";
import type { CenteredStageBounds, StageSize } from "./layout";

export interface PinLaneCompositionInput {
  readonly enabled: boolean;
  readonly safeOverlay: boolean;
  readonly stage: StageSize;
  readonly axis: Axis;
  readonly pinX: number;
  readonly pinY: number;
  readonly pinWidth: number;
}

export interface PinLaneComposition {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface ProtectedPinLaneCompositionInput {
  readonly enabled: boolean;
  readonly safeOverlay: boolean;
  readonly stage: StageSize;
  readonly axis: Axis;
  /** Full authored presenter frame bounds in centred stage coordinates. */
  readonly presenterBounds: CenteredStageBounds | null;
  /** Current moving-card centre before presenter avoidance. */
  readonly movingCenter: {
    readonly x: number;
    readonly y: number;
  };
  /** Undeformed card-front dimensions before current spatial/lifecycle scale. */
  readonly movingSize: StageSize;
  /** Current canonical spatial/lifecycle scale; pin avoidance is applied after it. */
  readonly movingScale: number;
  /** Current canonical in-plane rotation in radians. */
  readonly movingRotationZ: number;
  /** Keeps the yielded card away from the output edge when a clear lane exists. */
  readonly edgeInset?: number;
  /** Protected breathing room between card fronts. */
  readonly gap?: number;
}

export interface ProtectedPinLaneComposition extends PinLaneComposition {
  readonly influence: number;
  readonly targetScale: number;
  readonly targetCrossCenter: number;
  readonly protectedGap: number;
}

const NEUTRAL: PinLaneComposition = Object.freeze({ scale: 1, offsetX: 0, offsetY: 0 });
const PROTECTED_NEUTRAL: ProtectedPinLaneComposition = Object.freeze({
  ...NEUTRAL,
  influence: 0,
  targetScale: 1,
  targetCrossCenter: 0,
  protectedGap: 0,
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function rotatedHalfExtents(
  size: StageSize,
  scale: number,
  rotationZ: number,
): { x: number; y: number } {
  const width = Math.max(1, Math.abs(size.width * scale));
  const height = Math.max(1, Math.abs(size.height * scale));
  const cosine = Math.abs(Math.cos(Number.isFinite(rotationZ) ? rotationZ : 0));
  const sine = Math.abs(Math.sin(Number.isFinite(rotationZ) ? rotationZ : 0));
  return {
    x: (width * cosine + height * sine) / 2,
    y: (width * sine + height * cosine) / 2,
  };
}

function intervalSeparation(
  movingCenter: number,
  movingHalf: number,
  protectedMinimum: number,
  protectedMaximum: number,
): number {
  const movingMinimum = movingCenter - movingHalf;
  const movingMaximum = movingCenter + movingHalf;
  if (movingMaximum < protectedMinimum) return protectedMinimum - movingMaximum;
  if (movingMinimum > protectedMaximum) return movingMinimum - protectedMaximum;
  return 0;
}

/**
 * Curves a V2 moving card around the protected presenter footprint.
 *
 * This is a deterministic composition transform, not another timeline. The
 * canonical evaluator still owns time, order, path, and pose. Avoidance stays
 * neutral until the moving card approaches the presenter along the transport
 * axis; while their primary footprints could meet, the card occupies a clear
 * cross-axis lane opposite the presenter. A smooth approach field prevents a
 * last-frame jump without making the whole carousel permanently small.
 */
export function resolveProtectedPinLaneComposition(
  input: ProtectedPinLaneCompositionInput,
): ProtectedPinLaneComposition {
  const presenter = input.presenterBounds;
  if (!input.enabled || !input.safeOverlay || !presenter) return PROTECTED_NEUTRAL;

  const stageWidth = Math.max(1, Number.isFinite(input.stage.width) ? input.stage.width : 1);
  const stageHeight = Math.max(1, Number.isFinite(input.stage.height) ? input.stage.height : 1);
  const minimumStageExtent = Math.min(stageWidth, stageHeight);
  const protectedGap = clamp(input.gap ?? minimumStageExtent * 0.035, 12, minimumStageExtent * 0.08);
  const crossExtent = input.axis === "vertical" ? stageWidth : stageHeight;
  const primaryExtent = input.axis === "vertical" ? stageHeight : stageWidth;
  const edgeInset = clamp(input.edgeInset ?? minimumStageExtent * 0.04, 0, crossExtent * 0.24);
  const movingCenterX = Number.isFinite(input.movingCenter.x) ? input.movingCenter.x : 0;
  const movingCenterY = Number.isFinite(input.movingCenter.y) ? input.movingCenter.y : 0;
  const movingScale = Math.max(0.01, Number.isFinite(input.movingScale) ? input.movingScale : 1);
  const movingHalf = rotatedHalfExtents(input.movingSize, movingScale, input.movingRotationZ);

  const movingPrimaryCenter = input.axis === "vertical" ? movingCenterY : movingCenterX;
  const movingPrimaryHalf = input.axis === "vertical" ? movingHalf.y : movingHalf.x;
  const movingCrossCenter = input.axis === "vertical" ? movingCenterX : movingCenterY;
  const movingCrossHalf = input.axis === "vertical" ? movingHalf.x : movingHalf.y;
  const presenterPrimaryMinimum = input.axis === "vertical" ? presenter.minY : presenter.minX;
  const presenterPrimaryMaximum = input.axis === "vertical" ? presenter.maxY : presenter.maxX;
  const presenterCrossMinimum = input.axis === "vertical" ? presenter.minX : presenter.minY;
  const presenterCrossMaximum = input.axis === "vertical" ? presenter.maxX : presenter.maxY;
  const presenterCrossCenter = (presenterCrossMinimum + presenterCrossMaximum) / 2;

  const primarySeparation = intervalSeparation(
    movingPrimaryCenter,
    movingPrimaryHalf,
    presenterPrimaryMinimum,
    presenterPrimaryMaximum,
  );
  const approachDistance = protectedGap + Math.max(primaryExtent * 0.1, movingPrimaryHalf * 0.55);
  const influence = primarySeparation <= protectedGap
    ? 1
    : 1 - smoothstep(protectedGap, approachDistance, primarySeparation);
  if (influence <= 0) {
    return Object.freeze({
      ...PROTECTED_NEUTRAL,
      targetCrossCenter: movingCrossCenter,
      protectedGap,
    });
  }

  const stageCrossMinimum = -crossExtent / 2 + edgeInset;
  const stageCrossMaximum = crossExtent / 2 - edgeInset;
  const presenterOnPositiveSide = presenterCrossCenter >= 0;
  const laneMinimum = presenterOnPositiveSide
    ? stageCrossMinimum
    : Math.max(stageCrossMinimum, presenterCrossMaximum + protectedGap);
  const laneMaximum = presenterOnPositiveSide
    ? Math.min(stageCrossMaximum, presenterCrossMinimum - protectedGap)
    : stageCrossMaximum;
  const laneExtent = Math.max(0, laneMaximum - laneMinimum);
  const exactFitScale = movingCrossHalf > 0 ? laneExtent / (movingCrossHalf * 2) : 1;
  // Below this size, preserve visual authority and let the opposite edge crop.
  // The presenter-facing edge remains strictly protected.
  const targetScale = Math.min(1, Math.max(0.34, exactFitScale));
  const targetHalf = movingCrossHalf * targetScale;
  let targetCrossCenter: number;
  if (presenterOnPositiveSide) {
    const presenterFacingLimit = presenterCrossMinimum - protectedGap - targetHalf;
    const fittedCentre = (laneMinimum + laneMaximum) / 2;
    targetCrossCenter = Math.min(fittedCentre, presenterFacingLimit);
  } else {
    const presenterFacingLimit = presenterCrossMaximum + protectedGap + targetHalf;
    const fittedCentre = (laneMinimum + laneMaximum) / 2;
    targetCrossCenter = Math.max(fittedCentre, presenterFacingLimit);
  }

  const additionalScale = 1 - (1 - targetScale) * influence;
  const crossOffset = (targetCrossCenter - movingCrossCenter) * influence;
  return Object.freeze({
    scale: additionalScale,
    offsetX: input.axis === "vertical" ? crossOffset : 0,
    offsetY: input.axis === "horizontal" ? crossOffset : 0,
    influence,
    targetScale,
    targetCrossCenter,
    protectedGap,
  });
}

/** Legacy V1-compatible global lane. V2 uses local protected avoidance above. */
export function resolvePinLaneComposition(input: PinLaneCompositionInput): PinLaneComposition {
  if (!input.enabled || !input.safeOverlay) return NEUTRAL;
  const portraitStage = input.stage.height / Math.max(1, input.stage.width) >= 1.2;
  const width = clamp(input.pinWidth, 0.14, 0.82);
  const scale = 1 - clamp(
    width * (portraitStage ? 0.66 : 0.35),
    portraitStage ? 0.1 : 0.055,
    portraitStage ? 0.32 : 0.15,
  );

  if (input.axis === "vertical") {
    const direction = clamp(input.pinX, 0, 1) >= 0.5 ? -1 : 1;
    const distance = input.stage.width * clamp(
      width * (portraitStage ? 0.48 : 0.28),
      portraitStage ? 0.09 : 0.045,
      portraitStage ? 0.21 : 0.1,
    );
    return Object.freeze({ scale, offsetX: direction * distance, offsetY: 0 });
  }

  const pinBelowCentre = clamp(input.pinY, 0, 1) >= 0.5;
  const distance = input.stage.height * clamp(
    width * (portraitStage ? 0.25 : 0.18),
    portraitStage ? 0.065 : 0.035,
    portraitStage ? 0.13 : 0.065,
  );
  return Object.freeze({ scale, offsetX: 0, offsetY: (pinBelowCentre ? 1 : -1) * distance });
}
