import {
  beginProjectSave,
  completeProjectSave,
  type ProjectRevisionState,
  type ProjectSaveTicket,
} from "../core/project/revisions";
import type {
  DesktopDocumentFailure,
  DesktopDocumentOpenReceipt,
  DesktopDocumentRevertResult,
  DesktopDocumentSaveReceipt,
  DesktopPlatform,
  DesktopPlatformDocuments,
  DesktopPlatformResult,
} from "./desktopPlatform";
import {
  createInterfaceScalePreferenceStore,
  type InterfaceScalePreferenceStore,
} from "./interfaceScale";

const LINUX_PROTOCOL = "dog.pitch.drift/desktop-platform/1";
const MAX_PROJECT_BYTES = 512 * 1024 * 1024;

export interface LinuxDesktopMarker {
  readonly bridgeVersion: 1;
  readonly platform: "Linux";
  readonly target: "linux-electron-tracer";
  readonly protocol: typeof LINUX_PROTOCOL;
  readonly sandboxed: true;
  readonly contextIsolated: true;
  readonly nodeIntegration: false;
  readonly genericAuthority: false;
}

type LinuxBridgeReply<T> =
  | Readonly<{ requestId: string; status: "completed"; value: T }>
  | Readonly<{ requestId: string; status: "cancelled" }>
  | Readonly<{
    requestId: string;
    status: "failed";
    failure: Readonly<{ code: string; message: string }>;
  }>;

export interface LinuxDesktopBridge {
  readonly marker: LinuxDesktopMarker;
  choosePortableProject(): Promise<LinuxBridgeReply<Readonly<{
    grantId: string;
    name: string;
    mimeType: string;
    bytes: Uint8Array;
  }>>>;
  finalizePortableProjectOpen(grantId: string): Promise<LinuxBridgeReply<DesktopDocumentOpenReceipt>>;
  abandonPortableProjectOpen(grantId: string): Promise<LinuxBridgeReply<Readonly<{ abandoned: true }>>>;
  savePortableProject(request: Readonly<{
    operation: "save" | "save-as";
    transactionId: string;
    ticket: ProjectSaveTicket;
    bytes: Uint8Array;
    suggestedName: string;
  }>): Promise<LinuxBridgeReply<DesktopDocumentSaveReceipt>>;
  revertPortableProject(expectedSha256: string): Promise<LinuxBridgeReply<Readonly<{
    bytes: Uint8Array;
    receipt: DesktopDocumentRevertResult["receipt"];
  }>>>;
}

const FAILURE_CODES = new Set<DesktopDocumentFailure["code"]>([
  "grant_expired",
  "permission_denied",
  "invalid_request",
  "unsupported_capability",
  "resource_limit",
  "not_found",
  "conflict",
  "corrupt_input",
  "verification_failed",
  "host_unavailable",
  "internal_error",
]);

function failed(
  operation: DesktopDocumentFailure["operation"],
  code: DesktopDocumentFailure["code"],
  message: string,
): DesktopPlatformResult<never> {
  return Object.freeze({
    status: "failed" as const,
    failure: Object.freeze({ operation, code, message }),
  });
}

function replyResult<T>(
  operation: DesktopDocumentFailure["operation"],
  reply: LinuxBridgeReply<T>,
): DesktopPlatformResult<T> {
  if (!reply || typeof reply !== "object") {
    return failed(operation, "verification_failed", "Linux host returned an invalid reply.");
  }
  if (reply.status === "cancelled") return Object.freeze({ status: "cancelled" as const });
  if (reply.status === "failed") {
    if (!reply.failure || typeof reply.failure !== "object") {
      return failed(operation, "verification_failed", "Linux host returned an invalid failure reply.");
    }
    const code = FAILURE_CODES.has(reply.failure.code as DesktopDocumentFailure["code"])
      ? reply.failure.code as DesktopDocumentFailure["code"]
      : "internal_error";
    const message = typeof reply.failure.message === "string"
      ? reply.failure.message
        .replace(/(?:file:\/\/)?\/(?:Users|home|private|Volumes|tmp)\/[^\s]+/gu, "[private path]")
        .replace(/[A-Za-z]:\\[^\s]+/gu, "[private path]")
        .replace(/\b(?:token|grant|secret|credential)=[^\s]+/giu, "[private value]")
        .slice(0, 256)
      : "Linux document operation failed.";
    return failed(operation, code, message);
  }
  if (reply.status !== "completed") {
    return failed(operation, "verification_failed", "Linux host returned an unknown reply state.");
  }
  return Object.freeze({ status: "completed" as const, value: reply.value });
}

function validMarker(value: unknown): value is LinuxDesktopMarker {
  if (!value || typeof value !== "object") return false;
  const marker = value as Partial<LinuxDesktopMarker>;
  return marker.bridgeVersion === 1
    && marker.platform === "Linux"
    && marker.target === "linux-electron-tracer"
    && marker.protocol === LINUX_PROTOCOL
    && marker.sandboxed === true
    && marker.contextIsolated === true
    && marker.nodeIntegration === false
    && marker.genericAuthority === false;
}

export function isLinuxElectronRuntime(
  candidate: unknown = typeof window === "undefined" ? undefined : window.__DRIFT_LINUX_DESKTOP__,
): candidate is LinuxDesktopBridge {
  if (!candidate || typeof candidate !== "object") return false;
  const bridge = candidate as Partial<LinuxDesktopBridge>;
  return validMarker(bridge.marker)
    && typeof bridge.choosePortableProject === "function"
    && typeof bridge.finalizePortableProjectOpen === "function"
    && typeof bridge.abandonPortableProjectOpen === "function"
    && typeof bridge.savePortableProject === "function"
    && typeof bridge.revertPortableProject === "function";
}

function portableBytes(value: unknown): Uint8Array | null {
  const bytes = value instanceof Uint8Array
    ? new Uint8Array(value)
    : value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : null;
  return bytes && bytes.byteLength > 0 && bytes.byteLength <= MAX_PROJECT_BYTES ? bytes : null;
}

export function createLinuxElectronDesktopPlatform(
  bridge: LinuxDesktopBridge,
  interfaceScale: InterfaceScalePreferenceStore = createInterfaceScalePreferenceStore(),
): DesktopPlatform {
  if (!isLinuxElectronRuntime(bridge)) {
    throw new DOMException("Linux desktop bridge identity is invalid.", "SecurityError");
  }
  const selectionGrants = new WeakMap<File, string>();
  const issuedSaveReceipts = new WeakMap<object, DesktopDocumentSaveReceipt>();
  let pendingGrant: string | null = null;

  const documents: DesktopPlatformDocuments = {
      choosePortableProject: async () => {
        const result = replyResult("choose", await bridge.choosePortableProject());
        if (result.status !== "completed") return result;
        const bytes = portableBytes(result.value.bytes);
        if (!bytes
          || typeof result.value.grantId !== "string"
          || !/^drift-grant-[a-f0-9-]{36}$/u.test(result.value.grantId)
          || typeof result.value.name !== "string"
          || result.value.name.length > 180
          || result.value.mimeType !== "application/vnd.pitchdog.pitched+zip") {
          return failed("choose", "verification_failed", "Linux picker returned invalid project authority.");
        }
        const file = new File([Uint8Array.from(bytes).buffer], result.value.name, {
          type: "application/vnd.pitchdog.pitched+zip",
        });
        pendingGrant = result.value.grantId;
        selectionGrants.set(file, result.value.grantId);
        return Object.freeze({ status: "completed" as const, value: Object.freeze({ file }) });
      },

      finalizePortableProjectOpen: async (file) => {
        const grantId = selectionGrants.get(file);
        if (!grantId || grantId !== pendingGrant) {
          return failed("open", "grant_expired", "Linux project authority expired. Choose the project again.");
        }
        const result = replyResult("open", await bridge.finalizePortableProjectOpen(grantId));
        if (result.status === "completed") {
          pendingGrant = null;
          selectionGrants.delete(file);
          if (result.value.byteLength !== file.size
            || !/^[a-f0-9]{64}$/u.test(result.value.sha256)
            || !result.value.readbackVerified
            || !result.value.bound
            || result.value.conflict !== false) {
            return failed("open", "verification_failed", "Linux Open receipt did not match the selected project.");
          }
        }
        return result;
      },

      abandonPortableProjectOpen: async () => {
        const grantId = pendingGrant;
        pendingGrant = null;
        if (grantId) await bridge.abandonPortableProjectOpen(grantId);
      },

      preparePortableProjectSave: (revisions) => {
        const started = beginProjectSave(revisions);
        return Object.freeze({ revisions: started.state, ticket: started.ticket });
      },

      savePortableProject: async (request) => {
        if (!request.ticket) {
          return failed(request.operation, "invalid_request", "Linux project Save requires a revision ticket.");
        }
        const result = replyResult(request.operation, await bridge.savePortableProject({
          operation: request.operation,
          transactionId: request.transactionId,
          ticket: request.ticket,
          bytes: new Uint8Array(await request.blob.arrayBuffer()),
          suggestedName: request.suggestedName,
        }));
        if (result.status !== "completed") return result;
        const receipt = result.value;
        if (receipt.operation !== request.operation
          || receipt.transactionId !== request.transactionId
          || receipt.sequence !== request.ticket.sequence
          || receipt.revision !== request.ticket.revision
          || receipt.byteLength !== request.blob.size
          || !/^[a-f0-9]{64}$/u.test(receipt.sha256)
          || !receipt.bound
          || !receipt.readbackVerified
          || receipt.conflict !== false) {
          return failed(request.operation, "verification_failed", "Linux Save receipt did not match the requested transaction.");
        }
        issuedSaveReceipts.set(receipt, receipt);
        return result;
      },

      completePortableProjectSave: (revisions, ticket, receipt) => {
        const issued = issuedSaveReceipts.get(receipt);
        if (!ticket || issued !== receipt
          || receipt.sequence !== ticket.sequence
          || receipt.revision !== ticket.revision) {
          throw new DOMException("Linux document save receipt is invalid.", "DataError");
        }
        issuedSaveReceipts.delete(receipt);
        return completeProjectSave(revisions, ticket);
      },

      revertPortableProject: async (request) => {
        const result = replyResult("revert", await bridge.revertPortableProject(request.expectedSha256));
        if (result.status !== "completed") return result;
        const bytes = portableBytes(result.value.bytes);
        if (!bytes
          || result.value.receipt.sha256 !== request.expectedSha256
          || result.value.receipt.byteLength !== bytes.byteLength
          || !result.value.receipt.readbackVerified
          || !result.value.receipt.bound
          || result.value.receipt.conflict !== false) {
          return failed("revert", "verification_failed", "Linux Revert receipt did not match the bound project.");
        }
        return Object.freeze({
          status: "completed" as const,
          value: Object.freeze({
            blob: new Blob([Uint8Array.from(bytes).buffer], { type: "application/vnd.pitchdog.pitched+zip" }),
            receipt: result.value.receipt,
          }),
        });
      },
  };
  const platform: DesktopPlatform = {
    target: "linux-electron" as const,
    documents: Object.freeze(documents),
    presentation: Object.freeze({ interfaceScale }),
  };
  return Object.freeze(platform);
}
