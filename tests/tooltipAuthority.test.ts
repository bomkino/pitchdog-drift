import { describe, expect, it } from "vitest";
import {
  TOOLTIP_ADJACENT_OPEN_DELAY_MS,
  TOOLTIP_FIRST_OPEN_DELAY_MS,
  createTooltipDelayState,
  markTooltipClosed,
  markTooltipOpened,
  resolveTooltipOpenDelay,
  resolveTooltipPlacement,
  type TooltipPlacementInput,
} from "../src/components/tooltip/tooltipAuthority";

const VIEWPORT = { width: 800, height: 600 };
const CONTENT = { width: 160, height: 72 };

function placement(overrides: Partial<TooltipPlacementInput>) {
  return resolveTooltipPlacement({
    trigger: { left: 360, top: 280, right: 440, bottom: 320 },
    content: CONTENT,
    viewport: VIEWPORT,
    ...overrides,
  });
}

describe("supplementary tooltip placement", () => {
  it("keeps a fitting preferred side and points its arrow at the trigger", () => {
    expect(placement({ preferredSide: "top" })).toMatchObject({
      side: "top",
      x: 320,
      y: 200,
      arrowX: 80,
      arrowY: 72,
      transformOrigin: "80px 72px",
    });
  });

  it.each([
    ["top", { arrowX: 80, arrowY: 72 }],
    ["right", { arrowX: 0, arrowY: 36 }],
    ["bottom", { arrowX: 80, arrowY: 0 }],
    ["left", { arrowX: 160, arrowY: 36 }],
  ] as const)("anchors the %s arrow on the trigger-facing content edge", (preferredSide, arrow) => {
    expect(placement({ preferredSide })).toMatchObject({ side: preferredSide, ...arrow });
  });

  it.each([
    ["top", { left: 360, top: 2, right: 440, bottom: 42 }, "bottom"],
    ["right", { left: 758, top: 280, right: 798, bottom: 320 }, "left"],
    ["bottom", { left: 360, top: 558, right: 440, bottom: 598 }, "top"],
    ["left", { left: 2, top: 280, right: 42, bottom: 320 }, "right"],
  ] as const)("falls back from %s at the viewport edge", (preferredSide, trigger, expectedSide) => {
    const result = placement({ preferredSide, trigger });
    expect(result?.side).toBe(expectedSide);
    expect(result!.x).toBeGreaterThanOrEqual(12);
    expect(result!.y).toBeGreaterThanOrEqual(12);
    expect(result!.x + result!.constrainedWidth).toBeLessThanOrEqual(VIEWPORT.width - 12);
    expect(result!.y + result!.constrainedHeight).toBeLessThanOrEqual(VIEWPORT.height - 12);
  });

  it("stays inside a narrow viewport and clamps the arrow to usable content", () => {
    const result = placement({
      trigger: { left: 31, top: 90, right: 49, bottom: 120 },
      content: { width: 140, height: 48 },
      viewport: { width: 80, height: 240 },
      preferredSide: "top",
    });
    expect(result).toMatchObject({ x: 12, constrainedWidth: 56 });
    expect(result!.arrowX).toBeGreaterThanOrEqual(12);
    expect(result!.arrowX).toBeLessThanOrEqual(44);
  });

  it("keeps a corner arrow inset from the rounded content edge", () => {
    const result = placement({
      trigger: { left: 2, top: 180, right: 18, bottom: 210 },
      preferredSide: "bottom",
    });
    expect(result).toMatchObject({ side: "bottom", x: 12, arrowX: 12, arrowY: 0 });
  });

  it("constrains oversized content to the padded viewport", () => {
    const result = placement({
      content: { width: 2_000, height: 1_000 },
      preferredSide: "right",
    });
    expect(result).toMatchObject({
      x: 12,
      y: 12,
      constrainedWidth: 776,
      constrainedHeight: 576,
    });
  });

  it("fails closed for malformed geometry", () => {
    expect(placement({ trigger: { left: 10, top: 10, right: 9, bottom: 20 } })).toBeNull();
    expect(placement({ content: { width: Number.NaN, height: 20 } })).toBeNull();
    expect(placement({ viewport: { width: 20, height: 600 } })).toBeNull();
    expect(placement({ preferredSide: "diagonal" as "top" })).toBeNull();
  });
});

describe("supplementary tooltip delay authority", () => {
  it("uses 600 ms for the first tooltip", () => {
    expect(resolveTooltipOpenDelay(createTooltipDelayState(), "look-help", 1_000))
      .toBe(TOOLTIP_FIRST_OPEN_DELAY_MS);
  });

  it("uses 100 ms for an adjacent tooltip while one is open", () => {
    const state = markTooltipOpened(createTooltipDelayState(), "look-help");
    expect(resolveTooltipOpenDelay(state, "motion-help", 1_000))
      .toBe(TOOLTIP_ADJACENT_OPEN_DELAY_MS);
    expect(resolveTooltipOpenDelay(state, "look-help", 1_000)).toBe(0);
  });

  it("keeps the adjacent delay briefly after crossing the gap between triggers", () => {
    const opened = markTooltipOpened(createTooltipDelayState(), "look-help");
    const closed = markTooltipClosed(opened, "look-help", 1_000);
    expect(resolveTooltipOpenDelay(closed, "motion-help", 1_799))
      .toBe(TOOLTIP_ADJACENT_OPEN_DELAY_MS);
    expect(resolveTooltipOpenDelay(closed, "motion-help", 1_800))
      .toBe(TOOLTIP_FIRST_OPEN_DELAY_MS);
  });

  it("fails invalid timing state back to the deliberate first-open delay", () => {
    expect(resolveTooltipOpenDelay(
      { activeTooltipId: "", adjacentUntilMs: Number.NaN },
      "motion-help",
      -1,
    )).toBe(TOOLTIP_FIRST_OPEN_DELAY_MS);
  });
});
