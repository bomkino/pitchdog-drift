import type { LensSettings, PresenterSettingsV4 } from "../project/schema";

export interface PinnedFramePresentation {
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly layer: PresenterSettingsV4["layer"];
  readonly storyStart: number;
  readonly storyEnd: number;
  readonly sourceTime: number;
}

export interface PinnedFrameCompositePlan {
  readonly visible: boolean;
  readonly layer: PresenterSettingsV4["layer"];
  readonly opticalPath: "protected" | "through-lens";
  readonly requiresProtectedUnderlayPass: boolean;
}

export function resolvePinnedFrameCompositePlan(
  presentation: Pick<PinnedFramePresentation, "visible" | "layer">,
  lensActive: boolean,
  treatment: LensSettings["presenterTreatment"],
): PinnedFrameCompositePlan {
  const opticalPath = lensActive && treatment === "through-lens"
    ? "through-lens" as const
    : "protected" as const;
  return Object.freeze({
    visible: presentation.visible,
    layer: presentation.layer,
    opticalPath,
    requiresProtectedUnderlayPass: presentation.visible
      && presentation.layer === "below-slides"
      && opticalPath === "protected"
      && lensActive,
  });
}

/**
 * One canonical story-time and compositing decision for preview, scrub, still,
 * sequence, and video evaluation. The end is exclusive, matching fixed-step
 * frame ranges; a null authored end follows the current master duration.
 */
export function resolvePinnedFramePresentation(
  presenter: PresenterSettingsV4,
  masterDuration: number,
  time: number,
): PinnedFramePresentation {
  if (!Number.isFinite(masterDuration) || masterDuration <= 0) {
    throw new RangeError("Pinned-frame master duration must be a positive finite number.");
  }
  if (!Number.isFinite(time)) throw new RangeError("Pinned-frame story time must be finite.");
  const storyStart = Math.min(masterDuration, Math.max(0, presenter.startAt));
  const authoredEnd = presenter.endAt ?? masterDuration;
  const storyEnd = Math.min(masterDuration, Math.max(storyStart, authoredEnd));
  const boundedTime = Math.min(storyEnd, Math.max(storyStart, time));
  const enabled = presenter.enabled && presenter.assetId !== null;
  return Object.freeze({
    enabled,
    visible: enabled && time >= storyStart && time < storyEnd,
    layer: presenter.layer,
    storyStart,
    storyEnd,
    sourceTime: presenter.trimStart + boundedTime - storyStart,
  });
}
