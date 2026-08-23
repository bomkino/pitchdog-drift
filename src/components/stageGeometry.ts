export interface StagePreviewSize {
  width: number;
  height: number;
}

const DEFAULT_MAX_HEIGHT = 820;

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Fits the stage inside the preview well without changing its authored ratio.
 * Both axes are resolved together; independent CSS max-width/max-height clamps
 * can stretch a wide or tall composition after only one dimension is reduced.
 */
export function fitStagePreview(
  availableWidth: number,
  availableHeight: number,
  stageWidth: number,
  stageHeight: number,
  maxHeight = DEFAULT_MAX_HEIGHT,
): StagePreviewSize | null {
  if (
    !isPositiveFinite(availableWidth)
    || !isPositiveFinite(availableHeight)
    || !isPositiveFinite(stageWidth)
    || !isPositiveFinite(stageHeight)
    || !isPositiveFinite(maxHeight)
  ) return null;

  const ratio = stageWidth / stageHeight;
  const heightBound = Math.min(availableHeight, maxHeight);
  const widthBound = availableWidth;
  const widthFromHeight = heightBound * ratio;

  if (widthFromHeight <= widthBound) {
    return { width: widthFromHeight, height: heightBound };
  }

  return { width: widthBound, height: widthBound / ratio };
}
