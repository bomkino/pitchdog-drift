import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import {
  applyEditorialDriftFoundation,
  editorialDriftRecipe,
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
    expect(applied.composition).toMatchObject({ width: 1080, height: 1350 });
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
});
