import { describe, expect, it } from "vitest";
import { cloneSettings, DEFAULT_SETTINGS } from "../src/model";
import { deriveCarouselGeometry, evaluateSlide } from "../src/engine/evaluate";

function rotationEnergy(frame: ReturnType<typeof evaluateSlide>): number {
  return Math.abs(frame.rotationX)
    + Math.abs(frame.rotationY)
    + Math.abs(frame.rotationZ);
}

describe("path banking contract", () => {
  it("removes path-tangent rotation while preserving the separate authored tilt", () => {
    const straight = cloneSettings(DEFAULT_SETTINGS);
    straight.motion.flow = "straight";
    straight.motion.curvature = 0.9;
    straight.motion.depth = 0.8;
    straight.motion.tilt = 14;
    straight.motion.bank = 0;

    const helix = cloneSettings(straight);
    helix.motion.flow = "helix";
    const geometry = deriveCarouselGeometry(straight, 1080, 1920);
    const flatReference = evaluateSlide(2, 0, 8, straight, geometry);
    const unbankedHelix = evaluateSlide(2, 0, 8, helix, geometry);

    expect([
      unbankedHelix.rotationX,
      unbankedHelix.rotationY,
      unbankedHelix.rotationZ,
    ]).toEqual([
      flatReference.rotationX,
      flatReference.rotationY,
      flatReference.rotationZ,
    ]);

    helix.motion.bank = 1;
    const bankedHelix = evaluateSlide(2, 0, 8, helix, geometry);
    expect(rotationEnergy(bankedHelix)).toBeGreaterThan(rotationEnergy(unbankedHelix));
  });

  it("still follows the path tangent when base Tilt is zero", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.axis = "vertical";
    settings.motion.flow = "helix";
    settings.motion.curvature = 1;
    settings.motion.depth = 0.8;
    settings.motion.tilt = 0;
    settings.motion.bank = 1;
    const geometry = deriveCarouselGeometry(settings, 1080, 1920);
    const banked = evaluateSlide(2, 0, 8, settings, geometry);

    settings.motion.bank = 0;
    const unbanked = evaluateSlide(2, 0, 8, settings, geometry);
    expect(rotationEnergy(banked)).toBeGreaterThan(0.01);
    expect(rotationEnergy(unbanked)).toBe(0);
  });

  it("scales tangent-following monotonically through the control range", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.flow = "orbit";
    settings.motion.curvature = 1;
    settings.motion.depth = 0.7;
    settings.motion.tilt = 0;
    const geometry = deriveCarouselGeometry(settings, 1080, 1920);
    const energies = [0, 0.25, 0.5, 0.75, 1].map((bank) => {
      settings.motion.bank = bank;
      return rotationEnergy(evaluateSlide(2, 0, 8, settings, geometry));
    });

    expect(energies[0]).toBe(0);
    for (let index = 1; index < energies.length; index += 1) {
      expect(energies[index]!).toBeGreaterThan(energies[index - 1]!);
    }
  });
});
