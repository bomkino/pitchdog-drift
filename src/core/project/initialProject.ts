import { createDefaultDriftProjectV4 } from "./defaults";
import type { DriftProjectV4 } from "./schema";
import { applyEditorialDriftFoundation } from "../worlds";

/**
 * Creates a new Drift document with the current authored product foundation.
 * Build identity controls names, storage, and development affordances; it must
 * never decide which generation of the product a new document receives.
 */
export function createInitialDriftProjectV4(
  projectId: string,
  now = new Date().toISOString(),
): DriftProjectV4 {
  return applyEditorialDriftFoundation(
    createDefaultDriftProjectV4(projectId, now),
    "9:16",
    now,
  );
}
