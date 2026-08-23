import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import { DRIFT_V2_RENDER_CONTRACT, DRIFT_V1_COMPAT_RENDER_CONTRACT } from "../src/core/project/schema";
import { recipeReference } from "../src/core/recipes/fingerprint";
import {
  applyEditorialDriftFoundation,
  canRecutEditorialDrift,
  detachEditorialDriftRatioProvenance,
  editorialDriftRecipe,
  WORLD_RECIPE_DOMAINS,
} from "../src/core/worlds";

const NOW = "2026-08-22T10:00:00.000Z";

describe("explicit Editorial Drift foundation transaction", () => {
  it("applies an exact portrait-native recipe and deterministic provenance", () => {
    const source = createDefaultDriftProjectV4("world-apply", NOW, 27);
    const applied = applyEditorialDriftFoundation(source, "9:16", NOW);

    expect(applied.composition).toMatchObject({ width: 1080, height: 1920 });
    expect(applied).toMatchObject(editorialDriftRecipe("9:16"));
    expect(applied.provenance).toMatchObject({
      world: { id: "editorial-drift/9:16", version: 1 },
      worldVariant: "restrained",
    });
    expect(source.renderContract).toBe(DRIFT_V1_COMPAT_RENDER_CONTRACT);
    expect(applied.renderContract).toBe(DRIFT_V2_RENDER_CONTRACT);
    expect(validateDriftProjectV4(applied)).toEqual(applied);
    expect(source.atmosphere.composition).toBe("orbiting-bloom");
  });

  it("preserves project-owned lifecycle, presenter, sound, master, and extensions", () => {
    const source = createDefaultDriftProjectV4("world-preserve", NOW, 27);
    source.extensions = { "dog.pitch.test": { marker: "keep" } };
    source.sound.masterLevel = 0.44;
    source.presenter.width = 0.41;
    source.performance = {
      ...source.performance,
      body: { ...source.performance.body, tempo: { kind: "preset", preset: "read-and-go" } },
    };
    const protectedBefore = structuredClone({
      media: source.media,
      slides: source.slides,
      presenter: source.presenter,
      performance: source.performance,
      sound: source.sound,
      master: source.master,
      extensions: source.extensions,
    });

    const applied = applyEditorialDriftFoundation(source, "4:5", NOW);
    expect(applied.composition).toEqual(source.composition);
    expect({
      media: applied.media,
      slides: applied.slides,
      presenter: applied.presenter,
      performance: applied.performance,
      sound: applied.sound,
      master: applied.master,
      extensions: applied.extensions,
    }).toEqual(protectedBefore);
  });

  it("honours locked domains and remains idempotent", () => {
    const source = createDefaultDriftProjectV4("world-lock", NOW, 27);
    source.provenance.lockedDomains = ["card", "lens"];
    const card = structuredClone(source.card);
    const lens = structuredClone(source.lens);

    const first = applyEditorialDriftFoundation(source, "16:9", NOW);
    const second = applyEditorialDriftFoundation(first, "16:9", NOW);

    expect(first.card).toEqual(card);
    expect(first.lens).toEqual(lens);
    expect(first.motion).toEqual(editorialDriftRecipe("16:9").motion);
    expect(first).toEqual(second);
  });

  it("never changes output dimensions while applying a ratio-native recipe", () => {
    const source = createDefaultDriftProjectV4("world-output-authority", NOW, 27);
    source.composition = { ...source.composition, width: 2160, height: 3840 };

    const applied = applyEditorialDriftFoundation(source, "9:16", NOW);

    expect(applied.composition).toEqual(source.composition);
    expect(applied.provenance.world?.id).toBe("editorial-drift/9:16");
  });

  it("releases false ratio-level provenance for a custom composition", () => {
    const source = applyEditorialDriftFoundation(
      createDefaultDriftProjectV4("world-custom-ratio", NOW, 27),
      "9:16",
      NOW,
    );
    const detached = detachEditorialDriftRatioProvenance(
      source,
      "2026-08-22T10:01:00.000Z",
    );

    expect(detached.renderContract).toBe(DRIFT_V2_RENDER_CONTRACT);
    expect(detached.provenance.world).toBeNull();
    expect(detached.provenance.worldVariant).toBe("custom");
    expect(detached.provenance.recipes.motion).toEqual(source.provenance.recipes.motion);
    expect(detached.provenance.recipes.atmosphere).toEqual(source.provenance.recipes.atmosphere);
    expect(validateDriftProjectV4(detached)).toEqual(detached);
  });

  it("recuts after a dimensions-only detach without flattening real custom direction", () => {
    const compatibility = createDefaultDriftProjectV4("world-recut-guard", NOW, 27);
    const applied = applyEditorialDriftFoundation(compatibility, "9:16", NOW);
    const dimensionOnly = detachEditorialDriftRatioProvenance(applied, NOW);
    dimensionOnly.composition = { ...dimensionOnly.composition, width: 2160, height: 1920 };

    expect(canRecutEditorialDrift(compatibility)).toBe(false);
    expect(canRecutEditorialDrift(dimensionOnly)).toBe(true);

    const directed = structuredClone(dimensionOnly);
    directed.motion.transport.slidesPerSecond = 0.91;
    expect(canRecutEditorialDrift(directed)).toBe(false);

    const recut = applyEditorialDriftFoundation(dimensionOnly, "9:16", NOW);
    expect(recut.composition).toMatchObject({ width: 2160, height: 1920 });
    expect(recut.motion.transport.axis).toBe("vertical");
    expect(recut.provenance.world?.id).toBe("editorial-drift/9:16");
  });

  it("fails closed on stale, mixed, unknown, and future Editorial provenance", () => {
    const applied = applyEditorialDriftFoundation(
      createDefaultDriftProjectV4("world-hostile-recut", NOW, 27),
      "9:16",
      NOW,
    );

    const staleAggregate = structuredClone(applied);
    staleAggregate.motion.transport.slidesPerSecond = 0.91;
    expect(validateDriftProjectV4(staleAggregate)).toEqual(staleAggregate);
    expect(canRecutEditorialDrift(staleAggregate)).toBe(false);

    const mixed = detachEditorialDriftRatioProvenance(applied, NOW);
    mixed.atmosphere = structuredClone(editorialDriftRecipe("16:9").atmosphere);
    mixed.provenance.recipes.atmosphere = recipeReference(
      "editorial-drift/atmosphere/16:9",
      1,
      mixed.atmosphere,
    );
    expect(validateDriftProjectV4(mixed)).toEqual(mixed);
    expect(canRecutEditorialDrift(mixed)).toBe(false);

    const unknownWorld = structuredClone(applied);
    unknownWorld.provenance.world = recipeReference("future-world/9:16", 1, { marker: "future" });
    expect(validateDriftProjectV4(unknownWorld)).toEqual(unknownWorld);
    expect(canRecutEditorialDrift(unknownWorld)).toBe(false);

    const futureEditorial = structuredClone(applied);
    for (const domain of WORLD_RECIPE_DOMAINS) {
      futureEditorial.provenance.recipes[domain] = recipeReference(
        `editorial-drift/${domain}/9:16`,
        2,
        futureEditorial[domain],
      );
    }
    futureEditorial.provenance.world = recipeReference(
      "editorial-drift/9:16",
      2,
      editorialDriftRecipe("9:16"),
    );
    expect(validateDriftProjectV4(futureEditorial)).toEqual(futureEditorial);
    expect(canRecutEditorialDrift(futureEditorial)).toBe(false);
  });

  it("recuts truthful unlocked domains while preserving legitimate locked overrides", () => {
    const applied = applyEditorialDriftFoundation(
      createDefaultDriftProjectV4("world-locked-recut", NOW, 27),
      "9:16",
      NOW,
    );
    applied.provenance.lockedDomains = ["motion"];
    applied.motion.transport.slidesPerSecond = 0.91;
    applied.provenance.recipes.motion = null;
    expect(validateDriftProjectV4(applied)).toEqual(applied);
    expect(canRecutEditorialDrift(applied)).toBe(true);

    applied.composition = { ...applied.composition, width: 1920, height: 1080 };
    const recut = applyEditorialDriftFoundation(applied, "16:9", NOW);
    expect(recut.motion.transport.slidesPerSecond).toBe(0.91);
    expect(recut.provenance.recipes.motion).toBeNull();
    expect(recut.card).toEqual(editorialDriftRecipe("16:9").card);
    expect(recut.provenance.world?.id).toBe("editorial-drift/16:9");
  });
});
