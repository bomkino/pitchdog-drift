import { describe, expect, it } from "vitest";
import { applyProjectCommand } from "../src/core/commands/projectCommand";
import { createDefaultDriftProject } from "../src/core/project/defaults";
import { createProjectRevisionState } from "../src/core/project/revisions";
import {
  EDITORIAL_CUTS,
  HANDCRAFTED_MOTION_PRESETS,
  MOTION_CHARACTERS,
  PERFORMANCE_RECIPES,
  applyEditorialCutCommand,
  applyHandcraftedMotionPreset,
  applyMotionCharacterCommand,
  applyPerformanceCommand,
  detectEditorialCut,
  detectPerformanceRecipe,
  refreshMotionRecipeProvenance,
} from "../src/core/recipes/motion";

function project() {
  const value = createDefaultDriftProject("motion-recipes", "2026-08-21T00:00:00.000Z");
  value.media.order = ["slide-a", "slide-b", "slide-c"];
  value.media.assets = {
    "slide-a": { id: "slide-a", name: "A.png", kind: "image", mimeType: "image/png", hash: "a".repeat(64), byteLength: 1, width: 16, height: 9 },
    "slide-b": { id: "slide-b", name: "B.png", kind: "image", mimeType: "image/png", hash: "b".repeat(64), byteLength: 1, width: 16, height: 9 },
    "slide-c": { id: "slide-c", name: "C.png", kind: "image", mimeType: "image/png", hash: "c".repeat(64), byteLength: 1, width: 16, height: 9 },
  };
  value.slides = Object.fromEntries(value.media.order.map((assetId) => [assetId, {
    assetId,
    fit: "cover" as const,
    focalX: 0.5,
    focalY: 0.5,
    scaleOffset: 0,
  }]));
  return value;
}

describe("authored motion recipes", () => {
  it("keeps every cut and performance materially distinct", () => {
    expect(new Set(EDITORIAL_CUTS.map((entry) => entry.id)).size).toBe(4);
    expect(new Set(EDITORIAL_CUTS.map((entry) => JSON.stringify({
      transport: entry.transport,
      cadence: entry.cadence,
    }))).size).toBe(4);
    expect(new Set(PERFORMANCE_RECIPES.map((entry) => entry.id)).size).toBe(6);
    expect(new Set(PERFORMANCE_RECIPES.map((entry) => JSON.stringify({
      cadence: entry.poseCadence,
      performance: entry.performance,
    }))).size).toBe(6);
    expect(new Set(MOTION_CHARACTERS.map((entry) => entry.id)).size).toBe(4);
    expect(new Set(HANDCRAFTED_MOTION_PRESETS.map((entry) => JSON.stringify({
      cut: entry.cutId,
      performance: entry.performanceId,
      character: entry.characterId,
      cadence: entry.poseCadence,
    }))).size).toBe(6);
  });

  it("applies all six handcrafted stacks without touching non-motion domains", () => {
    for (const preset of HANDCRAFTED_MOTION_PRESETS) {
      const current = project();
      const protectedDomains = structuredClone({
        media: current.media,
        card: current.card,
        material: current.material,
        lighting: current.lighting,
        atmosphere: current.atmosphere,
        lens: current.lens,
        presenter: current.presenter,
      });
      applyHandcraftedMotionPreset(current, preset.id);
      expect(current.motion).toMatchObject({
        cadence: { cutId: preset.cutId, poseCadence: preset.poseCadence },
        performance: { id: preset.performanceId },
        character: { id: preset.characterId },
      });
      expect(current).toMatchObject(protectedDomains);
    }
  });

  it("applies a cut without touching media, material, master, or presenter", () => {
    const current = project();
    const frozen = structuredClone({
      media: current.media,
      slides: current.slides,
      material: current.material,
      lighting: current.lighting,
      atmosphere: current.atmosphere,
      lens: current.lens,
      sound: current.sound,
      presenter: current.presenter,
      master: current.master,
    });
    const applied = applyProjectCommand(
      current,
      createProjectRevisionState(),
      applyEditorialCutCommand("clean-data"),
      "2026-08-21T00:01:00.000Z",
    );

    expect(applied.project.motion).toMatchObject({
      transport: { axis: "horizontal", direction: -1, slidesPerSecond: 0.62 },
      cadence: { cutId: "clean-data" },
    });
    expect(detectEditorialCut(applied.project)?.id).toBe("clean-data");
    expect(applied.project).toMatchObject(frozen);
    expect(applied.receipt.ownedDomains).toEqual(["motion", "provenance"]);
    expect(applied.receipt.preservedDomains).toContain("master");
    expect(applied.receipt.changedPaths).toContain("motion.cadence.cutId");
    expect(applied.project.provenance.recipes.motion).toMatchObject({
      id: "motion-stack",
      version: 1,
    });
  });

  it("applies performances without silently replacing approved tempo or take", () => {
    const current = project();
    current.motion.transport.slidesPerSecond = 0.47;
    current.motion.performance.take = 7;
    const applied = applyProjectCommand(
      current,
      createProjectRevisionState(),
      applyPerformanceCommand("twelve-frame-hand"),
      "2026-08-21T00:01:00.000Z",
    );

    expect(applied.project.motion.transport.slidesPerSecond).toBe(0.47);
    expect(applied.project.motion.performance).toMatchObject({
      id: "twelve-frame-hand",
      take: 7,
      weight: 0.64,
      linger: 0.2,
      release: 0.58,
      runway: 0.86,
      overlap: 0.28,
      imperfection: 0.32,
    });
    expect(applied.project.motion.cadence.poseCadence).toBe("12fps");
    expect(detectPerformanceRecipe(applied.project)?.id).toBe("twelve-frame-hand");
  });

  it("marks a manually changed cut or performance as Custom without deleting its provenance", () => {
    let current = project();
    current = applyProjectCommand(
      current,
      createProjectRevisionState(),
      applyEditorialCutCommand("clean-data"),
      "2026-08-21T00:01:00.000Z",
    ).project;
    current = applyProjectCommand(
      current,
      createProjectRevisionState(),
      applyPerformanceCommand("cut-on-breath"),
      "2026-08-21T00:02:00.000Z",
    ).project;
    const approvedFingerprint = current.provenance.recipes.motion?.fingerprint;

    current.motion.cadence.read += 0.01;
    expect(detectEditorialCut(current)).toBeNull();
    expect(detectPerformanceRecipe(current)?.id).toBe("cut-on-breath");
    refreshMotionRecipeProvenance(current);
    expect(current.provenance.recipes.motion?.fingerprint).not.toBe(approvedFingerprint);
  });

  it("applies every motion character through one reversible project command", () => {
    for (const character of MOTION_CHARACTERS) {
      const current = project();
      const before = structuredClone(current.motion.character);
      const applied = applyProjectCommand(
        current,
        createProjectRevisionState(),
        applyMotionCharacterCommand(character.id),
        "2026-08-21T00:01:00.000Z",
      );
      expect(applied.project.motion.character).toEqual({
        id: character.id,
        amount: character.amount,
      });
      expect(applied.receipt.changed).toBe(
        before.id !== character.id || before.amount !== character.amount,
      );
    }
  });

  it("rejects unknown recipe ids without mutating the project", () => {
    const current = project();
    const before = structuredClone(current);
    expect(() => applyProjectCommand(
      current,
      createProjectRevisionState(),
      applyEditorialCutCommand("not-a-cut"),
      "2026-08-21T00:01:00.000Z",
    )).toThrow(/Unknown editorial cut/);
    expect(current).toEqual(before);
  });
});
