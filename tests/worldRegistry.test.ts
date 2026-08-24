import { describe, expect, it } from "vitest";
import {
  ATMOSPHERE_FAMILIES,
  ATMOSPHERE_HERO_STUDIES,
  EDITORIAL_DRIFT_9_16_RECIPE,
  EDITORIAL_DRIFT_RATIO_OVERRIDES,
  WORLD_IDENTITIES,
  WORLD_RATIO_DIMENSIONS,
  WORLD_RATIO_IDS,
  nearestWorldRatioForDimensions,
  worldRatioForDimensions,
  WORLD_REGISTRY_IMPLEMENTATION_STATUS,
  applyWorldRecipeOverride,
  assertWorldRegistryIntegrity,
  atmosphereCompositions,
  atmosphereFamily,
  editorialDriftRecipe,
  worldIdentity,
  type WorldRecipe,
} from "../src/core/worlds";

describe("V2 World registry foundation", () => {
  it("keeps the curated nine-by-eight atmosphere corpus exact", () => {
    expect(ATMOSPHERE_FAMILIES.map((family) => [
      family.id,
      family.compositions.map((composition) => composition.id),
    ])).toEqual([
      ["solid", ["pure-field", "projector-wash", "edge-light", "duotone-floor", "soft-burn", "paper-tooth", "low-halo", "night-exposure"]],
      ["gradient", ["legacy-horizon", "horizon-melt", "diagonal-weather", "radial-dusk", "prism-bands", "twin-suns", "split-signal", "road-mirage"]],
      ["aura", ["orbiting-bloom", "projector-halo", "aurora-veil", "stained-light", "liquid-caustic", "rose-chamber", "ice-bloom", "mandorla"]],
      ["paper", ["long-fibres", "contact-sheet", "risograph-cloud", "linen-drift", "newsprint", "silver-emulsion", "halftone-field", "dust-archive"]],
      ["void", ["breathing-slit", "eclipse", "ember-smoke", "abyssal-rays", "mineral-fog", "rain-negative", "chemical-burn", "black-tide"]],
      ["cutting-map", ["contour-notes", "folded-atlas", "route-thread", "parcel-lines", "registration-field", "coastline-proof", "crop-window", "survey-drift"]],
      ["grid", ["modular-field", "offset-ledger", "quiet-thirds", "baseline-rhythm", "coordinate-crosses", "broken-matrix", "contact-columns", "perspective-register"]],
      ["wave", ["tidal-horizon", "nested-swell", "interference-bed", "ribbon-current", "standing-wave", "radial-echo", "contour-current", "undertow-lines"]],
      ["atelier", ["saffron-anatomy", "verdigris-fresco", "ultramarine-ledger", "rose-madder-bloom", "charcoal-cartography", "gilded-palimpsest", "indigo-botanical", "oxide-gesture"]],
    ]);
    expect(atmosphereCompositions()).toHaveLength(72);
  });

  it("records the twelve candidate first-shelf studies named in the Director's Cut", () => {
    expect(ATMOSPHERE_HERO_STUDIES.map((study) => study.name)).toEqual([
      "Saffron Anatomy",
      "Projector Wash",
      "Horizon Melt",
      "Verdigris Fresco",
      "Orbiting Bloom",
      "Stained Light",
      "Aurora Veil",
      "Long Fibres",
      "Contact Sheet",
      "Silver Emulsion",
      "Eclipse",
      "Mineral Fog",
    ]);
  });

  it("defines all eight registry-only World identities without claiming shipped recipes", () => {
    expect(WORLD_REGISTRY_IMPLEMENTATION_STATUS).toBe("registry-only");
    expect(WORLD_IDENTITIES.map((world) => world.name)).toEqual([
      "Editorial Drift",
      "Noir Contact",
      "Sunstruck Atlas",
      "Dread",
      "Tender Light",
      "Velvet Fever",
      "Celluloid Archive",
      "Night Run",
    ]);

    for (const world of WORLD_IDENTITIES) {
      expect(world.authoredRecipeId).toBeNull();
      expect(world.supportedRatios).toEqual(WORLD_RATIO_IDS);
      expect(Object.keys(world.axes).sort()).toEqual(["horizontal", "vertical"]);
      expect(world.axes.horizontal.supportedDirections).toEqual(expect.arrayContaining([-1, 1]));
      expect(world.axes.vertical.supportedDirections).toEqual(expect.arrayContaining([-1, 1]));
      expect(Object.values(world.variants).map((variant) => variant.pressure)).toEqual([0, 1, 2]);
      expect(world.character).not.toEqual(world.eyebrow);
      expect(world.compositionIntent.portrait).not.toEqual(world.compositionIntent.landscape);
    }
  });

  it("defines an exact schema-shaped Editorial Drift foundation", () => {
    expect(EDITORIAL_DRIFT_9_16_RECIPE).toMatchObject({
      motion: {
        transport: { axis: "vertical", direction: -1, slidesPerSecond: 0.34 },
        cadence: { cutId: "paper-argument", poseCadence: "continuous" },
        performance: { id: "long-take", take: 1 },
        character: { id: "weighted", amount: 0.62 },
        path: { id: "ribbon", gap: 0.3, curvature: 0.3, depth: 0.14, banking: 3.5 },
      },
      card: {
        aspectWidth: 16,
        aspectHeight: 9,
        scale: 0.76,
        defaultFit: "cover",
        radius: 32,
        smoothing: 0.6,
        borderWidth: 0,
        borderOpacity: 0,
      },
      material: {
        surface: "paper",
        roughness: 0.92,
        finish: { id: "16mm-breath", registration: 0.06, microtexture: 0.12 },
      },
      lighting: {
        presetId: "studio-soft",
        artworkProtection: 1,
        heroProtection: 1,
        shadowOpacity: 0.24,
        shadowSoftness: 112,
      },
      atmosphere: {
        family: "paper",
        composition: "long-fibres",
        treatment: "quiet",
        presence: "whisper",
        motion: 0.06,
        grain: 0.035,
      },
      lens: {
        characterId: "clean-gate",
        presence: 0.1,
        directionalSmear: 0.025,
        chromaticSeparation: 0.006,
        cameraGrain: 0.018,
        presenterTreatment: "protected",
      },
    });
    expect(Object.keys(EDITORIAL_DRIFT_9_16_RECIPE).sort()).toEqual([
      "atmosphere",
      "card",
      "lens",
      "lighting",
      "material",
      "motion",
    ]);
  });

  it("resolves deterministic ratio-native recipes without mutating the source", () => {
    const before = structuredClone(EDITORIAL_DRIFT_9_16_RECIPE);
    const first = WORLD_RATIO_IDS.map((ratio) => editorialDriftRecipe(ratio));
    const second = WORLD_RATIO_IDS.map((ratio) => editorialDriftRecipe(ratio));

    expect(first).toEqual(second);
    expect(EDITORIAL_DRIFT_9_16_RECIPE).toEqual(before);
    expect(first.map((recipe) => recipe.motion.transport.axis)).toEqual([
      "vertical",
      "vertical",
      "horizontal",
      "horizontal",
    ]);
    expect(first.map((recipe) => recipe.card.scale)).toEqual([0.76, 0.72, 0.68, 0.62]);
    expect(first.every((recipe) => recipe.card.borderWidth === 0 && recipe.card.borderOpacity === 0)).toBe(true);
  });

  it("uses exact stage dimensions while proving each schema-shaped ratio recipe", () => {
    expect(WORLD_RATIO_DIMENSIONS).toEqual({
      "9:16": { width: 1080, height: 1920 },
      "4:5": { width: 1080, height: 1350 },
      "1:1": { width: 1080, height: 1080 },
      "16:9": { width: 1920, height: 1080 },
    });
    expect(Object.isFrozen(WORLD_RATIO_DIMENSIONS)).toBe(true);
    expect(Object.values(WORLD_RATIO_DIMENSIONS).every((dimensions) => Object.isFrozen(dimensions))).toBe(true);
  });

  it("recognises scaled authored ratios without treating arbitrary output as authored", () => {
    expect(worldRatioForDimensions(1080, 1920)).toBe("9:16");
    expect(worldRatioForDimensions(2160, 3840)).toBe("9:16");
    expect(worldRatioForDimensions(1600, 2000)).toBe("4:5");
    expect(worldRatioForDimensions(2048, 2048)).toBe("1:1");
    expect(worldRatioForDimensions(3840, 2160)).toBe("16:9");
    expect(worldRatioForDimensions(1200, 1700)).toBeNull();
    expect(nearestWorldRatioForDimensions(1200, 1700)).toBe("4:5");
    expect(nearestWorldRatioForDimensions(Number.NaN, 1700)).toBe("9:16");
  });

  it("merges single nested motion and material fields without erasing siblings or sharing aliases", () => {
    const patched = applyWorldRecipeOverride(EDITORIAL_DRIFT_9_16_RECIPE, {
      motion: { path: { gap: 0.91 } },
      material: { finish: { microtexture: 0.31 } },
    });

    expect(patched.motion.path).toEqual({
      ...EDITORIAL_DRIFT_9_16_RECIPE.motion.path,
      gap: 0.91,
    });
    expect(patched.material.finish).toEqual({
      ...EDITORIAL_DRIFT_9_16_RECIPE.material.finish,
      microtexture: 0.31,
    });
    patched.motion.path.curvature = 0.99;
    patched.material.finish.registration = 0.88;
    expect(EDITORIAL_DRIFT_9_16_RECIPE.motion.path.curvature).toBe(0.3);
    expect(EDITORIAL_DRIFT_9_16_RECIPE.material.finish.registration).toBe(0.06);

    const second = applyWorldRecipeOverride(EDITORIAL_DRIFT_9_16_RECIPE, {
      motion: { path: { gap: 0.91 } },
      material: { finish: { microtexture: 0.31 } },
    });
    expect(second.motion.path.curvature).toBe(0.3);
    expect(second.material.finish.registration).toBe(0.06);
  });

  it("deep-freezes canonical authority and keeps lookup/clone boundaries poison-proof", () => {
    const ratioTruth = [...WORLD_RATIO_IDS];
    const heroTruth = ATMOSPHERE_HERO_STUDIES[0]!.name;
    const familyTruth = ATMOSPHERE_FAMILIES[0]!.compositions[0]!.id;
    const world = worldIdentity("editorial-drift");
    const family = atmosphereFamily("solid");
    expect(world).not.toBeNull();
    expect(family).not.toBeNull();
    expect(Object.isFrozen(WORLD_RATIO_IDS)).toBe(true);
    expect(Object.isFrozen(WORLD_IDENTITIES)).toBe(true);
    expect(Object.isFrozen(world)).toBe(true);
    expect(Object.isFrozen(world!.axes.vertical.supportedDirections)).toBe(true);
    expect(Object.isFrozen(ATMOSPHERE_FAMILIES)).toBe(true);
    expect(Object.isFrozen(family!.compositions)).toBe(true);
    expect(Object.isFrozen(ATMOSPHERE_HERO_STUDIES)).toBe(true);
    expect(Object.isFrozen(EDITORIAL_DRIFT_9_16_RECIPE.motion.path)).toBe(true);
    expect(Object.isFrozen(EDITORIAL_DRIFT_RATIO_OVERRIDES["4:5"].motion.path)).toBe(true);

    const attempts: Array<() => void> = [
      () => { (WORLD_RATIO_IDS as unknown as string[])[0] = "poisoned"; },
      () => { (world!.axes.vertical.supportedDirections as unknown as number[])[0] = 0; },
      () => { (ATMOSPHERE_HERO_STUDIES as unknown as Array<{ name: string }>)[0]!.name = "Poisoned"; },
      () => { (family!.compositions as unknown as Array<{ id: string }>)[0]!.id = "poisoned"; },
      () => { (EDITORIAL_DRIFT_9_16_RECIPE as unknown as WorldRecipe).card.borderWidth = 12; },
      () => { (EDITORIAL_DRIFT_9_16_RECIPE as unknown as WorldRecipe).atmosphere.grain = 1; },
    ];
    for (const attempt of attempts) expect(attempt).toThrow(TypeError);

    const clone = editorialDriftRecipe("9:16");
    clone.card.borderWidth = 9;
    clone.atmosphere.grain = 0.9;
    clone.motion.path.gap = 1.2;

    expect(WORLD_RATIO_IDS).toEqual(ratioTruth);
    expect(ATMOSPHERE_HERO_STUDIES[0]!.name).toBe(heroTruth);
    expect(ATMOSPHERE_FAMILIES[0]!.compositions[0]!.id).toBe(familyTruth);
    expect(EDITORIAL_DRIFT_9_16_RECIPE.card.borderWidth).toBe(0);
    expect(EDITORIAL_DRIFT_9_16_RECIPE.atmosphere.grain).toBe(0.035);
    expect(editorialDriftRecipe("9:16")).toMatchObject({
      card: { borderWidth: 0, borderOpacity: 0 },
      atmosphere: { grain: 0.035 },
      motion: { path: { gap: 0.3 } },
    });
  });

  it("passes the registry's hostile integrity gauntlet", () => {
    expect(() => assertWorldRegistryIntegrity()).not.toThrow();
  });
});
