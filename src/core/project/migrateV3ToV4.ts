import {
  DRIFT_PROJECT_V4_MIGRATOR,
  DRIFT_PROJECT_V4_VERSION,
  DRIFT_V1_COMPAT_RENDER_CONTRACT,
  type DriftProjectV4,
  type DriftProjectV4SourceFormat,
  type PresenterSettingsV4,
} from "./schema";
import { validateDriftProjectV3, validateDriftProjectV4 } from "./validation";

export interface DriftProjectV4MigrationOverrides {
  presenter?: PresenterSettingsV4;
  masterAudioEnabled?: boolean;
}

function legacyCompatiblePresenter(
  project: ReturnType<typeof validateDriftProjectV3>,
): PresenterSettingsV4 {
  return {
    ...project.presenter,
    assetId: project.media.presenterAssetId,
    trackMode: "moving-and-pinned",
    layoutMode: "legacy-perspective",
    aspectMode: "custom",
    focalX: 0.5,
    focalY: 0.5,
    safeInset: 0,
    shadowOpacity: project.lighting.enabled ? project.lighting.shadowOpacity : 0,
    // V1's presenter branch rendered these values independently from the
    // moving-card shadow controls even though Project V3 could not say so.
    shadowSoftness: 48,
    shadowOffsetX: 12,
    shadowOffsetY: 18,
    matteColor: "#000000",
    matteOpacity: 1,
  };
}

export function migrateDriftProjectV3ToV4(
  input: unknown,
  sourceFormat: DriftProjectV4SourceFormat = "project-v3",
  overrides: DriftProjectV4MigrationOverrides = {},
): DriftProjectV4 {
  const validated = validateDriftProjectV3(input);
  const {
    schema,
    formatVersion: _formatVersion,
    presenter: _presenter,
    master,
    ...project
  } = validated;

  return validateDriftProjectV4({
    schema,
    formatVersion: DRIFT_PROJECT_V4_VERSION,
    renderContract: DRIFT_V1_COMPAT_RENDER_CONTRACT,
    migration: {
      sourceFormat,
      migrator: DRIFT_PROJECT_V4_MIGRATOR,
    },
    ...project,
    presenter: overrides.presenter ?? legacyCompatiblePresenter(validated),
    master: overrides.masterAudioEnabled === undefined
      ? master
      : { ...master, audio: { ...master.audio, enabled: overrides.masterAudioEnabled } },
    extensions: {},
  });
}
