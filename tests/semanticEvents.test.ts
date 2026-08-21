import { describe, expect, it } from "vitest";
import { createDefaultDriftProject } from "../src/core/project/defaults";
import { validateDriftProjectV3 } from "../src/core/project/validation";
import { planSemanticEvents } from "../src/core/timeline/eventPlanner";

const NOW = "2026-08-21T00:00:00.000Z";

function seamlessProject() {
  const project = createDefaultDriftProject("events", NOW);
  for (let index = 0; index < 4; index += 1) {
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
  project.motion.seamless.enabled = true;
  project.motion.seamless.loops = 1;
  project.motion.character.id = "direct";
  project.motion.character.amount = 0;
  project.motion.cadence.poseCadence = "continuous";
  return validateDriftProjectV3(project);
}

describe("semantic timeline events", () => {
  it("emits one deterministic focus handoff per source slide and a loop boundary", () => {
    const project = seamlessProject();
    const first = planSemanticEvents(project, 0, project.master.duration);
    const second = planSemanticEvents(project, 0, project.master.duration);
    expect(second).toEqual(first);
    expect(first.filter((event) => event.type === "focus-handoff")).toHaveLength(4);
    expect(first.filter((event) => event.type === "loop-boundary")).toHaveLength(1);
    expect(first.at(0)?.type).toBe("master-start");
    expect(first.at(-1)?.type).toBe("master-finish");
  });

  it("keeps content order stable while travel direction changes", () => {
    const forward = seamlessProject();
    const reverse = seamlessProject();
    reverse.motion.transport.direction = -1;
    forward.motion.transport.direction = 1;
    const a = planSemanticEvents(forward, 0, forward.master.duration)
      .filter((event) => event.type === "focus-handoff")
      .map((event) => event.sourceIndex);
    const b = planSemanticEvents(reverse, 0, reverse.master.duration)
      .filter((event) => event.type === "focus-handoff")
      .map((event) => event.sourceIndex);
    expect(b).toEqual(a);
  });
});
