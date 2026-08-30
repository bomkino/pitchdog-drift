import { describe, expect, it } from "vitest";
import { disclosureDuration } from "../src/components/MeasuredDisclosure";

describe("measured disclosure duration", () => {
  it("keeps short controls responsive and caps very tall panels", () => {
    expect(disclosureDuration(0)).toBe(180);
    expect(disclosureDuration(200)).toBe(196);
    expect(disclosureDuration(800)).toBe(244);
    expect(disclosureDuration(1_400)).toBe(250);
    expect(disclosureDuration(-1_400)).toBe(250);
    expect(disclosureDuration(0, false)).toBe(140);
    expect(disclosureDuration(800, false)).toBe(180);
  });
});
