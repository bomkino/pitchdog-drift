import { describe, expect, it } from "vitest";
import { applyProjectCommand } from "../src/core/commands/projectCommand";
import { createDefaultDriftProject } from "../src/core/project/defaults";
import { createProjectRevisionState } from "../src/core/project/revisions";
import {
  FINISH_RECIPES,
  MATERIAL_RECIPES,
  applyFinishCommand,
  applyMaterialCommand,
  detectFinishRecipe,
  detectMaterialRecipe,
} from "../src/core/recipes/material";

function project() {
  return createDefaultDriftProject("material-recipes", "2026-08-21T00:00:00.000Z");
}

describe("authored material and local-finish recipes", () => {
  it("keeps four materials and five finishes materially distinct", () => {
    expect(MATERIAL_RECIPES.map((entry) => entry.id)).toEqual(["card", "paper", "silk", "gel"]);
    expect(new Set(MATERIAL_RECIPES.map((entry) => JSON.stringify(entry.material))).size).toBe(4);
    expect(FINISH_RECIPES).toHaveLength(5);
    expect(new Set(FINISH_RECIPES.map((entry) => entry.id)).size).toBe(5);
    expect(new Set(FINISH_RECIPES.map((entry) => JSON.stringify(entry.finish))).size).toBe(5);
  });

  it("changes material character without overwriting the approved local finish", () => {
    const current = project();
    current.material.finish = structuredClone(FINISH_RECIPES[4]!.finish);
    const preserved = structuredClone({
      media: current.media,
      slides: current.slides,
      motion: current.motion,
      lighting: current.lighting,
      atmosphere: current.atmosphere,
      lens: current.lens,
      sound: current.sound,
      presenter: current.presenter,
      master: current.master,
      finish: current.material.finish,
    });
    const applied = applyProjectCommand(
      current,
      createProjectRevisionState(),
      applyMaterialCommand("silk"),
      "2026-08-21T00:01:00.000Z",
    );

    expect(applied.project.material).toMatchObject(MATERIAL_RECIPES[2]!.material);
    expect(applied.project.material.finish).toEqual(preserved.finish);
    expect(applied.project).toMatchObject({
      media: preserved.media,
      slides: preserved.slides,
      motion: preserved.motion,
      lighting: preserved.lighting,
      atmosphere: preserved.atmosphere,
      lens: preserved.lens,
      sound: preserved.sound,
      presenter: preserved.presenter,
      master: preserved.master,
    });
    expect(applied.receipt.ownedDomains).toEqual(["material", "provenance"]);
    expect(applied.receipt.changedPaths).toContain("material.surface");
    expect(applied.project.provenance.recipes.material).toMatchObject({ id: "material-stack", version: 1 });
    expect(detectMaterialRecipe(applied.project)?.id).toBe("silk");
    expect(detectFinishRecipe(applied.project)?.id).toBe("ghost-focus");
  });

  it("changes local finish without changing the physical material", () => {
    const current = project();
    current.material = {
      ...current.material,
      ...MATERIAL_RECIPES[3]!.material,
    };
    const physical = structuredClone({
      surface: current.material.surface,
      flex: current.material.flex,
      thickness: current.material.thickness,
      roughness: current.material.roughness,
      sheen: current.material.sheen,
    });
    const applied = applyProjectCommand(
      current,
      createProjectRevisionState(),
      applyFinishCommand("16mm-breath"),
      "2026-08-21T00:01:00.000Z",
    );

    expect(applied.project.material).toMatchObject(physical);
    expect(applied.project.material.finish).toEqual(FINISH_RECIPES[1]!.finish);
    expect(detectMaterialRecipe(applied.project)?.id).toBe("gel");
    expect(detectFinishRecipe(applied.project)?.id).toBe("16mm-breath");
  });

  it("reports Custom truth after any manual material or finish edit", () => {
    const current = project();
    current.material = {
      ...current.material,
      ...MATERIAL_RECIPES[1]!.material,
      finish: structuredClone(FINISH_RECIPES[1]!.finish),
    };
    expect(detectMaterialRecipe(current)?.id).toBe("paper");
    expect(detectFinishRecipe(current)?.id).toBe("16mm-breath");

    current.material.flex += 0.001;
    current.material.finish.registration += 0.001;
    expect(detectMaterialRecipe(current)).toBeNull();
    expect(detectFinishRecipe(current)).toBeNull();
  });

  it("keeps every authored value inside the Project V3 trust boundary", () => {
    for (const material of MATERIAL_RECIPES) {
      const applied = applyProjectCommand(
        project(),
        createProjectRevisionState(),
        applyMaterialCommand(material.id),
        "2026-08-21T00:01:00.000Z",
      );
      expect(applied.project.material.surface).toBe(material.id);
      expect(applied.project.material.flex).toBeGreaterThanOrEqual(0);
      expect(applied.project.material.flex).toBeLessThanOrEqual(1);
      expect(applied.project.material.thickness).toBeGreaterThanOrEqual(0);
      expect(applied.project.material.thickness).toBeLessThanOrEqual(1);
    }
    for (const finish of FINISH_RECIPES) {
      const applied = applyProjectCommand(
        project(),
        createProjectRevisionState(),
        applyFinishCommand(finish.id),
        "2026-08-21T00:01:00.000Z",
      );
      expect(applied.project.material.finish).toEqual(finish.finish);
    }
  });

  it("rejects unknown material and finish ids without mutating the project", () => {
    for (const command of [applyMaterialCommand("unknown"), applyFinishCommand("unknown")]) {
      const current = project();
      const before = structuredClone(current);
      expect(() => applyProjectCommand(
        current,
        createProjectRevisionState(),
        command,
        "2026-08-21T00:01:00.000Z",
      )).toThrow(/Unknown/);
      expect(current).toEqual(before);
    }
  });
});
