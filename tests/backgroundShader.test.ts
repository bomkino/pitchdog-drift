import { describe, expect, it } from "vitest";
import { backgroundFragmentShader } from "../src/engine/shaders";

const FAMILIES = ["solid", "gradient", "aura", "paper", "void"] as const;
const EXPECTED_UNIFORMS = [
  "uResolution",
  "uColorA",
  "uColorB",
  "uAccent",
  "uMode",
  "uIntensity",
  "uMotion",
  "uGrain",
  "uVignette",
  "uPhase",
  "uSeed",
];

describe("background atlas shader contract", () => {
  it("keeps the renderer-facing uniform API unchanged", () => {
    const uniforms = Array.from(
      backgroundFragmentShader.matchAll(/uniform\s+\w+\s+(u\w+)\s*;/g),
      (match) => match[1],
    );
    expect(uniforms).toEqual(EXPECTED_UNIFORMS);
  });

  it("contains every family/composition recipe", () => {
    expect(backgroundFragmentShader).toContain("BACKGROUND_VARIANT_COUNT = 8.0");
    expect(backgroundFragmentShader).toContain("BACKGROUND_ATLAS_SEED_BASE = 10000.0");
    for (const family of FAMILIES) {
      for (let index = 0; index < 8; index += 1) {
        expect(backgroundFragmentShader).toContain(`// ${family}-${index}`);
      }
    }
  });

  it("uses bounded procedural noise and no texture dependency", () => {
    expect(backgroundFragmentShader).toContain("for (int octave = 0; octave < 4; octave += 1)");
    expect(backgroundFragmentShader).toContain("float fbm(vec2 p)");
    expect(backgroundFragmentShader).toContain("float ridgedFbm(vec2 p)");
    expect(backgroundFragmentShader).not.toContain("sampler2D");
    expect(backgroundFragmentShader).not.toContain("texture2D");
  });

  it("expresses every background phase dependency through closed trigonometric motion", () => {
    const phaseLines = backgroundFragmentShader
      .split("\n")
      .filter((line) => line.includes("uPhase") && !line.includes("uniform") && !line.trimStart().startsWith("//"));
    expect(phaseLines.length).toBeGreaterThan(12);
    for (const line of phaseLines) expect(line, line.trim()).toMatch(/\b(?:sin|cos)\s*\(/);
  });

  it("keeps grain static and seeded instead of animating a noisy shimmer", () => {
    expect(backgroundFragmentShader).toContain(
      "vec2 grainCoordinate = gl_FragCoord.xy + vec2(uSeed * 0.071, uSeed * 0.113)",
    );
    const grainStart = backgroundFragmentShader.indexOf("vec2 grainCoordinate");
    const grainEnd = backgroundFragmentShader.indexOf("gl_FragColor", grainStart);
    expect(backgroundFragmentShader.slice(grainStart, grainEnd)).not.toContain("uPhase");
  });

  it("never relies on undefined reversed-edge smoothstep calls", () => {
    const numericSmoothsteps = Array.from(
      backgroundFragmentShader.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g),
      (match) => ({ lower: Number(match[1]), upper: Number(match[2]), source: match[0] }),
    );
    expect(numericSmoothsteps.length).toBeGreaterThan(40);
    for (const call of numericSmoothsteps) {
      expect(call.lower, call.source).toBeLessThanOrEqual(call.upper);
    }
  });

  it("retains explicit output colour-space encoding", () => {
    expect(backgroundFragmentShader).toContain("#include <colorspace_fragment>");
    expect(backgroundFragmentShader.indexOf("#include <colorspace_fragment>"))
      .toBeGreaterThan(backgroundFragmentShader.lastIndexOf("gl_FragColor"));
  });
});
