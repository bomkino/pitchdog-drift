import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { DRIFT_V2_RENDER_CONTRACT } from "../src/core/project/schema";
import { applyEditorialDriftFoundation } from "../src/core/worlds";
import { drawGraphStateFromProject } from "../src/engine/renderGraphState";

describe("Project V4 draw graph", () => {
  it("derives every graduated draw input directly without mutating project truth", () => {
    const source = createDefaultDriftProjectV4(
      "draw-graph",
      "2026-08-23T00:00:00.000Z",
      91,
      DRIFT_V2_RENDER_CONTRACT,
    );
    const project = applyEditorialDriftFoundation(source, "9:16");
    project.composition.alphaMode = "transparent";
    project.material.flex = 0.37;
    project.presenter.gain = 0.42;
    const before = structuredClone(project);

    const draw = drawGraphStateFromProject(project);

    expect(draw.stage).toEqual({
      width: project.composition.width,
      height: project.composition.height,
      transparent: true,
    });
    expect(draw.motion).toMatchObject({
      axis: project.motion.transport.axis,
      direction: project.motion.transport.direction,
      speed: project.motion.transport.slidesPerSecond,
      flow: project.motion.path.id,
      distortion: 0.37,
    });
    expect(draw.presenter.gain).toBe(0.42);
    expect(draw.output).toMatchObject({
      width: project.composition.width,
      height: project.composition.height,
      fps: project.master.fps,
      duration: project.master.duration,
    });
    expect(project).toEqual(before);
  });
});
