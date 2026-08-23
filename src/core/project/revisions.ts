export interface ProjectRevisionState {
  currentRevision: number;
  savedRevision: number;
  recoveryRevision: number;
  saveSequence: number;
  completedSaveSequence: number;
}

export interface ProjectSaveTicket {
  sequence: number;
  revision: number;
}

function revision(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer.`);
  return value;
}

export function createProjectRevisionState(initialRevision = 0): ProjectRevisionState {
  const initial = revision(initialRevision, "initialRevision");
  return {
    currentRevision: initial,
    savedRevision: initial,
    recoveryRevision: initial,
    saveSequence: 0,
    completedSaveSequence: 0,
  };
}

export function recordProjectMutation(state: ProjectRevisionState): ProjectRevisionState {
  const next = revision(state.currentRevision + 1, "currentRevision");
  return { ...state, currentRevision: next };
}

export function beginProjectSave(
  state: ProjectRevisionState,
): { state: ProjectRevisionState; ticket: ProjectSaveTicket } {
  const sequence = revision(state.saveSequence + 1, "saveSequence");
  return {
    state: { ...state, saveSequence: sequence },
    ticket: { sequence, revision: state.currentRevision },
  };
}

export function completeProjectSave(
  state: ProjectRevisionState,
  ticket: ProjectSaveTicket,
): ProjectRevisionState {
  revision(ticket.sequence, "ticket.sequence");
  revision(ticket.revision, "ticket.revision");
  if (ticket.sequence > state.saveSequence) throw new Error("Save ticket belongs to a future save sequence.");
  if (ticket.revision > state.currentRevision) throw new Error("Save ticket belongs to a future project revision.");
  return {
    ...state,
    savedRevision: Math.max(state.savedRevision, ticket.revision),
    completedSaveSequence: Math.max(state.completedSaveSequence, ticket.sequence),
  };
}

export function recordProjectRecovery(
  state: ProjectRevisionState,
  recoveredRevision = state.currentRevision,
): ProjectRevisionState {
  const value = revision(recoveredRevision, "recoveredRevision");
  if (value > state.currentRevision) throw new Error("Recovery cannot represent a future project revision.");
  return { ...state, recoveryRevision: Math.max(state.recoveryRevision, value) };
}

export function projectIsDirty(state: ProjectRevisionState): boolean {
  return state.currentRevision !== state.savedRevision;
}

export function projectHasUnrecoveredWork(state: ProjectRevisionState): boolean {
  return state.currentRevision > state.recoveryRevision;
}

export function projectCanRevert(state: ProjectRevisionState): boolean {
  return projectIsDirty(state) && state.savedRevision >= 0;
}

/**
 * An untitled project has no durable document to match, so it remains dirty
 * even when its in-memory revision counters are equal.
 */
export function projectDocumentIsDirty(
  state: ProjectRevisionState,
  documentBound: boolean,
): boolean {
  return !documentBound || projectIsDirty(state);
}

/** Revert is meaningful only for a bound, changed, conflict-free document. */
export function projectDocumentCanRevert(
  state: ProjectRevisionState,
  documentBound: boolean,
  documentConflict = false,
): boolean {
  return documentBound && !documentConflict && projectIsDirty(state);
}
