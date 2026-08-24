import type { DriftProjectV4 } from "../project/schema";

/**
 * The one-click recovery lane for a treatment that has gone too far. It keeps
 * atmosphere, geometry, shadows, card physics, motion, timing, and media, but
 * restores imported artwork to literal source pixels.
 */
export function applySourceFaithfulLook(project: DriftProjectV4): DriftProjectV4 {
  project.card.borderWidth = 0;
  project.card.borderOpacity = 0;
  project.material.finish = {
    id: "source-faithful",
    registration: 0,
    localSoftness: 0,
    localSmear: 0,
    microtexture: 0,
  };
  project.lighting.artworkProtection = 1;
  project.lighting.heroProtection = 1;
  project.lens.enabled = false;
  project.lens.presenterTreatment = "protected";

  // A partial World can remain useful, but it is no longer the exact authored
  // World after card/material/light/lens ownership changes.
  project.provenance.world = null;
  project.provenance.worldVariant = "custom";
  project.provenance.recipes.card = null;
  project.provenance.recipes.material = null;
  project.provenance.recipes.lighting = null;
  project.provenance.recipes.lens = null;
  return project;
}

export function isSourceFaithfulLook(project: DriftProjectV4): boolean {
  const finish = project.material.finish;
  return project.card.borderWidth === 0
    && project.card.borderOpacity === 0
    && finish.registration === 0
    && finish.localSoftness === 0
    && finish.localSmear === 0
    && finish.microtexture === 0
    && project.lighting.artworkProtection === 1
    && project.lighting.heroProtection === 1
    && !project.lens.enabled
    && project.lens.presenterTreatment === "protected";
}
