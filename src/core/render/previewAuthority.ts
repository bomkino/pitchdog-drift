import type { StudioAsset, StudioSettings } from "../../model";
import {
  DRIFT_V2_RENDER_CONTRACT,
  type DriftProjectV4,
} from "../project/schema";

export interface PreviewAuthorityEngine {
  setV2ProjectState(project: DriftProjectV4, assets: StudioAsset[]): Promise<void>;
  setV1CompatibilityState(
    settings: StudioSettings,
    project: DriftProjectV4,
    assets: StudioAsset[],
  ): Promise<void>;
  setPresenterAsset(asset: StudioAsset | null): Promise<void>;
}

export interface PreviewAuthority {
  project: DriftProjectV4;
  settings: StudioSettings;
  assets: StudioAsset[];
  pinnedAsset: StudioAsset | null;
}

/**
 * Installs one complete preview authority after a temporary renderer takeover.
 * Export and comparison both use the same seam so the HUD cannot say “before”
 * while the WebGL canvas silently keeps showing live/export state.
 */
export async function installPreviewAuthority(
  engine: PreviewAuthorityEngine,
  authority: PreviewAuthority,
): Promise<void> {
  if (authority.project.renderContract === DRIFT_V2_RENDER_CONTRACT) {
    await engine.setV2ProjectState(authority.project, authority.assets);
  } else {
    await engine.setV1CompatibilityState(
      authority.settings,
      authority.project,
      authority.assets,
    );
  }
  await engine.setPresenterAsset(authority.pinnedAsset);
}
