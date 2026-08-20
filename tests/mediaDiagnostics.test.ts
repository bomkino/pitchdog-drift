import { describe, expect, it } from "vitest";
import { buildMediaDiagnostic } from "../src/mediaDiagnostics";

function asset(width: number, height: number, hash = "", demo = false) {
  return { width, height, hash, demo };
}

describe("media diagnostics", () => {
  it("identifies a coherent deck without manufacturing a warning", () => {
    const diagnostic = buildMediaDiagnostic([
      asset(1920, 1080, "a"),
      asset(3840, 2160, "b"),
      asset(1600, 900, "c"),
    ]);
    expect(diagnostic).toMatchObject({
      level: "ready",
      label: "16:9 aligned",
      dominantRatio: "16:9",
      duplicateCount: 0,
    });
  });

  it("warns when a global cover surface may crop mixed sources", () => {
    const diagnostic = buildMediaDiagnostic([
      asset(1920, 1080, "a"),
      asset(1920, 1080, "b"),
      asset(1080, 1350, "c"),
    ]);
    expect(diagnostic).toMatchObject({
      level: "note",
      label: "Mixed source ratios",
      dominantRatio: "16:9",
    });
    expect(diagnostic.detail).toContain("2/3 slides are 16:9");
    expect(diagnostic.detail).toContain("global Cover setting may crop");
  });

  it("counts repeated content without assuming it is an error", () => {
    const diagnostic = buildMediaDiagnostic([
      asset(1920, 1080, "same"),
      asset(1920, 1080, "same"),
      asset(1920, 1080, "same"),
      asset(1920, 1080, "other"),
    ]);
    expect(diagnostic).toMatchObject({ level: "note", duplicateCount: 2 });
    expect(diagnostic.detail).toContain("repeats may be intentional");
  });

  it("labels the replaceable live study honestly", () => {
    const diagnostic = buildMediaDiagnostic([
      asset(1600, 900, "a", true),
      asset(1600, 900, "b", true),
    ]);
    expect(diagnostic).toMatchObject({
      level: "ready",
      label: "Live study · 2 slides",
    });
    expect(diagnostic.detail).toContain("first real import replaces it automatically");
  });
});
