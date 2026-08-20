import { describe, expect, it } from "vitest";
import engineSource from "../src/engine/CinematicCarousel.ts?raw";
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
    expect(slideVertexShader).toContain("uniform vec2 uSizePx");
    expect(slideVertexShader).toContain("min(uSizePx.x, uSizePx.y)");
    expect(slideVertexShader).not.toContain("uniform float uTime");
    expect(slideVertexShader).toContain("abs(acceleration) > 0.025");
    expect(slideVertexShader).toContain("Card: rigid stock");
    expect(slideVertexShader).toContain("Paper: cylindrical curl");
    expect(slideVertexShader).toContain("Silk: broad travelling folds");
    expect(slideVertexShader).toContain("Gel: coherent elastic mass");
  });

  it("keeps artwork registered to the deformed surface", () => {
    expect(slideFragmentShader).toContain("Artwork remains glued to the material");
    expect(slideFragmentShader).not.toContain("textureUv +=");
    expect(slideFragmentShader).not.toContain("flowAxis");
    expect(slideFragmentShader).not.toContain("uniform float uVelocity");
    expect(slideFragmentShader).not.toContain("uniform float uDistortion");
  });

  it("derives restrained surface light from deformed geometry", () => {
    expect(slideFragmentShader).toContain("dFdx(vViewPosition)");
    expect(slideFragmentShader).toContain("dFdy(vViewPosition)");
    expect(slideFragmentShader).toContain("gl_FrontFacing");
    expect(slideFragmentShader).toContain("Slide-locked grain");
    expect(slideFragmentShader).toContain("deformationScale");
    expect(slideFragmentShader).not.toContain("fract(uTime)");
  });

  it("uses a continuous-corner lit shell and excludes it from the pinned frame", () => {
    expect(engineSource).toContain("createRoundedSlideShellGeometry");
    expect(engineSource).toContain("new THREE.MeshStandardMaterial");
    expect(engineSource).toContain("createPoolItem(1000, false)");
    expect(engineSource).toContain("applyMotionImpulse");
    expect(engineSource).toContain("surfacePhaseAtDistance");
    expect(engineSource).toContain("evaluateExportMotion");
    expect(engineSource).toContain("motion.acceleration");
    expect(engineSource).not.toContain("new THREE.BoxGeometry");
    expect(engineSource).not.toContain("new THREE.MeshBasicMaterial");
    expect(engineSource).not.toContain("activeExportMode");
  });

  it("regenerates one shared shell geometry and disposes ownership exactly once", () => {
    expect(engineSource).toContain("private sharedShellGeometry");
    expect(engineSource.match(/createRoundedSlideShellGeometry\(/g)).toHaveLength(1);
    expect(engineSource).toMatch(/item\.shell\.geometry\s*=\s*next/);
    expect(engineSource).toContain("previous?.dispose()");
    expect(engineSource).toContain("this.sharedShellGeometry?.dispose()");
    expect(engineSource).toContain("item.shell?.material.dispose()");
    expect(engineSource).not.toMatch(/item\.shell\.geometry\.dispose\(/);
  });
});
