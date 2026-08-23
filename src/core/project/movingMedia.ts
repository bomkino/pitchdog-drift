import type { DriftProjectV4 } from "./schema";

export interface MovingMediaItem {
  readonly assetId: string;
  /** Index in the complete authored deck before pinned-only exclusion. */
  readonly sourceIndex: number;
}

export interface MovingMediaResolution {
  readonly order: readonly string[];
  readonly items: readonly MovingMediaItem[];
  readonly count: number;
  readonly excludedPinnedOnlyAssetId: string | null;
  readonly pinnedOnlyAssetExcluded: boolean;
}

type MovingMediaProject = Pick<DriftProjectV4, "media" | "presenter">;

/**
 * Returns the one ordered still that belongs exclusively to the pinned frame.
 * Disabled pins, presenter video, and moving-and-pinned stills remain outside
 * this exclusion rule.
 */
export function getPinnedOnlyMovingMediaExclusion(
  project: MovingMediaProject,
): string | null {
  const { presenter } = project;
  if (!presenter.enabled || presenter.trackMode !== "pinned-only" || presenter.assetId === null) {
    return null;
  }
  const asset = project.media.assets[presenter.assetId];
  return asset?.kind === "image" && project.media.order.includes(presenter.assetId)
    ? presenter.assetId
    : null;
}

/** Canonical ordered moving-track identity for timing, rendering, and receipts. */
export function resolveMovingMedia(project: MovingMediaProject): MovingMediaResolution {
  const excludedPinnedOnlyAssetId = getPinnedOnlyMovingMediaExclusion(project);
  const items = project.media.order.flatMap((assetId, sourceIndex) => (
    assetId === excludedPinnedOnlyAssetId
      ? []
      : [Object.freeze({ assetId, sourceIndex })]
  ));
  const order = items.map(({ assetId }) => assetId);
  return Object.freeze({
    order: Object.freeze(order),
    items: Object.freeze(items),
    count: items.length,
    excludedPinnedOnlyAssetId,
    pinnedOnlyAssetExcluded: excludedPinnedOnlyAssetId !== null,
  });
}

export function resolveMovingMediaOrder(project: MovingMediaProject): readonly string[] {
  return resolveMovingMedia(project).order;
}

export function countMovingMedia(project: MovingMediaProject): number {
  return resolveMovingMedia(project).count;
}
