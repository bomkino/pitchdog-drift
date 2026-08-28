import type { ExportJobController, ExportJobReceipt, ExportJobStatus } from "../export/exportJobController";
import type {
  ExportFormatId,
  GuidedExportCompletion,
  GuidedExportPreflight,
  GuidedExportRunRequest,
  PngFramesDestination,
} from "../export/guidedExport";

export const DRIFT_AUTOMATION_EXPORT_SCOPE = "export-jobs" as const;

export interface AutomationExportChoice {
  readonly format: Extract<ExportFormatId, "h264-mp4" | "png-frames">;
  readonly pngDestination: PngFramesDestination;
  readonly audioConsequenceAcknowledged: boolean;
}

export interface AutomationExportReservationHooks {
  beforeReservation(): void;
  onReserved(jobId: string): void;
}

export interface AutomationExportAuthority {
  readonly jobs: ExportJobController;
  preflight(choice: AutomationExportChoice): {
    readonly request: GuidedExportRunRequest;
    readonly preflight: GuidedExportPreflight;
  };
  run(
    request: GuidedExportRunRequest,
    hooks: AutomationExportReservationHooks,
  ): Promise<GuidedExportCompletion | null>;
}

export type AutomationExportRequestState =
  | "awaiting-destination"
  | "running"
  | "completed"
  | "canceled"
  | "failed";

export interface AutomationExportRequestStatus {
  readonly id: string;
  readonly reconnectToken: string;
  readonly state: AutomationExportRequestState;
  readonly jobId: string | null;
  readonly format: AutomationExportChoice["format"];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly failureCode: "preflight_blocked" | "destination_unavailable" | null;
  readonly job: ExportJobStatus | null;
}

export class AutomationExportError extends Error {
  readonly code: "invalid_request" | "scope_required" | "preflight_blocked" | "unknown_request" | "invalid_token" | "request_limit";

  constructor(code: AutomationExportError["code"], message: string) {
    super(message);
    this.name = "AutomationExportError";
    this.code = code;
  }
}

export interface ProductAutomationExportService {
  preflight(choice: AutomationExportChoice): GuidedExportPreflight;
  start(choice: AutomationExportChoice): AutomationExportRequestStatus;
  status(id: string, reconnectToken: string): AutomationExportRequestStatus;
  cancel(id: string, reconnectToken: string): AutomationExportRequestStatus;
  receipt(id: string, reconnectToken: string): ExportJobReceipt | null;
}

interface StoredRequest {
  readonly id: string;
  readonly reconnectToken: string;
  readonly choice: AutomationExportChoice;
  state: AutomationExportRequestState;
  jobId: string | null;
  readonly createdAt: string;
  updatedAt: string;
  failureCode: AutomationExportRequestStatus["failureCode"];
}

const MAXIMUM_REQUESTS = 20;

function machineValue(value: string, label: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) {
    throw new AutomationExportError("invalid_request", `${label} is invalid.`);
  }
  return value;
}

function validateChoice(choice: AutomationExportChoice): AutomationExportChoice {
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
    throw new AutomationExportError("invalid_request", "Automation export choice must be an object.");
  }
  const keys = Object.keys(choice).sort();
  if (keys.join(",") !== "audioConsequenceAcknowledged,format,pngDestination"
    || (choice.format !== "h264-mp4" && choice.format !== "png-frames")
    || (choice.pngDestination !== "directory" && choice.pngDestination !== "zip")
    || typeof choice.audioConsequenceAcknowledged !== "boolean") {
    throw new AutomationExportError("invalid_request", "Automation export choice is invalid.");
  }
  return Object.freeze({ ...choice });
}

export function createProductAutomationExportService(
  authority: AutomationExportAuthority,
  options: {
    readonly now?: () => string;
    readonly issueId?: (kind: "request" | "token") => string;
  } = {},
): ProductAutomationExportService {
  const now = options.now ?? (() => new Date().toISOString());
  const issueId = options.issueId ?? ((kind) => `${kind}-${globalThis.crypto.randomUUID()}`);
  const requests = new Map<string, StoredRequest>();

  function requireRequest(id: string, token: string): StoredRequest {
    const stored = requests.get(id);
    if (!stored) throw new AutomationExportError("unknown_request", "Automation export request is unknown.");
    if (stored.reconnectToken !== token) {
      throw new AutomationExportError("invalid_token", "Automation export reconnect token is invalid.");
    }
    return stored;
  }

  function publicStatus(stored: StoredRequest): AutomationExportRequestStatus {
    const job = stored.jobId ? authority.jobs.getStatus(stored.jobId) : null;
    const state = job?.state === "completed" ? "completed"
      : job?.state === "canceled" || job?.state === "canceling" ? "canceled"
        : job?.state === "failed" ? "failed"
          : job?.state === "running" ? "running"
            : stored.state;
    return structuredClone({
      id: stored.id,
      reconnectToken: stored.reconnectToken,
      state,
      jobId: stored.jobId,
      format: stored.choice.format,
      createdAt: stored.createdAt,
      updatedAt: job?.updatedAt ?? stored.updatedAt,
      failureCode: stored.failureCode,
      job,
    });
  }

  function preflight(choice: AutomationExportChoice): GuidedExportPreflight {
    return structuredClone(authority.preflight(validateChoice(choice)).preflight);
  }

  function start(choiceInput: AutomationExportChoice): AutomationExportRequestStatus {
    const choice = validateChoice(choiceInput);
    const prepared = authority.preflight(choice);
    if (!prepared.preflight.canStart) {
      throw new AutomationExportError("preflight_blocked", "Automation export is blocked by Guided Export preflight.");
    }
    if (requests.size >= MAXIMUM_REQUESTS) {
      for (const [id, stored] of requests) {
        if (stored.state === "awaiting-destination" || stored.state === "running") continue;
        requests.delete(id);
      }
    }
    if (requests.size >= MAXIMUM_REQUESTS) {
      throw new AutomationExportError("request_limit", "Automation export request history is full for this app session.");
    }
    const createdAt = now();
    const stored: StoredRequest = {
      id: machineValue(issueId("request"), "Automation export request id"),
      reconnectToken: machineValue(issueId("token"), "Automation export reconnect token"),
      choice,
      state: "awaiting-destination",
      jobId: null,
      createdAt,
      updatedAt: createdAt,
      failureCode: null,
    };
    requests.set(stored.id, stored);
    void authority.run(prepared.request, {
      beforeReservation: () => {
        if (stored.state === "canceled") {
          throw new DOMException("Automation export request was canceled.", "AbortError");
        }
      },
      onReserved: (jobId) => {
        if (stored.state === "canceled") {
          authority.jobs.cancel(jobId);
          return;
        }
        stored.jobId = jobId;
        stored.state = "running";
        stored.updatedAt = now();
      },
    }).then((completion) => {
      if (stored.state === "canceled") return;
      if (completion) {
        stored.jobId = completion.snapshotId;
        stored.state = "completed";
      } else if (stored.jobId) {
        const job = authority.jobs.getStatus(stored.jobId);
        stored.state = job?.state === "canceled" || job?.state === "canceling" ? "canceled" : "failed";
      } else {
        stored.state = "failed";
        stored.failureCode = "destination_unavailable";
      }
      stored.updatedAt = now();
    }).catch(() => {
      if (stored.state === "canceled") return;
      stored.state = "failed";
      stored.failureCode = stored.jobId ? null : "destination_unavailable";
      stored.updatedAt = now();
    });
    return publicStatus(stored);
  }

  return Object.freeze({
    preflight,
    start,
    status: (id: string, token: string) => publicStatus(requireRequest(id, token)),
    cancel: (id: string, token: string) => {
      const stored = requireRequest(id, token);
      if (stored.state === "awaiting-destination") {
        stored.state = "canceled";
        stored.updatedAt = now();
      } else if (stored.jobId) {
        authority.jobs.cancel(stored.jobId);
        stored.state = "canceled";
        stored.updatedAt = now();
      }
      return publicStatus(stored);
    },
    receipt: (id: string, token: string) => {
      const stored = requireRequest(id, token);
      return stored.jobId ? authority.jobs.getReceipt(stored.jobId) : null;
    },
  });
}
