import { describe, expect, it } from "vitest";
import {
  advanceLocalSaveRevision,
  createLocalSaveRevisionAuthority,
  matchesDirectPersistenceSnapshot,
  ownsLocalSaveRevision,
} from "../src/lib/localSaveAuthority";

describe("local save authority", () => {
  it("keeps exit protection active when an older save resolves after a newer mutation", async () => {
    const authority = createLocalSaveRevisionAuthority();
    let saveState: "saving" | "saved" = "saving";
    let releaseOldSave: (() => void) | undefined;
    const oldSaveHeld = new Promise<void>((resolve) => { releaseOldSave = resolve; });
    const oldRevision = advanceLocalSaveRevision(authority);
    const oldCompletion = oldSaveHeld.then(() => {
      if (ownsLocalSaveRevision(authority, oldRevision)) saveState = "saved";
    });

    // The mutation invalidates the active save synchronously, before React's
    // passive autosave effect can reserve and commit the newer snapshot.
    advanceLocalSaveRevision(authority);
    saveState = "saving";
    releaseOldSave?.();
    await oldCompletion;

    expect(saveState).toBe("saving");

    const newRevision = advanceLocalSaveRevision(authority);
    if (ownsLocalSaveRevision(authority, newRevision)) saveState = "saved";
    expect(saveState).toBe("saved");
  });

  it("suppresses autosave only for the exact directly persisted snapshot", () => {
    const settings = { speed: 1 };
    const assets = [{ id: "slide-1" }];
    const presenter = { id: "presenter-1" };
    const snapshot = { settings, assets, presenter };

    expect(matchesDirectPersistenceSnapshot(snapshot, settings, assets, presenter)).toBe(true);
    expect(matchesDirectPersistenceSnapshot(snapshot, { ...settings }, assets, presenter)).toBe(false);
    expect(matchesDirectPersistenceSnapshot(snapshot, settings, [...assets], presenter)).toBe(false);
    expect(matchesDirectPersistenceSnapshot(snapshot, settings, assets, { ...presenter })).toBe(false);
  });
});
