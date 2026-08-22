import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import {
  AUTHORED_WORLDS,
  applyAuthoredWorld,
} from "../src/core/worlds/authoredWorlds";
import { PUBLIC_WORLD_VARIANTS, WORLD_RATIO_IDS } from "../src/core/worlds/worldRegistry";

function project() {
  return createDefaultDriftProjectV4("authored-worlds", "2026-08-23T00:00:00.000Z");
}

describe("authored Worlds", () => {
  it("ships eight directions and two distinct portrait scenes per World", () => {
    expect(AUTHORED_WORLDS).toHaveLength(8);
    expect(new Set(AUTHORED_WORLDS.map((world) => world.id)).size).toBe(8);
    for (const world of AUTHORED_WORLDS) {
      expect(world.portraitScenes).toHaveLength(2);
      expect(new Set(world.portraitScenes.map((scene) => scene.id)).size).toBe(2);
      expect(new Set(world.portraitScenes.map((scene) => JSON.stringify({
        direction: scene.direction,
        path: scene.pathId,
        atmosphere: scene.backgroundStudyId,
        scale: scene.scale,
        gap: scene.gap,
      }))).size).toBe(2);
    }
  });

  it("resolves every World, pressure and ratio through valid Project V4 state", () => {
    for (const world of AUTHORED_WORLDS) {
      for (const variant of PUBLIC_WORLD_VARIANTS) {
        for (const ratio of WORLD_RATIO_IDS) {
          const result = applyAuthoredWorld(project(), world.id, variant, ratio, 1, 3);
          expect(() => validateDriftProjectV4(result)).not.toThrow();
          expect(result.provenance.world?.id).toBe(`world/${world.id}`);
          expect(result.provenance.worldVariant).toBe(variant);
          expect(result.motion.transport.axis).toBe(ratio === "9:16" || ratio === "4:5" ? "vertical" : "horizontal");
        }
      }
    }
  });

  it("is non-compounding and respects locked creative domains", () => {
    const first = applyAuthoredWorld(project(), "dread", "fever", "9:16", 1, 7);
    const second = applyAuthoredWorld(structuredClone(first), "dread", "fever", "9:16", 1, 7);
    expect(second.motion).toEqual(first.motion);
    expect(second.card).toEqual(first.card);
    expect(second.material).toEqual(first.material);
    expect(second.lighting).toEqual(first.lighting);
    expect(second.atmosphere).toEqual(first.atmosphere);
    expect(second.lens).toEqual(first.lens);

    const locked = project();
    locked.provenance.lockedDomains = ["atmosphere", "lens"];
    const protectedState = structuredClone({ atmosphere: locked.atmosphere, lens: locked.lens });
    applyAuthoredWorld(locked, "night-run", "directed", "16:9", 0, 2);
    expect(locked.atmosphere).toEqual(protectedState.atmosphere);
    expect(locked.lens).toEqual(protectedState.lens);
  });
});
