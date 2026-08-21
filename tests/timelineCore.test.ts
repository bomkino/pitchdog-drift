import { describe, expect, it } from "vitest";
import { evaluateFrame } from "../src/core/timeline/evaluateFrame";
import { evaluateCadence, invertVisibleSlideDistance, visibleSlideDistance } from "../src/core/timeline/cadence";
import { evaluateMasterTimeline } from "../src/core/timeline/master";
import { evaluatePerformance } from "../src/core/timeline/performance";
import { evaluateTrack } from "../src/core/timeline/track";
import { createDefaultDriftProject } from "../src/core/project/defaults";
import { validateDriftProjectV3 } from "../src/core/project/validation";

const NOW = "2026-08-21T00:00:00.000Z";

function projectWithSlides(count: number) {
  const project = createDefaultDriftProject("timeline", NOW);
  for (let index = 0; index < count; index += 1) {
    const id = `slide-${index}`;
    project.media.order.push(id);
    project.media.assets[id] = {
      id,
      name: `${id}.png`,
      kind: "image",
      mimeType: "image/png",
      hash: index.toString(16).padStart(64, "0"),
      byteLength: 1,
      width: 1920,
      height: 1080,
    };
    project.slides[id] = { assetId: id, fit: "cover", focalX: 0.5, focalY: 0.5, scaleOffset: 0 };
  }
  return validateDriftProjectV3(project);
}

describe("canonical timeline", () => {
  it("builds a monotonic runway with true non-looping endpoint rests", () => {
    const project = projectWithSlides(8);
    let previous = -1;
    for (let step = 0; step <= 1_000; step += 1) {
      const sample = evaluateMasterTimeline(project, project.master.duration * step / 1_000);
      expect(sample.progress).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = sample.progress;
    }
    expect(evaluateMasterTimeline(project, 0)).toMatchObject({ progress: 0, velocityPerSecond: 0 });
    expect(evaluateMasterTimeline(project, project.master.duration)).toMatchObject({ progress: 1, velocityPerSecond: 0 });
  });

  it("ignores runway for seamless output and closes one source-deck pass exactly", () => {
    const project = projectWithSlides(8);
    project.motion.seamless.enabled = true;
    project.motion.seamless.loops = 2;
    const start = evaluateTrack(project, 0, { samplePose: false });
    const end = evaluateTrack(project, project.master.duration, { samplePose: false });
    expect(start.rawSlides).toBe(0);
    expect(end.rawSlides).toBe(16);
    expect(start.master.velocityPerSecond).toBe(end.master.velocityPerSecond);
  });

  it("creates exact reading holds and monotonic carries", () => {
    const project = projectWithSlides(8);
    const schedule = evaluateCadence(project, 0).schedule;
    expect(evaluateCadence(project, schedule.readEnd * 0.5).progress).toBe(0);
    expect(evaluateCadence(project, (schedule.anticipationEnd + schedule.carryEnd) * 0.5).progress).toBeGreaterThan(0);
    expect(evaluateCadence(project, (schedule.carryEnd + 1) * 0.5).progress).toBe(1);
    let previous = -1;
    for (let step = 0; step <= 2_000; step += 1) {
      const visible = visibleSlideDistance(project, 2 * step / 2_000);
      expect(visible).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = visible;
    }
  });

  it("inverts authored visible distance through exact plateaus", () => {
    const project = projectWithSlides(8);
    for (const visible of [0, 0.1, 0.5, 0.9, 1, 1.37, 2]) {
      const raw = invertVisibleSlideDistance(project, visible);
      expect(visibleSlideDistance(project, raw)).toBeCloseTo(visible, 8);
    }
  });

  it("keeps every motion character monotonic with exact endpoints", () => {
    for (const id of ["direct", "weighted", "spring", "drift"] as const) {
      let previous = -1;
      for (let step = 0; step <= 1_000; step += 1) {
        const p = step / 1_000;
        const sample = evaluatePerformance(p, 1, 0, id, 1);
        expect(sample.progress).toBeGreaterThanOrEqual(previous - 1e-12);
        previous = sample.progress;
      }
      expect(evaluatePerformance(0, 1, 0, id, 1).progress).toBe(0);
      expect(evaluatePerformance(1, 1, 0, id, 1).progress).toBe(1);
    }
  });

  it("holds a 12 fps authored pose inside a 30 fps master", () => {
    const project = projectWithSlides(8);
    project.motion.cadence.poseCadence = "12fps";
    const frameOne = evaluateFrame(project, 1 / 30, { frameIndex: 1 });
    const frameTwo = evaluateFrame(project, 2 / 30, { frameIndex: 2 });
    expect(frameOne.track.visibleDistance).toBe(frameTwo.track.visibleDistance);
    expect(frameTwo.track.velocity).toBe(0);
  });

  it("freezes every timeline derivative for a reduced-motion master", () => {
    const project = projectWithSlides(8);
    project.master.reducedMotion = true;
    const frame = evaluateFrame(project, 4, { frameIndex: 120 });
    expect(frame.track).toMatchObject({ rawDistance: 0, visibleDistance: 0, velocity: 0, acceleration: 0, resting: true });
  });
});
