import type { StudioAsset, StudioSettings } from "../../model";
import type { DriftProjectV4 } from "../project/schema";

export interface ExportAuthorityState {
  readonly project: DriftProjectV4;
  readonly settings: StudioSettings;
  readonly assets: readonly StudioAsset[];
  readonly presenter: StudioAsset | null;
}

export interface ExportAuthoritySnapshot {
  readonly project: DriftProjectV4;
  readonly settings: StudioSettings;
  readonly assets: StudioAsset[];
  readonly presenter: StudioAsset | null;
  readonly projectFingerprint: string;
  readonly settingsFingerprint: string;
  readonly assetFingerprint: string;
}

function projectFingerprint(project: DriftProjectV4): string {
  const authored = structuredClone(project);
  // Persistence advances this wall-clock field without changing creative
  // authority. Export admission must follow authored state, not autosave time.
  delete (authored as Partial<DriftProjectV4>).updatedAt;
  return JSON.stringify(authored);
}

function assetFingerprint(assets: readonly StudioAsset[], presenter: StudioAsset | null): string {
  return JSON.stringify([...assets, ...(presenter ? [presenter] : [])].map((asset) => ({
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    duration: asset.duration ?? null,
    hash: asset.hash ?? null,
    objectUrl: asset.objectUrl,
    blobSize: asset.blob.size,
    blobType: asset.blob.type,
  })));
}

export function captureExportAuthority(state: ExportAuthorityState): ExportAuthoritySnapshot {
  return Object.freeze({
    project: structuredClone(state.project),
    settings: structuredClone(state.settings),
    assets: [...state.assets],
    presenter: state.presenter,
    projectFingerprint: projectFingerprint(state.project),
    settingsFingerprint: JSON.stringify(state.settings),
    assetFingerprint: assetFingerprint(state.assets, state.presenter),
  });
}

export function assertExportAuthorityUnchanged(
  snapshot: ExportAuthoritySnapshot,
  current: ExportAuthorityState,
): void {
  const changed = projectFingerprint(current.project) !== snapshot.projectFingerprint
    || JSON.stringify(current.settings) !== snapshot.settingsFingerprint
    || assetFingerprint(current.assets, current.presenter) !== snapshot.assetFingerprint;

  if (changed) {
    throw new DOMException(
      "Project changed while export was preparing. Nothing was committed; start the export again.",
      "InvalidStateError",
    );
  }
}
