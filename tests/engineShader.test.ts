import { describe, expect, it } from "vitest";
import { assertExportSurfaceSupported, selectRenderableItems } from "../src/engine/CinematicCarousel";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import { evaluateSlide, getLogicalSlotCount, getSlideGeometry, isPotentiallyVisible } from "../src/engine/evaluate";
import { backgroundFragmentShader, shadowFragmentShader, slideFragmentShader, slideVertexShader } from "../src/engine/shaders";

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

describe("cinematic lighting shader contract", () => {
  it("lights the actual deformed slide surface rather than an undeformed proxy", () => {
    expect(slideVertexShader).toContain("varying vec3 vViewPosition");
    expect(slideVertexShader).toContain("vViewPosition = viewPosition.xyz");
    expect(slideFragmentShader).toContain("dFdx(vViewPosition)");
    expect(slideFragmentShader).toContain("dFdy(vViewPosition)");
    expect(slideFragmentShader).toContain("gl_FrontFacing");
    expect(slideFragmentShader).toContain("uRoughness");
    expect(slideFragmentShader).toContain("uRimIntensity");
  });

  it("keeps slide and background grain spatial instead of wall-clock driven", () => {
    expect(slideFragmentShader).toContain("floor(vUv * uSizePx)");
    expect(slideFragmentShader).not.toContain("fract(uTime)");
    expect(slideFragmentShader).toContain("* clamp(uLightingEnabled, 0.0, 1.0)");
    expect(backgroundFragmentShader).toContain("hash12(gl_FragCoord.xy)");
    expect(backgroundFragmentShader).not.toContain("hash12(gl_FragCoord.xy +");
  });

  it("builds a directional coloured cast plus a separate contact-hardening lobe", () => {
    expect(shadowFragmentShader).toContain("uShadowOffsetPx");
    expect(shadowFragmentShader).not.toContain("uShadowOffsetPx * pulse");
    expect(shadowFragmentShader).toContain("uShadowColor");
    expect(shadowFragmentShader).toContain("contactSoftness");
    expect(shadowFragmentShader).toContain("contactDistance");
    expect(shadowFragmentShader).toContain("1.0 - (1.0 - castLayer) * (1.0 - contactLayer)");
  });

  it("offers six structural background light fields and a defined vignette", () => {
    expect(backgroundFragmentShader).toContain("authoredLightField");
    expect(backgroundFragmentShader).toContain("uLightGobo");
    expect(backgroundFragmentShader).toContain("float window =");
    expect(backgroundFragmentShader).toContain("float projector =");
    expect(backgroundFragmentShader).toContain("float slit =");
    expect(backgroundFragmentShader).toContain("float sunset =");
    expect(backgroundFragmentShader).toContain("float edge =");
    expect(backgroundFragmentShader).toContain("smoothstep(0.18, 0.88, dot(p, p))");
    expect(backgroundFragmentShader).not.toContain("smoothstep(0.88, 0.18");
  });
});
