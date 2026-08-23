import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { driftBuildIdentity } from "./buildIdentity";

export const PROJECT_MANIFEST_SCHEMA = "pitch.dog/pitched-project" as const;
export const PROJECT_MANIFEST_VERSION = 1 as const;
export const PROJECT_BUNDLE_MIME = "application/vnd.pitchdog.pitched+zip";

const DATABASE_VERSION = 1;
const PROJECT_STORE = "project";
const ASSET_STORE = "assets";
const CURRENT_PROJECT_KEY = "current";
const MANIFEST_PATH = "manifest.json";
// fflate reads local date fields. A local constructor keeps ZIP bytes stable in
// every timezone and stays inside DOS ZIP's 1980-2099 representable range.
const FIXED_ZIP_MTIME = new Date(1980, 0, 1, 0, 0, 0, 0);

export const DEFAULT_PROJECT_BUNDLE_LIMITS = Object.freeze({
  // This API returns an in-memory Blob. Hashing, ZIP input, ZIP output, and
  // verification coexist briefly, so a seemingly generous cap can OOM a tab.
  // Larger projects need a future worker-backed streaming archive path.
  maxArchiveBytes: 96 * 1024 * 1024,
  maxManifestBytes: 2 * 1024 * 1024,
  maxAssetBytes: 64 * 1024 * 1024,
  maxTotalAssetBytes: 80 * 1024 * 1024,
  maxAssetCount: 2_000,
});

export interface ProjectBundleLimits {
  maxArchiveBytes: number;
  maxManifestBytes: number;
  maxAssetBytes: number;
  maxTotalAssetBytes: number;
  maxAssetCount: number;
}

export interface ProjectAssetManifest {
  id: string;
  order: number;
  path: string;
  name: string;
  type: string;
  size: number;
  sha256: string;
}

/**
 * Payload deliberately stays generic: this layer persists editor state without
 * knowing which settings, presets, or scene model the caller uses.
 */
export interface ProjectManifest<TPayload = unknown> {
  schema: typeof PROJECT_MANIFEST_SCHEMA;
  version: typeof PROJECT_MANIFEST_VERSION;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  engineVersion: string;
  themeVersion: string;
  payload: TPayload;
  assets: ProjectAssetManifest[];
}

export interface ProjectAssetInput {
  id: string;
  name: string;
  blob: Blob;
}

export interface ProjectAsset extends ProjectAssetManifest {
  blob: Blob;
}

export interface NewProject<TPayload> {
  payload: TPayload;
  assets: readonly ProjectAssetInput[];
  engineVersion: string;
  themeVersion: string;
  projectId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectSnapshot<TPayload = unknown> {
  manifest: ProjectManifest<TPayload>;
  payload: TPayload;
  assets: ProjectAsset[];
}

export type ProjectIntegrityErrorCode =
  | "archive-too-large"
  | "asset-too-large"
  | "duplicate-archive-path"
  | "duplicate-asset-id"
  | "duplicate-asset-path"
  | "hash-mismatch"
  | "indexeddb-unavailable"
  | "invalid-archive"
  | "invalid-asset"
  | "invalid-manifest"
  | "invalid-payload"
  | "missing-asset"
  | "missing-project"
  | "size-mismatch"
  | "unexpected-file"
  | "unsupported-version";

export class ProjectIntegrityError extends Error {
  readonly code: ProjectIntegrityErrorCode;

  constructor(code: ProjectIntegrityErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectIntegrityError";
    this.code = code;
  }
}

export interface ProjectStoreOptions {
  databaseName?: string;
  indexedDB?: IDBFactory | null;
  limits?: Partial<ProjectBundleLimits>;
}

interface StoredProjectRecord {
  key: typeof CURRENT_PROJECT_KEY;
  manifest: ProjectManifest<unknown>;
}

interface StoredAssetRecord extends ProjectAsset {
  storageKey: string;
}

function integrityError(
  code: ProjectIntegrityErrorCode,
  message: string,
  cause?: unknown,
): ProjectIntegrityError {
  return new ProjectIntegrityError(code, message, cause === undefined ? undefined : { cause });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBlob(value: unknown): value is Blob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Blob).size === "number" &&
    typeof (value as Blob).type === "string" &&
    typeof (value as Blob).arrayBuffer === "function"
  );
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw integrityError("invalid-manifest", `${label} must be a positive safe integer.`);
  }
}

function resolveLimits(overrides?: Partial<ProjectBundleLimits>): ProjectBundleLimits {
  const limits = { ...DEFAULT_PROJECT_BUNDLE_LIMITS, ...overrides };
  assertPositiveSafeInteger(limits.maxArchiveBytes, "maxArchiveBytes");
  assertPositiveSafeInteger(limits.maxManifestBytes, "maxManifestBytes");
  assertPositiveSafeInteger(limits.maxAssetBytes, "maxAssetBytes");
  assertPositiveSafeInteger(limits.maxTotalAssetBytes, "maxTotalAssetBytes");
  assertPositiveSafeInteger(limits.maxAssetCount, "maxAssetCount");
  return limits;
}

function assertJsonValue(value: unknown, path = "payload", seen = new Set<object>(), depth = 0): void {
  if (depth > 100) {
    throw integrityError("invalid-payload", `${path} exceeds maximum nesting depth.`);
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw integrityError("invalid-payload", `${path} contains a non-finite number.`);
    }
    return;
  }

  if (typeof value !== "object") {
    throw integrityError("invalid-payload", `${path} is not JSON-safe.`);
  }

  if (seen.has(value)) {
    throw integrityError("invalid-payload", `${path} contains a circular reference.`);
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertJsonValue(value[index], `${path}[${index}]`, seen, depth + 1);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw integrityError("invalid-payload", `${path} contains a non-plain object.`);
    }
    for (const [key, child] of Object.entries(value)) {
      assertJsonValue(child, `${path}.${key}`, seen, depth + 1);
    }
  }

  seen.delete(value);
}

function cloneJson<T>(value: T): T {
  assertJsonValue(value);
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (cause) {
    throw integrityError("invalid-payload", "Project payload cannot be serialized as JSON.", cause);
  }
}

function assertNonEmptyString(value: unknown, label: string, maxLength = 256): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw integrityError("invalid-manifest", `${label} must be a non-empty safe string.`);
  }
}

function parseIsoDate(value: unknown, label: string): string {
  assertNonEmptyString(value, label, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    throw integrityError("invalid-manifest", `${label} must be a canonical UTC ISO date.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw integrityError("invalid-manifest", `${label} must be a valid UTC ISO date.`);
  }
  return value;
}

function makeProjectId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return `project-${Date.now().toString(36)}-${random}`;
}

function sanitizePart(value: string, fallback: string, maxLength: number): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/gu, "-")
    .replace(/\.{2,}/gu, ".")
    .replace(/^[-_.]+|[-_.]+$/gu, "")
    .replace(/-+/gu, "-")
    .slice(0, maxLength)
    .replace(/[-_.]+$/gu, "");
  return normalized || fallback;
}

export function sanitizeAssetFilename(name: string): string {
  const slashNormalized = name.replace(/\\/gu, "/");
  const leaf = slashNormalized.split("/").at(-1) ?? "asset";
  const lastDot = leaf.lastIndexOf(".");
  const hasExtension = lastDot > 0 && lastDot < leaf.length - 1;
  const stem = hasExtension ? leaf.slice(0, lastDot) : leaf;
  const extension = hasExtension ? leaf.slice(lastDot + 1) : "";
  const safeStem = sanitizePart(stem, "asset", 96);
  const safeExtension = sanitizePart(extension, "", 16).toLowerCase();
  return safeExtension ? `${safeStem}.${safeExtension}` : safeStem;
}

function assetPath(order: number, id: string, name: string): string {
  const orderPart = order.toString().padStart(4, "0");
  const idPart = sanitizePart(id, "asset", 48);
  return `assets/${orderPart}-${idPart}-${sanitizeAssetFilename(name)}`;
}

async function sha256(blob: Blob): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest !== "function") {
    throw integrityError("invalid-asset", "Web Crypto SHA-256 is unavailable in this browser.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type });
}

function assertAssetInput(asset: ProjectAssetInput, index: number): void {
  if (!isRecord(asset)) {
    throw integrityError("invalid-asset", `Asset ${index} must be an object.`);
  }
  try {
    assertNonEmptyString(asset.id, `assets[${index}].id`);
    assertNonEmptyString(asset.name, `assets[${index}].name`, 512);
  } catch (cause) {
    throw integrityError("invalid-asset", `Asset ${index} has invalid metadata.`, cause);
  }
  if (!isBlob(asset.blob)) {
    throw integrityError("invalid-asset", `Asset ${index} is missing a Blob.`);
  }
}

async function createSnapshot<TPayload>(
  project: NewProject<TPayload>,
  limits: ProjectBundleLimits,
): Promise<ProjectSnapshot<TPayload>> {
  if (!isRecord(project)) {
    throw integrityError("invalid-manifest", "Project input must be an object.");
  }
  assertNonEmptyString(project.engineVersion, "engineVersion");
  assertNonEmptyString(project.themeVersion, "themeVersion");
  if (!Array.isArray(project.assets)) {
    throw integrityError("invalid-asset", "Project assets must be an array.");
  }
  if (project.assets.length > limits.maxAssetCount) {
    throw integrityError("asset-too-large", `Project exceeds ${limits.maxAssetCount} assets.`);
  }

  const payload = cloneJson(project.payload);
  const ids = new Set<string>();
  const paths = new Set<string>();
  let totalSize = 0;
  const assets: ProjectAsset[] = [];

  for (let order = 0; order < project.assets.length; order += 1) {
    const input = project.assets[order];
    if (input === undefined) {
      throw integrityError("invalid-asset", `Asset order ${order} is missing.`);
    }
    assertAssetInput(input, order);
    if (ids.has(input.id)) {
      throw integrityError("duplicate-asset-id", `Duplicate asset id: ${input.id}`);
    }
    ids.add(input.id);

    if (input.blob.size > limits.maxAssetBytes) {
      throw integrityError("asset-too-large", `Asset ${input.id} exceeds per-asset limit.`);
    }
    totalSize += input.blob.size;
    if (!Number.isSafeInteger(totalSize) || totalSize > limits.maxTotalAssetBytes) {
      throw integrityError("asset-too-large", "Project assets exceed total bundle limit.");
    }

    const path = assetPath(order, input.id, input.name);
    if (paths.has(path)) {
      throw integrityError("duplicate-asset-path", `Duplicate asset path: ${path}`);
    }
    paths.add(path);
    assets.push({
      id: input.id,
      order,
      path,
      name: input.name,
      type: input.blob.type,
      size: input.blob.size,
      sha256: await sha256(input.blob),
      blob: input.blob,
    });
  }

  const now = new Date().toISOString();
  const createdAt = parseIsoDate(project.createdAt ?? now, "createdAt");
  const updatedAt = parseIsoDate(project.updatedAt ?? now, "updatedAt");
  const projectId = project.projectId ?? makeProjectId();
  assertNonEmptyString(projectId, "projectId");
  const manifest: ProjectManifest<TPayload> = {
    schema: PROJECT_MANIFEST_SCHEMA,
    version: PROJECT_MANIFEST_VERSION,
    projectId,
    createdAt,
    updatedAt,
    engineVersion: project.engineVersion,
    themeVersion: project.themeVersion,
    payload,
    assets: assets.map(({ blob: _blob, ...metadata }) => metadata),
  };
  assertManifestByteSize(manifest, limits);
  return { manifest, payload, assets };
}

function manifestBytes(manifest: ProjectManifest<unknown>): Uint8Array {
  return strToU8(JSON.stringify(manifest, null, 2));
}

function assertManifestByteSize(manifest: ProjectManifest<unknown>, limits: ProjectBundleLimits): void {
  if (manifestBytes(manifest).byteLength > limits.maxManifestBytes) {
    throw integrityError("invalid-manifest", "Project manifest exceeds safe size limit.");
  }
}

function parseAssetManifest(value: unknown, expectedOrder: number): ProjectAssetManifest {
  if (!isRecord(value)) {
    throw integrityError("invalid-manifest", `assets[${expectedOrder}] must be an object.`);
  }
  assertNonEmptyString(value.id, `assets[${expectedOrder}].id`);
  assertNonEmptyString(value.name, `assets[${expectedOrder}].name`, 512);
  assertNonEmptyString(value.path, `assets[${expectedOrder}].path`, 1024);
  if (typeof value.type !== "string" || value.type.length > 256) {
    throw integrityError("invalid-manifest", `assets[${expectedOrder}].type is invalid.`);
  }
  if (value.order !== expectedOrder) {
    throw integrityError(
      "invalid-manifest",
      `Asset order must be contiguous; expected ${expectedOrder}, received ${String(value.order)}.`,
    );
  }
  if (!Number.isSafeInteger(value.size) || (value.size as number) < 0) {
    throw integrityError("invalid-manifest", `assets[${expectedOrder}].size is invalid.`);
  }
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.sha256)) {
    throw integrityError("invalid-manifest", `assets[${expectedOrder}].sha256 is invalid.`);
  }

  const expectedPath = assetPath(expectedOrder, value.id, value.name);
  if (value.path !== expectedPath) {
    throw integrityError("invalid-manifest", `Asset ${value.id} has an invalid or unstable path.`);
  }

  return {
    id: value.id,
    order: expectedOrder,
    path: value.path,
    name: value.name,
    type: value.type,
    size: value.size as number,
    sha256: value.sha256,
  };
}

function parseManifest<TPayload>(raw: unknown, limits: ProjectBundleLimits): ProjectManifest<TPayload> {
  if (!isRecord(raw)) {
    throw integrityError("invalid-manifest", "manifest.json must contain an object.");
  }
  if (raw.schema !== PROJECT_MANIFEST_SCHEMA) {
    throw integrityError("invalid-manifest", "Project manifest schema is not recognized.");
  }
  if (raw.version !== PROJECT_MANIFEST_VERSION) {
    throw integrityError("unsupported-version", `Unsupported project manifest version: ${String(raw.version)}.`);
  }
  assertNonEmptyString(raw.projectId, "projectId");
  const createdAt = parseIsoDate(raw.createdAt, "createdAt");
  const updatedAt = parseIsoDate(raw.updatedAt, "updatedAt");
  assertNonEmptyString(raw.engineVersion, "engineVersion");
  assertNonEmptyString(raw.themeVersion, "themeVersion");
  if (!("payload" in raw)) {
    throw integrityError("invalid-manifest", "Project manifest is missing payload.");
  }
  const payload = cloneJson(raw.payload) as TPayload;
  if (!Array.isArray(raw.assets)) {
    throw integrityError("invalid-manifest", "Project manifest assets must be an array.");
  }
  if (raw.assets.length > limits.maxAssetCount) {
    throw integrityError("asset-too-large", `Project exceeds ${limits.maxAssetCount} assets.`);
  }

  const ids = new Set<string>();
  const paths = new Set<string>();
  let totalSize = 0;
  const assets = raw.assets.map((asset, order) => {
    const parsed = parseAssetManifest(asset, order);
    if (ids.has(parsed.id)) {
      throw integrityError("duplicate-asset-id", `Duplicate asset id: ${parsed.id}`);
    }
    if (paths.has(parsed.path)) {
      throw integrityError("duplicate-asset-path", `Duplicate asset path: ${parsed.path}`);
    }
    ids.add(parsed.id);
    paths.add(parsed.path);
    if (parsed.size > limits.maxAssetBytes) {
      throw integrityError("asset-too-large", `Asset ${parsed.id} exceeds per-asset limit.`);
    }
    totalSize += parsed.size;
    if (!Number.isSafeInteger(totalSize) || totalSize > limits.maxTotalAssetBytes) {
      throw integrityError("asset-too-large", "Project assets exceed total bundle limit.");
    }
    return parsed;
  });

  const manifest: ProjectManifest<TPayload> = {
    schema: PROJECT_MANIFEST_SCHEMA,
    version: PROJECT_MANIFEST_VERSION,
    projectId: raw.projectId,
    createdAt,
    updatedAt,
    engineVersion: raw.engineVersion,
    themeVersion: raw.themeVersion,
    payload,
    assets,
  };
  assertManifestByteSize(manifest, limits);
  return manifest;
}

async function hydrateSnapshot<TPayload>(
  manifest: ProjectManifest<TPayload>,
  files: ReadonlyMap<string, Blob>,
): Promise<ProjectSnapshot<TPayload>> {
  const assets: ProjectAsset[] = [];
  for (const metadata of manifest.assets) {
    const blob = files.get(metadata.path);
    if (blob === undefined) {
      throw integrityError("missing-asset", `Project asset is missing: ${metadata.path}`);
    }
    if (blob.size !== metadata.size) {
      throw integrityError("size-mismatch", `Asset size mismatch: ${metadata.id}`);
    }
    const hash = await sha256(blob);
    if (hash !== metadata.sha256) {
      throw integrityError("hash-mismatch", `Asset hash mismatch: ${metadata.id}`);
    }
    assets.push({ ...metadata, blob });
  }
  return { manifest, payload: manifest.payload, assets };
}

export async function createProjectBundle<TPayload>(
  project: NewProject<TPayload>,
  limitOverrides?: Partial<ProjectBundleLimits>,
): Promise<ProjectSnapshot<TPayload>> {
  return createSnapshot(project, resolveLimits(limitOverrides));
}

export async function exportProjectBundle<TPayload>(
  snapshot: ProjectSnapshot<TPayload>,
  limitOverrides?: Partial<ProjectBundleLimits>,
): Promise<Blob> {
  const limits = resolveLimits(limitOverrides);
  const manifest = parseManifest<TPayload>(snapshot.manifest, limits);
  if (snapshot.assets.length !== manifest.assets.length) {
    throw integrityError("missing-asset", "Project snapshot asset count does not match manifest.");
  }

  const suppliedAssets = new Map<string, Blob>();
  for (const asset of snapshot.assets) {
    if (suppliedAssets.has(asset.path)) {
      throw integrityError("duplicate-asset-path", `Duplicate asset path: ${asset.path}`);
    }
    suppliedAssets.set(asset.path, asset.blob);
  }
  const verified = await hydrateSnapshot(manifest, suppliedAssets);
  const files: Record<string, Uint8Array> = {
    [MANIFEST_PATH]: manifestBytes(manifest),
  };
  for (const asset of verified.assets) {
    files[asset.path] = new Uint8Array(await asset.blob.arrayBuffer());
  }

  let archive: Uint8Array;
  try {
    archive = zipSync(files, { level: 0, mtime: FIXED_ZIP_MTIME });
  } catch (cause) {
    throw integrityError("invalid-archive", "Could not create portable project archive.", cause);
  }
  if (archive.byteLength > limits.maxArchiveBytes) {
    throw integrityError("archive-too-large", "Portable project archive exceeds safe size limit.");
  }
  return bytesToBlob(archive, PROJECT_BUNDLE_MIME);
}

export async function importProjectBundle<TPayload = unknown>(
  archive: Blob,
  limitOverrides?: Partial<ProjectBundleLimits>,
): Promise<ProjectSnapshot<TPayload>> {
  const limits = resolveLimits(limitOverrides);
  if (!isBlob(archive)) {
    throw integrityError("invalid-archive", "Portable project must be a Blob.");
  }
  if (archive.size > limits.maxArchiveBytes) {
    throw integrityError("archive-too-large", "Portable project archive exceeds safe size limit.");
  }

  let entries: Record<string, Uint8Array>;
  const seenPaths = new Set<string>();
  let entryCount = 0;
  let expandedBytes = 0;
  try {
    entries = unzipSync(new Uint8Array(await archive.arrayBuffer()), {
      filter: (file) => {
        entryCount += 1;
        if (entryCount > limits.maxAssetCount + 1) {
          throw integrityError("asset-too-large", "Archive contains too many files.");
        }
        if (
          file.name.length === 0 ||
          file.name.startsWith("/") ||
          file.name.includes("\\") ||
          file.name.split("/").some((part) => part === ".." || part === ".")
        ) {
          throw integrityError("invalid-archive", `Unsafe archive path: ${file.name}`);
        }
        if (seenPaths.has(file.name)) {
          throw integrityError("duplicate-archive-path", `Duplicate archive path: ${file.name}`);
        }
        seenPaths.add(file.name);
        if (!Number.isSafeInteger(file.originalSize) || file.originalSize < 0) {
          throw integrityError("invalid-archive", `Invalid expanded size for ${file.name}.`);
        }
        const entryLimit = file.name === MANIFEST_PATH ? limits.maxManifestBytes : limits.maxAssetBytes;
        if (file.originalSize > entryLimit) {
          throw integrityError("asset-too-large", `Archive entry exceeds safe size limit: ${file.name}`);
        }
        expandedBytes += file.originalSize;
        if (!Number.isSafeInteger(expandedBytes) || expandedBytes > limits.maxTotalAssetBytes + limits.maxManifestBytes) {
          throw integrityError("asset-too-large", "Expanded archive exceeds safe size limit.");
        }
        return true;
      },
    });
  } catch (cause) {
    if (cause instanceof ProjectIntegrityError) {
      throw cause;
    }
    throw integrityError("invalid-archive", "Portable project is not a readable ZIP archive.", cause);
  }

  const rawManifest = entries[MANIFEST_PATH];
  if (rawManifest === undefined) {
    throw integrityError("invalid-manifest", "Portable project is missing manifest.json.");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(strFromU8(rawManifest));
  } catch (cause) {
    throw integrityError("invalid-manifest", "manifest.json is not valid JSON.", cause);
  }
  const manifest = parseManifest<TPayload>(decoded, limits);

  const expectedPaths = new Set([MANIFEST_PATH, ...manifest.assets.map((asset) => asset.path)]);
  for (const path of Object.keys(entries)) {
    if (!expectedPaths.has(path)) {
      throw integrityError("unexpected-file", `Archive contains an unexpected file: ${path}`);
    }
  }

  const files = new Map<string, Blob>();
  for (const metadata of manifest.assets) {
    const bytes = entries[metadata.path];
    if (bytes === undefined) {
      throw integrityError("missing-asset", `Project asset is missing: ${metadata.path}`);
    }
    files.set(metadata.path, bytesToBlob(bytes, metadata.type));
  }
  return hydrateSnapshot(manifest, files);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

export class ProjectStore {
  readonly databaseName: string;
  readonly limits: ProjectBundleLimits;
  private readonly indexedDBOverride: IDBFactory | null | undefined;

  constructor(options: ProjectStoreOptions = {}) {
    this.databaseName = options.databaseName ?? driftBuildIdentity.databaseName;
    this.indexedDBOverride = options.indexedDB;
    this.limits = resolveLimits(options.limits);
  }

  private getFactory(): IDBFactory {
    const factory = this.indexedDBOverride === undefined ? globalThis.indexedDB : this.indexedDBOverride;
    if (factory === null || factory === undefined) {
      throw integrityError("indexeddb-unavailable", "IndexedDB is unavailable; project was not changed.");
    }
    return factory;
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      let settled = false;
      try {
        request = this.getFactory().open(this.databaseName, DATABASE_VERSION);
      } catch (cause) {
        reject(integrityError("indexeddb-unavailable", "Could not open local project storage.", cause));
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PROJECT_STORE)) {
          database.createObjectStore(PROJECT_STORE, { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains(ASSET_STORE)) {
          database.createObjectStore(ASSET_STORE, { keyPath: "storageKey" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        if (settled) {
          database.close();
          return;
        }
        settled = true;
        resolve(database);
      };
      request.onerror = () => {
        if (settled) return;
        settled = true;
        reject(request.error ?? new Error("Could not open IndexedDB."));
      };
      request.onblocked = () => {
        if (settled) return;
        settled = true;
        reject(new Error("IndexedDB upgrade is blocked by another tab."));
      };
    });
  }

  async save<TPayload>(project: NewProject<TPayload>): Promise<ProjectSnapshot<TPayload>> {
    const snapshot = await createSnapshot(project, this.limits);
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction([PROJECT_STORE, ASSET_STORE], "readwrite");
      const done = transactionDone(transaction);
      try {
        const projects = transaction.objectStore(PROJECT_STORE);
        const assets = transaction.objectStore(ASSET_STORE);
        projects.clear();
        assets.clear();
        const projectRecord: StoredProjectRecord = {
          key: CURRENT_PROJECT_KEY,
          manifest: snapshot.manifest,
        };
        projects.put(projectRecord);
        for (const asset of snapshot.assets) {
          const assetRecord: StoredAssetRecord = {
            ...asset,
            storageKey: `${CURRENT_PROJECT_KEY}:${asset.id}`,
          };
          assets.put(assetRecord);
        }
      } catch (cause) {
        transaction.abort();
        throw cause;
      }
      await done;
      return snapshot;
    } finally {
      database.close();
    }
  }

  async load<TPayload = unknown>(): Promise<ProjectSnapshot<TPayload> | null> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction([PROJECT_STORE, ASSET_STORE], "readonly");
      const done = transactionDone(transaction);
      const projectRequest = transaction.objectStore(PROJECT_STORE).get(CURRENT_PROJECT_KEY);
      const assetsRequest = transaction.objectStore(ASSET_STORE).getAll();
      const [storedProject, storedAssets] = await Promise.all([
        requestResult(projectRequest) as Promise<StoredProjectRecord | undefined>,
        requestResult(assetsRequest) as Promise<StoredAssetRecord[]>,
      ]);
      await done;
      if (storedProject === undefined) {
        if (storedAssets.length > 0) {
          throw integrityError("missing-project", "Local assets exist without a current project manifest.");
        }
        return null;
      }
      if (!isRecord(storedProject) || storedProject.key !== CURRENT_PROJECT_KEY) {
        throw integrityError("invalid-manifest", "Local project record is invalid.");
      }
      const manifest = parseManifest<TPayload>(storedProject.manifest, this.limits);
      const files = new Map<string, Blob>();
      for (const storedAsset of storedAssets) {
        if (!isRecord(storedAsset) || !isBlob(storedAsset.blob) || typeof storedAsset.path !== "string") {
          throw integrityError("invalid-asset", "Local project contains an invalid asset record.");
        }
        if (files.has(storedAsset.path)) {
          throw integrityError("duplicate-asset-path", `Duplicate local asset path: ${storedAsset.path}`);
        }
        files.set(storedAsset.path, storedAsset.blob);
      }
      if (files.size !== manifest.assets.length) {
        throw integrityError("missing-asset", "Local asset count does not match project manifest.");
      }
      return hydrateSnapshot(manifest, files);
    } finally {
      database.close();
    }
  }

  async clear(): Promise<void> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction([PROJECT_STORE, ASSET_STORE], "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(PROJECT_STORE).clear();
      transaction.objectStore(ASSET_STORE).clear();
      await done;
    } finally {
      database.close();
    }
  }

  /** Imports and verifies only. Caller must explicitly call save() to replace local state. */
  async import<TPayload = unknown>(archive: Blob): Promise<ProjectSnapshot<TPayload>> {
    return importProjectBundle<TPayload>(archive, this.limits);
  }

  async export<TPayload = unknown>(snapshot?: ProjectSnapshot<TPayload>): Promise<Blob> {
    const source = snapshot ?? (await this.load<TPayload>());
    if (source === null) {
      throw integrityError("missing-project", "No current project is available to export.");
    }
    return exportProjectBundle(source, this.limits);
  }
}

function runtimeDatabaseName(): string {
  const candidate = (globalThis as typeof globalThis & {
    __DRIFT_NATIVE_SELF_TEST_DB__?: unknown;
  }).__DRIFT_NATIVE_SELF_TEST_DB__;
  // The packaged AppKit probe injects a random namespace before the signed app
  // entry executes. This preserves production persistent IndexedDB semantics
  // without reading, clearing, or replacing a user's actual Drift project.
  if (
    typeof candidate === "string"
    && /^drift-project-self-test-[a-f0-9-]{36}$/.test(candidate)
  ) return candidate;
  return driftBuildIdentity.databaseName;
}

export const projectStore = new ProjectStore({ databaseName: runtimeDatabaseName() });

export function saveProject<TPayload>(project: NewProject<TPayload>): Promise<ProjectSnapshot<TPayload>> {
  return projectStore.save(project);
}

export function loadProject<TPayload = unknown>(): Promise<ProjectSnapshot<TPayload> | null> {
  return projectStore.load<TPayload>();
}

export function clearProject(): Promise<void> {
  return projectStore.clear();
}

export function exportProject<TPayload = unknown>(snapshot?: ProjectSnapshot<TPayload>): Promise<Blob> {
  return projectStore.export(snapshot);
}

export function importProject<TPayload = unknown>(archive: Blob): Promise<ProjectSnapshot<TPayload>> {
  return projectStore.import<TPayload>(archive);
}
