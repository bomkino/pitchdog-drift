import { describe, expect, it } from "vitest";
import { assertExportSurfaceSupported, selectRenderableItems } from "../src/engine/CinematicCarousel";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import { evaluateSlide, getLogicalSlotCount, getSlideGeometry, isPotentiallyVisible } from "../src/engine/evaluate";
import { backgroundFragmentShader, shadowFragmentShader, slideFragmentShader } from "../src/engine/shaders";

const LIMITS = {
  maxTextureSize: 8_192,
  maxRenderbufferSize: 16_384,
  maxViewportWidth: 16_384,
  maxViewportHeight: 16_384,
};

describe("custom shader output contract", () => {
  it("encodes every custom material from linear light into the renderer output color space", () => {
    for (const shader of [slideFragmentShader, shadowFragmentShader, backgroundFragmentShader]) {
      expect(shader).toContain("#include <colorspace_fragment>");
      expect(shader.indexOf("#include <colorspace_fragment>")).toBeGreaterThan(shader.lastIndexOf("gl_FragColor"));
    }
  });

  it("maps the contained image's occupied fraction, not its reciprocal", () => {
    expect(slideFragmentShader).toContain("scale.y = planeAspect / imageAspect");
    expect(slideFragmentShader).toContain("scale.x = imageAspect / planeAspect");
  });

  it("keeps cinematic optics bounded, velocity-aware, and legible at rest", () => {
    expect(slideFragmentShader).toContain("float motionBlurPx = min(5.0");
    expect(slideFragmentShader).toContain("float defocusPx = min(3.5");
    expect(slideFragmentShader).toContain("float chromaPx = min(2.8");
    expect(slideFragmentShader).toContain("if (motionBlurPx + defocusPx > 0.05)");
    expect(slideFragmentShader).toContain("speed * clamp(uDistortion");
  });

  it("pins microtexture to each slide instead of flickering it over time", () => {
    expect(slideFragmentShader).toContain("vec2 grainCoordinate = vUv * uSizePx");
    expect(slideFragmentShader).not.toContain("grainDrift");
  });

  it("never relies on undefined reversed-edge smoothstep calls", () => {
    const shaders = `${slideFragmentShader}
${backgroundFragmentShader}`;
    const numericCalls = [...shaders.matchAll(/smoothstep\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),/g)];
    expect(numericCalls.length).toBeGreaterThan(0);
    for (const call of numericCalls) expect(Number(call[1])).toBeLessThan(Number(call[2]));
  });

  it("routes atmosphere motion through exact cyclic coordinates", () => {
    expect(backgroundFragmentShader).toContain("float cycle = uPhase");
    expect(backgroundFragmentShader).toContain("vec2 loopA = vec2(cos(cycle), sin(cycle))");
    expect(backgroundFragmentShader).toContain("vec2 loopB = vec2(cos(cycle * 2.0 + 1.7), sin(cycle * 2.0 + 1.7))");
    const bodyAfterCycleVectors = backgroundFragmentShader.slice(
      backgroundFragmentShader.indexOf("float variant = mod"),
    );
    expect(bodyAfterCycleVectors).not.toMatch(/\bcycle\b/);
    expect(bodyAfterCycleVectors).not.toContain("uPhase");
  });

  it("uses every background family as a four-recipe procedural corpus", () => {
    expect(backgroundFragmentShader).toContain("float variant = mod(floor(abs(uSeed)), 4.0)");
    expect(backgroundFragmentShader).toContain("// SOLID FAMILY");
    expect(backgroundFragmentShader).toContain("// GRADIENT FAMILY");
    expect(backgroundFragmentShader).toContain("// AURA FAMILY");
    expect(backgroundFragmentShader).toContain("// PAPER FAMILY");
    expect(backgroundFragmentShader).toContain("// VOID FAMILY");
    expect(backgroundFragmentShader).toContain("smoothstep(0.18, 0.92, vignetteRadius)");
  });
});

describe("export surface preflight", () => {
  it("accepts a surface at the conservative GPU boundary", () => {
    expect(() => assertExportSurfaceSupported(8_192, 8_192, LIMITS)).not.toThrow();
  });

  it("rejects oversized, fractional, and non-positive surfaces", () => {
    expect(() => assertExportSurfaceSupported(8_193, 1_080, LIMITS)).toThrow(/exceeds this GPU's safe WebGL limit/);
    expect(() => assertExportSurfaceSupported(1_080.5, 1_920, LIMITS)).toThrow(/positive whole pixels/);
    expect(() => assertExportSurfaceSupported(0, 1_920, LIMITS)).toThrow(/positive whole pixels/);
  });
});

describe("bounded renderer pool", () => {
  it("keeps the centered slide under extreme custom-ratio pressure", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.stage.width = 256;
    settings.stage.height = 456;
    settings.motion.axis = "vertical";
    settings.motion.flow = "straight";
    settings.motion.gap = 0;
    settings.slide.scale = 0.24;
    settings.slide.aspectWidth = 4;
    settings.slide.aspectHeight = 1;
    const geometry = getSlideGeometry(settings);
    const slotCount = getLogicalSlotCount(1, geometry);
    const visible = Array.from({ length: slotCount }, (_, logicalIndex) => ({
      logicalIndex,
      evaluated: evaluateSlide(logicalIndex, slotCount, 0, settings, geometry),
    })).filter((item) => isPotentiallyVisible(item.evaluated, geometry));

    expect(visible.length).toBeGreaterThan(24);
    const renderable = selectRenderableItems(visible, 24);
    expect(renderable).toHaveLength(24);
    expect(Math.min(...renderable.map((item) => Math.abs(item.evaluated.primary)))).toBeLessThan(1e-9);
    expect(renderable.map((item) => item.evaluated.z)).toEqual(
      [...renderable].sort((a, b) => a.evaluated.z - b.evaluated.z).map((item) => item.evaluated.z),
    );
  });
});
