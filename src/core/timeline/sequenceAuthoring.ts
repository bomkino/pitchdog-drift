import type { DriftJsonValue, DriftProjectV4 } from "../project/schema";

export const SEQUENCE_EXTENSION_KEY = "dog.pitch.drift.sequence" as const;
export const SEQUENCE_AUTHORING_SCHEMA_VERSION = 1 as const;
export const MAX_SEQUENCE_GROUPS = 100;
export const MAX_SEQUENCE_PASSES = 100;
export const MIN_RELATIVE_SECONDS_PER_PASS = 0.01;
export const MAX_RELATIVE_SECONDS_PER_PASS = 100;

export type SequencePace = "fast" | "read" | "custom";

export interface SequenceGroupAuthoring {
  readonly id: string;
  readonly label: string;
  readonly passes: number;
  readonly pace: SequencePace;
  /** Duration weight relative to one readable deck pass. */
  readonly relativeSecondsPerPass: number;
}

export interface SequenceAuthoring {
  readonly schemaVersion: typeof SEQUENCE_AUTHORING_SCHEMA_VERSION;
  readonly groups: readonly SequenceGroupAuthoring[];
  /** Repeats the complete ordered group sequence inside each body cycle. */
  readonly repeatCount: number;
}

export interface SequenceAuthoringRead {
  readonly authoring: SequenceAuthoring | null;
  readonly status: "stored" | "missing" | "malformed";
}

export class SequenceAuthoringError extends TypeError {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`${path} ${detail}`);
    this.name = "SequenceAuthoringError";
    this.path = path;
  }
}

const SAFE_TEXT = /^[^\u0000-\u001f\u007f]+$/u;

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SequenceAuthoringError(path, "must be an object.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new SequenceAuthoringError(path, "must be a plain object.");
  }
  return value as Record<string, unknown>;
}

function exactFields(value: Record<string, unknown>, path: string, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    throw new SequenceAuthoringError(path, `must contain exactly ${canonical.join(", ")}.`);
  }
}

function safeText(value: unknown, path: string, maximum: number): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximum
    || !SAFE_TEXT.test(value)
  ) {
    throw new SequenceAuthoringError(
      path,
      `must be non-empty safe text no longer than ${maximum} characters.`,
    );
  }
  return value;
}

function positiveInteger(value: unknown, path: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    throw new SequenceAuthoringError(path, `must be a safe integer from 1 through ${maximum}.`);
  }
  return value as number;
}

function relativeSeconds(value: unknown, path: string): number {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < MIN_RELATIVE_SECONDS_PER_PASS
    || value > MAX_RELATIVE_SECONDS_PER_PASS
  ) {
    throw new SequenceAuthoringError(
      path,
      `must be finite from ${MIN_RELATIVE_SECONDS_PER_PASS} through ${MAX_RELATIVE_SECONDS_PER_PASS}.`,
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

function pace(value: unknown, path: string): SequencePace {
  if (value !== "fast" && value !== "read" && value !== "custom") {
    throw new SequenceAuthoringError(path, "must be fast, read, or custom.");
  }
  return value;
}

/** Strict runtime validator used by persistence, compilation, and commands. */
export function createSequenceAuthoring(value: unknown): SequenceAuthoring {
  const root = record(value, "sequence");
  exactFields(root, "sequence", ["schemaVersion", "groups", "repeatCount"]);
  if (root.schemaVersion !== SEQUENCE_AUTHORING_SCHEMA_VERSION) {
    throw new SequenceAuthoringError(
      "sequence.schemaVersion",
      `must be ${SEQUENCE_AUTHORING_SCHEMA_VERSION}.`,
    );
  }
  if (!Array.isArray(root.groups) || root.groups.length < 1 || root.groups.length > MAX_SEQUENCE_GROUPS) {
    throw new SequenceAuthoringError(
      "sequence.groups",
      `must contain from 1 through ${MAX_SEQUENCE_GROUPS} groups.`,
    );
  }
  const repeatCount = positiveInteger(root.repeatCount, "sequence.repeatCount", MAX_SEQUENCE_PASSES);
  const identifiers = new Set<string>();
  let passesPerSequence = 0;
  const groups = root.groups.map((candidate, index): SequenceGroupAuthoring => {
    const path = `sequence.groups[${index}]`;
    const group = record(candidate, path);
    exactFields(group, path, ["id", "label", "pace", "passes", "relativeSecondsPerPass"]);
    const id = safeText(group.id, `${path}.id`, 96);
    if (identifiers.has(id)) throw new SequenceAuthoringError(`${path}.id`, "must be unique.");
    identifiers.add(id);
    const passes = positiveInteger(group.passes, `${path}.passes`, MAX_SEQUENCE_PASSES);
    const groupPace = pace(group.pace, `${path}.pace`);
    const relativeSecondsPerPass = relativeSeconds(
      group.relativeSecondsPerPass,
      `${path}.relativeSecondsPerPass`,
    );
    if (groupPace === "read" && relativeSecondsPerPass !== 1) {
      throw new SequenceAuthoringError(
        `${path}.relativeSecondsPerPass`,
        "must be exactly 1 when pace is read.",
      );
    }
    if (groupPace === "fast" && relativeSecondsPerPass >= 1) {
      throw new SequenceAuthoringError(
        `${path}.relativeSecondsPerPass`,
        "must be below 1 when pace is fast.",
      );
    }
    passesPerSequence += passes;
    return Object.freeze({
      id,
      label: safeText(group.label, `${path}.label`, 128),
      passes,
      pace: groupPace,
      relativeSecondsPerPass,
    });
  });
  if (passesPerSequence * repeatCount > MAX_SEQUENCE_PASSES) {
    throw new SequenceAuthoringError(
      "sequence",
      `groups times repeatCount must contain at most ${MAX_SEQUENCE_PASSES} deck passes.`,
    );
  }
  return Object.freeze({
    schemaVersion: SEQUENCE_AUTHORING_SCHEMA_VERSION,
    groups: Object.freeze(groups),
    repeatCount,
  });
}

export function parseSequenceAuthoringExtension(value: unknown): SequenceAuthoring | null {
  try {
    return createSequenceAuthoring(value);
  } catch {
    return null;
  }
}

/** Missing or malformed sequence data keeps the historical V4 timing/render path. */
export function readSequenceAuthoring(
  project: Pick<DriftProjectV4, "extensions">,
): SequenceAuthoringRead {
  if (!Object.prototype.hasOwnProperty.call(project.extensions, SEQUENCE_EXTENSION_KEY)) {
    return Object.freeze({ authoring: null, status: "missing" as const });
  }
  const authoring = parseSequenceAuthoringExtension(project.extensions[SEQUENCE_EXTENSION_KEY]);
  return authoring
    ? Object.freeze({ authoring, status: "stored" as const })
    : Object.freeze({ authoring: null, status: "malformed" as const });
}

/** Writes only Drift's sequence namespace. Every unrelated extension survives unchanged. */
export function withSequenceAuthoring(
  project: DriftProjectV4,
  authoringInput: SequenceAuthoring,
): DriftProjectV4 {
  const authoring = createSequenceAuthoring(authoringInput);
  const stored: DriftJsonValue = {
    schemaVersion: authoring.schemaVersion,
    groups: authoring.groups.map((group) => ({ ...group })),
    repeatCount: authoring.repeatCount,
  };
  return {
    ...project,
    extensions: {
      ...project.extensions,
      [SEQUENCE_EXTENSION_KEY]: stored,
    },
  };
}

export function sequencePassCount(authoringInput: SequenceAuthoring): number {
  const authoring = createSequenceAuthoring(authoringInput);
  return authoring.groups.reduce((total, group) => total + group.passes, 0) * authoring.repeatCount;
}

export function sequenceRelativePassWeight(authoringInput: SequenceAuthoring): number {
  const authoring = createSequenceAuthoring(authoringInput);
  const oneSequence = authoring.groups.reduce(
    (total, group) => total + group.passes * group.relativeSecondsPerPass,
    0,
  );
  return oneSequence * authoring.repeatCount;
}
