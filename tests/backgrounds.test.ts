import { describe, expect, it } from "vitest";
import { BACKGROUND_FAMILIES, backgroundMode, getBackgroundFamily } from "../src/backgrounds";
import { BACKGROUND_STYLES } from "../src/model";

describe("authored background corpus", () => {
  it("covers the public style contract exactly once", () => {
    expect(BACKGROUND_FAMILIES.map((family) => family.id)).toEqual(BACKGROUND_STYLES);
    expect(new Set(BACKGROUND_FAMILIES.map((family) => family.id)).size).toBe(BACKGROUND_STYLES.length);
  });

  it("ships fourteen rendered atmosphere families plus transparent output", () => {
    const rendered = BACKGROUND_FAMILIES.filter((family) => family.rendered);
    expect(rendered).toHaveLength(14);
    expect(rendered.map((family) => family.mode)).toEqual(Array.from({ length: 14 }, (_, index) => index));
    expect(getBackgroundFamily("transparent").rendered).toBe(false);
    expect(backgroundMode("projector")).toBe(13);
  });

  it("gives every family an authored sentence rather than a bare shader id", () => {
    for (const family of BACKGROUND_FAMILIES) {
      expect(family.name.trim().length).toBeGreaterThan(3);
      expect(family.description.trim().length).toBeGreaterThan(40);
    }
  });
});
