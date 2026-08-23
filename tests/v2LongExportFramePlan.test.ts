import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { DRIFT_V2_RENDER_CONTRACT } from "../src/core/project/schema";
import { createPerformanceLifecycle } from "../src/core/timeline/performanceLifecycle";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import { buildExportFramePlan, getExportFrameCount } from "../src/lib/exportStudio";

const FPS = 24;
const MATRIX = [
  { duration: 30, slides: 8, width: 1080, height: 1920 },
  { duration: 30, slides: 8, width: 1920, height: 1080 },
  { duration: 30, slides: 40, width: 1080, height: 1920 },
  { duration: 30, slides: 40, width: 1920, height: 1080 },
  { duration: 60, slides: 40, width: 1080, height: 1920 },
  { duration: 60, slides: 40, width: 1920, height: 1080 },
  { duration: 180, slides: 40, width: 1080, height: 1920 },
  { duration: 180, slides: 200, width: 1080, height: 1920 },
] as const;

describe("Project V4 long-export fixed frame plans", () => {
  for (const entry of MATRIX) {
    it(`${entry.duration}s / ${entry.slides} slides / ${entry.width}x${entry.height}`, () => {
      const project = createDefaultDriftProjectV4(
        `qa-${entry.duration}-${entry.slides}-${entry.width}x${entry.height}`,
        "2026-08-23T00:00:00.000Z",
        73,
        DRIFT_V2_RENDER_CONTRACT,
      );
      project.composition = { ...project.composition, width: entry.width, height: entry.height };
      project.master = { ...project.master, duration: entry.duration, fps: FPS };
      project.motion = { ...project.motion, seamless: { enabled: true, loops: 1 } };
      project.performance = createPerformanceLifecycle({
        entry: { enabled: false },
        body: { durationSeconds: entry.duration, tempo: { kind: "preset", preset: "even" } },
        exit: { enabled: false },
        repeat: { mode: "off" },
        reducedMotion: false,
      }).authoring;
      project.media.order = [];
      project.media.assets = {};
      project.slides = {};
      for (let index = 0; index < entry.slides; index += 1) {
        const id = `slide-${index.toString().padStart(3, "0")}`;
        project.media.order.push(id);
        project.media.assets[id] = {
          id,
          name: `${id}.png`,
          kind: "image",
          mimeType: "image/png",
          hash: (index + 1).toString(16).padStart(64, "0"),
          byteLength: 1,
          width: 32,
          height: 32,
        };
        project.slides[id] = { assetId: id, fit: "cover", focalX: 0.5, focalY: 0.5, scaleOffset: 0 };
      }

      const validated = validateDriftProjectV4(project);
      const settings = {
        width: entry.width,
        height: entry.height,
        duration: entry.duration,
        fps: FPS,
      };
      const expectedFrames = entry.duration * FPS;
      const plan = buildExportFramePlan(settings);

      expect(validated.formatVersion).toBe(4);
      expect(validated.renderContract).toBe(DRIFT_V2_RENDER_CONTRACT);
      expect(validated.media.order).toHaveLength(entry.slides);
      expect(getExportFrameCount(settings)).toBe(expectedFrames);
      expect(plan).toHaveLength(expectedFrames);
      expect(plan[0]).toMatchObject({ index: 0, time: 0, duration: 1 / FPS });
      expect(plan.at(-1)).toMatchObject({
        index: expectedFrames - 1,
        time: (expectedFrames - 1) / FPS,
        duration: 1 / FPS,
      });
    });
  }
});
