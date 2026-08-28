import {
  DRIFT_AUTOMATION_MANIFEST_IDS,
  automationIdentity,
  type DriftAutomationManifestId,
  type DriftAutomationManifests,
} from "./selfDescription";
import {
  createProductAutomationMutationService,
  type AutomationMutationServiceOptions,
  type ProductAutomationMutationService,
} from "./productAutomationMutation";
import type { ProductAutomationPreviewService } from "./productAutomationPreview";
import type { ProductAutomationExportService } from "./productAutomationExport";

export type DriftAutomationResourceUri = `drift://manifest/${DriftAutomationManifestId}`;

export interface DriftAutomationResourceDescriptor {
  readonly uri: DriftAutomationResourceUri;
  readonly id: DriftAutomationManifestId;
  readonly name: string;
  readonly mimeType: "application/json";
}

export interface ProductAutomationService {
  readonly snapshotIdentity: string;
  readonly mutation: ProductAutomationMutationService | null;
  readonly preview: ProductAutomationPreviewService | null;
  readonly exports: ProductAutomationExportService | null;
  listResources(): readonly DriftAutomationResourceDescriptor[];
  readResource(uri: string): unknown;
  getManifest(id: string): unknown;
}

const RESOURCE_PREFIX = "drift://manifest/";
const RESOURCE_NAMES: Readonly<Record<DriftAutomationManifestId, string>> = Object.freeze({
  protocol: "Protocol and scope",
  vocabulary: "Product vocabulary",
  defaults: "Defaults and recipes",
  document: "Current document metadata",
  presentation: "Current presentation state",
  capabilities: "Runtime capabilities",
  jobs: "Job summaries",
});

function isManifestId(value: string): value is DriftAutomationManifestId {
  return DRIFT_AUTOMATION_MANIFEST_IDS.includes(value as DriftAutomationManifestId);
}

export function createProductAutomationService(
  manifests: DriftAutomationManifests,
  mutationOptions?: AutomationMutationServiceOptions | ProductAutomationMutationService,
  previewService?: ProductAutomationPreviewService,
  exportService?: ProductAutomationExportService,
): ProductAutomationService {
  const snapshot = structuredClone(manifests);
  const resources = Object.freeze(DRIFT_AUTOMATION_MANIFEST_IDS.map((id) => Object.freeze({
    uri: `${RESOURCE_PREFIX}${id}` as DriftAutomationResourceUri,
    id,
    name: RESOURCE_NAMES[id],
    mimeType: "application/json" as const,
  })));

  function getManifest(id: string): unknown {
    if (!isManifestId(id)) throw new RangeError(`Unknown Drift automation manifest: ${id}.`);
    return structuredClone(snapshot[id]);
  }

  return Object.freeze({
    snapshotIdentity: automationIdentity(snapshot),
    mutation: mutationOptions
      ? "plan" in mutationOptions
        ? mutationOptions
        : createProductAutomationMutationService(snapshot, mutationOptions)
      : null,
    preview: previewService ?? null,
    exports: exportService ?? null,
    listResources: () => resources,
    readResource: (uri: string) => {
      if (!uri.startsWith(RESOURCE_PREFIX)) throw new RangeError("Unknown Drift automation resource.");
      return getManifest(uri.slice(RESOURCE_PREFIX.length));
    },
    getManifest,
  });
}
