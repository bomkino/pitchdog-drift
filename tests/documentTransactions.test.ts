import { describe, expect, it } from "vitest";
import { commitProjectReplacement, documentContentIdentity } from "../src/core/project/documentContent";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { beginProjectSave, completeProjectSave, createProjectRevisionState, projectIsDirty, recordProjectMutation } from "../src/core/project/revisions";

describe("document handoff", () => {
  it("restores durable A when B persisted but binding failed", async () => {
    let durable = "A"; const visible = "A"; const history = ["edit A"];
    await expect(commitProjectReplacement({
      persistCandidate: async () => { durable = "B"; },
      bindCandidate: async () => { throw new Error("binding failed"); },
      restorePrevious: async () => { durable = "A"; },
    })).rejects.toThrow("binding failed");
    expect(durable).toBe(visible); expect(history).toEqual(["edit A"]);
  });
  it("never attempts binding after a failed durable write", async () => {
    const calls: string[] = [];
    await expect(commitProjectReplacement({
      persistCandidate: async () => { throw new Error("disk full"); },
      bindCandidate: async () => { calls.push("bind"); },
      restorePrevious: async () => { calls.push("restore"); },
    })).rejects.toThrow("disk full");
    expect(calls).toEqual([]);
  });
  it("does not hide a failed rollback behind success", async () => {
    await expect(commitProjectReplacement({
      persistCandidate: async () => {},
      bindCandidate: async () => { throw new Error("binding failed"); },
      restorePrevious: async () => { throw new Error("disk full"); },
    })).rejects.toBeInstanceOf(AggregateError);
  });
  it("ignores save timestamps, not authored values, in saved content identity", () => {
    const p = createDefaultDriftProjectV4("test", "2026-09-05T00:00:00.000Z");
    expect(documentContentIdentity({ ...p, updatedAt: "2026-09-05T01:00:00.000Z" })).toBe(documentContentIdentity(p));
    expect(documentContentIdentity({ ...p, card: { ...p.card, scale: 0.9 } })).not.toBe(documentContentIdentity(p));
  });
  it("undo to a saved content checkpoint is clean while redo is dirty", () => {
    let s = { ...createProjectRevisionState(), currentContentIdentity: "A", savedContentIdentity: "A" };
    s = { ...recordProjectMutation(s), currentContentIdentity: "B", savedContentIdentity: "A" };
    expect(projectIsDirty(s)).toBe(true);
    expect(projectIsDirty({ ...s, currentContentIdentity: "A" })).toBe(false);
    const save = beginProjectSave(s);
    const edited = { ...recordProjectMutation(save.state), currentContentIdentity: "C" };
    const complete = completeProjectSave(edited, save.ticket);
    expect(complete.savedContentIdentity).toBe("B");
    expect(projectIsDirty(complete)).toBe(true);
  });
});
