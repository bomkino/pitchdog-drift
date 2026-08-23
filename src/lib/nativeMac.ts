import {
  completeProjectSave,
  projectDocumentCanRevert,
  projectDocumentIsDirty,
  type ProjectRevisionState,
  type ProjectSaveTicket,
} from "../core/project/revisions";

export const NATIVE_MAC_COMMANDS = [
  "open-project",
  "add-slides",
  "add-presenter",
  "save-project",
  "save-project-as",
  "revert-project",
  "export-mp4",
  "export-still",
  "export-frames",
  "toggle-playback",
  "previous-slide",
  "next-slide",
  "toggle-focus",
  "cancel-export",
] as const;

export type NativeMacCommand = typeof NATIVE_MAC_COMMANDS[number];
export type NativeMacImportKind = "slides" | "presenter" | "project";
export type NativeMacSaveState = "loading" | "saving" | "saved" | "failed" | "recovery";

export interface NativeMacDocumentClientState {
  readonly bound: boolean;
  readonly dirty: boolean;
  readonly revertible: boolean;
  readonly conflict: boolean;
}

export interface NativeMacClientState {
  readonly exportInProgress: boolean;
  readonly projectBusy: boolean;
  readonly saveState: NativeMacSaveState;
  readonly lastNotice: string | null;
  readonly document: NativeMacDocumentClientState;
}

export type NativeMacClientStateInput = Omit<NativeMacClientState, "document"> & {
  /** Optional only while the current App integration migrates to document facts. */
  readonly document?: NativeMacDocumentClientState;
};

export type NativeMacDocumentSaveOperation = "save" | "save-as";
export type NativeMacDocumentOperation = NativeMacDocumentSaveOperation | "revert";

export interface NativeMacDocumentSaveRequest {
  readonly transactionId: string;
  readonly ticket: ProjectSaveTicket;
  /** Existing portable-project bytes; this layer does not serialize Project V4. */
  readonly blob: Blob;
}

export interface NativeMacDocumentRevertRequest {
  readonly transactionId: string;
  /** Digest from the last verified bound save/open receipt. */
  readonly expectedSha256: string;
}

export interface NativeMacDocumentReceipt {
  readonly operation: NativeMacDocumentOperation;
  readonly transactionId: string;
  readonly sequence: number | null;
  readonly revision: number | null;
  readonly sha256: string;
  readonly byteLength: number;
  readonly bound: true;
  readonly conflict: false;
  readonly verified: true;
}

export interface NativeMacDocumentRevertResult {
  readonly receipt: NativeMacDocumentReceipt & { readonly operation: "revert" };
  readonly blob: Blob;
}

export interface NativeMacDocumentOpenReceipt {
  readonly sha256: string;
  readonly byteLength: number;
  readonly bound: true;
  readonly conflict: false;
  readonly verified: true;
}

export type NativeMacDocumentTransactionRequest =
  | Readonly<{
      operation: NativeMacDocumentSaveOperation;
      transactionId: string;
      sequence: number;
      revision: number;
      expectedSha256: string;
      byteLength: number;
      blob: Blob;
    }>
  | Readonly<{
      operation: "revert";
      transactionId: string;
      expectedSha256: string;
    }>;

export class NativeMacDocumentConflictError extends DOMException {
  readonly operation: NativeMacDocumentOperation;

  constructor(operation: NativeMacDocumentOperation) {
    super("The bound Drift document changed outside this transaction.", "InvalidModificationError");
    this.operation = operation;
  }
}

export interface NativeMacAppBridge {
  command: (command: NativeMacCommand) => boolean | void | Promise<boolean | void>;
  importFile: (kind: NativeMacImportKind, file: File) => void | Promise<void>;
  importFiles?: (kind: NativeMacImportKind, files: readonly File[]) => void | Promise<void>;
}

interface NativeMacRuntimeMarker {
  bridgeVersion: number;
  platform: "macOS";
  systemCodecsOnly: true;
  documentAuthority: "appkit-issued-per-document";
  webKitOutboundPolicyInstalled: true;
  webKitOutboundPolicyVersion: 3;
  nativeNetworkClientSurface: "none-shipped";
  networkBoundary: "app-entitled-webkit-blocked";
  networkClientEntitlementRequiredWhenSandboxed: true;
}

interface NativeMacFileHandle extends FileSystemFileHandle {
  _release?: () => Promise<void>;
}

interface NativeMacPickerWindow extends Window {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<NativeMacFileHandle[]>;
}

declare global {
  interface Window {
    __DRIFT_NATIVE_MAC__?: Readonly<NativeMacRuntimeMarker>;
    __driftNativeInstallAppBridge?: (bridge: NativeMacAppBridge) => void | (() => void);
    __driftNativeReportClientState?: (state: NativeMacClientState) => void;
    __driftNativeDocumentTransaction?: (
      request: NativeMacDocumentTransactionRequest,
    ) => Promise<unknown>;
    __driftNativeConfirmProjectOpen?: (file: File) => Promise<unknown>;
    __driftNativeAbandonProjectOpen?: () => Promise<void> | void;
    __driftNativeSaveBlob?: (blob: Blob, suggestedName: string) => Promise<void>;
    __driftNativeCall?: (
      command: string,
      payload?: Readonly<Record<string, unknown>>,
    ) => Promise<unknown>;
  }
}

const NATIVE_PICKER_TYPES: Readonly<Record<NativeMacImportKind, ReadonlyArray<{
  description: string;
  accept: Record<string, string[]>;
}>>> = Object.freeze({
  slides: [{
    description: "Pitch-deck images",
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
      "image/avif": [".avif"],
    },
  }],
  presenter: [{
    description: "Presenter video",
    accept: {
      "video/mp4": [".mp4"],
      "video/quicktime": [".mov"],
      "video/webm": [".webm"],
    },
  }],
  project: [{
    description: "Drift portable project",
    accept: {
      "application/vnd.pitchdog.pitched+zip": [".pitched"],
      "application/zip": [".pitched"],
    },
  }],
});

let installedAppBridge: NativeMacAppBridge | null = null;
const verifiedNativeDocumentReceipts = new WeakSet<object>();

export function isNativeMacRuntime(): boolean {
  return typeof window !== "undefined"
    && window.__DRIFT_NATIVE_MAC__?.platform === "macOS"
    && window.__DRIFT_NATIVE_MAC__.bridgeVersion === 2
    && window.__DRIFT_NATIVE_MAC__.documentAuthority === "appkit-issued-per-document"
    && window.__DRIFT_NATIVE_MAC__.webKitOutboundPolicyInstalled === true
    && window.__DRIFT_NATIVE_MAC__.webKitOutboundPolicyVersion === 3
    && window.__DRIFT_NATIVE_MAC__.nativeNetworkClientSurface === "none-shipped"
    && window.__DRIFT_NATIVE_MAC__.networkBoundary === "app-entitled-webkit-blocked"
    && window.__DRIFT_NATIVE_MAC__.networkClientEntitlementRequiredWhenSandboxed === true;
}

export function installNativeMacAppBridge(bridge: NativeMacAppBridge): () => void {
  if (!isNativeMacRuntime() || typeof window.__driftNativeInstallAppBridge !== "function") {
    return () => undefined;
  }
  installedAppBridge = bridge;
  const nativeCleanup = window.__driftNativeInstallAppBridge(bridge);
  return () => {
    if (installedAppBridge === bridge) installedAppBridge = null;
    if (typeof nativeCleanup === "function") nativeCleanup();
  };
}

/**
 * Sends files already copied out of opaque native grants directly into the
 * installed React bridge. WKWebView does not reliably construct a writable
 * FileList through DataTransfer, so native imports must not depend on spoofing
 * a hidden input. The browser build retains its ordinary input event path.
 */
export async function dispatchNativeMacFiles(
  kind: NativeMacImportKind,
  files: readonly File[],
): Promise<boolean> {
  if (!isNativeMacRuntime()) return false;
  const bridge = installedAppBridge;
  if (!bridge) {
    throw new DOMException(
      "Drift is still opening. Wait for the project to finish loading, then try the import again.",
      "InvalidStateError",
    );
  }

  const selected = [...files];
  if (selected.length === 0) return true;
  if (kind !== "slides" && selected.length !== 1) {
    throw new DOMException(
      kind === "presenter"
        ? "Choose exactly one presenter video."
        : "Choose exactly one Drift project.",
      "TypeMismatchError",
    );
  }
  if (selected.some((file) => !(file instanceof File))) {
    throw new DOMException("The native picker returned an invalid file object.", "DataError");
  }

  // A native multi-slide selection is one project mutation and one durable
  // save, rather than N success replies and N progressively larger snapshots.
  // Retain the single-file fallback for older installed bridge implementations.
  if (bridge.importFiles) await bridge.importFiles(kind, selected);
  else for (const file of selected) await bridge.importFile(kind, file);
  return true;
}

export function nativeMacDocumentClientState(
  revisions: ProjectRevisionState,
  bound: boolean,
  conflict = false,
): NativeMacDocumentClientState {
  return Object.freeze({
    bound,
    dirty: projectDocumentIsDirty(revisions, bound),
    revertible: projectDocumentCanRevert(revisions, bound, conflict),
    conflict,
  });
}

function normalizedDocumentClientState(
  state: NativeMacDocumentClientState | undefined,
): NativeMacDocumentClientState {
  const bound = state?.bound === true;
  const conflict = state?.conflict === true;
  const dirty = !bound || state?.dirty === true;
  return Object.freeze({
    bound,
    dirty,
    revertible: bound && dirty && !conflict && state?.revertible === true,
    conflict,
  });
}

export function reportNativeMacClientState(state: NativeMacClientStateInput): void {
  if (!isNativeMacRuntime() || typeof window.__driftNativeReportClientState !== "function") return;
  window.__driftNativeReportClientState({
    exportInProgress: state.exportInProgress,
    projectBusy: state.projectBusy,
    saveState: state.saveState,
    // Notices can include confidential deck or media filenames. AppKit needs
    // only a presence signal for diagnostics; the renderer keeps the real copy.
    lastNotice: state.lastNotice ? "present" : null,
    document: normalizedDocumentClientState(state.document),
  });
}

/**
 * Returns null when Drift is running as an ordinary browser app, an empty list
 * when the native panel was cancelled, and verified local Files after a native
 * selection. Opaque native grants are released after their bytes are copied so
 * repeated imports cannot exhaust the bridge's bounded grant table.
 */
export async function pickNativeMacFiles(
  kind: NativeMacImportKind,
  multiple = kind === "slides",
): Promise<File[] | null> {
  if (!isNativeMacRuntime()) return null;
  const picker = (window as NativeMacPickerWindow).showOpenFilePicker;
  if (typeof picker !== "function") return null;

  let handles: NativeMacFileHandle[];
  try {
    handles = await picker({
      multiple: kind === "slides" && multiple,
      types: NATIVE_PICKER_TYPES[kind].map((type) => ({
        description: type.description,
        accept: { ...type.accept },
      })),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return [];
    throw error;
  }

  try {
    return await Promise.all(handles.map((handle) => handle.getFile()));
  } finally {
    await Promise.allSettled(handles.map(async (handle) => {
      if (typeof handle._release === "function") await handle._release();
    }));
  }
}

/**
 * Returns false in the ordinary browser. In Drift.app it resolves only after
 * the native save panel and staged file commit have completed successfully.
 */
export async function saveNativeMacBlob(blob: Blob, suggestedName: string): Promise<boolean> {
  if (!isNativeMacRuntime() || typeof window.__driftNativeSaveBlob !== "function") return false;
  await window.__driftNativeSaveBlob(blob, suggestedName);
  return true;
}

export async function confirmNativeMacDocumentOpen(
  file: File,
): Promise<NativeMacDocumentOpenReceipt | null> {
  if (!isNativeMacRuntime() || typeof window.__driftNativeConfirmProjectOpen !== "function") return null;
  const raw = record(await window.__driftNativeConfirmProjectOpen(file), "Native document Open receipt");
  const observedSha256 = sha256(raw.sha256, "Native document Open receipt digest");
  if (raw.byteLength !== file.size || raw.bound !== true || raw.conflict !== false || raw.verified !== true) {
    throw new DOMException("Native document Open receipt is incomplete.", "DataError");
  }
  const localSha256 = await sha256NativeDocumentBlob(file);
  if (localSha256 !== observedSha256) {
    throw new DOMException("Native document Open receipt does not match the verified project bytes.", "DataError");
  }
  return Object.freeze({
    sha256: observedSha256,
    byteLength: file.size,
    bound: true as const,
    conflict: false as const,
    verified: true as const,
  });
}

export async function abandonNativeMacDocumentOpen(): Promise<void> {
  if (!isNativeMacRuntime() || typeof window.__driftNativeAbandonProjectOpen !== "function") return;
  await window.__driftNativeAbandonProjectOpen();
}

function transactionId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new TypeError("Native document transaction id is invalid.");
  }
  return value;
}

function nonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new DOMException(`${label} is not a lowercase SHA-256 digest.`, "DataError");
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DOMException(`${label} is malformed.`, "DataError");
  }
  return value as Record<string, unknown>;
}

export async function sha256NativeDocumentBlob(blob: Blob): Promise<string> {
  if (!(blob instanceof Blob)) throw new TypeError("Native document bytes must be a Blob.");
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new DOMException("SHA-256 verification is unavailable in this runtime.", "NotSupportedError");
  }
  const digest = new Uint8Array(await subtle.digest("SHA-256", await blob.arrayBuffer()));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function documentTransactionHook(): Window["__driftNativeDocumentTransaction"] | null {
  if (!isNativeMacRuntime()) return null;
  if (typeof window.__driftNativeDocumentTransaction !== "function") {
    throw new DOMException(
      "The native document transaction bridge is unavailable in this Drift build.",
      "NotSupportedError",
    );
  }
  return window.__driftNativeDocumentTransaction;
}

function checkConflict(
  raw: Record<string, unknown>,
  operation: NativeMacDocumentOperation,
): void {
  if (raw.conflict === true) throw new NativeMacDocumentConflictError(operation);
  if (raw.conflict !== false) {
    throw new DOMException("Native document receipt omitted conflict status.", "DataError");
  }
}

function checkReceiptIdentity(
  raw: Record<string, unknown>,
  expected: {
    operation: NativeMacDocumentOperation;
    transactionId: string;
    sequence: number | null;
    revision: number | null;
  },
): void {
  if (raw.operation !== expected.operation || raw.transactionId !== expected.transactionId) {
    throw new DOMException("Native document receipt belongs to another transaction.", "SecurityError");
  }
  if (raw.sequence !== expected.sequence || raw.revision !== expected.revision) {
    throw new DOMException("Native document receipt belongs to another project revision.", "SecurityError");
  }
}

function verifiedReceipt(
  rawValue: unknown,
  expected: {
    operation: NativeMacDocumentOperation;
    transactionId: string;
    sequence: number | null;
    revision: number | null;
    sha256: string;
    byteLength: number;
  },
): NativeMacDocumentReceipt {
  const raw = record(rawValue, "Native document receipt");
  checkReceiptIdentity(raw, expected);
  checkConflict(raw, expected.operation);
  const observedSha256 = sha256(raw.sha256, "Native document receipt digest");
  if (observedSha256 !== expected.sha256) {
    throw new DOMException("Native document readback digest does not match the requested bytes.", "DataError");
  }
  if (raw.byteLength !== expected.byteLength || raw.bound !== true) {
    throw new DOMException("Native document readback length or binding is invalid.", "DataError");
  }
  const receipt = Object.freeze({
    operation: expected.operation,
    transactionId: expected.transactionId,
    sequence: expected.sequence,
    revision: expected.revision,
    sha256: observedSha256,
    byteLength: expected.byteLength,
    bound: true as const,
    conflict: false as const,
    verified: true as const,
  });
  verifiedNativeDocumentReceipts.add(receipt);
  return receipt;
}

async function saveNativeMacDocumentTransaction(
  operation: NativeMacDocumentSaveOperation,
  request: NativeMacDocumentSaveRequest,
): Promise<NativeMacDocumentReceipt | null> {
  const hook = documentTransactionHook();
  if (!hook) return null;
  const id = transactionId(request.transactionId);
  const sequence = nonNegativeSafeInteger(request.ticket.sequence, "Save ticket sequence");
  const revision = nonNegativeSafeInteger(request.ticket.revision, "Save ticket revision");
  if (!(request.blob instanceof Blob)) throw new TypeError("Native document bytes must be a Blob.");
  const expectedSha256 = await sha256NativeDocumentBlob(request.blob);
  const payload: NativeMacDocumentTransactionRequest = Object.freeze({
    operation,
    transactionId: id,
    sequence,
    revision,
    expectedSha256,
    byteLength: request.blob.size,
    blob: request.blob,
  });
  const raw = await hook(payload);
  return verifiedReceipt(raw, {
    operation,
    transactionId: id,
    sequence,
    revision,
    sha256: expectedSha256,
    byteLength: request.blob.size,
  });
}

/** Save uses the current binding, or lets AppKit bind an untitled document. */
export function saveNativeMacDocument(
  request: NativeMacDocumentSaveRequest,
): Promise<NativeMacDocumentReceipt | null> {
  return saveNativeMacDocumentTransaction("save", request);
}

/** Save As always asks AppKit for a new document binding. */
export function saveNativeMacDocumentAs(
  request: NativeMacDocumentSaveRequest,
): Promise<NativeMacDocumentReceipt | null> {
  return saveNativeMacDocumentTransaction("save-as", request);
}

/**
 * Completes only the revision captured by the verified transaction. Later
 * edits remain dirty because completeProjectSave never advances past the
 * ticket's revision.
 */
export function completeNativeMacDocumentSave(
  state: ProjectRevisionState,
  ticket: ProjectSaveTicket,
  receipt: NativeMacDocumentReceipt,
): ProjectRevisionState {
  if (
    !verifiedNativeDocumentReceipts.has(receipt)
    || !receipt.verified
    || (receipt.operation !== "save" && receipt.operation !== "save-as")
  ) {
    throw new DOMException("A verified save receipt is required.", "DataError");
  }
  if (receipt.sequence !== ticket.sequence || receipt.revision !== ticket.revision) {
    throw new DOMException("Save receipt does not match its project revision ticket.", "SecurityError");
  }
  return completeProjectSave(state, ticket);
}

/** Revert returns verified existing portable-project bytes; applying them remains the caller's authority. */
export async function revertNativeMacDocument(
  request: NativeMacDocumentRevertRequest,
): Promise<NativeMacDocumentRevertResult | null> {
  const hook = documentTransactionHook();
  if (!hook) return null;
  const id = transactionId(request.transactionId);
  const expectedSha256 = sha256(request.expectedSha256, "Expected bound document digest");
  const rawValue = await hook(Object.freeze({
    operation: "revert" as const,
    transactionId: id,
    expectedSha256,
  }));
  const raw = record(rawValue, "Native document revert receipt");
  checkReceiptIdentity(raw, {
    operation: "revert",
    transactionId: id,
    sequence: null,
    revision: null,
  });
  checkConflict(raw, "revert");
  if (!(raw.blob instanceof Blob)) {
    throw new DOMException("Native document revert omitted verified project bytes.", "DataError");
  }
  const observedSha256 = await sha256NativeDocumentBlob(raw.blob);
  const receipt = verifiedReceipt(raw, {
    operation: "revert",
    transactionId: id,
    sequence: null,
    revision: null,
    sha256: expectedSha256,
    byteLength: raw.blob.size,
  });
  if (observedSha256 !== receipt.sha256) {
    throw new DOMException("Native reverted bytes do not match their verified readback receipt.", "DataError");
  }
  return Object.freeze({
    receipt: receipt as NativeMacDocumentReceipt & { readonly operation: "revert" },
    blob: raw.blob,
  });
}
