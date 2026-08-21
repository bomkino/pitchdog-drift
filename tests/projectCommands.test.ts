import { describe, expect, it } from "vitest";
import { applyProjectCommand } from "../src/core/commands/projectCommand";
import { createDefaultDriftProject } from "../src/core/project/defaults";
import { createProjectRevisionState } from "../src/core/project/revisions";

const NOW = "2026-08-21T00:00:00.000Z";
const LATER = "2026-08-21T00:01:00.000Z";

describe("project command ownership", () => {
  it("records one owned creative decision and preserves every other domain", () => {
    const project = createDefaultDriftProject("project-1", NOW);
    const applied = applyProjectCommand(project, createProjectRevisionState(), {
      id: "motion.speed",
      source: "director",
      ownedDomains: ["motion"],
      apply: (candidate) => {
        candidate.motion.transport.slidesPerSecond = 0.5;
        return candidate;
      },
    }, LATER);

    expect(applied.project.motion.transport.slidesPerSecond).toBe(0.5);
    expect(applied.receipt.changedPaths).toContain("motion.transport.slidesPerSecond");
    expect(applied.receipt.changedPaths).toContain("updatedAt");
    expect(applied.receipt.preservedDomains).toContain("master");
    expect(applied.receipt.toRevision).toBe(1);
  });

  it("rejects a command that changes a domain it did not declare", () => {
    const project = createDefaultDriftProject("project-1", NOW);
    expect(() => applyProjectCommand(project, createProjectRevisionState(), {
      id: "dishonest-motion",
      source: "test",
      ownedDomains: ["motion"],
      apply: (candidate) => {
        candidate.composition.width = 1920;
        return candidate;
      },
    }, LATER)).toThrow(/outside its owned domains/u);
  });
});
