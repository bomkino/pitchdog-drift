import { STUDIO_COMMAND_REGISTRY } from "../commands/studioCommandRegistry";
import { projectV4ChangePaths } from "../commands/projectCommand";
import { createInitialDriftProjectV4 } from "../project/initialProject";
import {
  DRIFT_PROJECT_SCHEMA,
  DRIFT_PROJECT_V4_VERSION,
  PROJECT_DOMAINS,
  type DriftProjectV4,
} from "../project/schema";
import {
  OUTCOME_RECIPES,
  applyOutcomeRecipe,
  resetMotion,
  resetSequence,
} from "../recipes/outcomeRecipes";
import type { ExportCapabilityReport } from "../../lib/exportStudio";
import { normalizeInterfaceScale } from "../../lib/interfaceScale";

export const DRIFT_AUTOMATION_PRODUCT_ID = "dog.pitch.drift" as const;
export const DRIFT_AUTOMATION_PROTOCOL_VERSION = 1 as const;
export const DRIFT_AUTOMATION_METADATA_SCOPE = "metadata-only" as const;

export const DRIFT_AUTOMATION_MANIFEST_IDS = [
  "protocol",
  "vocabulary",
  "defaults",
  "document",
  "presentation",
  "capabilities",
  "jobs",
] as const;

export type DriftAutomationManifestId = (typeof DRIFT_AUTOMATION_MANIFEST_IDS)[number];

export interface DriftPresentationManifestInput {
  readonly interfaceScale: number;
  readonly workspace: "slides" | "look" | "motion" | "export";
  readonly panel: "media" | "stage" | "director";
  readonly focusMode: boolean;
  readonly playheadSeconds: number;
}

export interface DriftAutomationPlatformInput {
  readonly target: "browser-development" | "macos";
  readonly buildChannel: "release" | "v2-dev";
  readonly packaged: boolean;
}

export interface DriftAutomationJobSummary {
  readonly id: string;
  readonly kind: "export" | "still" | "frames" | "video";
  readonly state: "queued" | "running" | "completed" | "cancelled" | "failed";
  readonly progress: number;
}

export interface CreateDriftSelfDescriptionInput {
  readonly project: DriftProjectV4;
  readonly documentRevision: number;
  readonly savedDocumentRevision?: number;
  readonly documentBound?: boolean;
  readonly documentConflict?: boolean;
  readonly selectedAssetId: string | null;
  readonly presentation: DriftPresentationManifestInput;
  readonly platform: DriftAutomationPlatformInput;
  readonly exportCapabilities: ExportCapabilityReport | null;
  readonly jobs: readonly DriftAutomationJobSummary[];
}

const FACTORY_NOW = "2000-01-01T00:00:00.000Z";
const FACTORY_PROJECT = createInitialDriftProjectV4("automation-factory", FACTORY_NOW);
const MOTION_RESET_PROJECT = resetMotion(FACTORY_PROJECT);
const SEQUENCE_RESET_PROJECT = resetSequence(FACTORY_PROJECT);

function plainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Canonical JSON serialization for stable identities and resource equality. */
export function stableAutomationJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Automation manifests require finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableAutomationJson).join(",")}]`;
  if (plainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableAutomationJson(value[key])}`
    )).join(",")}}`;
  }
  throw new TypeError("Automation manifests require plain JSON values.");
}

export function automationIdentity(value: unknown): string {
  const input = stableAutomationJson(value);
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function boundedMachineId(value: string, fallbackHash: string, prefix: string): string {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)
    ? value
    : `${prefix}-${fallbackHash.replace("fnv1a64:", "").slice(0, 16)}`;
}

function boundedReason(value: string): string {
  return value
    .replace(/(?:file:\/\/)?\/(?:Users|home|private|Volumes)\/[^\s]+/gu, "[private path]")
    .replace(/[A-Za-z]:\\[^\s]+/gu, "[private path]")
    .slice(0, 256);
}

function mediaManifest(project: DriftProjectV4): readonly Readonly<Record<string, unknown>>[] {
  const ordered = [...project.media.order];
  for (const id of Object.keys(project.media.assets).sort()) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered.flatMap((id) => {
    const asset = project.media.assets[id];
    if (!asset) return [];
    const contentHash = /^[a-f0-9]{64}$/i.test(asset.hash)
      ? asset.hash.toLowerCase()
      : automationIdentity({ id, byteLength: asset.byteLength });
    return [{
      id: boundedMachineId(id, contentHash, "asset"),
      kind: asset.kind,
      mimeType: /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(asset.mimeType) ? asset.mimeType : "application/octet-stream",
      contentHash,
      byteLength: Math.max(0, Math.trunc(asset.byteLength)),
      width: Math.max(0, Math.trunc(asset.width)),
      height: Math.max(0, Math.trunc(asset.height)),
      ...(asset.duration === undefined ? {} : { duration: Math.max(0, asset.duration) }),
    }];
  });
}

function capabilityManifest(
  platform: DriftAutomationPlatformInput,
  report: ExportCapabilityReport | null,
): Readonly<Record<string, unknown>> {
  return {
    target: platform.target,
    buildChannel: platform.buildChannel,
    packaged: platform.packaged,
    evidenceState: platform.packaged ? "runtime-reported" : "source-runtime-only",
    packageReason: platform.packaged ? null : "not_packaged",
    export: report === null ? {
      state: "unknown",
      reason: "capabilities_not_probed",
    } : {
      state: "probed",
      mp4: {
        supported: report.mp4.supported,
        avc: report.mp4.avc,
        aac: report.mp4.aac,
        presenterAudioFpsSupported: report.mp4.presenterAudioFpsSupported,
        maximumPresenterAudioFps: report.mp4.maximumPresenterAudioFps,
        nativeAacMaximumDurationSeconds: report.mp4.nativeAacMaximumDurationSeconds,
        reasons: report.mp4.reasons.map(boundedReason),
      },
      png: { ...report.png },
      presenter: { ...report.presenter },
      futureStreamTarget: report.futureStreamTarget,
    },
  };
}

/**
 * Generates the one metadata-only truth consumed by both the visible access
 * view and the development MCP adapter. Raw media, names, paths and grants are
 * deliberately absent.
 */
export function createDriftSelfDescription(
  input: CreateDriftSelfDescriptionInput,
) {
  const projectHash = automationIdentity(input.project);
  const factoryProject = FACTORY_PROJECT;
  const media = mediaManifest(input.project);
  const selectedAssetId = input.selectedAssetId;
  const selected = selectedAssetId === null
    ? null
    : media.find((asset) => asset.id === boundedMachineId(selectedAssetId, projectHash, "asset"))?.id ?? null;

  return structuredClone({
    protocol: {
      productId: DRIFT_AUTOMATION_PRODUCT_ID,
      protocolVersion: DRIFT_AUTOMATION_PROTOCOL_VERSION,
      metadataScope: DRIFT_AUTOMATION_METADATA_SCOPE,
      transport: "local-development-in-process",
      mutationAccess: false,
      rawMediaAccess: false,
      build: {
        target: input.platform.target,
        channel: input.platform.buildChannel,
        packaged: input.platform.packaged,
      },
      manifestIds: DRIFT_AUTOMATION_MANIFEST_IDS,
      limits: {
        maximumRequestBytes: 65_536,
        maximumRequestsPerSession: 512,
      },
    },
    vocabulary: {
      projectDomains: PROJECT_DOMAINS,
      commands: STUDIO_COMMAND_REGISTRY.map(({ id, label, workspace, action }) => ({
        id,
        label,
        workspace,
        action,
      })),
    },
    defaults: {
      context: "new-project-and-reset",
      factoryProject,
      resets: [{
        id: "motion",
        context: "factory-project",
        changedPaths: projectV4ChangePaths(factoryProject, MOTION_RESET_PROJECT),
        completeResult: MOTION_RESET_PROJECT,
      }, {
        id: "sequence",
        context: "factory-project",
        changedPaths: projectV4ChangePaths(factoryProject, SEQUENCE_RESET_PROJECT),
        completeResult: SEQUENCE_RESET_PROJECT,
      }],
      outcomeRecipes: OUTCOME_RECIPES.map((recipe) => {
        const completeResult = applyOutcomeRecipe(factoryProject, recipe.id);
        return {
          id: recipe.id,
          label: recipe.label,
          description: recipe.description,
          axisCompatibility: recipe.axisCompatibility,
          ownedDomains: recipe.ownedDomains,
          ownedPaths: recipe.ownedPaths,
          completeDelta: {
            grammar: recipe.grammar,
            motion: recipe.motion,
            timing: recipe.timing,
            sequence: recipe.sequence,
            context: "factory-project",
            changedPaths: projectV4ChangePaths(factoryProject, completeResult),
            resultProject: completeResult,
          },
        };
      }),
    },
    document: {
      productId: DRIFT_AUTOMATION_PRODUCT_ID,
      schema: DRIFT_PROJECT_SCHEMA,
      formatVersion: DRIFT_PROJECT_V4_VERSION,
      id: boundedMachineId(input.project.projectId, projectHash, "project"),
      revision: Math.max(0, Math.trunc(input.documentRevision)),
      persistence: {
        savedRevision: Math.max(0, Math.trunc(input.savedDocumentRevision ?? input.documentRevision)),
        dirty: (input.savedDocumentRevision ?? input.documentRevision) !== input.documentRevision,
        bound: input.documentBound ?? false,
        conflict: input.documentConflict ?? false,
      },
      projectHash,
      renderContract: input.project.renderContract,
      composition: { ...input.project.composition },
      media,
      selectedAssetId: selected,
      timeline: {
        durationSeconds: input.project.master.duration,
        fps: input.project.master.fps,
        loops: input.project.motion.seamless.loops,
        seamless: input.project.motion.seamless.enabled,
      },
      audioIntent: {
        masterEnabled: input.project.master.audio.enabled,
        source: input.project.sound.source,
        previewEnabled: input.project.sound.previewEnabled,
        exportEnabled: input.project.sound.exportEnabled,
        presenterMuted: input.project.presenter.muted,
      },
      diff: {
        state: "not-retained",
        changedPaths: [],
        reason: "saved_project_snapshot_not_retained",
      },
    },
    presentation: {
      ...input.presentation,
      interfaceScale: normalizeInterfaceScale(input.presentation.interfaceScale),
      portableProjectIntent: false,
    },
    capabilities: capabilityManifest(input.platform, input.exportCapabilities),
    jobs: {
      activeCount: input.jobs.filter((job) => job.state === "queued" || job.state === "running").length,
      items: input.jobs.slice(0, 32).map((job) => ({
        id: boundedMachineId(job.id, automationIdentity(job), "job"),
        kind: job.kind,
        state: job.state,
        progress: Math.max(0, Math.min(1, job.progress)),
      })),
    },
  });
}

export type DriftAutomationManifests = ReturnType<typeof createDriftSelfDescription>;
