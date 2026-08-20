import { describe, expect, it } from "vitest";
import {
  PROJECT_MEDIA_LIMITS,
  formatProjectMiB,
  projectMediaViolation,
  selectProjectMediaWithinBudget,
} from "../src/lib/projectMediaBudget";

const MiB = 1024 * 1024;
const item = (name: string, size: number) => ({ name, size });

describe("project media budget", () => {
  it("accepts only files that the verified portable-project format can persist", () => {
    const selection = selectProjectMediaWithinBudget([
      item("one.png", 20 * MiB),
      item("oversized.mov", 65 * MiB),
      item("two.png", 30 * MiB),
      item("no-room.png", 21 * MiB),
      item("three.png", 10 * MiB),
      item("count-limited.png", 1 * MiB),
    ], 10 * MiB, 3);

    expect(selection.accepted.map(({ name }) => name)).toEqual(["one.png", "two.png", "three.png"]);
    expect(selection.rejectedTooLarge.map(({ name }) => name)).toEqual(["oversized.mov"]);
    expect(selection.rejectedForBudget.map(({ name }) => name)).toEqual(["no-room.png"]);
    expect(selection.rejectedForCount.map(({ name }) => name)).toEqual(["count-limited.png"]);
    expect(selection.remainingBytes).toBe(10 * MiB);
  });

  it("does not let a replacement presenter push original media beyond 80 MiB", () => {
    expect(projectMediaViolation(32 * MiB, 48 * MiB)).toBeNull();
    expect(projectMediaViolation(32 * MiB + 1, 48 * MiB)).toContain("80 MiB");
  });

  it("uses the same 64 MiB per-asset ceiling as project verification", () => {
    expect(PROJECT_MEDIA_LIMITS.maxAssetBytes).toBe(64 * MiB);
    expect(projectMediaViolation(64 * MiB, 0)).toBeNull();
    expect(projectMediaViolation(64 * MiB + 1, 0)).toContain("64 MiB");
  });

  it("rejects invalid byte accounting instead of converting it silently", () => {
    expect(() => selectProjectMediaWithinBudget([item("bad", 1)], -1, 1)).toThrow(TypeError);
    expect(() => selectProjectMediaWithinBudget([item("bad", 1)], 0, -1)).toThrow(TypeError);
    expect(projectMediaViolation(0, 0)).toContain("readable byte");
    expect(projectMediaViolation(1, -1)).toContain("accounting is invalid");
  });

  it("formats exact binary limits without pretending they are decimal megabytes", () => {
    expect(formatProjectMiB(PROJECT_MEDIA_LIMITS.maxAssetBytes)).toBe("64 MiB");
    expect(formatProjectMiB(PROJECT_MEDIA_LIMITS.maxTotalBytes)).toBe("80 MiB");
  });
});
