import type {
  GuideOverlapSubject,
  NormalizedBounds,
  NormalizedInsets,
  NormalizedRect,
  PlatformGuideOverlap,
  PlatformGuideProfile,
} from "./types";

const UNIT_MINIMUM = 0;
const UNIT_MAXIMUM = 1;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function unitValue(value: number, label: string): number {
  finite(value, label);
  if (value < UNIT_MINIMUM || value > UNIT_MAXIMUM) {
    throw new RangeError(`${label} must be between 0 and 1.`);
  }
  return value;
}

function positiveUnitValue(value: number, label: string): number {
  unitValue(value, label);
  if (value <= 0) throw new RangeError(`${label} must be greater than zero.`);
  return value;
}

/** Validates and returns an immutable rectangle wholly inside normalized stage space. */
export function validateNormalizedRect(
  rect: NormalizedRect,
  label = "rect",
): NormalizedRect {
  const x = unitValue(rect.x, `${label}.x`);
  const y = unitValue(rect.y, `${label}.y`);
  const width = positiveUnitValue(rect.width, `${label}.width`);
  const height = positiveUnitValue(rect.height, `${label}.height`);
  if (x + width > UNIT_MAXIMUM) {
    throw new RangeError(`${label} must not extend beyond the stage's right edge.`);
  }
  if (y + height > UNIT_MAXIMUM) {
    throw new RangeError(`${label} must not extend beyond the stage's bottom edge.`);
  }
  return Object.freeze({ x, y, width, height });
}

/** Validates normalized top-left bounds and returns an immutable canonical copy. */
export function validateNormalizedBounds(
  bounds: NormalizedBounds,
  label = "bounds",
): NormalizedBounds {
  const left = unitValue(bounds.left, `${label}.left`);
  const top = unitValue(bounds.top, `${label}.top`);
  const right = unitValue(bounds.right, `${label}.right`);
  const bottom = unitValue(bounds.bottom, `${label}.bottom`);
  if (right <= left) throw new RangeError(`${label}.right must be greater than ${label}.left.`);
  if (bottom <= top) throw new RangeError(`${label}.bottom must be greater than ${label}.top.`);
  return Object.freeze({ left, top, right, bottom });
}

/** Validates four independent edge controls and ensures they leave a valid unit rectangle. */
export function validateNormalizedInsets(
  insets: NormalizedInsets,
  label = "insets",
): NormalizedInsets {
  const top = unitValue(insets.top, `${label}.top`);
  const right = unitValue(insets.right, `${label}.right`);
  const bottom = unitValue(insets.bottom, `${label}.bottom`);
  const left = unitValue(insets.left, `${label}.left`);
  if (top + bottom > UNIT_MAXIMUM) {
    throw new RangeError(`${label}.top and ${label}.bottom must sum to at most 1.`);
  }
  if (left + right > UNIT_MAXIMUM) {
    throw new RangeError(`${label}.left and ${label}.right must sum to at most 1.`);
  }
  return Object.freeze({ top, right, bottom, left });
}

export function normalizedRectFromBounds(bounds: NormalizedBounds): NormalizedRect {
  const valid = validateNormalizedBounds(bounds);
  return Object.freeze({
    x: valid.left,
    y: valid.top,
    width: valid.right - valid.left,
    height: valid.bottom - valid.top,
  });
}

export function normalizedBoundsFromRect(rect: NormalizedRect): NormalizedBounds {
  const valid = validateNormalizedRect(rect);
  return Object.freeze({
    left: valid.x,
    top: valid.y,
    right: valid.x + valid.width,
    bottom: valid.y + valid.height,
  });
}

export function normalizedRectArea(rect: NormalizedRect): number {
  const valid = validateNormalizedRect(rect);
  return valid.width * valid.height;
}

/** Returns null when rectangles merely touch; overlap always has positive area. */
export function intersectNormalizedRects(
  first: NormalizedRect,
  second: NormalizedRect,
): NormalizedRect | null {
  const a = validateNormalizedRect(first, "first");
  const b = validateNormalizedRect(second, "second");
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return Object.freeze({ x, y, width: right - x, height: bottom - y });
}

function subtractRect(rect: NormalizedRect, cutter: NormalizedRect): NormalizedRect[] {
  const intersection = intersectNormalizedRects(rect, cutter);
  if (!intersection) return [rect];

  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  const intersectionRight = intersection.x + intersection.width;
  const intersectionBottom = intersection.y + intersection.height;
  const fragments: NormalizedRect[] = [];
  const add = (x: number, y: number, width: number, height: number): void => {
    if (width > 0 && height > 0) fragments.push(Object.freeze({ x, y, width, height }));
  };

  add(rect.x, rect.y, rect.width, intersection.y - rect.y);
  add(rect.x, intersectionBottom, rect.width, rectBottom - intersectionBottom);
  add(rect.x, intersection.y, intersection.x - rect.x, intersection.height);
  add(intersectionRight, intersection.y, rectRight - intersectionRight, intersection.height);
  return fragments;
}

/**
 * Produces an exact non-overlapping rectangle set for a geometric union.
 * Existing pieces retain precedence, so an overlay can paint every returned
 * rectangle once without darker stacked intersections.
 */
export function unionNormalizedRects(rects: readonly NormalizedRect[]): readonly NormalizedRect[] {
  const union: NormalizedRect[] = [];
  rects.forEach((rect, rectIndex) => {
    let uncovered = [validateNormalizedRect(rect, `rects[${rectIndex}]`)];
    for (const existing of union) {
      uncovered = uncovered.flatMap((fragment) => subtractRect(fragment, existing));
      if (uncovered.length === 0) break;
    }
    union.push(...uncovered);
  });
  return Object.freeze(union);
}

/** Converts independent edge insets into one exact, non-overlapping obstruction union. */
export function obstructionRectsFromInsets(
  insets: NormalizedInsets,
): readonly NormalizedRect[] {
  const valid = validateNormalizedInsets(insets);
  const rects: NormalizedRect[] = [];
  if (valid.top > 0) rects.push({ x: 0, y: 0, width: 1, height: valid.top });
  if (valid.right > 0) rects.push({ x: 1 - valid.right, y: 0, width: valid.right, height: 1 });
  if (valid.bottom > 0) rects.push({ x: 0, y: 1 - valid.bottom, width: 1, height: valid.bottom });
  if (valid.left > 0) rects.push({ x: 0, y: 0, width: valid.left, height: 1 });
  return unionNormalizedRects(rects);
}

function evaluateOverlap(
  subject: GuideOverlapSubject,
  bounds: NormalizedBounds,
  guide: Pick<PlatformGuideProfile, "obstructions">,
): PlatformGuideOverlap {
  const subjectBounds = validateNormalizedBounds(bounds, `${subject}Bounds`);
  const subjectRect = normalizedRectFromBounds(subjectBounds);
  const obstructions = unionNormalizedRects(guide.obstructions);
  const intersections = unionNormalizedRects(
    obstructions.flatMap((obstruction) => {
      const intersection = intersectNormalizedRects(subjectRect, obstruction);
      return intersection ? [intersection] : [];
    }),
  );
  const overlapArea = intersections.reduce((sum, rect) => sum + rect.width * rect.height, 0);
  const subjectArea = subjectRect.width * subjectRect.height;
  return Object.freeze({
    subject,
    subjectBounds,
    overlaps: overlapArea > 0,
    intersections,
    overlapArea,
    subjectArea,
    overlapRatio: overlapArea / subjectArea,
  });
}

export function evaluatePresenterGuideOverlap(
  presenterBounds: NormalizedBounds,
  guide: Pick<PlatformGuideProfile, "obstructions">,
): PlatformGuideOverlap {
  return evaluateOverlap("presenter", presenterBounds, guide);
}

export function evaluateSlideGuideOverlap(
  slideBounds: NormalizedBounds,
  guide: Pick<PlatformGuideProfile, "obstructions">,
): PlatformGuideOverlap {
  return evaluateOverlap("slide", slideBounds, guide);
}
