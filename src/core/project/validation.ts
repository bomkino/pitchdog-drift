import {
  DRIFT_PROJECT_V4_MIGRATOR,
  DRIFT_PROJECT_V4_VERSION,
  DRIFT_RENDER_CONTRACTS,
  DRIFT_PROJECT_SCHEMA,
  DRIFT_PROJECT_VERSION,
  DRIFT_V1_COMPAT_RENDER_CONTRACT,
  PROJECT_DOMAINS,
  type DriftJsonValue,
  type DriftProjectMigrationV4,
  type DriftProjectV3,
  type DriftProjectV4,
  type PresenterSettings,
  type PresenterSettingsV4,
  type ProjectDomain,
} from "./schema";
import { DRIFT_AAC_BITRATE, DRIFT_H264_BITRATE } from "./masterContract";
import {
  createPerformanceLifecycle,
  type PerformanceLifecycleAuthoring,
} from "../timeline/performanceLifecycle";

const HEX_COLOUR = /^#[a-f0-9]{6}$/iu;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]+$/u;
const EXTENSION_NAMESPACE = /^(?=.{3,128}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;
const FORBIDDEN_EXTENSION_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_EXTENSION_NAMESPACES = 64;
const MAX_EXTENSION_BYTES = 256 * 1024;
const MAX_EXTENSION_DEPTH = 32;
const MAX_EXTENSION_NODES = 10_000;
const MAX_PROJECT_DATA_DEPTH = 64;
const MAX_PROJECT_DATA_NODES = 50_000;

type UnknownRecord = Record<string, unknown>;
type NumberRule = readonly [minimum: number, maximum: number, integer?: boolean];

export class ProjectValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ProjectValidationError";
    this.path = path;
  }
}

function fail(path: string, message: string): never {
  throw new ProjectValidationError(path, message);
}

function dictionary(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object");
  return value as UnknownRecord;
}

function object(value: unknown, path: string, fields: readonly string[]): UnknownRecord {
  const output = dictionary(value, path);
  const unknown = Object.keys(output).find((key) => !fields.includes(key));
  if (unknown) fail(path, `contains unknown field ${unknown}`);
  for (const field of fields) if (!(field in output)) fail(`${path}.${field}`, "is required");
  return output;
}

function objectWithOptional(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): UnknownRecord {
  const output = dictionary(value, path);
  const allowed = [...required, ...optional];
  const unknown = Object.keys(output).find((key) => !allowed.includes(key));
  if (unknown) fail(path, `contains unknown field ${unknown}`);
  for (const field of required) if (!(field in output)) fail(`${path}.${field}`, "is required");
  return output;
}

function safeString(value: unknown, path: string, maximum = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || !SAFE_TEXT.test(value)) {
    fail(path, `must be a non-empty safe string no longer than ${maximum} characters`);
  }
  return value;
}

function optionalSafeString(value: unknown, path: string, maximum = 256): string | null {
  return value === null ? null : safeString(value, path, maximum);
}

function finiteNumber(value: unknown, path: string, minimum: number, maximum: number, integer = false): number {
  if (
    typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum
    || (integer && !Number.isSafeInteger(value))
  ) {
    fail(path, `must be ${integer ? "a safe integer" : "a finite number"} between ${minimum} and ${maximum}`);
  }
  return value;
}

function numbers(value: UnknownRecord, path: string, rules: Readonly<Record<string, NumberRule>>): void {
  for (const [key, [minimum, maximum, integer = false]] of Object.entries(rules)) {
    finiteNumber(value[key], `${path}.${key}`, minimum, maximum, integer);
  }
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}

function oneOf<const T extends readonly unknown[]>(value: unknown, options: T, path: string): T[number] {
  if (!options.includes(value)) fail(path, `must be one of ${options.join(", ")}`);
  return value as T[number];
}

function colour(value: unknown, path: string): string {
  const result = safeString(value, path, 7);
  if (!HEX_COLOUR.test(result)) fail(path, "must be a six-digit hexadecimal colour");
  return result;
}

function isoDate(value: unknown, path: string): string {
  const result = safeString(value, path, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(result)) {
    fail(path, "must be a canonical UTC ISO timestamp");
  }
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== result) fail(path, "is not a valid timestamp");
  return result;
}

function uniqueStrings(value: unknown, path: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(path, `must contain at most ${maximum} items`);
  const output = value.map((item, index) => safeString(item, `${path}[${index}]`, 512));
  if (new Set(output).size !== output.length) fail(path, "must not contain duplicates");
  return output;
}

function recipe(value: unknown, path: string): void {
  const item = object(value, path, ["id", "version", "fingerprint"]);
  safeString(item.id, `${path}.id`);
  finiteNumber(item.version, `${path}.version`, 1, 1_000_000, true);
  safeString(item.fingerprint, `${path}.fingerprint`, 512);
}

function asset(value: unknown, path: string, expectedId: string): void {
  const item = dictionary(value, path);
  const allowed = ["id", "name", "kind", "mimeType", "hash", "byteLength", "width", "height", "duration"];
  const unknown = Object.keys(item).find((key) => !allowed.includes(key));
  if (unknown) fail(path, `contains unknown field ${unknown}`);
  for (const field of allowed.slice(0, 8)) if (!(field in item)) fail(`${path}.${field}`, "is required");
  if (safeString(item.id, `${path}.id`, 512) !== expectedId) fail(`${path}.id`, "must match its manifest key");
  safeString(item.name, `${path}.name`, 512);
  const kind = oneOf(item.kind, ["image", "video"] as const, `${path}.kind`);
  const mime = safeString(item.mimeType, `${path}.mimeType`);
  if (!mime.startsWith(`${kind}/`)) fail(`${path}.mimeType`, `must describe ${kind} media`);
  const digest = safeString(item.hash, `${path}.hash`, 64);
  if (!SHA256.test(digest)) fail(`${path}.hash`, "must be a lower-case SHA-256 digest");
  numbers(item, path, {
    byteLength: [0, Number.MAX_SAFE_INTEGER, true],
    width: [1, 131_072, true],
    height: [1, 131_072, true],
  });
  if (item.duration !== undefined) finiteNumber(item.duration, `${path}.duration`, 0.001, 86_400);
}

function motion(value: unknown): void {
  const root = object(value, "project.motion", ["transport", "cadence", "performance", "character", "path", "seamless"]);
  const transport = object(root.transport, "project.motion.transport", ["axis", "direction", "slidesPerSecond"]);
  oneOf(transport.axis, ["horizontal", "vertical"] as const, "project.motion.transport.axis");
  oneOf(transport.direction, [1, -1] as const, "project.motion.transport.direction");
  finiteNumber(transport.slidesPerSecond, "project.motion.transport.slidesPerSecond", 0, 8);

  const cadence = object(root.cadence, "project.motion.cadence", [
    "cutId", "read", "anticipation", "carry", "impact", "settle", "land", "poseCadence",
  ]);
  safeString(cadence.cutId, "project.motion.cadence.cutId");
  const cadenceKeys = ["read", "anticipation", "carry", "impact", "settle", "land"] as const;
  let total = 0;
  for (const key of cadenceKeys) total += finiteNumber(cadence[key], `project.motion.cadence.${key}`, 0, 1);
  if (total <= 0.001) fail("project.motion.cadence", "must contain at least one visible phase");
  oneOf(cadence.poseCadence, ["continuous", "24fps", "18fps", "12fps"] as const, "project.motion.cadence.poseCadence");

  const performance = object(root.performance, "project.motion.performance", [
    "id", "weight", "linger", "release", "runway", "overlap", "imperfection", "take",
  ]);
  safeString(performance.id, "project.motion.performance.id");
  numbers(performance, "project.motion.performance", {
    weight: [0, 1], linger: [0, 1], release: [0, 1], runway: [0, 1],
    overlap: [0, 1], imperfection: [0, 1], take: [1, 1_000_000, true],
  });

  const character = object(root.character, "project.motion.character", ["id", "amount"]);
  oneOf(character.id, ["direct", "weighted", "spring", "drift"] as const, "project.motion.character.id");
  finiteNumber(character.amount, "project.motion.character.amount", 0, 1);

  const path = object(root.path, "project.motion.path", ["id", "gap", "curvature", "depth", "banking", "focusScale", "edgeFade"]);
  safeString(path.id, "project.motion.path.id");
  numbers(path, "project.motion.path", {
    gap: [0, 2.5], curvature: [0, 1], depth: [0, 1], banking: [-45, 45],
    focusScale: [0, 0.5], edgeFade: [0, 1],
  });

  const seamless = object(root.seamless, "project.motion.seamless", ["enabled", "loops"]);
  boolean(seamless.enabled, "project.motion.seamless.enabled");
  finiteNumber(seamless.loops, "project.motion.seamless.loops", 1, 100, true);
}

function unitFields(value: UnknownRecord, path: string, fields: readonly string[]): void {
  for (const key of fields) finiteNumber(value[key], `${path}.${key}`, 0, 1);
}

function plainDataObject(value: unknown, path: string): UnknownRecord {
  const output = dictionary(value, path);
  const prototype = Object.getPrototypeOf(output) as unknown;
  if (prototype !== Object.prototype && prototype !== null) fail(path, "must be a plain object");
  for (const key of Reflect.ownKeys(output)) {
    if (typeof key !== "string") fail(path, "must contain only string keys");
    const descriptor = Object.getOwnPropertyDescriptor(output, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail(`${path}.${key}`, "must be an enumerable data field");
  }
  return output;
}

interface ExtensionTraversalState {
  nodes: number;
  bytes: number;
  active: WeakSet<object>;
}

function assertPlainDataTree(
  value: unknown,
  path: string,
  state: { nodes: number; active: WeakSet<object> },
  depth = 0,
): void {
  state.nodes += 1;
  if (state.nodes > MAX_PROJECT_DATA_NODES) fail(path, `must contain at most ${MAX_PROJECT_DATA_NODES} data values`);
  if (depth > MAX_PROJECT_DATA_DEPTH) fail(path, `must not exceed ${MAX_PROJECT_DATA_DEPTH} data levels`);
  if (value === null || ["string", "boolean", "number"].includes(typeof value)) return;
  if (typeof value !== "object") fail(path, "must contain only serializable data values");
  if (state.active.has(value)) fail(path, "must not contain a cycle");
  state.active.add(value);

  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_PROJECT_DATA_NODES - state.nodes) {
        fail(path, `must contain at most ${MAX_PROJECT_DATA_NODES} data values`);
      }
      for (const key of Reflect.ownKeys(value)) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) {
          fail(path, "must be a dense data array without custom fields");
        }
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          fail(`${path}[${index}]`, "is required and must be an enumerable data field");
        }
        assertPlainDataTree(descriptor.value, `${path}[${index}]`, state, depth + 1);
      }
      return;
    }

    const record = plainDataObject(value, path);
    const keys = Object.keys(record);
    if (keys.length > MAX_PROJECT_DATA_NODES - state.nodes) {
      fail(path, `must contain at most ${MAX_PROJECT_DATA_NODES} data values`);
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      assertPlainDataTree(descriptor?.value, `${path}.${key}`, state, depth + 1);
    }
  } finally {
    state.active.delete(value);
  }
}

function addExtensionBytes(state: ExtensionTraversalState, bytes: number): void {
  state.bytes += bytes;
  if (state.bytes > MAX_EXTENSION_BYTES) {
    fail("project.extensions", `must encode to at most ${MAX_EXTENSION_BYTES} UTF-8 bytes`);
  }
}

function addJsonStringBytes(value: string, state: ExtensionTraversalState): void {
  addExtensionBytes(state, 2);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x22 || code === 0x5c || code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) {
      addExtensionBytes(state, 2);
    } else if (code <= 0x1f) {
      addExtensionBytes(state, 6);
    } else if (code <= 0x7f) {
      addExtensionBytes(state, 1);
    } else if (code <= 0x7ff) {
      addExtensionBytes(state, 2);
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        addExtensionBytes(state, 4);
        index += 1;
      } else {
        addExtensionBytes(state, 6);
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      addExtensionBytes(state, 6);
    } else {
      addExtensionBytes(state, 3);
    }
  }
}

function canonicalJsonValue(
  value: unknown,
  path: string,
  depth: number,
  state: ExtensionTraversalState,
): DriftJsonValue {
  state.nodes += 1;
  if (state.nodes > MAX_EXTENSION_NODES) fail("project.extensions", `must contain at most ${MAX_EXTENSION_NODES} JSON values`);
  if (depth > MAX_EXTENSION_DEPTH) fail(path, `must not exceed ${MAX_EXTENSION_DEPTH} levels`);

  if (value === null) {
    addExtensionBytes(state, 4);
    return value;
  }
  if (typeof value === "string") {
    addJsonStringBytes(value, state);
    return value;
  }
  if (typeof value === "boolean") {
    addExtensionBytes(state, value ? 4 : 5);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(path, "must be a finite JSON number");
    const canonical = Object.is(value, -0) ? 0 : value;
    addExtensionBytes(state, JSON.stringify(canonical).length);
    return canonical;
  }
  if (typeof value !== "object") fail(path, "must be a JSON value");
  if (state.active.has(value)) fail(path, "must not contain a cycle");
  state.active.add(value);

  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_EXTENSION_NODES - state.nodes) {
        fail("project.extensions", `must contain at most ${MAX_EXTENSION_NODES} JSON values`);
      }
      addExtensionBytes(state, 2 + Math.max(0, value.length - 1));
      const ownKeys = Reflect.ownKeys(value);
      for (const key of ownKeys) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) {
          fail(path, "must be a dense JSON array without custom fields");
        }
      }
      const result: DriftJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          fail(`${path}[${index}]`, "is required and must be an enumerable data field");
        }
        result.push(canonicalJsonValue(descriptor.value, `${path}[${index}]`, depth + 1, state));
      }
      return result;
    }

    const record = plainDataObject(value, path);
    if (Object.keys(record).length > MAX_EXTENSION_NODES - state.nodes) {
      fail("project.extensions", `must contain at most ${MAX_EXTENSION_NODES} JSON values`);
    }
    const result: Record<string, DriftJsonValue> = {};
    const keys = Object.keys(record).sort();
    addExtensionBytes(state, 2 + Math.max(0, keys.length - 1));
    for (const key of keys) {
      if (FORBIDDEN_EXTENSION_KEYS.has(key)) fail(`${path}.${key}`, "is not a permitted extension key");
      addJsonStringBytes(key, state);
      addExtensionBytes(state, 1);
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      result[key] = canonicalJsonValue(descriptor?.value, `${path}.${key}`, depth + 1, state);
    }
    return result;
  } finally {
    state.active.delete(value);
  }
}

function canonicalExtensions(value: unknown): Record<string, DriftJsonValue> {
  const extensions = plainDataObject(value, "project.extensions");
  const namespaces = Object.keys(extensions).sort();
  if (namespaces.length > MAX_EXTENSION_NAMESPACES) {
    fail("project.extensions", `must contain at most ${MAX_EXTENSION_NAMESPACES} namespaces`);
  }

  const state: ExtensionTraversalState = { nodes: 0, bytes: 0, active: new WeakSet() };
  const result: Record<string, DriftJsonValue> = {};
  addExtensionBytes(state, 2 + Math.max(0, namespaces.length - 1));
  for (const namespace of namespaces) {
    if (!EXTENSION_NAMESPACE.test(namespace)) {
      fail(`project.extensions.${namespace}`, "must use a lower-case reverse-DNS namespace");
    }
    addJsonStringBytes(namespace, state);
    addExtensionBytes(state, 1);
    const descriptor = Object.getOwnPropertyDescriptor(extensions, namespace);
    result[namespace] = canonicalJsonValue(descriptor?.value, `project.extensions.${namespace}`, 0, state);
  }
  return result;
}

function migrationV4(value: unknown): DriftProjectMigrationV4 | null {
  if (value === null) return null;
  const migration = plainDataObject(value, "project.migration");
  const unknown = Object.keys(migration).find((key) => !["sourceFormat", "migrator"].includes(key));
  if (unknown) fail("project.migration", `contains unknown field ${unknown}`);
  for (const field of ["sourceFormat", "migrator"] as const) {
    if (!(field in migration)) fail(`project.migration.${field}`, "is required");
  }
  const sourceFormat = oneOf(
    migration.sourceFormat,
    ["legacy-studio-v1", "project-v3"] as const,
    "project.migration.sourceFormat",
  );
  if (migration.migrator !== DRIFT_PROJECT_V4_MIGRATOR) {
    fail("project.migration.migrator", `must be ${DRIFT_PROJECT_V4_MIGRATOR}`);
  }
  return { sourceFormat, migrator: DRIFT_PROJECT_V4_MIGRATOR };
}

const PRESENTER_V3_FIELDS = [
  "enabled", "x", "y", "width", "aspectWidth", "aspectHeight", "fit", "radius", "smoothing",
  "borderWidth", "borderColor", "borderOpacity", "muted", "gain", "trimStart", "startAt",
] as const;

const PRESENTER_V4_FIELDS = [
  ...PRESENTER_V3_FIELDS,
  "assetId", "trackMode", "layoutMode", "aspectMode", "focalX", "focalY", "safeInset",
  "shadowOpacity", "shadowSoftness", "shadowOffsetX", "shadowOffsetY", "matteColor", "matteOpacity",
] as const;

const PRESENTER_V4_RANGE_LAYER_FIELDS = ["layer", "endAt"] as const;

function validatePresenterV4(value: unknown): PresenterSettingsV4 {
  assertPlainDataTree(value, "project.presenter", { nodes: 0, active: new WeakSet() });
  const presenter = objectWithOptional(
    value,
    "project.presenter",
    PRESENTER_V4_FIELDS,
    PRESENTER_V4_RANGE_LAYER_FIELDS,
  );
  boolean(presenter.enabled, "project.presenter.enabled");
  optionalSafeString(presenter.assetId, "project.presenter.assetId", 512);
  oneOf(presenter.trackMode, ["pinned-only", "moving-and-pinned"] as const, "project.presenter.trackMode");
  oneOf(presenter.layoutMode, ["safe-overlay", "legacy-perspective"] as const, "project.presenter.layoutMode");
  oneOf(presenter.aspectMode, ["source", "custom"] as const, "project.presenter.aspectMode");
  const layer = presenter.layer === undefined
    ? "above-slides" as const
    : oneOf(presenter.layer, ["below-slides", "above-slides"] as const, "project.presenter.layer");
  oneOf(presenter.fit, ["cover", "contain"] as const, "project.presenter.fit");
  boolean(presenter.muted, "project.presenter.muted");
  colour(presenter.borderColor, "project.presenter.borderColor");
  colour(presenter.matteColor, "project.presenter.matteColor");
  numbers(presenter, "project.presenter", {
    x: [0, 1], y: [0, 1], width: [0.05, 1], aspectWidth: [0.01, 100], aspectHeight: [0.01, 100],
    radius: [0, 512], smoothing: [0, 1], borderWidth: [0, 32], borderOpacity: [0, 1],
    gain: [0, 4], trimStart: [0, 86_400], startAt: [0, 86_400], focalX: [0, 1], focalY: [0, 1],
    safeInset: [0, 0.25], shadowOpacity: [0, 0.8], shadowSoftness: [0, 256],
    shadowOffsetX: [-512, 512], shadowOffsetY: [-512, 512], matteOpacity: [0, 1],
  });
  const startAt = presenter.startAt as number;
  const endAt = presenter.endAt === undefined || presenter.endAt === null
    ? null
    : finiteNumber(presenter.endAt, "project.presenter.endAt", 0, 86_400);
  if (endAt !== null && endAt <= startAt) {
    fail("project.presenter.endAt", "must be greater than project.presenter.startAt");
  }
  return structuredClone({ ...presenter, layer, endAt }) as PresenterSettingsV4;
}

function presenterV3Compatibility(value: PresenterSettingsV4): PresenterSettings {
  return {
    enabled: false,
    x: value.x,
    y: value.y,
    width: value.width,
    aspectWidth: value.aspectWidth,
    aspectHeight: value.aspectHeight,
    fit: value.fit,
    radius: value.radius,
    smoothing: value.smoothing,
    borderWidth: value.borderWidth,
    borderColor: value.borderColor,
    borderOpacity: value.borderOpacity,
    muted: value.muted,
    gain: value.gain,
    trimStart: value.trimStart,
    startAt: value.startAt,
  };
}

function validatePerformanceV4(value: unknown): PerformanceLifecycleAuthoring {
  const path = "project.performance";
  const root = objectWithOptional(
    value,
    path,
    ["entry", "body", "exit", "repeat", "reducedMotion"],
    ["transitionPreset"],
  );

  const validateTransitionShape = (candidate: unknown, transitionPath: string): void => {
    const transition = dictionary(candidate, transitionPath);
    if (transition.enabled === false) {
      object(transition, transitionPath, ["enabled"]);
      return;
    }
    const enabled = objectWithOptional(transition, transitionPath, [
      "enabled", "durationSeconds", "treatment", "curve", "background", "slides", "includePresenter",
    ], ["presenter"]);
    object(enabled.background, `${transitionPath}.background`, ["lead", "span"]);
    object(enabled.slides, `${transitionPath}.slides`, ["lead", "span", "stagger", "order"]);
    if (enabled.presenter !== undefined) {
      object(enabled.presenter, `${transitionPath}.presenter`, ["lead", "span"]);
    }
  };

  validateTransitionShape(root.entry, `${path}.entry`);
  validateTransitionShape(root.exit, `${path}.exit`);
  const body = object(root.body, `${path}.body`, ["durationSeconds", "tempo"]);
  const tempo = dictionary(body.tempo, `${path}.body.tempo`);
  if (tempo.kind === "preset") {
    object(tempo, `${path}.body.tempo`, ["kind", "preset"]);
  } else if (tempo.kind === "custom") {
    const custom = object(tempo, `${path}.body.tempo`, ["kind", "envelope"]);
    object(custom.envelope, `${path}.body.tempo.envelope`, ["start", "middle", "finish"]);
  } else {
    fail(`${path}.body.tempo.kind`, "must be preset or custom");
  }
  const repeat = dictionary(root.repeat, `${path}.repeat`);
  if (repeat.mode === "off") object(repeat, `${path}.repeat`, ["mode"]);
  else object(repeat, `${path}.repeat`, ["mode", "count"]);

  try {
    return createPerformanceLifecycle(value as PerformanceLifecycleAuthoring).authoring;
  } catch (error) {
    const message = error instanceof Error ? error.message : "is malformed";
    fail(path, message);
  }
}

export function validateDriftProjectV3(value: unknown): DriftProjectV3 {
  const project = object(value, "project", [
    "schema", "formatVersion", "projectId", "projectSeed", "createdAt", "updatedAt",
    "composition", "media", "slides", "motion", "card", "material", "lighting",
    "atmosphere", "lens", "sound", "presenter", "master", "provenance",
  ]);
  if (project.schema !== DRIFT_PROJECT_SCHEMA) fail("project.schema", `must be ${DRIFT_PROJECT_SCHEMA}`);
  if (project.formatVersion !== DRIFT_PROJECT_VERSION) fail("project.formatVersion", `must be ${DRIFT_PROJECT_VERSION}`);
  safeString(project.projectId, "project.projectId", 512);
  finiteNumber(project.projectSeed, "project.projectSeed", 0, 4_294_967_295, true);
  const created = isoDate(project.createdAt, "project.createdAt");
  const updated = isoDate(project.updatedAt, "project.updatedAt");
  if (updated < created) fail("project.updatedAt", "must not precede project.createdAt");

  const composition = object(project.composition, "project.composition", ["width", "height", "alphaMode", "colourSpace"]);
  numbers(composition, "project.composition", { width: [1, 16_384, true], height: [1, 16_384, true] });
  oneOf(composition.alphaMode, ["opaque", "transparent"] as const, "project.composition.alphaMode");
  oneOf(composition.colourSpace, ["srgb-rec709"] as const, "project.composition.colourSpace");

  const media = object(project.media, "project.media", ["order", "presenterAssetId", "assets"]);
  const order = uniqueStrings(media.order, "project.media.order", 200);
  const presenterId = optionalSafeString(media.presenterAssetId, "project.media.presenterAssetId", 512);
  const assets = dictionary(media.assets, "project.media.assets");
  const assetIds = Object.keys(assets);
  if (assetIds.length > 201) fail("project.media.assets", "contains more than 201 assets");
  for (const id of assetIds) asset(assets[id], `project.media.assets.${id}`, id);
  for (const id of order) {
    const descriptor = assets[id] as UnknownRecord | undefined;
    if (!descriptor) fail("project.media.order", `references missing asset ${id}`);
    if (descriptor.kind !== "image") fail("project.media.order", `references non-image asset ${id}`);
  }
  if (presenterId !== null) {
    const descriptor = assets[presenterId] as UnknownRecord | undefined;
    if (!descriptor) fail("project.media.presenterAssetId", "references missing media");
    if (descriptor.kind !== "video") fail("project.media.presenterAssetId", "must reference video media");
  }
  const referenced = new Set([...order, ...(presenterId ? [presenterId] : [])]);
  if (assetIds.some((id) => !referenced.has(id)) || referenced.size !== assetIds.length) {
    fail("project.media.assets", "contains unreferenced media");
  }

  const slides = dictionary(project.slides, "project.slides");
  if (Object.keys(slides).length !== order.length) fail("project.slides", "must contain one directive per ordered slide");
  for (const id of order) {
    const directive = object(slides[id], `project.slides.${id}`, ["assetId", "fit", "focalX", "focalY", "scaleOffset"]);
    if (directive.assetId !== id) fail(`project.slides.${id}.assetId`, "must match the slide key");
    oneOf(directive.fit, ["cover", "contain"] as const, `project.slides.${id}.fit`);
    numbers(directive, `project.slides.${id}`, { focalX: [0, 1], focalY: [0, 1], scaleOffset: [-0.75, 0.75] });
  }
  for (const id of Object.keys(slides)) if (!order.includes(id)) fail(`project.slides.${id}`, "does not belong to the ordered deck");

  motion(project.motion);

  const card = object(project.card, "project.card", [
    "aspectWidth", "aspectHeight", "scale", "defaultFit", "radius", "smoothing", "borderWidth", "borderColor", "borderOpacity",
  ]);
  numbers(card, "project.card", {
    aspectWidth: [0.01, 100], aspectHeight: [0.01, 100], scale: [0.1, 1.6],
    radius: [0, 512], smoothing: [0, 1], borderWidth: [0, 32], borderOpacity: [0, 1],
  });
  oneOf(card.defaultFit, ["cover", "contain"] as const, "project.card.defaultFit");
  colour(card.borderColor, "project.card.borderColor");

  const material = object(project.material, "project.material", ["surface", "flex", "thickness", "roughness", "sheen", "finish"]);
  oneOf(material.surface, ["card", "paper", "silk", "gel"] as const, "project.material.surface");
  numbers(material, "project.material", { flex: [0, 1], thickness: [0, 128], roughness: [0, 1], sheen: [0, 1] });
  const finish = object(material.finish, "project.material.finish", ["id", "registration", "localSoftness", "localSmear", "microtexture"]);
  safeString(finish.id, "project.material.finish.id");
  unitFields(finish, "project.material.finish", ["registration", "localSoftness", "localSmear", "microtexture"]);

  const lighting = object(project.lighting, "project.lighting", [
    "enabled", "presetId", "space", "motionMode", "motionSpeed", "keyColor", "fillColor", "shadowColor", "azimuth",
    "elevation", "keyIntensity", "fillIntensity", "rimIntensity", "artworkProtection", "heroProtection", "shadowOpacity",
    "shadowSoftness", "shadowDistance", "contactStrength", "backgroundSpill", "spillFocus", "gobo", "goboStrength", "breath",
  ]);
  boolean(lighting.enabled, "project.lighting.enabled");
  safeString(lighting.presetId, "project.lighting.presetId");
  oneOf(lighting.space, ["stage", "card"] as const, "project.lighting.space");
  oneOf(lighting.motionMode, ["static", "breathe", "sweep", "flicker", "orbit"] as const, "project.lighting.motionMode");
  colour(lighting.keyColor, "project.lighting.keyColor");
  colour(lighting.fillColor, "project.lighting.fillColor");
  colour(lighting.shadowColor, "project.lighting.shadowColor");
  numbers(lighting, "project.lighting", {
    motionSpeed: [0, 8], azimuth: [-180, 180], elevation: [0, 90], keyIntensity: [0, 2], fillIntensity: [0, 2],
    rimIntensity: [0, 2], artworkProtection: [0, 1], heroProtection: [0, 1], shadowOpacity: [0, 1],
    shadowSoftness: [0, 256], shadowDistance: [0, 512], contactStrength: [0, 1], backgroundSpill: [0, 1],
    spillFocus: [0.1, 2], goboStrength: [0, 1], breath: [0, 1],
  });
  safeString(lighting.gobo, "project.lighting.gobo");

  const atmosphere = object(project.atmosphere, "project.atmosphere", [
    "enabled", "family", "composition", "paletteId", "treatment", "recut", "seedOffset", "presence",
    "intensity", "motion", "grain", "vignette", "colourA", "colourB", "accent",
  ]);
  boolean(atmosphere.enabled, "project.atmosphere.enabled");
  safeString(atmosphere.family, "project.atmosphere.family");
  safeString(atmosphere.composition, "project.atmosphere.composition");
  optionalSafeString(atmosphere.paletteId, "project.atmosphere.paletteId");
  oneOf(atmosphere.treatment, ["quiet", "cinema", "graphic", "weathered"] as const, "project.atmosphere.treatment");
  oneOf(atmosphere.presence, ["whisper", "balanced", "statement"] as const, "project.atmosphere.presence");
  numbers(atmosphere, "project.atmosphere", {
    recut: [0, 1_000_000, true], seedOffset: [0, 4_294_967_295, true], intensity: [0, 1], motion: [0, 1], grain: [0, 1], vignette: [0, 1],
  });
  colour(atmosphere.colourA, "project.atmosphere.colourA");
  colour(atmosphere.colourB, "project.atmosphere.colourB");
  colour(atmosphere.accent, "project.atmosphere.accent");

  const lens = object(project.lens, "project.lens", [
    "enabled", "characterId", "presence", "focus", "directionalSmear", "chromaticSeparation", "bloom", "halation",
    "flare", "curvature", "gateWeave", "cameraGrain", "vignette", "presenterTreatment",
  ]);
  boolean(lens.enabled, "project.lens.enabled");
  safeString(lens.characterId, "project.lens.characterId");
  unitFields(lens, "project.lens", [
    "presence", "focus", "directionalSmear", "chromaticSeparation", "bloom", "halation", "flare", "gateWeave", "cameraGrain", "vignette",
  ]);
  finiteNumber(lens.curvature, "project.lens.curvature", -1, 1);
  oneOf(lens.presenterTreatment, ["protected", "through-lens"] as const, "project.lens.presenterTreatment");

  const sound = object(project.sound, "project.sound", [
    "source", "material", "grammar", "density", "texture", "take", "masterLevel", "motionLevel",
    "interfaceLevel", "underVoice", "previewEnabled", "exportEnabled",
  ]);
  oneOf(sound.source, ["recorded", "procedural"] as const, "project.sound.source");
  safeString(sound.material, "project.sound.material");
  oneOf(sound.grammar, ["dry", "editorial", "organic"] as const, "project.sound.grammar");
  unitFields(sound, "project.sound", ["density", "texture", "masterLevel", "motionLevel", "interfaceLevel", "underVoice"]);
  finiteNumber(sound.take, "project.sound.take", 1, 1_000_000, true);
  boolean(sound.previewEnabled, "project.sound.previewEnabled");
  boolean(sound.exportEnabled, "project.sound.exportEnabled");

  const presenter = object(project.presenter, "project.presenter", [
    "enabled", "x", "y", "width", "aspectWidth", "aspectHeight", "fit", "radius", "smoothing",
    "borderWidth", "borderColor", "borderOpacity", "muted", "gain", "trimStart", "startAt",
  ]);
  boolean(presenter.enabled, "project.presenter.enabled");
  oneOf(presenter.fit, ["cover", "contain"] as const, "project.presenter.fit");
  boolean(presenter.muted, "project.presenter.muted");
  colour(presenter.borderColor, "project.presenter.borderColor");
  numbers(presenter, "project.presenter", {
    x: [0, 1], y: [0, 1], width: [0.05, 1], aspectWidth: [0.01, 100], aspectHeight: [0.01, 100],
    radius: [0, 512], smoothing: [0, 1], borderWidth: [0, 32], borderOpacity: [0, 1],
    gain: [0, 4], trimStart: [0, 86_400], startAt: [0, 86_400],
  });
  if (presenter.enabled && presenterId === null) fail("project.presenter.enabled", "requires presenter media");

  const master = object(project.master, "project.master", ["fps", "duration", "reducedMotion", "video", "audio"]);
  oneOf(master.fps, [24, 25, 30, 50, 60] as const, "project.master.fps");
  finiteNumber(master.duration, "project.master.duration", 0.5, 300);
  boolean(master.reducedMotion, "project.master.reducedMotion");
  const video = object(master.video, "project.master.video", ["format", "bitrate"]);
  oneOf(video.format, ["h264"] as const, "project.master.video.format");
  finiteNumber(video.bitrate, "project.master.video.bitrate", DRIFT_H264_BITRATE, DRIFT_H264_BITRATE, true);
  const audio = object(master.audio, "project.master.audio", ["enabled", "bitrate"]);
  boolean(audio.enabled, "project.master.audio.enabled");
  finiteNumber(audio.bitrate, "project.master.audio.bitrate", DRIFT_AAC_BITRATE, DRIFT_AAC_BITRATE, true);
  if (audio.enabled && !sound.exportEnabled && (presenterId === null || presenter.muted === true)) {
    fail("project.master.audio.enabled", "requires presenter audio or exported sound");
  }

  const provenance = object(project.provenance, "project.provenance", ["world", "worldVariant", "recipes", "lockedDomains"]);
  if (provenance.world !== null) recipe(provenance.world, "project.provenance.world");
  oneOf(provenance.worldVariant, ["restrained", "directed", "fever", "custom"] as const, "project.provenance.worldVariant");
  const recipes = object(provenance.recipes, "project.provenance.recipes", PROJECT_DOMAINS);
  for (const domain of PROJECT_DOMAINS) if (recipes[domain] !== null) recipe(recipes[domain], `project.provenance.recipes.${domain}`);
  const locked = uniqueStrings(provenance.lockedDomains, "project.provenance.lockedDomains", PROJECT_DOMAINS.length);
  for (const [index, domain] of locked.entries()) oneOf(domain, PROJECT_DOMAINS, `project.provenance.lockedDomains[${index}]`);

  return structuredClone(value) as DriftProjectV3;
}

export function validateDriftProjectV4(value: unknown): DriftProjectV4 {
  const fields = [
    "schema", "formatVersion", "renderContract", "migration", "projectId", "projectSeed", "createdAt", "updatedAt",
    "composition", "media", "slides", "motion", "card", "material", "lighting",
    "atmosphere", "lens", "sound", "presenter", "performance", "master", "provenance", "extensions",
  ] as const;
  const project = plainDataObject(value, "project");
  const unknown = Object.keys(project).find((key) => !fields.includes(key as (typeof fields)[number]));
  if (unknown) fail("project", `contains unknown field ${unknown}`);
  for (const field of fields) if (!(field in project)) fail(`project.${field}`, "is required");
  if (project.schema !== DRIFT_PROJECT_SCHEMA) fail("project.schema", `must be ${DRIFT_PROJECT_SCHEMA}`);
  if (project.formatVersion !== DRIFT_PROJECT_V4_VERSION) {
    fail("project.formatVersion", `must be ${DRIFT_PROJECT_V4_VERSION}`);
  }
  const renderContract = oneOf(project.renderContract, DRIFT_RENDER_CONTRACTS, "project.renderContract");

  const migration = migrationV4(project.migration);
  const extensions = canonicalExtensions(project.extensions);
  const presenter = validatePresenterV4(project.presenter);
  assertPlainDataTree(project.performance, "project.performance", { nodes: 0, active: new WeakSet() });
  const performance = validatePerformanceV4(project.performance);
  const v3Candidate = {
    schema: project.schema,
    formatVersion: DRIFT_PROJECT_VERSION,
    projectId: project.projectId,
    projectSeed: project.projectSeed,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    composition: project.composition,
    media: project.media,
    slides: project.slides,
    motion: project.motion,
    card: project.card,
    material: project.material,
    lighting: project.lighting,
    atmosphere: project.atmosphere,
    lens: project.lens,
    sound: project.sound,
    presenter: presenterV3Compatibility(presenter),
    master: project.master,
    provenance: project.provenance,
  };
  assertPlainDataTree(v3Candidate, "project", { nodes: 0, active: new WeakSet() });
  const v3 = validateDriftProjectV3(v3Candidate);
  const lifecycle = createPerformanceLifecycle(performance);
  if (Math.abs(lifecycle.totalDuration - v3.master.duration) > 1e-9) {
    fail("project.performance", "derived total duration must equal project.master.duration");
  }

  const pinnedAssetId = presenter.assetId;
  const pinnedAsset = pinnedAssetId === null ? null : v3.media.assets[pinnedAssetId];
  if (pinnedAssetId !== null && !pinnedAsset) {
    fail("project.presenter.assetId", "references missing media");
  }
  if (pinnedAsset?.kind === "image" && !v3.media.order.includes(pinnedAssetId!)) {
    fail("project.presenter.assetId", "image pin must belong to the ordered deck");
  }
  if (pinnedAsset?.kind === "video" && pinnedAssetId !== v3.media.presenterAssetId) {
    fail("project.presenter.assetId", "video pin must match project.media.presenterAssetId");
  }
  if (presenter.enabled && !pinnedAsset) {
    fail("project.presenter.enabled", "requires pinned media");
  }
  const hasPresenterAudio = presenter.enabled
    && !presenter.muted
    && pinnedAsset?.kind === "video"
    && pinnedAssetId === v3.media.presenterAssetId;
  if (v3.master.audio.enabled && !v3.sound.exportEnabled && !hasPresenterAudio) {
    fail("project.master.audio.enabled", "requires presenter audio or exported sound");
  }

  return {
    schema: v3.schema,
    formatVersion: DRIFT_PROJECT_V4_VERSION,
    renderContract,
    migration,
    projectId: v3.projectId,
    projectSeed: v3.projectSeed,
    createdAt: v3.createdAt,
    updatedAt: v3.updatedAt,
    composition: v3.composition,
    media: v3.media,
    slides: v3.slides,
    motion: v3.motion,
    card: v3.card,
    material: v3.material,
    lighting: v3.lighting,
    atmosphere: v3.atmosphere,
    lens: v3.lens,
    sound: v3.sound,
    presenter,
    performance,
    master: v3.master,
    provenance: v3.provenance,
    extensions,
  };
}
