/**
 * Pure geometry for Drift's protected presenter overlay.
 *
 * Pixel coordinates use a top-left origin with y increasing downward. Centered
 * stage coordinates use the stage centre as origin with y increasing upward.
 * No camera, perspective, device-pixel ratio, or renderer state participates.
 */

export interface StageSize {
  readonly width: number;
  readonly height: number;
}

export interface AspectSize {
  readonly width: number;
  readonly height: number;
}

export interface NormalizedAnchor {
  readonly x: number;
  readonly y: number;
}

export interface EdgeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type EdgeInsetsInput = number | Partial<EdgeInsets>;

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface CenteredStagePoint {
  readonly x: number;
  readonly y: number;
}

export interface PixelRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface CenteredStageBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface PresenterOverlayLayoutInput {
  /** Final composition dimensions in stage units (normally output pixels). */
  readonly stage: StageSize;
  /** Decoded image or video dimensions. */
  readonly source: AspectSize;
  /** Optional authored aspect override. Source dimensions remain untouched. */
  readonly customAspect?: AspectSize | null;
  /**
   * Authored position within the safe centre lane. Zero means its complete
   * frame and shadow touch the safe area's top/left edge; one means bottom/right.
   */
  readonly anchor: NormalizedAnchor;
  /** Requested frame width as a fraction of full stage width. */
  readonly scale: number;
  /** Safe-area inset in stage units. A number applies equally to every edge. */
  readonly safeInset?: EdgeInsetsInput;
  /** Shadow support beyond each frame edge, including any authored offset. */
  readonly shadowExtents?: EdgeInsetsInput;
}

export interface PresenterOverlayLayout {
  readonly stage: StageSize;
  readonly aspect: {
    readonly width: number;
    readonly height: number;
    readonly ratio: number;
    readonly origin: "source" | "custom";
  };
  readonly anchor: NormalizedAnchor;
  readonly anchorWasClamped: boolean;
  readonly safeInset: EdgeInsets;
  readonly safeBoundsPx: PixelRect;
  readonly requestedFrameSizePx: StageSize;
  readonly frameSizePx: StageSize;
  readonly shadowExtentsPx: EdgeInsets;
  /** Uniform scale applied to requested frame and shadow support to fit safely. */
  readonly fitScale: number;
  readonly constrained: boolean;
  readonly centerPx: PixelPoint;
  readonly centerStage: CenteredStagePoint;
  readonly frameBoundsPx: PixelRect;
  readonly frameBoundsStage: CenteredStageBounds;
  readonly occupiedBoundsPx: PixelRect;
  readonly occupiedBoundsStage: CenteredStageBounds;
}

const ZERO_INSETS: EdgeInsets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

export const BOTTOM_RIGHT_SAFE_ANCHOR: NormalizedAnchor = Object.freeze({ x: 1, y: 1 });

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite number greater than zero.`);
  }
  return value;
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number.`);
  }
  return value;
}

function normalizeInsets(value: EdgeInsetsInput | undefined, label: string): EdgeInsets {
  if (value === undefined) return ZERO_INSETS;
  if (typeof value === "number") {
    const inset = finiteNonNegative(value, label);
    return { top: inset, right: inset, bottom: inset, left: inset };
  }
  return {
    top: finiteNonNegative(value.top ?? 0, `${label}.top`),
    right: finiteNonNegative(value.right ?? 0, `${label}.right`),
    bottom: finiteNonNegative(value.bottom ?? 0, `${label}.bottom`),
    left: finiteNonNegative(value.left ?? 0, `${label}.left`),
  };
}

function clamp01(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return Math.min(1, Math.max(0, value));
}

function pixelRect(left: number, top: number, right: number, bottom: number): PixelRect {
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function centeredStageBounds(stage: StageSize, bounds: PixelRect): CenteredStageBounds {
  return {
    minX: bounds.left - stage.width / 2,
    maxX: bounds.right - stage.width / 2,
    minY: stage.height / 2 - bounds.bottom,
    maxY: stage.height / 2 - bounds.top,
    width: bounds.width,
    height: bounds.height,
  };
}

function lanePosition(minimum: number, maximum: number, anchor: number): number {
  if (anchor <= 0) return minimum;
  if (anchor >= 1) return maximum;
  return minimum + (maximum - minimum) * anchor;
}

/**
 * Resolves a presenter frame inside a protected orthographic overlay.
 *
 * Oversized requests are handled by uniformly reducing frame and shadow
 * support until their complete footprint fits the safe area. This preserves
 * aspect and shadow proportions and yields one deterministic result even when
 * the request is much larger than the composition.
 */
export function resolvePresenterOverlayLayout(
  input: PresenterOverlayLayoutInput,
): PresenterOverlayLayout {
  const stage: StageSize = {
    width: finitePositive(input.stage.width, "stage.width"),
    height: finitePositive(input.stage.height, "stage.height"),
  };
  const source: AspectSize = {
    width: finitePositive(input.source.width, "source.width"),
    height: finitePositive(input.source.height, "source.height"),
  };
  const custom = input.customAspect === null || input.customAspect === undefined
    ? null
    : {
        width: finitePositive(input.customAspect.width, "customAspect.width"),
        height: finitePositive(input.customAspect.height, "customAspect.height"),
      };
  const aspectSize = custom ?? source;
  const aspectRatio = finitePositive(aspectSize.width / aspectSize.height, "resolved aspect ratio");
  const scale = finitePositive(input.scale, "scale");
  const safeInset = normalizeInsets(input.safeInset, "safeInset");
  const requestedShadow = normalizeInsets(input.shadowExtents, "shadowExtents");

  const safeBoundsPx = pixelRect(
    safeInset.left,
    safeInset.top,
    stage.width - safeInset.right,
    stage.height - safeInset.bottom,
  );
  if (safeBoundsPx.width <= 0 || safeBoundsPx.height <= 0) {
    throw new RangeError("safeInset must leave a positive safe area inside the stage.");
  }

  const requestedWidth = finitePositive(stage.width * scale, "requested frame width");
  const requestedFrameSizePx: StageSize = {
    width: requestedWidth,
    height: finitePositive(requestedWidth / aspectRatio, "requested frame height"),
  };
  const requestedOccupiedWidth = finitePositive(requestedFrameSizePx.width
    + requestedShadow.left
    + requestedShadow.right, "requested occupied width");
  const requestedOccupiedHeight = finitePositive(requestedFrameSizePx.height
    + requestedShadow.top
    + requestedShadow.bottom, "requested occupied height");
  const fitScale = Math.min(
    1,
    safeBoundsPx.width / requestedOccupiedWidth,
    safeBoundsPx.height / requestedOccupiedHeight,
  );
  const frameSizePx: StageSize = {
    width: requestedFrameSizePx.width * fitScale,
    height: requestedFrameSizePx.height * fitScale,
  };
  const shadowExtentsPx: EdgeInsets = {
    top: requestedShadow.top * fitScale,
    right: requestedShadow.right * fitScale,
    bottom: requestedShadow.bottom * fitScale,
    left: requestedShadow.left * fitScale,
  };

  const authoredAnchor = {
    x: clamp01(input.anchor.x, "anchor.x"),
    y: clamp01(input.anchor.y, "anchor.y"),
  };
  const minimumCenterX = safeBoundsPx.left + shadowExtentsPx.left + frameSizePx.width / 2;
  const maximumCenterX = safeBoundsPx.right - shadowExtentsPx.right - frameSizePx.width / 2;
  const minimumCenterY = safeBoundsPx.top + shadowExtentsPx.top + frameSizePx.height / 2;
  const maximumCenterY = safeBoundsPx.bottom - shadowExtentsPx.bottom - frameSizePx.height / 2;
  const centerPx: PixelPoint = {
    x: lanePosition(minimumCenterX, Math.max(minimumCenterX, maximumCenterX), authoredAnchor.x),
    y: lanePosition(minimumCenterY, Math.max(minimumCenterY, maximumCenterY), authoredAnchor.y),
  };
  const centerStage: CenteredStagePoint = {
    x: centerPx.x - stage.width / 2,
    y: stage.height / 2 - centerPx.y,
  };
  const frameBoundsPx = pixelRect(
    centerPx.x - frameSizePx.width / 2,
    centerPx.y - frameSizePx.height / 2,
    centerPx.x + frameSizePx.width / 2,
    centerPx.y + frameSizePx.height / 2,
  );
  const occupiedBoundsPx = pixelRect(
    frameBoundsPx.left - shadowExtentsPx.left,
    frameBoundsPx.top - shadowExtentsPx.top,
    frameBoundsPx.right + shadowExtentsPx.right,
    frameBoundsPx.bottom + shadowExtentsPx.bottom,
  );

  return {
    stage,
    aspect: {
      width: aspectSize.width,
      height: aspectSize.height,
      ratio: aspectRatio,
      origin: custom ? "custom" : "source",
    },
    anchor: authoredAnchor,
    anchorWasClamped: authoredAnchor.x !== input.anchor.x || authoredAnchor.y !== input.anchor.y,
    safeInset,
    safeBoundsPx,
    requestedFrameSizePx,
    frameSizePx,
    shadowExtentsPx,
    fitScale,
    constrained: fitScale < 1,
    centerPx,
    centerStage,
    frameBoundsPx,
    frameBoundsStage: centeredStageBounds(stage, frameBoundsPx),
    occupiedBoundsPx,
    occupiedBoundsStage: centeredStageBounds(stage, occupiedBoundsPx),
  };
}

/** Resolves the authored bottom-right presenter lane without duplicating policy. */
export function resolveBottomRightPresenterLayout(
  input: Omit<PresenterOverlayLayoutInput, "anchor">,
): PresenterOverlayLayout {
  return resolvePresenterOverlayLayout({ ...input, anchor: BOTTOM_RIGHT_SAFE_ANCHOR });
}
