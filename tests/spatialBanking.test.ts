import { describe, expect, it } from "vitest";
import { cloneSettings, DEFAULT_SETTINGS } from "../src/model";
import { deriveCarouselGeometry, evaluateSlide } from "../src/engine/evaluate";

describe("path banking zero state", () => {
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
    expect(
      Math.abs(bankedHelix.rotationX)
        + Math.abs(bankedHelix.rotationY)
        + Math.abs(bankedHelix.rotationZ),
    ).toBeGreaterThan(
      Math.abs(unbankedHelix.rotationX)
        + Math.abs(unbankedHelix.rotationY)
        + Math.abs(unbankedHelix.rotationZ),
    );
  });
});
