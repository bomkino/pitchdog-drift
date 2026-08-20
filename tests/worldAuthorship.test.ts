import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES } from "../src/themes";

function renderingFingerprint(theme: (typeof THEMES)[number]): string {
  const { motion, slide, background } = theme.settings;
  return JSON.stringify({
    axis: motion.axis,
    direction: motion.direction,
    speed: motion.speed,
    flow: motion.flow,
    gap: motion.gap,
    curvature: motion.curvature,
    depth: motion.depth,
    tilt: motion.tilt,
    distortion: motion.distortion,
    focusScale: motion.focusScale,
    edgeFade: motion.edgeFade,
    scale: slide.scale,
    radius: slide.radius,
    smoothing: slide.smoothing,
    borderWidth: slide.borderWidth,
    shadowOpacity: slide.shadowOpacity,
    shadowSoftness: slide.shadowSoftness,
    backgroundStyle: background.style,
    intensity: background.intensity,
    motion: background.motion,
    grain: background.grain,
    vignette: background.vignette,
    seed: background.seed,
  });
}

describe("authored film-world contract", () => {
  it("ships the twelve worlds documented by the product", () => {
    expect(THEMES).toHaveLength(12);
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((theme) => theme.name)).size).toBe(THEMES.length);
  });

  it("keeps worlds materially distinct rather than multiplying palette swaps", () => {
    const fingerprints = THEMES.map(renderingFingerprint);
    expect(new Set(fingerprints).size).toBe(THEMES.length);

    const flows = new Set(THEMES.map((theme) => theme.settings.motion.flow));
    const axes = new Set(THEMES.map((theme) => theme.settings.motion.axis));
    const backgrounds = new Set(THEMES.map((theme) => theme.settings.background.style));
    const radii = THEMES.map((theme) => theme.settings.slide.radius);

    expect(flows.size).toBeGreaterThanOrEqual(5);
    expect(axes).toEqual(new Set(["horizontal", "vertical"]));
    expect(backgrounds.size).toBeGreaterThanOrEqual(7);
    expect(Math.min(...radii)).toBeLessThanOrEqual(8);
    expect(Math.max(...radii)).toBeGreaterThanOrEqual(48);
  });

  it("requires authored language, not anonymous preset filler", () => {
    for (const theme of THEMES) {
      expect(theme.name.trim().length).toBeGreaterThanOrEqual(4);
      expect(theme.eyebrow.trim().length).toBeGreaterThanOrEqual(8);
      expect(theme.description.trim().length).toBeGreaterThanOrEqual(28);
      expect(theme.description).not.toMatch(/lorem|placeholder|preset\s+\d+/i);
    }
  });

  it("keeps public documentation aligned with the registry", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    expect(readme).toContain("Twelve authored film worlds");
    expect(readme).not.toMatch(/\b18\s+authored\s+film\s+worlds\b/i);
  });
});
