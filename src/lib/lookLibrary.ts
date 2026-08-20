import type {
  ControlSnapshot,
  DirectorSnapshot,
  SegmentedSnapshot,
} from "./directorControlBridge";

export const DIRECTOR_LOOK_SCHEMA = "pitch.dog/director-look" as const;
export const DIRECTOR_LOOK_VERSION = 1 as const;
export const DIRECTOR_LOOK_STORAGE_KEY = "pitchdog-drift-director-looks-v1";
export const MAX_DIRECTOR_LOOKS = 24;

const MAX_LOOK_NAME = 48;
const MAX_STATE_CONTROLS = 128;
const MAX_STATE_SEGMENTS = 32;

const EXCLUDED_CONTROLS = new Set([
  "Stage width",
  "Stage height",
  "Width",
  "Horizontal position",
  "Vertical position",
  "Pinned ratio width",
  "Pinned ratio height",
  "Pinned radius",
  "Pinned smoothing",
  "Pinned border",
  "Pinned border colour",
  "Pinned border presence",
  "Pinned shadow",
  "Keep one frame still",
  "Mute presenter in export",
  "Duration",
  "Seamless export lock",
  "Loops per master",
  "Reduced-motion master",
]);

const EXCLUDED_SEGMENTS = new Set([
  "Stage ratio",
  "Pinned ratio",
  "Pinned fit",
  "Frame rate",
]);

export interface DirectorLook {
  schema: typeof DIRECTOR_LOOK_SCHEMA;
  version: typeof DIRECTOR_LOOK_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  state: DirectorSnapshot;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function canonicalDate(value: unknown): string | null {
  if (!safeString(value, 64)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString() === value ? value : null;
}

export function normalizeLookName(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_LOOK_NAME)
    .trim();
}

function keepControl(control: ControlSnapshot): boolean {
  return !EXCLUDED_CONTROLS.has(control.name) && !control.name.startsWith("Pinned ");
}

function keepSegment(segment: SegmentedSnapshot): boolean {
  return !EXCLUDED_SEGMENTS.has(segment.group) && !segment.group.startsWith("Pinned ");
}

/**
 * A reusable look owns visual direction, not the current video's media,
 * presenter geometry, canvas/output shape, loop policy, or accessibility
 * output choice. Those remain decisions for the destination project.
 */
export function extractReusableLookState(snapshot: DirectorSnapshot): DirectorSnapshot {
  return {
    theme: snapshot.theme,
    controls: snapshot.controls.filter(keepControl).map((control) => ({ ...control })),
    segmented: snapshot.segmented.filter(keepSegment).map((segment) => ({ ...segment })),
  };
}

function parseControl(value: unknown): ControlSnapshot | null {
  if (!isRecord(value) || !safeString(value.name, 80)) return null;
  if (typeof value.value !== "boolean" && !safeString(value.value, 256)) return null;
  const control = { name: value.name, value: value.value };
  return keepControl(control) ? control : null;
}

function parseSegment(value: unknown): SegmentedSnapshot | null {
  if (!isRecord(value) || !safeString(value.group, 80) || !safeString(value.option, 80)) return null;
  const segment = { group: value.group, option: value.option };
  return keepSegment(segment) ? segment : null;
}

function parseState(value: unknown): DirectorSnapshot | null {
  if (!isRecord(value)) return null;
  const theme = value.theme === null ? null : safeString(value.theme, 80) ? value.theme : undefined;
  if (theme === undefined || !Array.isArray(value.controls) || !Array.isArray(value.segmented)) return null;
  if (value.controls.length > MAX_STATE_CONTROLS || value.segmented.length > MAX_STATE_SEGMENTS) return null;

  const controls = value.controls.map(parseControl).filter((entry): entry is ControlSnapshot => entry !== null);
  const segmented = value.segmented.map(parseSegment).filter((entry): entry is SegmentedSnapshot => entry !== null);
  const controlNames = new Set(controls.map((entry) => entry.name));
  const segmentNames = new Set(segmented.map((entry) => entry.group));
  if (
    controls.length !== value.controls.length
    || segmented.length !== value.segmented.length
    || controlNames.size !== controls.length
    || segmentNames.size !== segmented.length
  ) return null;

  return { theme, controls, segmented };
}

function parseLook(value: unknown): DirectorLook | null {
  if (!isRecord(value)) return null;
  if (value.schema !== DIRECTOR_LOOK_SCHEMA || value.version !== DIRECTOR_LOOK_VERSION) return null;
  if (!safeString(value.id, 96)) return null;
  const name = typeof value.name === "string" ? normalizeLookName(value.name) : "";
  const createdAt = canonicalDate(value.createdAt);
  const updatedAt = canonicalDate(value.updatedAt);
  const state = parseState(value.state);
  if (!name || !createdAt || !updatedAt || !state) return null;
  return {
    schema: DIRECTOR_LOOK_SCHEMA,
    version: DIRECTOR_LOOK_VERSION,
    id: value.id,
    name,
    createdAt,
    updatedAt,
    state,
  };
}

export function parseDirectorLooks(raw: string | null): DirectorLook[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];

  const looks: DirectorLook[] = [];
  const ids = new Set<string>();
  for (const candidate of value.slice(0, MAX_DIRECTOR_LOOKS * 2)) {
    const look = parseLook(candidate);
    if (!look || ids.has(look.id)) continue;
    ids.add(look.id);
    looks.push(look);
    if (looks.length === MAX_DIRECTOR_LOOKS) break;
  }
  return looks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function readDirectorLooks(storage: StorageLike): DirectorLook[] {
  try {
    return parseDirectorLooks(storage.getItem(DIRECTOR_LOOK_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeDirectorLooks(storage: StorageLike, looks: readonly DirectorLook[]): boolean {
  try {
    storage.setItem(DIRECTOR_LOOK_STORAGE_KEY, JSON.stringify(looks.slice(0, MAX_DIRECTOR_LOOKS)));
    return true;
  } catch {
    return false;
  }
}

export function upsertDirectorLook(
  looks: readonly DirectorLook[],
  nameInput: string,
  stateInput: DirectorSnapshot,
  id: string,
  now: string,
): { looks: DirectorLook[]; look: DirectorLook } {
  const name = normalizeLookName(nameInput);
  if (!name) throw new Error("Give the look a name before saving it.");
  if (!safeString(id, 96)) throw new Error("Could not create a safe look identifier.");
  const timestamp = canonicalDate(now);
  if (!timestamp) throw new Error("Could not create a stable look timestamp.");
  const state = extractReusableLookState(stateInput);
  if (state.controls.length === 0 && state.segmented.length === 0 && state.theme === null) {
    throw new Error("The current inspector contains no reusable direction.");
  }

  const existing = looks.find((look) => look.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const look: DirectorLook = {
    schema: DIRECTOR_LOOK_SCHEMA,
    version: DIRECTOR_LOOK_VERSION,
    id: existing?.id ?? id,
    name,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    state,
  };
  const next = [look, ...looks.filter((candidate) => candidate.id !== look.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_DIRECTOR_LOOKS);
  return { looks: next, look };
}

export function removeDirectorLook(looks: readonly DirectorLook[], id: string): DirectorLook[] {
  return looks.filter((look) => look.id !== id);
}
