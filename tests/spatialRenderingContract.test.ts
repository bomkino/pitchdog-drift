import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  slideFragmentShader,
  slideVertexShader,
} from "../src/engine/shaders";

describe("spatial rendering contract", () => {
  it("drives deformation from velocity, acceleration, path bend, and travel", () => {
    for (const uniform of [
      "uVelocity",
      "uAcceleration",
      "uPathBend",
      "uTravelPhase",
      "uSurface",
      "uSlideSeed",
    ]) {
      expect(slideVertexShader).toContain(`uniform float ${uniform}`);
    }
    expect(slideVertexShader).not.toContain("uniform float uTime");
    expect(slideVertexShader).toContain("abs(acceleration) > 0.025");
    expect(slideVertexShader).toContain("Card: rigid stock");
    expect(slideVertexShader).toContain("Paper: cylindrical curl");
    expect(slideVertexShader).toContain("Silk: broad travelling folds");
    expect(slideVertexShader).toContain("Gel: coherent elastic mass");
  });

  it("derives restrained surface light from deformed geometry", () => {
    expect(slideFragmentShader).toContain("dFdx(vViewPosition)");
    expect(slideFragmentShader).toContain("dFdy(vViewPosition)");
    expect(slideFragmentShader).toContain("gl_FrontFacing");
    expect(slideFragmentShader).toContain("Slide-locked grain");
    expect(slideFragmentShader).not.toContain("fract(uTime)");
  });

  it("uses a continuous-corner lit shell and excludes it from the pinned frame", () => {
    const engineSource = readFileSync("src/engine/CinematicCarousel.ts", "utf8");
    expect(engineSource).toContain("createRoundedSlideShellGeometry");
    expect(engineSource).toContain("new THREE.MeshStandardMaterial");
    expect(engineSource).toContain("createPoolItem(1000, false)");
    expect(engineSource).toContain("applyMotionImpulse");
    expect(engineSource).toContain("surfacePhaseAtDistance");
    expect(engineSource).not.toContain("new THREE.BoxGeometry");
    expect(engineSource).not.toContain("new THREE.MeshBasicMaterial");
    expect(engineSource).not.toContain("activeExportMode");
  });

  it("shares one shell geometry across the bounded resident pool", () => {
    const engineSource = readFileSync("src/engine/CinematicCarousel.ts", "utf8");
    expect(engineSource).toContain("private shellGeometry");
    expect(engineSource).toContain("item.shell.geometry = nextGeometry");
    expect(engineSource).toContain("this.shellGeometry.dispose()");
    expect(engineSource).not.toContain("item.shell.geometry.dispose()");
  });
});
