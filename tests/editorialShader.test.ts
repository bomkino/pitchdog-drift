import { describe, expect, it } from "vitest";
import { backgroundFragmentShader, slideFragmentShader } from "../src/engine/shaders";

describe("editorial material stability", () => {
  it("locks slide grain to slide space instead of wall-clock time", () => {
    expect(slideFragmentShader).toContain("uniform float uPhase;");
    expect(slideFragmentShader).toContain("uniform float uTactile;");
    expect(slideFragmentShader).toContain("hash12(vUv * uSizePx");
    expect(slideFragmentShader).toContain("uPhase * 37.0");
    expect(slideFragmentShader).not.toContain("uTime");
  });

  it("uses defined ascending smoothstep edges for the vignette", () => {
    expect(backgroundFragmentShader).toContain("1.0 - smoothstep(0.18, 0.88, dot(p, p))");
    expect(backgroundFragmentShader).not.toContain("smoothstep(0.88, 0.18");
  });
});
