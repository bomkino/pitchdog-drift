import type { ProjectRevisionState } from "../project/revisions";
import type { DriftProjectV4 } from "../project/schema";
import { automationIdentity } from "./selfDescription";

export const DRIFT_AUTOMATION_PREVIEW_SCOPE = "bounded-preview" as const;
export const AUTOMATION_PREVIEW_LIMITS = Object.freeze({
  minimumDimension: 64,
  maximumDimension: 1_024,
  maximumPixels: 1_048_576,
  maximumBytes: 2_000_000,
  maximumLifetimeMs: 60_000,
  maximumRetained: 16,
});

export interface AutomationPreviewSnapshot {
  readonly project: DriftProjectV4;
  readonly revisions: ProjectRevisionState;
  readonly documentId: string;
  readonly scopes: readonly string[];
}

export interface AutomationPreviewRenderInput {
  readonly project: DriftProjectV4;
  readonly width: number;
  readonly height: number;
  readonly timeSeconds: number;
  readonly signal: AbortSignal;
}

export interface AutomationPreviewAuthority {
  read(): AutomationPreviewSnapshot;
  render(input: AutomationPreviewRenderInput): Promise<{
    readonly mimeType: "image/png";
    readonly bytes: Uint8Array;
  }>;
}

export type AutomationPreviewErrorCode =
  | "scope_required"
  | "invalid_request"
  | "preview_busy"
  | "preview_limit"
  | "unknown_preview"
  | "requester_changed"
  | "preview_unavailable";

export class AutomationPreviewError extends Error {
  readonly code: AutomationPreviewErrorCode;

  constructor(code: AutomationPreviewErrorCode, message: string) {
    super(message);
    this.name = "AutomationPreviewError";
    this.code = code;
  }
}

export type AutomationPreviewState =
  | "running"
  | "completed"
  | "cancelled"
  | "failed"
  | "expired";

export interface AutomationPreviewStatus {
  readonly id: string;
  readonly requesterIdentity: string;
  readonly state: AutomationPreviewState;
  readonly documentId: string;
  readonly projectHash: string;
  readonly revision: number;
  readonly width: number;
  readonly height: number;
  readonly timeSeconds: number;
  readonly byteLength: number | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly failureCode: "render_failed" | "byte_limit" | null;
}

export interface AutomationPreviewResult {
  readonly status: AutomationPreviewStatus;
  readonly mimeType: "image/png";
  readonly bytes: Uint8Array;
}

export interface ProductAutomationPreviewService {
  start(input: {
    readonly requesterIdentity: string;
    readonly width: number;
    readonly height: number;
    readonly timeSeconds: number;
    readonly maximumBytes?: number;
    readonly expiresInMs?: number;
  }): AutomationPreviewStatus;
  status(id: string, requesterIdentity: string): AutomationPreviewStatus;
  result(id: string, requesterIdentity: string): AutomationPreviewResult | null;
  cancel(id: string, requesterIdentity: string): AutomationPreviewStatus;
  revokeRequester(requesterIdentity: string): void;
}

interface StoredPreview {
  status: AutomationPreviewStatus;
  readonly controller: AbortController;
  bytes: Uint8Array | null;
}

function machineValue(value: string, label: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) {
    throw new AutomationPreviewError("invalid_request", `${label} is invalid.`);
  }
  return value;
}

function finiteInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new AutomationPreviewError("invalid_request", `${label} must be a safe integer.`);
  }
  return value;
}

function cloneStatus(status: AutomationPreviewStatus): AutomationPreviewStatus {
  return structuredClone(status);
}

export function createProductAutomationPreviewService(
  authority: AutomationPreviewAuthority,
  options: {
    readonly now?: () => string;
    readonly issueId?: () => string;
  } = {},
): ProductAutomationPreviewService {
  const now = options.now ?? (() => new Date().toISOString());
  const issueId = options.issueId ?? (() => `preview-${globalThis.crypto.randomUUID()}`);
  const retained = new Map<string, StoredPreview>();

  function expire(stored: StoredPreview): void {
    if (stored.status.state === "expired") return;
    if (Date.parse(now()) < Date.parse(stored.status.expiresAt)) return;
    if (stored.status.state === "running") stored.controller.abort();
    stored.bytes = null;
    stored.status = Object.freeze({ ...stored.status, state: "expired", byteLength: null });
  }

  function requireStored(id: string, requesterIdentity: string): StoredPreview {
    const stored = retained.get(id);
    if (!stored) throw new AutomationPreviewError("unknown_preview", "Automation preview is unknown.");
    if (stored.status.requesterIdentity !== requesterIdentity) {
      throw new AutomationPreviewError("requester_changed", "Automation preview belongs to another client session.");
    }
    expire(stored);
    return stored;
  }

  function start(input: {
    readonly requesterIdentity: string;
    readonly width: number;
    readonly height: number;
    readonly timeSeconds: number;
    readonly maximumBytes?: number;
    readonly expiresInMs?: number;
  }): AutomationPreviewStatus {
    const requesterIdentity = machineValue(input.requesterIdentity, "Automation preview requester");
    const width = finiteInteger(input.width, "Automation preview width");
    const height = finiteInteger(input.height, "Automation preview height");
    if (width < AUTOMATION_PREVIEW_LIMITS.minimumDimension
      || height < AUTOMATION_PREVIEW_LIMITS.minimumDimension
      || width > AUTOMATION_PREVIEW_LIMITS.maximumDimension
      || height > AUTOMATION_PREVIEW_LIMITS.maximumDimension
      || width * height > AUTOMATION_PREVIEW_LIMITS.maximumPixels) {
      throw new AutomationPreviewError("preview_limit", "Automation preview dimensions exceed the bounded preview budget.");
    }
    if (!Number.isFinite(input.timeSeconds) || input.timeSeconds < 0) {
      throw new AutomationPreviewError("invalid_request", "Automation preview time must be finite and non-negative.");
    }
    const maximumBytes = finiteInteger(
      input.maximumBytes ?? AUTOMATION_PREVIEW_LIMITS.maximumBytes,
      "Automation preview byte budget",
    );
    if (maximumBytes <= 0 || maximumBytes > AUTOMATION_PREVIEW_LIMITS.maximumBytes) {
      throw new AutomationPreviewError("preview_limit", "Automation preview byte budget exceeds the allowed limit.");
    }
    const expiresInMs = finiteInteger(input.expiresInMs ?? 30_000, "Automation preview lifetime");
    if (expiresInMs <= 0 || expiresInMs > AUTOMATION_PREVIEW_LIMITS.maximumLifetimeMs) {
      throw new AutomationPreviewError("preview_limit", "Automation preview lifetime exceeds the allowed limit.");
    }

    const snapshot = authority.read();
    if (!snapshot.scopes.includes(DRIFT_AUTOMATION_PREVIEW_SCOPE)) {
      throw new AutomationPreviewError("scope_required", "Automation bounded-preview scope is not enabled.");
    }
    if (input.timeSeconds > snapshot.project.master.duration) {
      throw new AutomationPreviewError("invalid_request", "Automation preview time exceeds the current Project duration.");
    }
    if ([...retained.values()].some((stored) => {
      expire(stored);
      return stored.status.state === "running";
    })) {
      throw new AutomationPreviewError("preview_busy", "Another automation preview is already rendering.");
    }
    for (const [id, stored] of retained) {
      expire(stored);
      if (stored.status.state === "expired") retained.delete(id);
    }
    if (retained.size >= AUTOMATION_PREVIEW_LIMITS.maximumRetained) {
      throw new AutomationPreviewError("preview_limit", "Automation preview retention limit is reached.");
    }

    const createdAt = now();
    const id = machineValue(issueId(), "Automation preview id");
    const controller = new AbortController();
    const status: AutomationPreviewStatus = Object.freeze({
      id,
      requesterIdentity,
      state: "running",
      documentId: snapshot.documentId,
      projectHash: automationIdentity(snapshot.project),
      revision: snapshot.revisions.currentRevision,
      width,
      height,
      timeSeconds: input.timeSeconds,
      byteLength: null,
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + expiresInMs).toISOString(),
      failureCode: null,
    });
    const stored: StoredPreview = { status, controller, bytes: null };
    retained.set(id, stored);
    void authority.render({
      project: structuredClone(snapshot.project),
      width,
      height,
      timeSeconds: input.timeSeconds,
      signal: controller.signal,
    }).then((result) => {
      if (stored.status.state !== "running" || controller.signal.aborted) return;
      if (result.mimeType !== "image/png" || !(result.bytes instanceof Uint8Array)) {
        throw new AutomationPreviewError("preview_unavailable", "Automation preview renderer returned an invalid payload.");
      }
      if (result.bytes.byteLength > maximumBytes) {
        stored.status = Object.freeze({ ...stored.status, state: "failed", failureCode: "byte_limit" });
        return;
      }
      stored.bytes = result.bytes.slice();
      stored.status = Object.freeze({
        ...stored.status,
        state: "completed",
        byteLength: stored.bytes.byteLength,
      });
      expire(stored);
    }).catch(() => {
      if (stored.status.state !== "running" || controller.signal.aborted) return;
      stored.bytes = null;
      stored.status = Object.freeze({ ...stored.status, state: "failed", failureCode: "render_failed" });
    });
    return cloneStatus(status);
  }

  function cancel(id: string, requesterIdentity: string): AutomationPreviewStatus {
    const stored = requireStored(id, requesterIdentity);
    if (stored.status.state !== "running") return cloneStatus(stored.status);
    stored.controller.abort();
    stored.bytes = null;
    stored.status = Object.freeze({ ...stored.status, state: "cancelled", byteLength: null });
    return cloneStatus(stored.status);
  }

  return Object.freeze({
    start,
    status: (id: string, requesterIdentity: string) => cloneStatus(requireStored(id, requesterIdentity).status),
    result: (id: string, requesterIdentity: string): AutomationPreviewResult | null => {
      const stored = requireStored(id, requesterIdentity);
      if (stored.status.state !== "completed" || !stored.bytes) return null;
      return {
        status: cloneStatus(stored.status),
        mimeType: "image/png" as const,
        bytes: stored.bytes.slice(),
      };
    },
    cancel,
    revokeRequester: (requesterIdentity: string) => {
      for (const stored of retained.values()) {
        if (stored.status.requesterIdentity !== requesterIdentity) continue;
        if (stored.status.state === "running") stored.controller.abort();
        stored.bytes = null;
        stored.status = Object.freeze({ ...stored.status, state: "expired", byteLength: null });
      }
    },
  });
}
