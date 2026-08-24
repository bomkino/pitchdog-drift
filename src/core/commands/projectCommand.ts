import {
  PROJECT_DOMAINS,
  cloneDriftProject,
  cloneDriftProjectV4,
  type DriftProjectV3,
  type DriftProjectV4,
  type ProjectDomain,
} from "../project/schema";
import { recordProjectMutation, type ProjectRevisionState } from "../project/revisions";
import { validateDriftProjectV3, validateDriftProjectV4 } from "../project/validation";

export type ProjectV4CommandDomain = ProjectDomain | "performance" | "compatibility";
export const PROJECT_V4_COMMAND_DOMAINS = [
  ...PROJECT_DOMAINS,
  "performance",
  "compatibility",
] as const;

export interface ProjectCommand {
  id: string;
  source: string;
  ownedDomains: readonly ProjectDomain[];
  apply: (project: DriftProjectV3) => DriftProjectV3;
}

export interface ProjectChangeReceipt {
  commandId: string;
  source: string;
  ownedDomains: ProjectDomain[];
  preservedDomains: ProjectDomain[];
  changedPaths: string[];
  fromRevision: number;
  toRevision: number;
  changed: boolean;
}

export interface AppliedProjectCommand {
  project: DriftProjectV3;
  revision: ProjectRevisionState;
  receipt: ProjectChangeReceipt;
}

export interface ProjectV4Command {
  id: string;
  source: string;
  ownedDomains: readonly ProjectV4CommandDomain[];
  apply: (project: DriftProjectV4) => DriftProjectV4;
}

export interface ProjectV4ChangeReceipt {
  commandId: string;
  source: string;
  ownedDomains: ProjectV4CommandDomain[];
  preservedDomains: ProjectV4CommandDomain[];
  changedPaths: string[];
  fromRevision: number;
  toRevision: number;
  changed: boolean;
}

export interface AppliedProjectV4Command {
  project: DriftProjectV4;
  revision: ProjectRevisionState;
  receipt: ProjectV4ChangeReceipt;
}

const DOMAIN_PATHS: Readonly<Record<ProjectDomain, readonly string[]>> = {
  identity: ["projectId", "projectSeed", "createdAt"],
  composition: ["composition"],
  media: ["media"],
  slides: ["slides"],
  motion: ["motion"],
  card: ["card"],
  material: ["material"],
  lighting: ["lighting"],
  atmosphere: ["atmosphere"],
  lens: ["lens"],
  sound: ["sound"],
  presenter: ["presenter"],
  master: ["master"],
  provenance: ["provenance"],
};

const V4_DOMAIN_PATHS: Readonly<Record<ProjectV4CommandDomain, readonly string[]>> = {
  ...DOMAIN_PATHS,
  performance: ["performance"],
  compatibility: ["renderContract", "migration", "extensions"],
};

function collectChangedPaths(previous: unknown, next: unknown, prefix: string, output: string[]): void {
  if (Object.is(previous, next)) return;

  const previousArray = Array.isArray(previous);
  const nextArray = Array.isArray(next);
  if (previousArray || nextArray) {
    if (!previousArray || !nextArray || previous.length !== next.length) {
      output.push(prefix || "project");
      return;
    }
    for (let index = 0; index < previous.length; index += 1) {
      collectChangedPaths(previous[index], next[index], `${prefix}[${index}]`, output);
    }
    return;
  }

  if (
    typeof previous !== "object" || previous === null
    || typeof next !== "object" || next === null
  ) {
    output.push(prefix || "project");
    return;
  }
  const previousRecord = previous as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  const keys = new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)]);
  for (const key of [...keys].sort()) {
    collectChangedPaths(
      previousRecord[key],
      nextRecord[key],
      prefix ? `${prefix}.${key}` : key,
      output,
    );
  }
}

export function projectChangePaths(previous: DriftProjectV3, next: DriftProjectV3): string[] {
  const output: string[] = [];
  collectChangedPaths(previous, next, "", output);
  return output;
}

export function projectV4ChangePaths(previous: DriftProjectV4, next: DriftProjectV4): string[] {
  const output: string[] = [];
  collectChangedPaths(previous, next, "", output);
  return output;
}

function pathOwned(path: string, domains: readonly ProjectDomain[]): boolean {
  return domains.some((domain) => DOMAIN_PATHS[domain].some((root) => path === root || path.startsWith(`${root}.`) || path.startsWith(`${root}[`)));
}

function v4PathOwned(path: string, domains: readonly ProjectV4CommandDomain[]): boolean {
  return domains.some((domain) => V4_DOMAIN_PATHS[domain]
    .some((root) => path === root || path.startsWith(`${root}.`) || path.startsWith(`${root}[`)));
}

function receipt(
  revision: ProjectRevisionState,
  command: ProjectCommand,
  changedPaths: string[],
  toRevision: number,
): ProjectChangeReceipt {
  return {
    commandId: command.id,
    source: command.source,
    ownedDomains: [...command.ownedDomains],
    preservedDomains: PROJECT_DOMAINS.filter((domain) => !command.ownedDomains.includes(domain)),
    changedPaths,
    fromRevision: revision.currentRevision,
    toRevision,
    changed: changedPaths.length > 0,
  };
}

export function applyProjectCommand(
  current: DriftProjectV3,
  revision: ProjectRevisionState,
  command: ProjectCommand,
  now: string,
): AppliedProjectCommand {
  if (!command.id || !command.source) throw new Error("Project commands require stable id and source values.");
  if (command.ownedDomains.length === 0) throw new Error(`Project command ${command.id} owns no project domain.`);
  if (new Set(command.ownedDomains).size !== command.ownedDomains.length) {
    throw new Error(`Project command ${command.id} repeats a project domain.`);
  }
  for (const domain of command.ownedDomains) {
    if (!PROJECT_DOMAINS.includes(domain)) throw new Error(`Project command ${command.id} declares an unknown domain.`);
  }

  const authoredCandidate = validateDriftProjectV3(command.apply(cloneDriftProject(current)));
  const authoredPaths = projectChangePaths(current, authoredCandidate);
  if (authoredPaths.includes("updatedAt")) {
    throw new Error(`Project command ${command.id} attempted to own the reducer-managed updatedAt timestamp.`);
  }
  const illegal = authoredPaths.find((path) => !pathOwned(path, command.ownedDomains));
  if (illegal) throw new Error(`Project command ${command.id} changed ${illegal} outside its owned domains.`);

  if (authoredPaths.length === 0) {
    return {
      project: current,
      revision,
      receipt: receipt(revision, command, [], revision.currentRevision),
    };
  }

  authoredCandidate.updatedAt = now;
  const next = validateDriftProjectV3(authoredCandidate);
  const changedPaths = projectChangePaths(current, next);
  const nextRevision = recordProjectMutation(revision);
  return {
    project: next,
    revision: nextRevision,
    receipt: receipt(revision, command, changedPaths, nextRevision.currentRevision),
  };
}

function v4Receipt(
  revision: ProjectRevisionState,
  command: ProjectV4Command,
  changedPaths: string[],
  toRevision: number,
): ProjectV4ChangeReceipt {
  return {
    commandId: command.id,
    source: command.source,
    ownedDomains: [...command.ownedDomains],
    preservedDomains: PROJECT_V4_COMMAND_DOMAINS.filter((domain) => !command.ownedDomains.includes(domain)),
    changedPaths,
    fromRevision: revision.currentRevision,
    toRevision,
    changed: changedPaths.length > 0,
  };
}

export function applyProjectV4Command(
  current: DriftProjectV4,
  revision: ProjectRevisionState,
  command: ProjectV4Command,
  now: string,
): AppliedProjectV4Command {
  if (!command.id || !command.source) throw new Error("Project commands require stable id and source values.");
  if (command.ownedDomains.length === 0) throw new Error(`Project command ${command.id} owns no project domain.`);
  if (new Set(command.ownedDomains).size !== command.ownedDomains.length) {
    throw new Error(`Project command ${command.id} repeats a project domain.`);
  }
  for (const domain of command.ownedDomains) {
    if (!PROJECT_V4_COMMAND_DOMAINS.includes(domain)) {
      throw new Error(`Project command ${command.id} declares an unknown domain.`);
    }
  }

  const authoredCandidate = validateDriftProjectV4(command.apply(cloneDriftProjectV4(current)));
  const authoredPaths = projectV4ChangePaths(current, authoredCandidate);
  if (authoredPaths.includes("updatedAt")) {
    throw new Error(`Project command ${command.id} attempted to own the reducer-managed updatedAt timestamp.`);
  }
  const illegal = authoredPaths.find((path) => !v4PathOwned(path, command.ownedDomains));
  if (illegal) throw new Error(`Project command ${command.id} changed ${illegal} outside its owned domains.`);

  if (authoredPaths.length === 0) {
    return {
      project: current,
      revision,
      receipt: v4Receipt(revision, command, [], revision.currentRevision),
    };
  }

  authoredCandidate.updatedAt = now;
  const next = validateDriftProjectV4(authoredCandidate);
  const changedPaths = projectV4ChangePaths(current, next);
  const nextRevision = recordProjectMutation(revision);
  return {
    project: next,
    revision: nextRevision,
    receipt: v4Receipt(revision, command, changedPaths, nextRevision.currentRevision),
  };
}

/**
 * Restores only the domains owned by one earlier command. The reducer still
 * validates domain ownership and records the undo as a new revision; using
 * the snapshot timestamp restores a canonical project document byte-for-byte
 * when no later command has touched an owned domain.
 */
export function undoProjectV4Command(
  current: DriftProjectV4,
  revision: ProjectRevisionState,
  previous: DriftProjectV4,
  command: ProjectV4Command,
): AppliedProjectV4Command {
  const snapshot = cloneDriftProjectV4(previous);
  const undoCommand: ProjectV4Command = {
    id: `history.undo.${command.id}`,
    source: "history",
    ownedDomains: [...command.ownedDomains],
    apply: (candidate) => {
      const candidateRecord = candidate as unknown as Record<string, unknown>;
      const snapshotRecord = snapshot as unknown as Record<string, unknown>;
      for (const domain of command.ownedDomains) {
        for (const root of V4_DOMAIN_PATHS[domain]) {
          candidateRecord[root] = structuredClone(snapshotRecord[root]);
        }
      }
      return candidate;
    },
  };
  return applyProjectV4Command(current, revision, undoCommand, snapshot.updatedAt);
}
