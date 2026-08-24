import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { DRIFT_V2_RENDER_CONTRACT } from "../src/core/project/schema";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import {
  applySourceFaithfulLook,
  isSourceFaithfulLook,
} from "../src/core/recipes/sourceFaithfulLook";

describe("source-faithful Look recovery", () => {
  it("removes artwork treatments while preserving atmosphere, motion, geometry, shadows, and physics", () => {
    const project = createDefaultDriftProjectV4(
      "source-faithful",
      "2026-08-24T00:00:00.000Z",
      29,
      DRIFT_V2_RENDER_CONTRACT,
    );
    project.card = { ...project.card, radius: 61, smoothing: 0.73, borderWidth: 4, borderOpacity: 0.7 };
    project.material = {
      ...project.material,
      surface: "silk",
      flex: 0.57,
      thickness: 0.08,
      roughness: 0.41,
      sheen: 0.62,
      finish: { id: "custom", registration: 0.4, localSoftness: 0.3, localSmear: 0.2, microtexture: 0.5 },
    };
    project.lighting = {
      ...project.lighting,
      presetId: "custom",
      artworkProtection: 0.2,
      heroProtection: 0.3,
      shadowOpacity: 0.67,
      shadowSoftness: 91,
    };
    project.lens = { ...project.lens, enabled: true, presenterTreatment: "through-lens" };
    project.provenance.world = { id: "world/test", version: 1, fingerprint: "test" };
    project.provenance.worldVariant = "fever";
    for (const domain of ["card", "material", "lighting", "lens"] as const) {
      project.provenance.recipes[domain] = { id: `${domain}/test`, version: 1, fingerprint: domain };
    }
    const preserved = structuredClone({
      atmosphere: project.atmosphere,
      motion: project.motion,
      cardGeometry: {
        radius: project.card.radius,
        smoothing: project.card.smoothing,
        scale: project.card.scale,
      },
      materialPhysics: {
        surface: project.material.surface,
        flex: project.material.flex,
        thickness: project.material.thickness,
        roughness: project.material.roughness,
        sheen: project.material.sheen,
      },
      shadows: {
        opacity: project.lighting.shadowOpacity,
        softness: project.lighting.shadowSoftness,
      },
    });

    expect(isSourceFaithfulLook(project)).toBe(false);
    expect(applySourceFaithfulLook(project)).toBe(project);
    expect(isSourceFaithfulLook(project)).toBe(true);
    expect(project.card).toMatchObject({ borderWidth: 0, borderOpacity: 0 });
    expect(project.material.finish).toEqual({
      id: "source-faithful",
      registration: 0,
      localSoftness: 0,
      localSmear: 0,
      microtexture: 0,
    });
    expect(project.lighting).toMatchObject({ artworkProtection: 1, heroProtection: 1 });
    expect(project.lens).toMatchObject({ enabled: false, presenterTreatment: "protected" });
    expect({
      atmosphere: project.atmosphere,
      motion: project.motion,
      cardGeometry: {
        radius: project.card.radius,
        smoothing: project.card.smoothing,
        scale: project.card.scale,
      },
      materialPhysics: {
        surface: project.material.surface,
        flex: project.material.flex,
        thickness: project.material.thickness,
        roughness: project.material.roughness,
        sheen: project.material.sheen,
      },
      shadows: {
        opacity: project.lighting.shadowOpacity,
        softness: project.lighting.shadowSoftness,
      },
    }).toEqual(preserved);
    expect(project.provenance.world).toBeNull();
    expect(project.provenance.worldVariant).toBe("custom");
    expect(project.provenance.recipes).toMatchObject({
      card: null,
      material: null,
      lighting: null,
      lens: null,
    });
    expect(validateDriftProjectV4(project)).toEqual(project);
  });
});
