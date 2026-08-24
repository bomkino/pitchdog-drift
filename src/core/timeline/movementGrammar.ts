import type { DriftJsonValue, DriftProjectV4 } from "../project/schema";

export const MOVEMENT_GRAMMAR_EXTENSION_KEY = "dog.pitch.drift.movement-grammar" as const;
export const MOVEMENT_GRAMMAR_SCHEMA_VERSION = 1 as const;

export type MovementGrammar = "continuous-glide" | "editorial-holds" | "handcrafted";
export type ResolvedMovementGrammar = MovementGrammar | "legacy";

export interface MovementGrammarAuthoring {
  readonly schemaVersion: typeof MOVEMENT_GRAMMAR_SCHEMA_VERSION;
  readonly grammar: MovementGrammar;
}

export interface MovementGrammarResolution {
  readonly authoring: MovementGrammarAuthoring | null;
  readonly grammar: ResolvedMovementGrammar;
  readonly status: "stored" | "missing" | "malformed";
}

export class MovementGrammarAuthoringError extends TypeError {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`${path} ${detail}`);
    this.name = "MovementGrammarAuthoringError";
    this.path = path;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MovementGrammarAuthoringError("movementGrammar", "must be an object.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new MovementGrammarAuthoringError("movementGrammar", "must be a plain object.");
  }
  return value as Record<string, unknown>;
}

function grammar(value: unknown): MovementGrammar {
  if (
    value !== "continuous-glide"
    && value !== "editorial-holds"
    && value !== "handcrafted"
  ) {
    throw new MovementGrammarAuthoringError(
      "movementGrammar.grammar",
      "must be continuous-glide, editorial-holds, or handcrafted.",
    );
  }
  return value;
}

/** Strict parser for one persisted movement authority. */
export function createMovementGrammarAuthoring(value: unknown): MovementGrammarAuthoring {
  const root = record(value);
  const keys = Object.keys(root).sort();
  if (keys.length !== 2 || keys[0] !== "grammar" || keys[1] !== "schemaVersion") {
    throw new MovementGrammarAuthoringError(
      "movementGrammar",
      "must contain exactly grammar and schemaVersion.",
    );
  }
  if (root.schemaVersion !== MOVEMENT_GRAMMAR_SCHEMA_VERSION) {
    throw new MovementGrammarAuthoringError(
      "movementGrammar.schemaVersion",
      `must be ${MOVEMENT_GRAMMAR_SCHEMA_VERSION}.`,
    );
  }
  return Object.freeze({
    schemaVersion: MOVEMENT_GRAMMAR_SCHEMA_VERSION,
    grammar: grammar(root.grammar),
  });
}

export function parseMovementGrammarExtension(value: unknown): MovementGrammarAuthoring | null {
  try {
    return createMovementGrammarAuthoring(value);
  } catch {
    return null;
  }
}

/**
 * `legacy` means no new authority was accepted. Callers then preserve the
 * exact pre-grammar V4 behavior instead of inventing a new default.
 */
export function resolveMovementGrammar(
  project: Pick<DriftProjectV4, "extensions">,
): MovementGrammarResolution {
  if (!Object.prototype.hasOwnProperty.call(project.extensions, MOVEMENT_GRAMMAR_EXTENSION_KEY)) {
    return Object.freeze({
      authoring: null,
      grammar: "legacy" as const,
      status: "missing" as const,
    });
  }
  const authoring = parseMovementGrammarExtension(
    project.extensions[MOVEMENT_GRAMMAR_EXTENSION_KEY],
  );
  return authoring
    ? Object.freeze({ authoring, grammar: authoring.grammar, status: "stored" as const })
    : Object.freeze({ authoring: null, grammar: "legacy" as const, status: "malformed" as const });
}

/** Writes only movement grammar; media, Look, sequence, and foreign extensions survive. */
export function withMovementGrammar(
  project: DriftProjectV4,
  authoringInput: MovementGrammarAuthoring,
): DriftProjectV4 {
  const authoring = createMovementGrammarAuthoring(authoringInput);
  const stored: DriftJsonValue = {
    schemaVersion: authoring.schemaVersion,
    grammar: authoring.grammar,
  };
  return {
    ...project,
    extensions: {
      ...project.extensions,
      [MOVEMENT_GRAMMAR_EXTENSION_KEY]: stored,
    },
  };
}
