import { describe, expect, it } from "vitest";
import { COMPOSITION_GUIDES, COMPOSITION_GUIDE_MODES, getCompositionGuide, nextCompositionGuide } from "../src/guides";

describe("preview-only composition guides", () => {
  it("covers every guide exactly once with honest descriptions", () => {
    expect(COMPOSITION_GUIDES.map((guide) => guide.id)).toEqual(COMPOSITION_GUIDE_MODES);
    expect(new Set(COMPOSITION_GUIDES.map((guide) => guide.id)).size).toBe(COMPOSITION_GUIDE_MODES.length);
    expect(getCompositionGuide("social-safe").description).toContain("verify");
  });

  it("cycles predictably and returns to an unobstructed preview", () => {
    let mode = nextCompositionGuide("off");
    expect(mode).toBe("thirds");
    mode = nextCompositionGuide(mode);
    expect(mode).toBe("title-safe");
    mode = nextCompositionGuide(mode);
    expect(mode).toBe("social-safe");
    expect(nextCompositionGuide(mode)).toBe("off");
  });
});
