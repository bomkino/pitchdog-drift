import { describe, expect, it } from "vitest";
import {
  beginProjectSave,
  completeProjectSave,
  createProjectRevisionState,
  projectDocumentCanRevert,
  projectDocumentIsDirty,
  projectHasUnrecoveredWork,
  projectIsDirty,
  recordProjectMutation,
  recordProjectRecovery,
} from "../src/core/project/revisions";

describe("native-safe project revisions", () => {
  it("does not mark edits made during a save as clean", () => {
    let state = createProjectRevisionState();
    state = recordProjectMutation(state);
    const first = beginProjectSave(state);
    state = first.state;
    state = recordProjectMutation(state);
    state = completeProjectSave(state, first.ticket);

    expect(state.savedRevision).toBe(1);
    expect(state.currentRevision).toBe(2);
    expect(projectIsDirty(state)).toBe(true);
  });

  it("does not let a late older save completion regress the saved revision", () => {
    let state = recordProjectMutation(createProjectRevisionState());
    const saveOne = beginProjectSave(state);
    state = saveOne.state;
    state = recordProjectMutation(state);
    const saveTwo = beginProjectSave(state);
    state = saveTwo.state;

    state = completeProjectSave(state, saveTwo.ticket);
    state = completeProjectSave(state, saveOne.ticket);

    expect(state.savedRevision).toBe(2);
    expect(projectIsDirty(state)).toBe(false);
  });

  it("tracks recovery separately from user Save", () => {
    let state = recordProjectMutation(createProjectRevisionState());
    expect(projectHasUnrecoveredWork(state)).toBe(true);
    state = recordProjectRecovery(state);
    expect(projectHasUnrecoveredWork(state)).toBe(false);
    expect(projectIsDirty(state)).toBe(true);
  });

  it("keeps untitled documents dirty and never offers a false revert target", () => {
    const untitled = createProjectRevisionState();
    expect(projectIsDirty(untitled)).toBe(false);
    expect(projectDocumentIsDirty(untitled, false)).toBe(true);
    expect(projectDocumentCanRevert(untitled, false)).toBe(false);

    const edited = recordProjectMutation(untitled);
    expect(projectDocumentIsDirty(edited, false)).toBe(true);
    expect(projectDocumentCanRevert(edited, false)).toBe(false);
  });

  it("offers Revert only for changed bound documents without an unresolved conflict", () => {
    const clean = createProjectRevisionState();
    const dirty = recordProjectMutation(clean);

    expect(projectDocumentCanRevert(clean, true)).toBe(false);
    expect(projectDocumentCanRevert(dirty, true)).toBe(true);
    expect(projectDocumentCanRevert(dirty, true, true)).toBe(false);
  });
});
