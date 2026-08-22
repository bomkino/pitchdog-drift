import type { StudioSettings } from "../../model";
import type { AspectSize, StageSize } from "./layout";

export interface FirstPinComposition {
  readonly trackMode: "pinned-only";
  readonly layoutMode: "safe-overlay";
  readonly aspectMode: "source";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly safeInset: number;
  readonly shadowOpacity: number;
  readonly shadowSoftness: number;
  readonly shadowOffsetX: number;
  readonly shadowOffsetY: number;
}

/**
 * Authored first-use composition. It is applied only while no pin identity has
 * ever been chosen; remembered or user-positioned pins are never repositioned.
 */
export function resolveFirstPinComposition(
  stage: StageSize,
  source: AspectSize,
): FirstPinComposition {
  const stageWidth = Math.max(1, stage.width);
  const stageHeight = Math.max(1, stage.height);
  const sourceAspect = Math.max(0.01, source.width / Math.max(1, source.height));
  const stagePortrait = stageHeight / stageWidth >= 1.2;
  const sourcePortrait = sourceAspect <= 1 / 1.15;
  const maxHeight = stagePortrait ? 0.44 : 0.45;
  const maxWidth = stagePortrait
    ? sourcePortrait ? 0.34 : 0.35
    : sourcePortrait ? 0.22 : 0.32;
  const heightLimitedWidth = maxHeight * (stageHeight / stageWidth) * sourceAspect;
  const width = Math.max(0.01, Math.min(maxWidth, heightLimitedWidth));

  if (stagePortrait) {
    return Object.freeze({
      trackMode: "pinned-only",
      layoutMode: "safe-overlay",
      aspectMode: "source",
      x: 0.94,
      y: sourcePortrait ? 0.58 : 0.62,
      width,
      safeInset: 0.055,
      shadowOpacity: 0.2,
      shadowSoftness: 72,
      shadowOffsetX: 0,
      shadowOffsetY: 14,
    });
  }

  return Object.freeze({
    trackMode: "pinned-only",
    layoutMode: "safe-overlay",
    aspectMode: "source",
    x: 0.94,
    y: 0.86,
    width,
    safeInset: 0.045,
    shadowOpacity: 0.18,
    shadowSoftness: 64,
    shadowOffsetX: 0,
    shadowOffsetY: 12,
  });
}

/**
 * Returns a pin to Drift's authored geometry without disturbing its media
 * identity, enabled state, crop, focal point, border, or corner treatment.
 * This is an explicit recovery action: saved custom direction is never
 * rewritten merely because a project was opened by a newer build.
 */
export function resetPinnedFrameComposition(
  settings: StudioSettings,
  source: AspectSize,
): StudioSettings {
  return {
    ...settings,
    presenter: {
      ...settings.presenter,
      ...resolveFirstPinComposition(settings.stage, source),
    },
  };
}
