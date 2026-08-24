import { describe, expect, it } from "vitest";
import { disclosureDuration } from "../src/components/MeasuredDisclosure";

describe("measured disclosure duration", () => {
  it("keeps short controls responsive and caps very tall panels", () => {
    expect(disclosureDuration(0)).toBe(240);
    expect(disclosureDuration(200)).toBe(240);
    expect(disclosureDuration(800)).toBe(330);
    expect(disclosureDuration(1_400)).toBe(420);
    expect(disclosureDuration(-1_400)).toBe(420);
  });
});
