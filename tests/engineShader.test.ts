import { describe, expect, it, vi } from "vitest";
import {
  CinematicCarousel,
  assertExportSurfaceSupported,
  getShadowSupportMargin,
  normalizeGrainSeed,
  resolveCanvasClearAlpha,
  resolveExportFrameIndex,
  resolveGrainFrame,
  resolveMovingTrackAssets,
  resolvePresenterPreviewClock,
  selectRenderableItems,
} from "../src/engine/CinematicCarousel";
import { DRIFT_V2_RENDER_CONTRACT } from "../src/core/project/schema";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { DEFAULT_SETTINGS, cloneSettings, type StudioAsset } from "../src/model";
import { evaluateSlide, getLogicalSlotCount, getSlideGeometry, isPotentiallyVisible } from "../src/engine/evaluate";
import { backgroundFragmentShader, shadowFragmentShader, slideFragmentShader } from "../src/engine/shaders";
import { createPerformanceLifecycle } from "../src/core/timeline/performanceLifecycle";

const LIMITS = {
  maxTextureSize: 8_192,
  maxRenderbufferSize: 16_384,
  maxViewportWidth: 16_384,
  maxViewportHeight: 16_384,
};

describe("custom shader output contract", () => {
  it("encodes every custom material from linear light into the renderer output color space", () => {
    for (const shader of [slideFragmentShader, shadowFragmentShader]) {
      expect(shader).toContain("#include <colorspace_fragment>");
      expect(shader.indexOf("#include <colorspace_fragment>")).toBeGreaterThan(shader.lastIndexOf("gl_FragColor"));
    }
    expect(backgroundFragmentShader.indexOf("#include <colorspace_fragment>")).toBeGreaterThan(
      backgroundFragmentShader.indexOf("gl_FragColor = vec4(color, 1.0)"),
    );
    expect(backgroundFragmentShader.indexOf("#include <colorspace_fragment>")).toBeLessThan(
      backgroundFragmentShader.lastIndexOf("gl_FragColor.rgb"),
    );
  });

  it("maps the contained image's occupied fraction, not its reciprocal", () => {
    expect(slideFragmentShader).toContain("scale.y = planeAspect / imageAspect");
    expect(slideFragmentShader).toContain("scale.x = imageAspect / planeAspect");
  });

  it("keeps procedural grain out of imported slide pixels", () => {
    expect(slideFragmentShader).not.toContain("hash12");
    expect(slideFragmentShader).not.toContain("uTime");
    expect(slideFragmentShader).not.toContain("filmGrain");
    expect(backgroundFragmentShader).toContain("filmGrain");
    expect(backgroundFragmentShader).toContain("uGrainFrame");
    expect(backgroundFragmentShader).toContain("1.0 - exp(-8.0 * grainControl)");
    expect(backgroundFragmentShader).toContain("smoothstep(0.004, 0.040, displayLuminance)");
    expect(backgroundFragmentShader).toContain("p + seedShift");
    expect(backgroundFragmentShader).not.toContain("33.33 + uSeed");
  });

  it("composites an intentional border independently from transparent artwork alpha", () => {
    expect(slideFragmentShader).toContain("borderAlpha + sampled.a * (1.0 - borderAlpha)");
    expect(slideFragmentShader).toContain("combinedPremultiplied");
  });

  it("gives safe Contain frames a truthful transparent matte while preserving legacy edge fill", () => {
    expect(slideFragmentShader).toContain("uLegacyContainMatte");
    expect(slideFragmentShader).toContain("sampled = vec4(uMatteColor, uMatteOpacity)");
    expect(slideFragmentShader).toContain("sampled.rgb *= 0.2");
  });

  it("casts shadows from the card mask instead of the expanded blur canvas", () => {
    expect(shadowFragmentShader).toContain("uCanvasSizePx");
    expect(shadowFragmentShader).toContain("uCardSizePx");
    expect(shadowFragmentShader).toContain("uCardSizePx * 0.5");
    expect(shadowFragmentShader).not.toContain("shapeDistance(pixel, uCanvasSizePx * 0.5");
  });

  it("extends shadow support through the discard threshold at every valid softness", () => {
    for (const softness of [48, 96, 256]) {
      const opacity = 0.8;
      const margin = getShadowSupportMargin(softness, opacity);
      const sigma = Math.max(1, softness * 0.34);
      const edgeAlpha = Math.exp(-0.5 * margin * margin / (sigma * sigma)) * opacity;
      expect(edgeAlpha).toBeLessThanOrEqual(0.001);
    }
    expect(getShadowSupportMargin(96, 0.8)).toBeGreaterThan(84);
    expect(getShadowSupportMargin(96, 0)).toBe(0);
  });

  it("folds the complete Project V3 seed range into stable float32-safe entropy", () => {
    const seeds = [0, 17, 10_000, 1_000_000, 10_000_000, 4_294_967_295];
    const normalized = seeds.map(normalizeGrainSeed);
    expect(normalized.every((seed) => Number.isInteger(seed) && seed >= 0 && seed < 4_093)).toBe(true);
    expect(new Set(normalized).size).toBe(seeds.length);
    expect(normalizeGrainSeed(4_294_967_295)).toBe(normalizeGrainSeed(4_294_967_295));
  });
});

describe("canvas alpha invariant", () => {
  it("keeps V2 opaque through lifecycle fades while preserving transparent and compatibility clears", () => {
    const opaque = createDefaultDriftProjectV4("alpha-invariant", undefined, undefined, DRIFT_V2_RENDER_CONTRACT);
    opaque.composition.alphaMode = "opaque";

    const transparent = structuredClone(opaque);
    transparent.composition.alphaMode = "transparent";

    const compatibility = structuredClone(opaque);
    compatibility.renderContract = "drift-v1-compat/1";

    expect(resolveCanvasClearAlpha(opaque)).toBe(1);
    expect(resolveCanvasClearAlpha(transparent)).toBe(0);
    expect(resolveCanvasClearAlpha(compatibility)).toBe(0);
    expect(resolveCanvasClearAlpha(null)).toBe(0);
  });
});

describe("pinned-only moving-track ownership", () => {
  const assets = ["a", "b", "c"].map((id): StudioAsset => ({
    id,
    name: `${id}.png`,
    kind: "image",
    blob: new Blob([id], { type: "image/png" }),
    mimeType: "image/png",
    width: 16,
    height: 9,
    objectUrl: `blob:${id}`,
  }));

  it("removes only the protected image while retaining original source identity", () => {
    expect(resolveMovingTrackAssets(assets, assets[1]!, {
      enabled: true,
      trackMode: "pinned-only",
    }).map(({ asset, sourceIndex }) => [asset.id, sourceIndex])).toEqual([
      ["a", 0],
      ["c", 2],
    ]);
  });

  it("keeps all moving images for compatibility mode, disabled pins, and presenter videos", () => {
    const video = { ...assets[1]!, kind: "video" as const, mimeType: "video/mp4" };
    for (const [presenterAsset, presenter] of [
      [assets[1]!, { enabled: true, trackMode: "moving-and-pinned" as const }],
      [assets[1]!, { enabled: false, trackMode: "pinned-only" as const }],
      [video, { enabled: true, trackMode: "pinned-only" as const }],
    ] as const) {
      expect(resolveMovingTrackAssets(assets, presenterAsset, presenter).map(({ sourceIndex }) => sourceIndex))
        .toEqual([0, 1, 2]);
    }
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

describe("deterministic export frame identity", () => {
  it("accepts only an exact nullable frame identity at the engine boundary", () => {
    expect(resolveExportFrameIndex(undefined)).toBeNull();
    expect(resolveExportFrameIndex(null)).toBeNull();
    expect(resolveExportFrameIndex(0)).toBe(0);
    expect(resolveExportFrameIndex(287)).toBe(287);
    for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => resolveExportFrameIndex(invalid)).toThrow(/non-negative safe integer/);
    }
  });

  it("uses explicit export identity for grain without reconstructing it from floating-point time", () => {
    expect(resolveGrainFrame(0.000_001, 30, true, false, 287)).toBe(114);
    expect(resolveGrainFrame(9_999.999, 30, true, false, 287)).toBe(114);
    expect(resolveGrainFrame(17 / 30, 30, true, false)).toBe(6);
    expect(resolveGrainFrame(17 / 30, 30, true, true, 17)).toBe(0);
  });

  it("holds deterministic grain plates at a handcrafted 12 fps cadence", () => {
    expect(Array.from({ length: 10 }, (_, frame) => resolveGrainFrame(frame / 30, 30, true, false, frame)))
      .toEqual([0, 0, 0, 1, 1, 2, 2, 2, 3, 3]);
    expect(resolveGrainFrame(23 / 24, 24, true, false, 23)).toBe(11);
    expect(resolveGrainFrame(59 / 60, 60, true, false, 59)).toBe(11);
  });

  it("preserves the explicit frame identity through asynchronous texture preparation", async () => {
    const renderAt = vi.fn();
    const settings = cloneSettings(DEFAULT_SETTINGS);
    const fakeEngine = {
      drawState: settings,
      requireV1Settings: () => settings,
      performanceTimeline: createPerformanceLifecycle(settings.performance),
      assets: [],
      pool: [],
      presenterAsset: null,
      presenterRequestGeneration: 0,
      movingTrackAssets: () => [],
      disposed: false,
      contextLost: false,
      assertExplicitFrameRendererAvailable: vi.fn(),
      resolvePresenterTexture: vi.fn(),
      setTextureDemand: vi.fn(),
      renderAt,
    };
    const renderAtAsync = CinematicCarousel.prototype.renderAtAsync as unknown as (
      this: typeof fakeEngine,
      time: number,
      frameIndex?: number | null,
    ) => Promise<void>;

    await renderAtAsync.call(fakeEngine, 287 / 30, 287);

    expect(renderAt).toHaveBeenCalledOnce();
    expect(renderAt).toHaveBeenCalledWith(287 / 30, 287);
  });
});

describe("canonical presenter preview clock", () => {
  const base = {
    masterTime: 1.25,
    previousMasterTime: 1.2,
    videoTime: 1.23,
    videoDuration: 2,
    masterFps: 30,
    exact: false,
  };

  it("lets running playback coast only within one master frame", () => {
    expect(resolvePresenterPreviewClock(base)).toEqual({
      targetTime: 1.25,
      shouldSeek: false,
      wrapped: false,
    });
    expect(resolvePresenterPreviewClock({ ...base, videoTime: 1.1 })).toMatchObject({
      targetTime: 1.25,
      shouldSeek: true,
      wrapped: false,
    });
  });

  it("corrects master loops but holds an under-length source instead of inventing an export loop", () => {
    expect(resolvePresenterPreviewClock({
      ...base,
      masterTime: 0.02,
      previousMasterTime: 2.98,
      videoTime: 1.02,
    })).toEqual({ targetTime: 0.02, shouldSeek: true, wrapped: true });

    const held = resolvePresenterPreviewClock({
      ...base,
      masterTime: 2.02,
      previousMasterTime: 1.98,
      videoTime: 1.99,
      exact: true,
    });
    expect(held.targetTime).toBeCloseTo(2 - 1 / 30, 12);
    expect(held).toMatchObject({ shouldSeek: true, wrapped: false });
  });

  it("seeks frozen playback to exact master time and waits for real metadata", () => {
    expect(resolvePresenterPreviewClock({ ...base, exact: true, videoTime: 1.246 })).toMatchObject({
      targetTime: 1.25,
      shouldSeek: true,
    });
    expect(resolvePresenterPreviewClock({ ...base, exact: true, videoTime: 1.2495 })).toMatchObject({
      shouldSeek: false,
    });
    expect(resolvePresenterPreviewClock({ ...base, videoDuration: Number.NaN })).toEqual({
      targetTime: null,
      shouldSeek: false,
      wrapped: false,
    });
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
