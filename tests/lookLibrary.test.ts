import { describe, expect, it } from "vitest";
import type { DirectorSnapshot } from "../src/lib/directorControlBridge";
import {
  DIRECTOR_LOOK_SCHEMA,
  DIRECTOR_LOOK_STORAGE_KEY,
  DIRECTOR_LOOK_VERSION,
  MAX_DIRECTOR_LOOKS,
  extractReusableLookState,
  parseDirectorLooks,
  readDirectorLooks,
  removeDirectorLook,
  upsertDirectorLook,
  writeDirectorLooks,
  type DirectorLook,
  type StorageLike,
} from "../src/lib/lookLibrary";

function snapshot(): DirectorSnapshot {
  return {
    theme: "Editorial Drift",
    controls: [
      { name: "Speed", value: "0.22" },
      { name: "Lens energy", value: "18" },
      { name: "Background", value: "aura" },
      { name: "Stage width", value: "1080" },
      { name: "Duration", value: "12" },
      { name: "Seamless export lock", value: true },
      { name: "Reduced-motion master", value: false },
      { name: "Width", value: "28" },
      { name: "Pinned radius", value: "42" },
      { name: "Keep one frame still", value: true },
    ],
    segmented: [
      { group: "Flow axis", option: "Vertical" },
      { group: "Image fit", option: "Cover" },
      { group: "Stage ratio", option: "9:16" },
      { group: "Frame rate", option: "30" },
      { group: "Pinned ratio", option: "9:16" },
    ],
  };
}

function look(id: string, name: string, updatedAt = "2026-08-20T00:00:00.000Z"): DirectorLook {
  return {
    schema: DIRECTOR_LOOK_SCHEMA,
    version: DIRECTOR_LOOK_VERSION,
    id,
    name,
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt,
    state: extractReusableLookState(snapshot()),
  };
}

class MemoryStorage implements StorageLike {
  value: string | null = null;
  getItem(key: string): string | null {
    expect(key).toBe(DIRECTOR_LOOK_STORAGE_KEY);
    return this.value;
  }
  setItem(key: string, value: string): void {
    expect(key).toBe(DIRECTOR_LOOK_STORAGE_KEY);
    this.value = value;
  }
}

describe("reusable look boundaries", () => {
  it("keeps visual direction while excluding media, presenter, master, and accessibility output decisions", () => {
    const state = extractReusableLookState(snapshot());

    expect(state.theme).toBe("Editorial Drift");
    expect(state.controls).toEqual([
      { name: "Speed", value: "0.22" },
      { name: "Lens energy", value: "18" },
      { name: "Background", value: "aura" },
    ]);
    expect(state.segmented).toEqual([
      { group: "Flow axis", option: "Vertical" },
      { group: "Image fit", option: "Cover" },
    ]);
  });

  it("normalizes names and updates an existing case-insensitive signature instead of duplicating it", () => {
    const first = upsertDirectorLook(
      [],
      "  Quiet   Glass  ",
      snapshot(),
      "look-one",
      "2026-08-20T00:00:00.000Z",
    );
    const second = upsertDirectorLook(
      first.looks,
      "quiet glass",
      { ...snapshot(), controls: [{ name: "Speed", value: "0.34" }] },
      "unused-new-id",
      "2026-08-20T01:00:00.000Z",
    );

    expect(first.look.name).toBe("Quiet Glass");
    expect(second.looks).toHaveLength(1);
    expect(second.look.id).toBe("look-one");
    expect(second.look.createdAt).toBe(first.look.createdAt);
    expect(second.look.updatedAt).toBe("2026-08-20T01:00:00.000Z");
    expect(second.look.state.controls).toEqual([{ name: "Speed", value: "0.34" }]);
  });

  it("enforces the bounded library and removes only the requested look", () => {
    let looks: DirectorLook[] = [];
    for (let index = 0; index < MAX_DIRECTOR_LOOKS + 5; index += 1) {
      looks = upsertDirectorLook(
        looks,
        `Look ${index}`,
        snapshot(),
        `look-${index}`,
        new Date(Date.UTC(2026, 7, 20, 0, index)).toISOString(),
      ).looks;
    }

    expect(looks).toHaveLength(MAX_DIRECTOR_LOOKS);
    expect(looks[0]?.name).toBe(`Look ${MAX_DIRECTOR_LOOKS + 4}`);
    const removed = removeDirectorLook(looks, looks[5]!.id);
    expect(removed).toHaveLength(MAX_DIRECTOR_LOOKS - 1);
    expect(removed.some((candidate) => candidate.id === looks[5]!.id)).toBe(false);
  });
});

describe("look storage trust boundary", () => {
  it("round-trips valid looks and sorts newest first", () => {
    const storage = new MemoryStorage();
    const older = look("older", "Older", "2026-08-20T00:00:00.000Z");
    const newer = look("newer", "Newer", "2026-08-20T01:00:00.000Z");

    expect(writeDirectorLooks(storage, [older, newer])).toBe(true);
    expect(readDirectorLooks(storage).map((entry) => entry.id)).toEqual(["newer", "older"]);
  });

  it("drops malformed, duplicate, overreaching, and hostile records instead of trusting local storage", () => {
    const valid = look("valid", "Valid");
    const duplicate = { ...valid, name: "Duplicate id" };
    const hostile = {
      ...valid,
      id: "hostile",
      state: {
        ...valid.state,
        controls: [...valid.state.controls, { name: "Duration", value: "3" }],
      },
    };
    const malformed = { ...valid, id: "malformed", updatedAt: "not-a-date" };
    const parsed = parseDirectorLooks(JSON.stringify([valid, duplicate, hostile, malformed, { __proto__: { polluted: true } }]));

    // Excluded master controls invalidate a persisted state rather than being
    // silently allowed to cross the reusable-look boundary.
    expect(parsed.map((entry) => entry.id)).toEqual(["valid"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("fails closed when storage is unavailable or over quota", () => {
    const throwing: StorageLike = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("quota"); },
    };
    expect(readDirectorLooks(throwing)).toEqual([]);
    expect(writeDirectorLooks(throwing, [look("one", "One")])).toBe(false);
  });

  it("treats invalid JSON and wrong top-level shapes as an empty library", () => {
    expect(parseDirectorLooks("{")) .toEqual([]);
    expect(parseDirectorLooks(JSON.stringify({ looks: [] }))).toEqual([]);
    expect(parseDirectorLooks(null)).toEqual([]);
  });
});
