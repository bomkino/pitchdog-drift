import { describe, expect, it } from "vitest";
import {
  BACKGROUND_ATLAS_SEED_BASE,
  BACKGROUND_COMPOSITION_COUNT,
  BACKGROUND_COMPOSITIONS,
  BACKGROUND_COMPOSITIONS_PER_FAMILY,
  BACKGROUND_PALETTES,
  BACKGROUND_STUDIES,
  BACKGROUND_VARIATION_COUNT,
  CURATED_BACKGROUND_STUDY_IDS,
  applyBackgroundStudy,
  backgroundCompositionIndex,
  backgroundVariation,
  encodeBackgroundSeed,
  curatedBackgroundStudies,
  matchingBackgroundPalette,
  matchingBackgroundStudy,
  withBackgroundComposition,
  withBackgroundPalette,
  withBackgroundVariation,
  type OpaqueBackgroundStyle,
} from "../src/backgrounds";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import { validateStudioSettings } from "../src/lib/settingsValidation";

const FAMILIES: readonly OpaqueBackgroundStyle[] = [
  "solid",
  "gradient",
  "aura",
  "paper",
  "void",
  "cutting-map",
  "grid",
  "wave",
  "atelier",
];

describe("background atlas catalogue", () => {
  it("ships eight materially named compositions for every opaque family", () => {
    expect(BACKGROUND_COMPOSITION_COUNT).toBe(FAMILIES.length * BACKGROUND_COMPOSITIONS_PER_FAMILY);
    for (const family of FAMILIES) {
      const entries = BACKGROUND_COMPOSITIONS[family];
      expect(entries).toHaveLength(BACKGROUND_COMPOSITIONS_PER_FAMILY);
      expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
      expect(new Set(entries.map((entry) => entry.name)).size).toBe(entries.length);
      for (const entry of entries) expect(entry.description.length).toBeGreaterThan(24);
    }
  });

  it("ships a broad palette library without duplicate colour signatures", () => {
    expect(BACKGROUND_PALETTES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(BACKGROUND_PALETTES.map((palette) => palette.id)).size).toBe(BACKGROUND_PALETTES.length);
    expect(new Set(BACKGROUND_PALETTES.map((palette) => `${palette.colorA}/${palette.colorB}/${palette.accent}`)).size)
      .toBe(BACKGROUND_PALETTES.length);
  });

  it("ships one authored study for every family/composition pair", () => {
    expect(BACKGROUND_STUDIES).toHaveLength(BACKGROUND_COMPOSITION_COUNT);
    expect(new Set(BACKGROUND_STUDIES.map((study) => study.id)).size).toBe(BACKGROUND_STUDIES.length);
    expect(new Set(BACKGROUND_STUDIES.map((study) => study.background.seed)).size).toBe(BACKGROUND_STUDIES.length);

    for (const family of FAMILIES) {
      const studies = BACKGROUND_STUDIES.filter((study) => study.family === family);
      expect(studies).toHaveLength(BACKGROUND_COMPOSITIONS_PER_FAMILY);
      expect(studies.map((study) => study.composition).sort((a, b) => a - b))
        .toEqual(Array.from({ length: BACKGROUND_COMPOSITIONS_PER_FAMILY }, (_, index) => index));
    }
  });

  it("keeps the first visual shelf small, diverse, deterministic, and spatially stable", () => {
    const shelf = curatedBackgroundStudies(null);
    expect(shelf.map(({ id }) => id)).toEqual(CURATED_BACKGROUND_STUDY_IDS);
    expect(shelf).toHaveLength(11);
    expect(new Set(shelf.map(({ id }) => id)).size).toBe(shelf.length);
    expect(new Set(shelf.map(({ family }) => family))).toEqual(new Set(FAMILIES));

    const alreadyCurated = shelf.find(({ id }) => id === "verdigris-fresco-study")!;
    expect(curatedBackgroundStudies(alreadyCurated).map(({ id }) => id)).toEqual(CURATED_BACKGROUND_STUDY_IDS);

    const outsideShelf = BACKGROUND_STUDIES.find(({ id }) => id === "aurora-veil")!;
    const withCurrent = curatedBackgroundStudies(outsideShelf);
    expect(withCurrent).toHaveLength(11);
    expect(withCurrent[0]).toBe(outsideShelf);
    expect(withCurrent.filter(({ id }) => id === outsideShelf.id)).toHaveLength(1);
    expect(curatedBackgroundStudies(outsideShelf)).toEqual(withCurrent);
    expect(curatedBackgroundStudies(outsideShelf, 0)).toEqual([]);
    expect(curatedBackgroundStudies(outsideShelf, 4).map(({ id }) => id)).toEqual([
      "aurora-veil",
      "black-leader",
      "cotton-rag",
      "road-memory-field",
    ]);
  });

  it("keeps the restrained-motion family registries aligned with their authored studies", () => {
    for (const family of ["cutting-map", "grid", "wave", "atelier"] as const) {
      const compositions = BACKGROUND_COMPOSITIONS[family];
      const studies = BACKGROUND_STUDIES.filter((study) => study.family === family);

      expect(compositions).toHaveLength(8);
      expect(studies.map((study) => study.composition).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(studies.every((study) => study.background.motion >= 0.04 && study.background.motion <= 0.14)).toBe(true);
      expect(studies.every((study) => study.background.intensity <= 0.55)).toBe(true);

      const transparent = cloneSettings(DEFAULT_SETTINGS);
      transparent.stage.transparent = true;
      transparent.background.style = "transparent";
      const applied = applyBackgroundStudy(transparent, studies[0]!);
      expect(applied.stage.transparent).toBe(false);
      expect(applied.background.style).toBe(family);
    }
  });

  it("keeps every authored study inside the persisted settings contract", () => {
    for (const study of BACKGROUND_STUDIES) {
      const settings = applyBackgroundStudy(cloneSettings(DEFAULT_SETTINGS), study);
      expect(validateStudioSettings(settings)).toEqual(settings);
      expect(backgroundCompositionIndex(settings.background.seed)).toBe(study.composition);
      expect(backgroundVariation(settings.background.seed)).toBe(study.variation);
      expect(matchingBackgroundStudy(settings.background)?.id).toBe(study.id);
      expect(matchingBackgroundPalette(settings.background)?.id).toBe(study.paletteId);
    }
  });
});

describe("background atlas seed codec", () => {
  it("reserves low seeds for the legacy composition", () => {
    for (const seed of [0, 17, 93, BACKGROUND_ATLAS_SEED_BASE - 1]) {
      expect(backgroundCompositionIndex(seed)).toBe(0);
      expect(backgroundVariation(seed)).toBe(seed % BACKGROUND_VARIATION_COUNT);
    }
  });

  it("round-trips every exposed composition and variation", () => {
    for (let composition = 0; composition < BACKGROUND_COMPOSITIONS_PER_FAMILY; composition += 1) {
      for (let variation = 0; variation < BACKGROUND_VARIATION_COUNT; variation += 1) {
        const seed = encodeBackgroundSeed(composition, variation);
        expect(backgroundCompositionIndex(seed)).toBe(composition);
        expect(backgroundVariation(seed)).toBe(variation);
      }
    }
  });

  it("changes one atlas axis without mutating the rest of the background", () => {
    const original = cloneSettings(DEFAULT_SETTINGS).background;
    const composed = withBackgroundComposition(original, 6);
    expect(backgroundCompositionIndex(composed.seed)).toBe(6);
    expect(backgroundVariation(composed.seed)).toBe(backgroundVariation(original.seed));
    expect({ ...composed, seed: original.seed }).toEqual(original);

    const varied = withBackgroundVariation(composed, 91);
    expect(backgroundCompositionIndex(varied.seed)).toBe(6);
    expect(backgroundVariation(varied.seed)).toBe(91);
    expect({ ...varied, seed: composed.seed }).toEqual(composed);
  });
});

describe("background atlas application", () => {
  it("preserves every non-background director choice", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.stage.width = 1920;
    settings.stage.height = 1080;
    settings.output.width = 1920;
    settings.output.height = 1080;
    settings.motion.speed = 0.73;
    settings.slide.radius = 71;
    settings.presenter.x = 0.23;
    settings.stage.transparent = true;
    settings.background.style = "transparent";

    const study = BACKGROUND_STUDIES[23]!;
    const result = applyBackgroundStudy(settings, study);

    expect(result.themeId).toBe(settings.themeId);
    expect(result.stage).toEqual({ ...settings.stage, transparent: false });
    expect(result.motion).toEqual(settings.motion);
    expect(result.slide).toEqual(settings.slide);
    expect(result.presenter).toEqual(settings.presenter);
    expect(result.output).toEqual(settings.output);
    expect(result.background).toEqual(study.background);
  });

  it("applies a palette without disturbing family, composition, or treatment", () => {
    const original = BACKGROUND_STUDIES[31]!.background;
    const palette = BACKGROUND_PALETTES[4]!;
    const result = withBackgroundPalette(original, palette);

    expect(result.style).toBe(original.style);
    expect(result.seed).toBe(original.seed);
    expect(result.intensity).toBe(original.intensity);
    expect(result.motion).toBe(original.motion);
    expect(result.grain).toBe(original.grain);
    expect(result.vignette).toBe(original.vignette);
    expect(matchingBackgroundPalette(result)?.id).toBe(palette.id);
  });
});
