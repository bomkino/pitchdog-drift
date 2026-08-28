import {
  beginProjectSave,
  type ProjectRevisionState,
  type ProjectSaveTicket,
} from "../core/project/revisions";
import { sanitizeFilename } from "./assets";
import {
  createInterfaceScalePreferenceStore,
  type InterfaceScalePreferenceStore,
} from "./interfaceScale";
import {
  createLinuxElectronDesktopPlatform,
  isLinuxElectronRuntime,
} from "./linuxElectron";
import {
  abandonNativeMacDocumentOpen,
  completeNativeMacDocumentSave,
  confirmNativeMacDocumentOpen,
  isNativeMacRuntime,
  pickNativeMacFiles,
  revertNativeMacDocument,
  saveNativeMacDocument,
  saveNativeMacDocumentAs,
  sha256NativeDocumentBlob,
  type NativeMacDocumentReceipt,
} from "./nativeMac";

export type DesktopPlatformTarget = "browser-development" | "macos" | "linux-electron";
export type DesktopDocumentOperation = "choose" | "open" | "save" | "save-as" | "revert";
export type DesktopDocumentFailureCode =
  | "grant_expired"
  | "permission_denied"
  | "invalid_request"
  | "unsupported_capability"
  | "resource_limit"
  | "not_found"
  | "conflict"
  | "corrupt_input"
  | "verification_failed"
  | "host_unavailable"
  | "internal_error";

export interface DesktopDocumentFailure {
  readonly code: DesktopDocumentFailureCode;
  readonly operation: DesktopDocumentOperation;
  readonly message: string;
}

export type DesktopPlatformResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "failed"; failure: DesktopDocumentFailure }>;

export interface DesktopPortableProjectSelection {
  readonly file: File;
}

export interface DesktopDocumentOpenReceipt {
  readonly sha256: string;
  readonly byteLength: number;
  readonly bound: boolean;
  readonly conflict: false;
  readonly readbackVerified: boolean;
}

export interface DesktopDocumentSaveReceipt {
  readonly operation: "save" | "save-as";
  readonly transactionId: string;
  readonly sequence: number | null;
  readonly revision: number | null;
  readonly sha256: string;
  readonly byteLength: number;
  readonly bound: boolean;
  readonly conflict: false;
  readonly readbackVerified: boolean;
}

export interface DesktopDocumentRevertReceipt {
  readonly operation: "revert";
  readonly transactionId: string;
  readonly sequence: null;
  readonly revision: null;
  readonly sha256: string;
  readonly byteLength: number;
  readonly bound: true;
  readonly conflict: false;
  readonly readbackVerified: true;
}

export interface DesktopDocumentRevertResult {
  readonly receipt: DesktopDocumentRevertReceipt;
  readonly blob: Blob;
}

export interface DesktopDocumentSavePreparation {
  readonly revisions: ProjectRevisionState;
  readonly ticket: ProjectSaveTicket | null;
}

export interface DesktopDocumentSaveRequest {
  readonly operation: "save" | "save-as";
  readonly transactionId: string;
  readonly ticket: ProjectSaveTicket | null;
  readonly blob: Blob;
  readonly suggestedName: string;
}

export interface DesktopPlatformDocuments {
  choosePortableProject(): Promise<DesktopPlatformResult<DesktopPortableProjectSelection>>;
  finalizePortableProjectOpen(file: File): Promise<DesktopPlatformResult<DesktopDocumentOpenReceipt>>;
  abandonPortableProjectOpen(): Promise<void>;
  preparePortableProjectSave(revisions: ProjectRevisionState): DesktopDocumentSavePreparation;
  savePortableProject(
    request: DesktopDocumentSaveRequest,
  ): Promise<DesktopPlatformResult<DesktopDocumentSaveReceipt>>;
  completePortableProjectSave(
    revisions: ProjectRevisionState,
    ticket: ProjectSaveTicket | null,
    receipt: DesktopDocumentSaveReceipt,
  ): ProjectRevisionState;
  revertPortableProject(request: {
    readonly transactionId: string;
    readonly expectedSha256: string;
  }): Promise<DesktopPlatformResult<DesktopDocumentRevertResult>>;
}

export interface DesktopPlatform {
  readonly target: DesktopPlatformTarget;
  readonly documents: DesktopPlatformDocuments;
  readonly presentation: DesktopPlatformPresentation;
}

export interface DesktopPlatformPresentation {
  readonly interfaceScale: InterfaceScalePreferenceStore;
}

export interface BrowserDesktopDocumentHost {
  choosePortableProject(): Promise<File | null>;
  publishPortableProject(blob: Blob, suggestedName: string): Promise<void>;
}

export class DesktopPlatformDocumentError extends Error {
  readonly code: DesktopDocumentFailureCode;
  readonly operation: DesktopDocumentOperation;

  constructor(failure: DesktopDocumentFailure) {
    super(failure.message);
    this.name = "DesktopPlatformDocumentError";
    this.code = failure.code;
    this.operation = failure.operation;
  }
}

export function requireDesktopPlatformCompletion<T>(result: DesktopPlatformResult<T>): T {
  if (result.status === "completed") return result.value;
  if (result.status === "cancelled") {
    throw new DOMException("Document operation was cancelled.", "AbortError");
  }
  throw new DesktopPlatformDocumentError(result.failure);
}

function completed<T>(value: T): DesktopPlatformResult<T> {
  return Object.freeze({ status: "completed" as const, value });
}

function failed(
  operation: DesktopDocumentOperation,
  code: DesktopDocumentFailureCode,
  message: string,
): DesktopPlatformResult<never> {
  return Object.freeze({
    status: "failed" as const,
    failure: Object.freeze({ operation, code, message }),
  });
}

function failureCode(error: unknown, operation: DesktopDocumentOperation): DesktopDocumentFailureCode {
  if (!(error instanceof DOMException)) return "internal_error";
  switch (error.name) {
  case "NotAllowedError":
    return "permission_denied";
  case "SecurityError":
    return operation === "choose" ? "permission_denied" : "verification_failed";
  case "TypeMismatchError":
  case "TypeError":
  case "InvalidStateError":
    return "invalid_request";
  case "NotSupportedError":
    return "unsupported_capability";
  case "QuotaExceededError":
    return "resource_limit";
  case "NotFoundError":
    return "not_found";
  case "InvalidModificationError":
    return "conflict";
  case "DataError":
    return "verification_failed";
  default:
    return "internal_error";
  }
}

function safeFailureMessage(error: unknown, operation: DesktopDocumentOperation): string {
  const fallback = `Desktop document ${operation} failed.`;
  if (!(error instanceof Error) || !error.message.trim()) return fallback;
  return error.message
    .replace(/(?:file:\/\/)?\/(?:Users|home|private|Volumes)\/[^\s]+/gu, "[private path]")
    .replace(/[A-Za-z]:\\[^\s]+/gu, "[private path]")
    .slice(0, 512);
}

async function capture<T>(
  operation: DesktopDocumentOperation,
  task: () => Promise<T>,
): Promise<DesktopPlatformResult<T>> {
  try {
    return completed(await task());
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return Object.freeze({ status: "cancelled" as const });
    }
    return failed(operation, failureCode(error, operation), safeFailureMessage(error, operation));
  }
}

function chooseBrowserPortableProject(): Promise<File | null> {
  if (typeof document === "undefined" || !document.body) {
    return Promise.reject(new DOMException("Browser document picker is unavailable.", "NotSupportedError"));
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pitched,application/vnd.pitchdog.pitched+zip,application/zip";
    input.hidden = true;
    let settled = false;
    const settle = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => settle(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => settle(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

async function publishBrowserPortableProject(blob: Blob, suggestedName: string): Promise<void> {
  if (typeof document === "undefined" || !document.body || typeof URL.createObjectURL !== "function") {
    throw new DOMException("Browser document download is unavailable.", "NotSupportedError");
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizeFilename(suggestedName);
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

const DEFAULT_BROWSER_DOCUMENT_HOST: BrowserDesktopDocumentHost = Object.freeze({
  choosePortableProject: chooseBrowserPortableProject,
  publishPortableProject: publishBrowserPortableProject,
});

export function createBrowserDesktopPlatform(
  host: BrowserDesktopDocumentHost = DEFAULT_BROWSER_DOCUMENT_HOST,
  interfaceScale: InterfaceScalePreferenceStore = createInterfaceScalePreferenceStore(),
): DesktopPlatform {
  const issuedSaveReceipts = new WeakSet<object>();
  const documents: DesktopPlatformDocuments = {
    choosePortableProject: () => capture("choose", async () => {
      const file = await host.choosePortableProject();
      if (!file) throw new DOMException("Document operation was cancelled.", "AbortError");
      if (!(file instanceof File)) {
        throw new DOMException("Browser picker returned invalid project bytes.", "DataError");
      }
      return Object.freeze({ file });
    }),
    finalizePortableProjectOpen: (file) => capture("open", async () => {
      if (!(file instanceof File)) throw new TypeError("Portable project selection must be a File.");
      return Object.freeze({
        sha256: await sha256NativeDocumentBlob(file),
        byteLength: file.size,
        bound: false,
        conflict: false as const,
        readbackVerified: true,
      });
    }),
    abandonPortableProjectOpen: async () => undefined,
    preparePortableProjectSave: (revisions) => Object.freeze({ revisions, ticket: null }),
    savePortableProject: (request) => capture(request.operation, async () => {
      if (!(request.blob instanceof Blob)) throw new TypeError("Portable project bytes must be a Blob.");
      const sha256 = await sha256NativeDocumentBlob(request.blob);
      await host.publishPortableProject(request.blob, request.suggestedName);
      const receipt = Object.freeze({
        operation: request.operation,
        transactionId: request.transactionId,
        sequence: null,
        revision: null,
        sha256,
        byteLength: request.blob.size,
        bound: false,
        conflict: false as const,
        readbackVerified: false,
      });
      issuedSaveReceipts.add(receipt);
      return receipt;
    }),
    completePortableProjectSave: (revisions, ticket, receipt) => {
      if (ticket !== null || receipt.bound || !issuedSaveReceipts.has(receipt)) {
        throw new DOMException("Browser document save receipt is invalid.", "DataError");
      }
      return revisions;
    },
    revertPortableProject: async () => failed(
      "revert",
      "unsupported_capability",
      "Browser downloads are not bound documents. Choose the saved project to reopen it.",
    ),
  };
  return Object.freeze({
    target: "browser-development",
    documents: Object.freeze(documents),
    presentation: Object.freeze({ interfaceScale }),
  });
}

export function createNativeMacDesktopPlatform(
  interfaceScale: InterfaceScalePreferenceStore = createInterfaceScalePreferenceStore(),
): DesktopPlatform {
  const nativeReceipts = new WeakMap<object, NativeMacDocumentReceipt>();
  const documents: DesktopPlatformDocuments = {
    choosePortableProject: () => capture("choose", async () => {
      const files = await pickNativeMacFiles("project", false);
      if (files === null) {
        throw new DOMException("Native document picker is unavailable.", "NotSupportedError");
      }
      const file = files[0];
      if (!file) throw new DOMException("Document operation was cancelled.", "AbortError");
      return Object.freeze({ file });
    }),
    finalizePortableProjectOpen: (file) => capture("open", async () => {
      const receipt = await confirmNativeMacDocumentOpen(file);
      if (!receipt) throw new DOMException("Native document Open is unavailable.", "NotSupportedError");
      return Object.freeze({
        sha256: receipt.sha256,
        byteLength: receipt.byteLength,
        bound: receipt.bound,
        conflict: receipt.conflict,
        readbackVerified: receipt.verified,
      });
    }),
    abandonPortableProjectOpen: abandonNativeMacDocumentOpen,
    preparePortableProjectSave: (revisions) => {
      const started = beginProjectSave(revisions);
      return Object.freeze({ revisions: started.state, ticket: started.ticket });
    },
    savePortableProject: (request) => capture(request.operation, async () => {
      if (!request.ticket) throw new TypeError("Native document save requires a project revision ticket.");
      const nativeRequest = {
        transactionId: request.transactionId,
        ticket: request.ticket,
        blob: request.blob,
      };
      const nativeReceipt = request.operation === "save-as"
        ? await saveNativeMacDocumentAs(nativeRequest)
        : await saveNativeMacDocument(nativeRequest);
      if (!nativeReceipt) throw new DOMException("Native document Save is unavailable.", "NotSupportedError");
      const receipt = Object.freeze({
        operation: request.operation,
        transactionId: nativeReceipt.transactionId,
        sequence: nativeReceipt.sequence,
        revision: nativeReceipt.revision,
        sha256: nativeReceipt.sha256,
        byteLength: nativeReceipt.byteLength,
        bound: nativeReceipt.bound,
        conflict: nativeReceipt.conflict,
        readbackVerified: nativeReceipt.verified,
      });
      nativeReceipts.set(receipt, nativeReceipt);
      return receipt;
    }),
    completePortableProjectSave: (revisions, ticket, receipt) => {
      const nativeReceipt = nativeReceipts.get(receipt);
      if (!ticket || !nativeReceipt) {
        throw new DOMException("Native document save receipt is invalid.", "DataError");
      }
      return completeNativeMacDocumentSave(revisions, ticket, nativeReceipt);
    },
    revertPortableProject: (request) => capture("revert", async () => {
      const result = await revertNativeMacDocument(request);
      if (!result) throw new DOMException("Native document Revert is unavailable.", "NotSupportedError");
      return Object.freeze({
        blob: result.blob,
        receipt: Object.freeze({
          operation: "revert" as const,
          transactionId: result.receipt.transactionId,
          sequence: null,
          revision: null,
          sha256: result.receipt.sha256,
          byteLength: result.receipt.byteLength,
          bound: true as const,
          conflict: false as const,
          readbackVerified: true as const,
        }),
      });
    }),
  };
  return Object.freeze({
    target: "macos",
    documents: Object.freeze(documents),
    presentation: Object.freeze({ interfaceScale }),
  });
}

export function createDesktopPlatform(
  browserHost: BrowserDesktopDocumentHost = DEFAULT_BROWSER_DOCUMENT_HOST,
): DesktopPlatform {
  const interfaceScale = createInterfaceScalePreferenceStore();
  if (isNativeMacRuntime()) return createNativeMacDesktopPlatform(interfaceScale);
  const linuxBridge = typeof window === "undefined" ? undefined : window.__DRIFT_LINUX_DESKTOP__;
  if (isLinuxElectronRuntime(linuxBridge)) {
    return createLinuxElectronDesktopPlatform(linuxBridge, interfaceScale);
  }
  return createBrowserDesktopPlatform(browserHost, interfaceScale);
}
