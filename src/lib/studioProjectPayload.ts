import type { StoredAssetDescriptor, StudioSettings } from "../model";
import { migrateLegacyStudioProject, type LegacyAssetDescriptor } from "../core/project/migrateLegacy";
import {
  DRIFT_PROJECT_SCHEMA,
  DRIFT_PROJECT_VERSION,
  type DriftProjectV3,
} from "../core/project/schema";
import { validateDriftProjectV3 } from "../core/project/validation";
import { validateStudioSettings } from "./settingsValidation";

export interface LegacyStudioProjectPayload {
  settings: StudioSettings;
  slideAssetIds: string[];
  presenterAssetId: string | null;
  descriptors: StoredAssetDescriptor[];
}

export interface DriftProjectPayloadV3 {
  project: DriftProjectV3;
}

export interface PortableAssetReceipt {
  id: string;
  name: string;
  type: string;
  size: number;
  sha256: string;
}

export interface StudioPayloadContext {
  projectId: string;
  createdAt: string;
  updatedAt: string;
  assets: readonly PortableAssetReceipt[];
}

export interface ParsedStudioPayload {
  project: DriftProjectV3;
  sourceFormat: "project-v3" | "legacy-studio-v1";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeAssetId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 512
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function isPositiveDimension(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 131_072;
}

function parseLegacyDescriptor(value: unknown): StoredAssetDescriptor {
  if (!isRecord(value)) throw new Error("Project contains invalid media metadata.");
  if (
    !isSafeAssetId(value.id)
    || typeof value.name !== "string"
    || value.name.length === 0
    || value.name.length > 512
    || (value.kind !== "image" && value.kind !== "video")
    || typeof value.mimeType !== "string"
    || !value.mimeType.startsWith(`${value.kind}/`)
    || value.mimeType.length > 256
    || !isPositiveDimension(value.width)
    || !isPositiveDimension(value.height)
    || typeof value.hash !== "string"
    || !/^[a-f0-9]{64}$/u.test(value.hash)
    || (value.duration !== undefined && (
      typeof value.duration !== "number"
      || !Number.isFinite(value.duration)
      || value.duration <= 0
      || value.duration > 86_400
    ))
    || (value.demo !== undefined && typeof value.demo !== "boolean")
  ) {
    throw new Error("Project contains invalid media metadata.");
  }

  const descriptor: StoredAssetDescriptor = {
    id: value.id,
    name: value.name,
    kind: value.kind,
    mimeType: value.mimeType,
    width: value.width,
    height: value.height,
    hash: value.hash,
  };
  if (value.duration !== undefined) descriptor.duration = value.duration;
  if (value.demo !== undefined) descriptor.demo = value.demo;
  return descriptor;
}

function parseLegacyPayload(value: unknown): LegacyStudioProjectPayload {
  if (!isRecord(value) || !isRecord(value.settings)) {
    throw new Error("Project has no readable studio settings.");
  }
  if (
    !Array.isArray(value.slideAssetIds)
    || value.slideAssetIds.length > 200
    || !value.slideAssetIds.every(isSafeAssetId)
    || new Set(value.slideAssetIds).size !== value.slideAssetIds.length
  ) {
    throw new Error("Project slide order is invalid.");
  }
  if (value.presenterAssetId !== null && !isSafeAssetId(value.presenterAssetId)) {
    throw new Error("Project presenter reference is invalid.");
  }
  if (!Array.isArray(value.descriptors) || value.descriptors.length > 201) {
    throw new Error("Project media descriptors are missing or exceed this version's limit.");
  }
  const descriptors = value.descriptors.map(parseLegacyDescriptor);
  if (new Set(descriptors.map((descriptor) => descriptor.id)).size !== descriptors.length) {
    throw new Error("Project contains duplicate media metadata.");
  }
  return {
    settings: validateStudioSettings(value.settings),
    slideAssetIds: [...value.slideAssetIds],
    presenterAssetId: value.presenterAssetId,
    descriptors,
  };
}

function receiptsById(context: StudioPayloadContext): Map<string, PortableAssetReceipt> {
  const byId = new Map<string, PortableAssetReceipt>();
  for (const receipt of context.assets) {
    if (
      !isSafeAssetId(receipt.id)
      || typeof receipt.name !== "string"
      || receipt.name.length === 0
      || typeof receipt.type !== "string"
      || receipt.type.length === 0
      || !Number.isSafeInteger(receipt.size)
      || receipt.size < 0
      || !/^[a-f0-9]{64}$/u.test(receipt.sha256)
      || byId.has(receipt.id)
    ) {
      throw new Error("Verified project asset receipts are invalid or duplicated.");
    }
    byId.set(receipt.id, { ...receipt });
  }
  return byId;
}

function assertV3MediaReceipts(project: DriftProjectV3, context: StudioPayloadContext): void {
  const receipts = receiptsById(context);
  const projectIds = Object.keys(project.media.assets);
  if (projectIds.length !== receipts.size) {
    throw new Error("Project media does not match its verified portable manifest.");
  }
  for (const [id, descriptor] of Object.entries(project.media.assets)) {
    const receipt = receipts.get(id);
    if (
      !receipt
      || descriptor.name !== receipt.name
      || descriptor.mimeType !== receipt.type
      || descriptor.byteLength !== receipt.size
      || descriptor.hash !== receipt.sha256
    ) {
      throw new Error(`Project media receipt does not match ${descriptor.name}.`);
    }
  }
}

function migrateLegacyPayload(
  payload: LegacyStudioProjectPayload,
  context: StudioPayloadContext,
): DriftProjectV3 {
  const receipts = receiptsById(context);
  const descriptors = new Map(payload.descriptors.map((descriptor) => [descriptor.id, descriptor]));
  if (descriptors.size !== receipts.size) {
    throw new Error("Legacy project media does not match its verified portable manifest.");
  }

  const migrated = new Map<string, LegacyAssetDescriptor>();
  for (const descriptor of payload.descriptors) {
    const receipt = receipts.get(descriptor.id);
    if (
      !receipt
      || descriptor.name !== receipt.name
      || descriptor.mimeType !== receipt.type
      || descriptor.hash !== receipt.sha256
    ) {
      throw new Error(`Legacy project media receipt does not match ${descriptor.name}.`);
    }
    migrated.set(descriptor.id, { ...descriptor, byteLength: receipt.size });
  }

  const slides = payload.slideAssetIds.map((id) => migrated.get(id));
  if (
    slides.some((descriptor) => descriptor === undefined || descriptor.kind !== "image")
    || new Set(payload.slideAssetIds).size !== payload.slideAssetIds.length
  ) {
    throw new Error("Legacy project slide order references missing or non-image media.");
  }

  const presenter = payload.presenterAssetId === null
    ? null
    : migrated.get(payload.presenterAssetId) ?? null;
  if (payload.presenterAssetId !== null && presenter?.kind !== "video") {
    throw new Error("Legacy project presenter slot references invalid video media.");
  }
  const consumed = new Set([
    ...payload.slideAssetIds,
    ...(payload.presenterAssetId ? [payload.presenterAssetId] : []),
  ]);
  if (consumed.size !== migrated.size) {
    throw new Error("Legacy project contains unreferenced or conflicting media.");
  }
  if (payload.settings.presenter.assetId && !migrated.has(payload.settings.presenter.assetId)) {
    throw new Error("Legacy project pinned-frame settings reference missing media.");
  }

  return migrateLegacyStudioProject({
    projectId: context.projectId,
    createdAt: context.createdAt,
    updatedAt: context.updatedAt,
    settings: payload.settings,
    slideAssets: slides as LegacyAssetDescriptor[],
    presenterAsset: presenter,
  });
}

function driftProjectEnvelope(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || !isRecord(value.project)) return null;
  return value.project.schema === DRIFT_PROJECT_SCHEMA ? value.project : null;
}

function isProjectV3Payload(value: unknown): value is DriftProjectPayloadV3 {
  const project = driftProjectEnvelope(value);
  return project !== null && project.formatVersion === DRIFT_PROJECT_VERSION;
}

export function parseStudioProjectPayload(
  value: unknown,
  context: StudioPayloadContext,
): ParsedStudioPayload {
  const driftProject = driftProjectEnvelope(value);
  if (driftProject && driftProject.formatVersion !== DRIFT_PROJECT_VERSION) {
    const version = typeof driftProject.formatVersion === "number"
      ? String(driftProject.formatVersion)
      : "unknown";
    throw new Error(
      `Project format ${version} is not supported by this Drift build. Open it with the version of Drift that created it or a newer release.`,
    );
  }

  if (isProjectV3Payload(value)) {
    const project = validateDriftProjectV3(value.project);
    if (
      project.projectId !== context.projectId
      || project.createdAt !== context.createdAt
      || project.updatedAt !== context.updatedAt
    ) {
      throw new Error("Project identity does not match its verified portable manifest.");
    }
    assertV3MediaReceipts(project, context);
    return { project, sourceFormat: "project-v3" };
  }

  const legacy = parseLegacyPayload(value);
  return {
    project: migrateLegacyPayload(legacy, context),
    sourceFormat: "legacy-studio-v1",
  };
}

export function createDriftProjectPayload(project: DriftProjectV3): DriftProjectPayloadV3 {
  return { project: validateDriftProjectV3(project) };
}
