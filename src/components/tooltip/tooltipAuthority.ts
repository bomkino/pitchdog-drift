export const TOOLTIP_VIEWPORT_PADDING_PX = 12;
export const TOOLTIP_FIRST_OPEN_DELAY_MS = 600;
export const TOOLTIP_ADJACENT_OPEN_DELAY_MS = 100;
export const TOOLTIP_ADJACENT_GRACE_MS = 800;

export type TooltipSide = "top" | "right" | "bottom" | "left";

export interface TooltipRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface TooltipSize {
  readonly width: number;
  readonly height: number;
}

export interface TooltipViewport {
  readonly width: number;
  readonly height: number;
}

export interface TooltipPlacementInput {
  readonly trigger: TooltipRect;
  readonly content: TooltipSize;
  readonly viewport: TooltipViewport;
  readonly preferredSide?: TooltipSide;
  readonly gap?: number;
  readonly viewportPadding?: number;
  readonly arrowInset?: number;
}

export interface TooltipPlacement {
  readonly side: TooltipSide;
  readonly x: number;
  readonly y: number;
  readonly arrowX: number;
  readonly arrowY: number;
  readonly constrainedWidth: number;
  readonly constrainedHeight: number;
  readonly transformOrigin: string;
}

const SIDE_ORDER: readonly TooltipSide[] = ["top", "right", "bottom", "left"];
const OPPOSITE_SIDE: Readonly<Record<TooltipSide, TooltipSide>> = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
};

function isFiniteAtLeastZero(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isSide(value: unknown): value is TooltipSide {
  return SIDE_ORDER.includes(value as TooltipSide);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function validRect(rect: TooltipRect): boolean {
  return [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)
    && rect.right >= rect.left
    && rect.bottom >= rect.top;
}

/**
 * Places a fixed tooltip inside the viewport. The preferred side wins when it
 * fits, its opposite is the first fallback, and remaining sides are ranked by
 * usable space. Hostile geometry fails closed instead of leaking NaN into CSS.
 */
export function resolveTooltipPlacement(input: TooltipPlacementInput): TooltipPlacement | null {
  const preferredSide = input.preferredSide ?? "top";
  const gap = input.gap ?? 8;
  const viewportPadding = input.viewportPadding ?? TOOLTIP_VIEWPORT_PADDING_PX;
  const arrowInset = input.arrowInset ?? 12;
  if (!validRect(input.trigger)
    || !isFiniteAtLeastZero(input.content.width)
    || !isFiniteAtLeastZero(input.content.height)
    || input.content.width === 0
    || input.content.height === 0
    || !Number.isFinite(input.viewport.width)
    || !Number.isFinite(input.viewport.height)
    || !isSide(preferredSide)
    || !isFiniteAtLeastZero(gap)
    || !isFiniteAtLeastZero(viewportPadding)
    || !isFiniteAtLeastZero(arrowInset)) return null;

  const usableWidth = input.viewport.width - viewportPadding * 2;
  const usableHeight = input.viewport.height - viewportPadding * 2;
  if (usableWidth <= 0 || usableHeight <= 0) return null;

  const width = Math.min(input.content.width, usableWidth);
  const height = Math.min(input.content.height, usableHeight);
  const triggerCenterX = (input.trigger.left + input.trigger.right) / 2;
  const triggerCenterY = (input.trigger.top + input.trigger.bottom) / 2;
  const available: Readonly<Record<TooltipSide, number>> = {
    top: input.trigger.top - viewportPadding - gap,
    right: input.viewport.width - viewportPadding - input.trigger.right - gap,
    bottom: input.viewport.height - viewportPadding - input.trigger.bottom - gap,
    left: input.trigger.left - viewportPadding - gap,
  };
  const required: Readonly<Record<TooltipSide, number>> = {
    top: height,
    right: width,
    bottom: height,
    left: width,
  };

  const opposite = OPPOSITE_SIDE[preferredSide];
  const remaining = SIDE_ORDER
    .filter((side) => side !== preferredSide && side !== opposite)
    .sort((a, b) => {
      const difference = available[b] - required[b] - (available[a] - required[a]);
      return difference || SIDE_ORDER.indexOf(a) - SIDE_ORDER.indexOf(b);
    });
  const candidates = [preferredSide, opposite, ...remaining];
  const fittingSide = candidates.find((side) => available[side] >= required[side]);
  const side = fittingSide ?? [...candidates].sort((a, b) => {
    const difference = available[b] - required[b] - (available[a] - required[a]);
    return difference || candidates.indexOf(a) - candidates.indexOf(b);
  })[0]!;

  let rawX = triggerCenterX - width / 2;
  let rawY = triggerCenterY - height / 2;
  if (side === "top") rawY = input.trigger.top - gap - height;
  if (side === "right") rawX = input.trigger.right + gap;
  if (side === "bottom") rawY = input.trigger.bottom + gap;
  if (side === "left") rawX = input.trigger.left - gap - width;

  const x = clamp(rawX, viewportPadding, input.viewport.width - viewportPadding - width);
  const y = clamp(rawY, viewportPadding, input.viewport.height - viewportPadding - height);
  const horizontalArrowInset = Math.min(arrowInset, width / 2);
  const verticalArrowInset = Math.min(arrowInset, height / 2);
  const arrowX = side === "left"
    ? width
    : side === "right"
      ? 0
      : clamp(triggerCenterX - x, horizontalArrowInset, width - horizontalArrowInset);
  const arrowY = side === "top"
    ? height
    : side === "bottom"
      ? 0
      : clamp(triggerCenterY - y, verticalArrowInset, height - verticalArrowInset);

  return {
    side,
    x,
    y,
    arrowX,
    arrowY,
    constrainedWidth: width,
    constrainedHeight: height,
    transformOrigin: `${arrowX}px ${arrowY}px`,
  };
}

export interface TooltipDelayState {
  readonly activeTooltipId: string | null;
  readonly adjacentUntilMs: number;
}

export function createTooltipDelayState(): TooltipDelayState {
  return { activeTooltipId: null, adjacentUntilMs: 0 };
}

function validTooltipId(id: string): boolean {
  return typeof id === "string" && id.trim().length > 0;
}

function validDelayState(state: TooltipDelayState): boolean {
  return (state.activeTooltipId === null || validTooltipId(state.activeTooltipId))
    && Number.isFinite(state.adjacentUntilMs)
    && state.adjacentUntilMs >= 0;
}

/** Pure provider timing authority: first hover 600 ms, adjacent hover 100 ms. */
export function resolveTooltipOpenDelay(
  state: TooltipDelayState,
  tooltipId: string,
  nowMs: number,
): number {
  if (!validDelayState(state) || !validTooltipId(tooltipId) || !Number.isFinite(nowMs) || nowMs < 0) {
    return TOOLTIP_FIRST_OPEN_DELAY_MS;
  }
  if (state.activeTooltipId === tooltipId) return 0;
  if (state.activeTooltipId !== null || nowMs < state.adjacentUntilMs) {
    return TOOLTIP_ADJACENT_OPEN_DELAY_MS;
  }
  return TOOLTIP_FIRST_OPEN_DELAY_MS;
}

export function markTooltipOpened(
  state: TooltipDelayState,
  tooltipId: string,
): TooltipDelayState {
  if (!validDelayState(state) || !validTooltipId(tooltipId)) return createTooltipDelayState();
  return { activeTooltipId: tooltipId, adjacentUntilMs: state.adjacentUntilMs };
}

export function markTooltipClosed(
  state: TooltipDelayState,
  tooltipId: string,
  nowMs: number,
): TooltipDelayState {
  if (!validDelayState(state) || !validTooltipId(tooltipId) || !Number.isFinite(nowMs) || nowMs < 0) {
    return createTooltipDelayState();
  }
  if (state.activeTooltipId !== tooltipId) return state;
  return {
    activeTooltipId: null,
    adjacentUntilMs: nowMs + TOOLTIP_ADJACENT_GRACE_MS,
  };
}
