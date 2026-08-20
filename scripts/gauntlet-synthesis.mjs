import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SOURCE = "b4bb164faecc3d5cdf92895b41439f9f5041a55a";

const copyPaths = [
  "src/App.tsx",
  "src/backgrounds.ts",
  "src/components/ControlPanel.tsx",
  "src/components/MediaLibrary.tsx",
  "src/components/Stage.tsx",
  "src/journey.css",
  "src/lib/directorSession.ts",
  "src/lib/importOrder.ts",
  "src/lib/naming.ts",
  "src/main.tsx",
  "src/mediaDiagnostics.ts",
  "src/optics.ts",
  "src/preflight.ts",
  "src/styles.css",
  "src/workflows.ts",
  "tests/backgrounds.test.ts",
  "tests/directorSession.test.ts",
  "tests/importOrder.test.ts",
  "tests/mediaDiagnostics.test.ts",
  "tests/naming.test.ts",
  "tests/optics.test.ts",
  "tests/preflight.test.ts",
  "tests/workflows.test.ts",
  "e2e/journey.e2e.ts",
  "docs/USER_JOURNEY_GAUNTLET.md",
];

function show(path) {
  return execFileSync("git", ["show", `${SOURCE}:${path}`], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function replaceRequired(path, search, replacement) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(search)) {
    throw new Error(`Could not find required patch target in ${path}: ${search.slice(0, 120)}`);
  }
  write(path, source.replace(search, replacement));
}

for (const path of copyPaths) write(path, show(path));

// The journey branch contains three worlds with different names. Map only the
// intent language onto this branch's richer eighteen-world registry.
const nameMappings = [
  ["archive-fever", "archival-blue"],
  ["Archive Fever", "Archival Blue"],
  ["ocean-memory", "salt-air"],
  ["Ocean Memory", "Salt Air"],
  ["daybreak-comedy", "acid-matinee"],
  ["Daybreak Comedy", "Acid Matinee"],
  ["alpine-silence", "winter-celluloid"],
  ["Alpine Silence", "Winter Celluloid"],
  ["ritual-ember", "folklore-ember"],
  ["Ritual Ember", "Folklore Ember"],
  ["neon-motel", "midnight-run"],
  ["Neon Motel", "Midnight Run"],
];
for (const path of copyPaths.filter((path) => /\.(?:ts|tsx|md)$/.test(path))) {
  let content = readFileSync(path, "utf8");
  for (const [from, to] of nameMappings) content = content.replaceAll(from, to);
  write(path, content);
}

// Keep the synthesis branch's three additional spatial paths visible in the
// Director instead of silently inheriting the five-path source panel.
replaceRequired(
  "src/components/ControlPanel.tsx",
  '            { value: "tunnel", label: "Tunnel" },\n',
  '            { value: "tunnel", label: "Tunnel" },\n            { value: "helix", label: "Helix" },\n            { value: "cascade", label: "Cascade" },\n            { value: "orbit", label: "Orbit" },\n',
);

// A seamless master must traverse authored source slides, not renderer-padding
// copies. Saved Autoplay is also project intent: OFF means still in preview and
// export, while a temporarily paused preview does not rewrite that intent.
{
  const path = "src/engine/evaluate.ts";
  const source = readFileSync(path, "utf8");
  const start = source.indexOf("export function distanceAtTime");
  const end = source.indexOf("export function evaluateSlide");
  if (start < 0 || end < 0 || end <= start) throw new Error("Could not isolate timeline evaluator block.");
  const timeline = `function completeLoopDistance(\n  settings: StudioSettings,\n  sourceSlideCount: number,\n  stride: number,\n): number {\n  if (sourceSlideCount <= 0) return 0;\n  return sourceSlideCount\n    * stride\n    * Math.max(1, Math.round(settings.motion.seamlessLoops));\n}\n\nexport function slidesPerSecondForPreview(\n  settings: StudioSettings,\n  sourceSlideCount: number,\n): number {\n  if (!settings.motion.autoplay) return 0;\n  if (settings.motion.seamless && sourceSlideCount > 0) {\n    return sourceSlideCount\n      * Math.max(1, Math.round(settings.motion.seamlessLoops))\n      / Math.max(0.001, settings.output.duration);\n  }\n  return settings.motion.speed;\n}\n\nexport function velocityForPreview(\n  settings: StudioSettings,\n  sourceSlideCount: number,\n  stride: number,\n): number {\n  return settings.motion.direction\n    * slidesPerSecondForPreview(settings, sourceSlideCount)\n    * stride;\n}\n\nexport function distanceAtTime(\n  settings: StudioSettings,\n  time: number,\n  sourceSlideCount: number,\n  stride: number,\n  exportMode: boolean,\n): number {\n  if (!settings.motion.autoplay) return 0;\n  if (settings.motion.reducedMotionOutput && exportMode) return 0;\n  const direction = settings.motion.direction;\n  if (exportMode && settings.motion.seamless && sourceSlideCount > 0) {\n    const phase = time / Math.max(0.001, settings.output.duration);\n    return direction * completeLoopDistance(settings, sourceSlideCount, stride) * phase;\n  }\n  return direction * settings.motion.speed * stride * Math.max(0, time);\n}\n\nexport function velocityAtTime(\n  settings: StudioSettings,\n  sourceSlideCount: number,\n  stride: number,\n  exportMode: boolean,\n): number {\n  if (!settings.motion.autoplay) return 0;\n  if (exportMode && settings.motion.reducedMotionOutput) return 0;\n  if (exportMode && settings.motion.seamless && sourceSlideCount > 0) {\n    return settings.motion.direction\n      * completeLoopDistance(settings, sourceSlideCount, stride)\n      / Math.max(0.001, settings.output.duration);\n  }\n  return settings.motion.direction * settings.motion.speed * stride;\n}\n\n`;
  write(path, source.slice(0, start) + timeline + source.slice(end));
}

// Wire the corrected authored-slide cadence into preview and fixed-step export.
replaceRequired(
  "src/engine/CinematicCarousel.ts",
  "  velocityAtTime,\n",
  "  velocityAtTime,\n  velocityForPreview,\n",
);
replaceRequired(
  "src/engine/CinematicCarousel.ts",
  `    const geometry = getSlideGeometry(this.settings);\n    const slotCount = getLogicalSlotCount(this.assets.length, geometry);\n    const distance = distanceAtTime(this.settings, time, slotCount, geometry.stride, true);\n    const velocity = velocityAtTime(this.settings, slotCount, geometry.stride, true);\n    this.renderInternal(time, distance, velocity, true);\n`,
  `    const geometry = getSlideGeometry(this.settings);\n    const distance = distanceAtTime(this.settings, time, this.assets.length, geometry.stride, true);\n    const velocity = velocityAtTime(this.settings, this.assets.length, geometry.stride, true);\n    this.renderInternal(time, distance, velocity, true);\n`,
);
replaceRequired(
  "src/engine/CinematicCarousel.ts",
  "    const distance = distanceAtTime(this.settings, time, slotCount, geometry.stride, true);\n",
  "    const distance = distanceAtTime(this.settings, time, this.assets.length, geometry.stride, true);\n",
);
replaceRequired(
  "src/engine/CinematicCarousel.ts",
  "    const desiredVelocity = autoplay ? this.settings.motion.direction * this.settings.motion.speed * geometry.stride : 0;\n",
  "    const desiredVelocity = autoplay\n      ? velocityForPreview(this.settings, this.assets.length, geometry.stride)\n      : 0;\n",
);

// The current branch deliberately kept Solid minimal. Deepen it into four
// deterministic chambers so every authored scene description is materially true.
replaceRequired(
  "src/engine/shaders.ts",
  `    if (uMode < 0.5) {\n      color = uColorA;\n    } else if (uMode < 1.5) {\n`,
  `    if (uMode < 0.5) {\n      if (variant < 0.5) {\n        float centre = softBlob(p, vec2(0.0), 0.92);\n        float cloth = fbm(p * 2.0 + vec2(uSeed * 0.017, uSeed * 0.011)) - 0.5;\n        color = mix(uColorA, uColorB, centre * 0.22 * uIntensity);\n        color += cloth * 0.012 * uIntensity;\n      } else if (variant < 1.5) {\n        vec2 practical = vec2(-0.22 + cosPhase * 0.03, 0.18 + sinDoublePhase * 0.025);\n        float pool = softBlob(p, practical, 0.74);\n        color = mix(uColorA, uColorB, pool * 0.48 * uIntensity);\n        color = mix(color, uAccent, pool * pool * 0.11 * uIntensity);\n      } else if (variant < 2.5) {\n        vec2 milkDrift = vec2(cosPhase, -sinPhase) * 0.035;\n        float milk = fbm(p * 1.25 + milkDrift + vec2(uSeed * 0.009));\n        float veil = smoothstep(0.22, 0.86, milk + (0.5 - length(p)) * 0.28);\n        color = mix(uColorA, uColorB, veil * 0.34 * uIntensity);\n        color = mix(color, uAccent, softBlob(p, vec2(0.2, -0.16), 1.0) * 0.12 * uIntensity);\n      } else {\n        vec2 oilDrift = vec2(cosDoublePhase, sinDoublePhase) * 0.05;\n        float oil = fbm(p * 2.2 + oilDrift + vec2(uSeed * 0.013));\n        float ribbon = smoothstep(0.5, 0.82, oil + sin(p.y * 4.0 + seedPhase) * 0.08);\n        color = mix(uColorA, uColorB, ribbon * 0.4 * uIntensity);\n        color = mix(color, uAccent, smoothstep(0.72, 0.92, oil) * 0.12 * uIntensity);\n      }\n    } else if (uMode < 1.5) {\n`,
);

write(
  "tests/evaluate.test.ts",
  `import { describe, expect, it } from "vitest";\nimport { DEFAULT_SETTINGS, FLOW_IDS, cloneSettings } from "../src/model";\nimport {\n  distanceAtTime,\n  evaluateSlide,\n  getLogicalSlotCount,\n  getSlideGeometry,\n  positiveModulo,\n  slidesPerSecondForPreview,\n  velocityAtTime,\n  velocityForPreview,\n} from "../src/engine/evaluate";\n\ndescribe("deterministic carousel evaluation", () => {\n  it("keeps virtual strip lengths on complete asset cycles", () => {\n    const geometry = getSlideGeometry(DEFAULT_SETTINGS);\n    for (const count of [1, 2, 3, 7, 8, 12, 25]) {\n      const slots = getLogicalSlotCount(count, geometry);\n      expect(slots).toBeGreaterThanOrEqual(count);\n      expect(slots % count).toBe(0);\n    }\n    expect(getLogicalSlotCount(0, geometry)).toBe(0);\n  });\n\n  it("wraps negative distance without a discontinuity", () => {\n    expect(positiveModulo(-1, 8)).toBe(7);\n    expect(positiveModulo(8, 8)).toBe(0);\n    expect(positiveModulo(Number.NaN, 8)).toBe(0);\n  });\n\n  it("evaluates the same frame identically", () => {\n    const settings = cloneSettings(DEFAULT_SETTINGS);\n    const geometry = getSlideGeometry(settings);\n    const sourceCount = 8;\n    const slots = getLogicalSlotCount(sourceCount, geometry);\n    const distance = distanceAtTime(settings, 2.125, sourceCount, geometry.stride, true);\n    expect(evaluateSlide(3, slots, distance, settings, geometry)).toEqual(\n      evaluateSlide(3, slots, distance, settings, geometry),\n    );\n  });\n\n  it("keeps every authored path finite across horizontal and vertical stages", () => {\n    for (const axis of ["horizontal", "vertical"] as const) {\n      for (const flow of FLOW_IDS) {\n        const settings = cloneSettings(DEFAULT_SETTINGS);\n        settings.motion.axis = axis;\n        settings.motion.flow = flow;\n        settings.motion.curvature = 0.73;\n        settings.motion.depth = 0.68;\n        settings.motion.tilt = 18;\n        const geometry = getSlideGeometry(settings);\n        const slots = getLogicalSlotCount(11, geometry);\n        for (let index = 0; index < slots; index += 1) {\n          const evaluated = evaluateSlide(index, slots, geometry.stride * 1.731, settings, geometry);\n          expect(Object.values(evaluated).every(Number.isFinite)).toBe(true);\n          expect(evaluated.opacity).toBeGreaterThanOrEqual(0.08);\n          expect(evaluated.opacity).toBeLessThanOrEqual(1);\n          expect(evaluated.scale).toBeGreaterThanOrEqual(1);\n        }\n      }\n    }\n  });\n\n  it("shares analytic free-run speed between preview and export", () => {\n    const settings = cloneSettings(DEFAULT_SETTINGS);\n    settings.motion.seamless = false;\n    const geometry = getSlideGeometry(settings);\n    const sourceCount = 8;\n    expect(velocityForPreview(settings, sourceCount, geometry.stride)).toBe(\n      velocityAtTime(settings, sourceCount, geometry.stride, true),\n    );\n    expect(slidesPerSecondForPreview(settings, sourceCount)).toBe(settings.motion.speed);\n  });\n\n  it("bases one seamless loop on authored slides, never renderer-padding copies", () => {\n    const settings = cloneSettings(DEFAULT_SETTINGS);\n    settings.motion.axis = "vertical";\n    settings.slide.scale = 0.24;\n    settings.slide.aspectWidth = 4;\n    settings.slide.aspectHeight = 1;\n    settings.motion.gap = 0;\n    settings.motion.seamless = true;\n    settings.motion.seamlessLoops = 2;\n    settings.output.duration = 8;\n    const geometry = getSlideGeometry(settings);\n    const sourceCount = 3;\n    const slots = getLogicalSlotCount(sourceCount, geometry);\n    expect(slots).toBeGreaterThan(sourceCount);\n    const start = distanceAtTime(settings, 0, sourceCount, geometry.stride, true);\n    const end = distanceAtTime(settings, settings.output.duration, sourceCount, geometry.stride, true);\n    expect(Math.abs(end - start)).toBe(sourceCount * geometry.stride * 2);\n    expect(velocityAtTime(settings, sourceCount, geometry.stride, true) * settings.output.duration).toBe(end);\n    expect(velocityForPreview(settings, sourceCount, geometry.stride)).toBe(\n      velocityAtTime(settings, sourceCount, geometry.stride, true),\n    );\n  });\n\n  it("freezes both distance and optical velocity for reduced-motion masters", () => {\n    const settings = cloneSettings(DEFAULT_SETTINGS);\n    settings.motion.reducedMotionOutput = true;\n    const geometry = getSlideGeometry(settings);\n    expect(distanceAtTime(settings, 4, 8, geometry.stride, true)).toBe(0);\n    expect(velocityAtTime(settings, 8, geometry.stride, true)).toBe(0);\n  });\n\n  it("treats saved Autoplay as project intent while temporary pause stays runtime-only", () => {\n    const settings = cloneSettings(DEFAULT_SETTINGS);\n    settings.motion.autoplay = false;\n    settings.motion.seamless = true;\n    settings.motion.seamlessLoops = 3;\n    const geometry = getSlideGeometry(settings);\n    expect(distanceAtTime(settings, 4, 8, geometry.stride, false)).toBe(0);\n    expect(distanceAtTime(settings, 4, 8, geometry.stride, true)).toBe(0);\n    expect(velocityAtTime(settings, 8, geometry.stride, false)).toBe(0);\n    expect(velocityAtTime(settings, 8, geometry.stride, true)).toBe(0);\n    expect(velocityForPreview(settings, 8, geometry.stride)).toBe(0);\n  });\n});\n`,
);

// Keep the temporary mutation machinery out of the authored branch.
rmSync("scripts/gauntlet-synthesis.mjs", { force: true });
rmSync(".github/workflows/gauntlet-synthesis.yml", { force: true });
