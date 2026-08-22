import {
  DRIFT_PROJECT_V4_MIGRATOR,
  DRIFT_PROJECT_V4_VERSION,
  DRIFT_V1_COMPAT_RENDER_CONTRACT,
  type DriftProjectV4,
  type DriftProjectV4SourceFormat,
} from "./schema";
import { validateDriftProjectV3, validateDriftProjectV4 } from "./validation";

export function migrateDriftProjectV3ToV4(
  input: unknown,
  sourceFormat: DriftProjectV4SourceFormat = "project-v3",
): DriftProjectV4 {
  const {
    schema,
    formatVersion: _formatVersion,
    ...project
  } = validateDriftProjectV3(input);

  return validateDriftProjectV4({
    schema,
    formatVersion: DRIFT_PROJECT_V4_VERSION,
    renderContract: DRIFT_V1_COMPAT_RENDER_CONTRACT,
    migration: {
      sourceFormat,
      migrator: DRIFT_PROJECT_V4_MIGRATOR,
    },
    ...project,
    extensions: {},
  });
}
