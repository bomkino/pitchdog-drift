import type { DriftProjectV4 } from "./schema";

/** Exact saved-content identity, not visual fidelity or an archive-byte hash. */
export function documentContentIdentity(project: DriftProjectV4): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, child]) => [key, canonical(child)]),
    );
    return value;
  };
  // Saving changes the envelope timestamp, not the authored document.
  return JSON.stringify(canonical({ ...project, updatedAt: "" }));
}

/** Persist and bind before changing the visible project or its undo history. */
export async function commitProjectReplacement(steps: {
  persistCandidate: () => Promise<void>;
  bindCandidate: () => Promise<void>;
  restorePrevious: () => Promise<void>;
}): Promise<void> {
  await steps.persistCandidate();
  try {
    await steps.bindCandidate();
  } catch (cause) {
    try { await steps.restorePrevious(); }
    catch (rollback) {
      throw new AggregateError([cause, rollback], "Project opening failed and recovery could not be restored. The previous project remains open; save a copy before quitting.");
    }
    throw cause;
  }
}
