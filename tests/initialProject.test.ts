import { describe, expect, it } from "vitest";
import { createInitialDriftProjectV4 } from "../src/core/project/initialProject";
import { DRIFT_V2_RENDER_CONTRACT } from "../src/core/project/schema";

describe("new Drift project authority", () => {
  it("always begins on the authored V2 foundation, independent of build identity", () => {
    const project = createInitialDriftProjectV4("new-project", "2026-08-23T00:00:00.000Z");

    expect(project.renderContract).toBe(DRIFT_V2_RENDER_CONTRACT);
    expect(project.composition).toMatchObject({ width: 1080, height: 1920, alphaMode: "opaque" });
    expect(project.provenance.world?.id).toBe("editorial-drift/9:16");
    expect(project.provenance.worldVariant).toBe("restrained");
  });
});
