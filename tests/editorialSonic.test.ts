import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings, type SonicPalette } from "../src/model";
import { validateStudioSettings } from "../src/lib/settingsValidation";
import {
  getSonicAssetVariantCount,
  SONIC_CUES,
  type SonicCue,
} from "../src/sonic/catalog";
import {
  buildSonicTimeline,
  getSonicPassageDecision,
} from "../src/sonic/plan";
import {
  buildSonicRecipe,
  getSonicRecipeCues,
  MAX_SONIC_RECIPE_LAYERS,
  type SonicRecipeInput,
} from "../src/sonic/recipe";

function input(
  palette: SonicPalette,
  cue: SonicCue = "passage",
  sequence = 1,
): SonicRecipeInput {
  return {
    palette,
    cue,
    seed: 17,
    sequence,
    variant: 1_234_567,
    gain: 0.8,
    playbackRate: 1.03,
    pan: -0.24,
  };
}

describe("editorial micro-Foley language", () => {
  it("persists and validates the editorial material direction", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.sound.palette = "editorial";
    expect(validateStudioSettings(settings)).toEqual(settings);

    for (const cue of SONIC_CUES) {
      expect(getSonicAssetVariantCount("editorial", cue)).toBeGreaterThan(0);
    }
  });

  it("leaves the established material directions exactly one layer deep", () => {
    for (const palette of ["studio", "cinematic", "paper"] as const) {
      for (const cue of SONIC_CUES) {
        const recipeInput = input(palette, cue, 9);
        const layers = buildSonicRecipe(recipeInput);
        expect(layers).toHaveLength(1);
        expect(layers[0]).toEqual({
          role: "body",
          cue,
          variant: recipeInput.variant,
          delay: 0,
          gain: recipeInput.gain,
          playbackRate: recipeInput.playbackRate,
          pan: recipeInput.pan,
        });
      }
    }
  });

  it("cycles every Editorial body take before reusing one at full density", () => {
    const takeCount = getSonicAssetVariantCount("editorial", "passage");
    expect(takeCount).toBe(5);
    const decisions = Array.from({ length: takeCount * 12 }, (_, index) => (
      getSonicPassageDecision(
        "editorial",
        1,
        1,
        37,
        index + 1,
      ).variant
    ));
    expect(decisions).toEqual(
      Array.from({ length: takeCount * 12 }, (_, index) => (
        getSonicPassageDecision(
          "editorial",
          1,
          1,
          37,
          index + 1,
        ).variant
      )),
    );
    for (let index = 1; index < decisions.length; index += 1) {
      expect(decisions[index]).not.toBe(decisions[index - 1]);
    }
    for (let offset = 0; offset < decisions.length; offset += takeCount) {
      const cycle = decisions.slice(offset, offset + takeCount);
      expect(new Set(cycle).size).toBe(takeCount);
      expect(cycle.every((variant) => (
        variant >= 0 && variant < takeCount
      ))).toBe(true);
    }
  });

  it("builds deterministic body, fibre, and sparse contact layers", () => {
    const first = buildSonicRecipe(input("editorial", "passage", 8));
    const second = buildSonicRecipe(input("editorial", "passage", 8));
    expect(first).toEqual(second);
    expect(first[0]?.role).toBe("body");
    expect(first[1]?.role).toBe("fibre");
    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(first.length).toBeLessThanOrEqual(MAX_SONIC_RECIPE_LAYERS);

    const contactSequences = Array.from({ length: 60 }, (_, index) => index + 1)
      .filter((sequence) => buildSonicRecipe(
        input("editorial", "passage", sequence),
      ).some((layer) => layer.role === "contact"));

    expect(contactSequences).toHaveLength(20);
    for (let index = 1; index < contactSequences.length; index += 1) {
      expect(contactSequences[index]! - contactSequences[index - 1]!).toBe(3);
    }
  });

  it("keeps every recipe finite, restrained, and voice-bounded", () => {
    for (const cue of SONIC_CUES) {
      for (let sequence = 0; sequence < 24; sequence += 1) {
        const layers = buildSonicRecipe({
          ...input("editorial", cue, sequence),
          gain: 1,
          playbackRate: sequence % 2 === 0 ? 0.78 : 1.2,
          pan: sequence % 2 === 0 ? -0.78 : 0.78,
        });
        expect(Object.isFrozen(layers)).toBe(true);
        expect(layers.length).toBeGreaterThan(0);
        expect(layers.length).toBeLessThanOrEqual(MAX_SONIC_RECIPE_LAYERS);
        expect(layers.reduce((sum, layer) => sum + layer.gain, 0)).toBeLessThanOrEqual(1.06);

        for (const layer of layers) {
          expect(Object.isFrozen(layer)).toBe(true);
          expect(SONIC_CUES).toContain(layer.cue);
          expect(Number.isInteger(layer.variant)).toBe(true);
          expect(Number.isFinite(layer.delay)).toBe(true);
          expect(layer.delay).toBeGreaterThanOrEqual(0);
          expect(layer.delay).toBeLessThanOrEqual(0.12);
          expect(Number.isFinite(layer.gain)).toBe(true);
          expect(layer.gain).toBeGreaterThan(0);
          expect(layer.gain).toBeLessThanOrEqual(1);
          expect(layer.playbackRate).toBeGreaterThanOrEqual(0.72);
          expect(layer.playbackRate).toBeLessThanOrEqual(1.28);
          expect(Math.abs(layer.pan)).toBeLessThanOrEqual(0.82);
        }
      }
    }
  });

  it("declares every dependent recording cue before playback or export", () => {
    const contactSequence = Array.from({ length: 3 }, (_, index) => index + 1)
      .find((sequence) => buildSonicRecipe(
        input("editorial", "passage", sequence),
      ).some((layer) => layer.role === "contact"));
    expect(contactSequence).toBeDefined();
    expect(getSonicRecipeCues(input(
      "editorial",
      "passage",
      contactSequence!,
    ))).toEqual(["passage", "settle"]);
    expect(getSonicRecipeCues(input("editorial", "grab", 2))).toEqual([
      "grab",
      "passage",
    ]);
    expect(getSonicRecipeCues(input("editorial", "release", 2))).toEqual([
      "release",
      "settle",
    ]);
    expect(getSonicRecipeCues(input("editorial", "success", 2))).toEqual([
      "success",
      "control",
    ]);
  });

  it("changes material complexity without rewriting editorial rhythm", () => {
    const studio = cloneSettings(DEFAULT_SETTINGS);
    studio.sound.exportEnabled = true;
    studio.sound.palette = "studio";
    studio.sound.density = 0.57;
    studio.sound.variation = 0.68;
    studio.output.duration = 24;

    const editorial = cloneSettings(studio);
    editorial.sound.palette = "editorial";

    const studioPassages = buildSonicTimeline(studio, 8, 24)
      .filter((event) => event.cue === "passage");
    const editorialPassages = buildSonicTimeline(editorial, 8, 24)
      .filter((event) => event.cue === "passage");

    expect(editorialPassages.map((event) => event.sequence)).toEqual(
      studioPassages.map((event) => event.sequence),
    );
    expect(editorialPassages.map((event) => event.time)).toEqual(
      studioPassages.map((event) => event.time),
    );
    expect(editorialPassages.length).toBeGreaterThan(3);

    for (const event of editorialPassages) {
      const recipeInput: SonicRecipeInput = {
        palette: "editorial",
        cue: event.cue,
        seed: editorial.background.seed,
        sequence: event.sequence,
        variant: event.variant,
        gain: event.gain,
        playbackRate: event.playbackRate,
        pan: event.pan,
      };
      expect(buildSonicRecipe(recipeInput)).toEqual(
        buildSonicRecipe(recipeInput),
      );
    }
  });
});
