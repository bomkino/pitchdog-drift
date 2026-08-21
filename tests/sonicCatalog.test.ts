import { describe, expect, it } from "vitest";
import type { SonicPalette } from "../src/model";
import {
  getSonicAssetSpec,
  getSonicAssetVariantCount,
  SONIC_CUES,
} from "../src/sonic/catalog";

const PALETTES: readonly SonicPalette[] = [
  "studio",
  "cinematic",
  "paper",
  "editorial",
];

describe("sonic catalogue treatments", () => {
  it("keeps every treatment finite, bounded, local, and non-destructive", () => {
    const unique = new Map<string, ReturnType<typeof getSonicAssetSpec>>();

    for (const palette of PALETTES) {
      for (const cue of SONIC_CUES) {
        const count = getSonicAssetVariantCount(palette, cue);
        expect(count).toBeGreaterThan(0);
        for (let variant = 0; variant < count; variant += 1) {
          const spec = getSonicAssetSpec(palette, cue, variant);
          expect(Object.isFrozen(spec)).toBe(true);
          expect(spec.name).toMatch(/\.wav$/);
          expect(spec.uri).not.toMatch(/^(?:data:|https?:\/\/|\/\/)/);
          expect(Number.isFinite(spec.trimStart)).toBe(true);
          expect(Number.isFinite(spec.trimEnd)).toBe(true);
          expect(Number.isFinite(spec.gain)).toBe(true);
          expect(spec.trimStart).toBeGreaterThanOrEqual(0);
          expect(spec.trimStart).toBeLessThanOrEqual(0.6);
          expect(spec.trimEnd).toBeGreaterThanOrEqual(0);
          expect(spec.trimEnd).toBeLessThanOrEqual(0.5);
          expect(spec.gain).toBeGreaterThanOrEqual(0.35);
          expect(spec.gain).toBeLessThanOrEqual(7);
          expect(Number.isFinite(spec.gainDb)).toBe(true);
          expect(spec.gainDb).toBeGreaterThanOrEqual(-12);
          expect(spec.gainDb).toBeLessThanOrEqual(18);

          const existing = unique.get(spec.name);
          if (existing) expect(spec).toBe(existing);
          else unique.set(spec.name, spec);
        }
      }
    }

    expect(unique.size).toBe(23);
  });

  it("wraps deterministic variant indexes without inventing recordings", () => {
    for (const palette of PALETTES) {
      for (const cue of SONIC_CUES) {
        const count = getSonicAssetVariantCount(palette, cue);
        expect(getSonicAssetSpec(palette, cue, count)).toBe(
          getSonicAssetSpec(palette, cue, 0),
        );
        expect(getSonicAssetSpec(palette, cue, -1)).toBe(
          getSonicAssetSpec(palette, cue, count - 1),
        );
      }
    }
  });
});
