import {
  DRIFT_AUTOMATION_MANIFEST_IDS,
  automationIdentity,
  type DriftAutomationManifestId,
  type DriftAutomationManifests,
} from "./selfDescription";

export type DriftAutomationResourceUri = `drift://manifest/${DriftAutomationManifestId}`;

export interface DriftAutomationResourceDescriptor {
  readonly uri: DriftAutomationResourceUri;
  readonly id: DriftAutomationManifestId;
  readonly name: string;
  readonly mimeType: "application/json";
}

export interface ProductAutomationService {
  readonly snapshotIdentity: string;
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
    listResources: () => resources,
    readResource: (uri: string) => {
      if (!uri.startsWith(RESOURCE_PREFIX)) throw new RangeError("Unknown Drift automation resource.");
      return getManifest(uri.slice(RESOURCE_PREFIX.length));
    },
    getManifest,
  });
}
