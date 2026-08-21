import { PROJECT_DOMAINS, cloneDriftProject, type DriftProjectV3, type ProjectDomain } from "../project/schema";
import { recordProjectMutation, type ProjectRevisionState } from "../project/revisions";
import { validateDriftProjectV3 } from "../project/validation";

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

function collectChangedPaths(previous: unknown, next: unknown, prefix: string, output: string[]): void {
  if (Object.is(previous, next)) return;
  if (
    typeof previous !== "object" || previous === null || Array.isArray(previous)
    || typeof next !== "object" || next === null || Array.isArray(next)
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

function pathOwned(path: string, domains: readonly ProjectDomain[]): boolean {
  if (path === "updatedAt") return true;
  return domains.some((domain) => DOMAIN_PATHS[domain].some((root) => path === root || path.startsWith(`${root}.`)));
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

  const candidate = command.apply(cloneDriftProject(current));
  candidate.updatedAt = now;
  const next = validateDriftProjectV3(candidate);
  const changedPaths = projectChangePaths(current, next);
  const illegal = changedPaths.find((path) => !pathOwned(path, command.ownedDomains));
  if (illegal) {
    throw new Error(`Project command ${command.id} changed ${illegal} outside its owned domains.`);
  }

  const changed = changedPaths.length > 0;
  const nextRevision = changed ? recordProjectMutation(revision) : revision;
  return {
    project: next,
    revision: nextRevision,
    receipt: {
      commandId: command.id,
      source: command.source,
      ownedDomains: [...command.ownedDomains],
      preservedDomains: PROJECT_DOMAINS.filter((domain) => !command.ownedDomains.includes(domain)),
      changedPaths,
      fromRevision: revision.currentRevision,
      toRevision: nextRevision.currentRevision,
      changed,
    },
  };
}
