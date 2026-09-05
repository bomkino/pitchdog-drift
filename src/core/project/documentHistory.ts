import type { StudioAsset } from "../../model";
import type { DriftProjectV4 } from "./schema";

export interface DocumentHistoryEntry {
  project: DriftProjectV4;
  assets: StudioAsset[];
  presenter: StudioAsset | null;
}
export interface DocumentHistory {
  past: DocumentHistoryEntry[];
  future: DocumentHistoryEntry[];
  lastGesture: { message: string; at: number } | null;
}
export function captureDocumentHistory(project: DriftProjectV4, assets: readonly StudioAsset[], presenter: StudioAsset | null): DocumentHistoryEntry {
  const source = (asset: StudioAsset): StudioAsset => ({ ...asset, objectUrl: "" });
  return { project: structuredClone(project), assets: assets.map(source), presenter: presenter ? source(presenter) : null };
}
/** History holds immutable original Blobs, never decoded pixels or live object URLs. */
export function trimDocumentHistory(history: DocumentHistory, liveAssets: readonly StudioAsset[], livePresenter: StudioAsset | null): void {
  history.past = history.past.slice(-50);
  history.future = history.future.slice(0, 50);
  const bytes = () => {
    const blobs = new Set<Blob>();
    const add = (assets: readonly StudioAsset[], presenter: StudioAsset | null) => {
      assets.forEach((a) => blobs.add(a.blob));
      if (presenter) blobs.add(presenter.blob);
    };
    add(liveAssets, livePresenter);
    [...history.past, ...history.future].forEach((entry) => add(entry.assets, entry.presenter));
    return [...blobs].reduce((sum, blob) => sum + blob.size, 0);
  };
  while (bytes() > 192 * 1024 * 1024 && history.past.length + history.future.length > 1) {
    if (history.past.length > 1) history.past.shift();
    else history.future.pop();
  }
}
