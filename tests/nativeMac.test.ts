import { afterEach, describe, expect, it, vi } from "vitest";
import {
  abandonNativeMacDocumentOpen,
  completeNativeMacDocumentSave,
  confirmNativeMacDocumentOpen,
  dispatchNativeMacFiles,
  installNativeMacAppBridge,
  isNativeMacRuntime,
  nativeMacDocumentClientState,
  NATIVE_MAC_COMMANDS,
  pickNativeMacFiles,
  reportNativeMacClientState,
  revertNativeMacDocument,
  saveNativeMacDocument,
  saveNativeMacDocumentAs,
  saveNativeMacBlob,
  sha256NativeDocumentBlob,
  type NativeMacAppBridge,
  type NativeMacDocumentTransactionRequest,
} from "../src/lib/nativeMac";
import {
  beginProjectSave,
  createProjectRevisionState,
  projectIsDirty,
  recordProjectMutation,
} from "../src/core/project/revisions";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function setWindow(value: Record<string, unknown>): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value,
  });
}

function nativeMarker(): Record<string, unknown> {
  return {
    bridgeVersion: 2,
    platform: "macOS",
    systemCodecsOnly: true,
    documentAuthority: "appkit-issued-per-document",
    webKitOutboundPolicyInstalled: true,
    webKitOutboundPolicyVersion: 3,
    nativeNetworkClientSurface: "none-shipped",
    networkBoundary: "app-entitled-webkit-blocked",
    networkClientEntitlementRequiredWhenSandboxed: true,
  };
}

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

describe("native macOS app contract", () => {
  it("exposes typed Save As and Revert commands", () => {
    expect(NATIVE_MAC_COMMANDS).toContain("save-project-as");
    expect(NATIVE_MAC_COMMANDS).toContain("revert-project");
  });

  it("stays inert in the ordinary browser and test runtime", async () => {
    Reflect.deleteProperty(globalThis, "window");
    const cleanup = installNativeMacAppBridge({
      command: vi.fn(),
      importFile: vi.fn(),
    });

    expect(isNativeMacRuntime()).toBe(false);
    expect(() => cleanup()).not.toThrow();
    expect(() => reportNativeMacClientState({
      exportInProgress: false,
      projectBusy: false,
      saveState: "saved",
      lastNotice: null,
    })).not.toThrow();
    await expect(pickNativeMacFiles("slides")).resolves.toBeNull();
    await expect(saveNativeMacBlob(new Blob(["browser"]), "browser.txt")).resolves.toBe(false);
    const save = beginProjectSave(recordProjectMutation(createProjectRevisionState()));
    await expect(saveNativeMacDocument({
      transactionId: "browser-save",
      ticket: save.ticket,
      blob: new Blob(["project"]),
    })).resolves.toBeNull();
    await expect(revertNativeMacDocument({
      transactionId: "browser-revert",
      expectedSha256: "0".repeat(64),
    })).resolves.toBeNull();
  });

  it("installs the typed React bridge and returns the native cleanup", () => {
    const cleanup = vi.fn();
    const installer = vi.fn(() => cleanup);
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeInstallAppBridge: installer,
    });
    const bridge: NativeMacAppBridge = {
      command: vi.fn(),
      importFile: vi.fn(),
    };

    const release = installNativeMacAppBridge(bridge);

    expect(isNativeMacRuntime()).toBe(true);
    expect(installer).toHaveBeenCalledOnce();
    expect(installer).toHaveBeenCalledWith(bridge);
    release();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("does not finish native delivery until the React import promise finishes", async () => {
    let finishImport: (() => void) | undefined;
    const importFile = vi.fn(() => new Promise<void>((resolve) => { finishImport = resolve; }));
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeInstallAppBridge: vi.fn(() => () => undefined),
    });
    const cleanup = installNativeMacAppBridge({ command: vi.fn(), importFile });
    const file = new File(["verified later"], "later.pitched", {
      type: "application/vnd.pitchdog.pitched+zip",
    });

    let settled = false;
    const delivery = dispatchNativeMacFiles("project", [file]).then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();

    expect(importFile).toHaveBeenCalledWith("project", file);
    expect(settled).toBe(false);
    finishImport?.();
    await expect(delivery).resolves.toBe(true);
    expect(settled).toBe(true);
    cleanup();
  });

  it("binds Open only after native and renderer SHA-256 receipts agree", async () => {
    const file = new File(["verified project"], "verified.pitched", {
      type: "application/vnd.pitchdog.pitched+zip",
    });
    const sha256 = await sha256NativeDocumentBlob(file);
    const confirm = vi.fn(async () => ({
      sha256,
      byteLength: file.size,
      bound: true,
      conflict: false,
      verified: true,
      path: "/Users/example/Secret.pitched",
    }));
    const abandon = vi.fn(async () => undefined);
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeConfirmProjectOpen: confirm,
      __driftNativeAbandonProjectOpen: abandon,
    });

    await expect(confirmNativeMacDocumentOpen(file)).resolves.toEqual({
      sha256,
      byteLength: file.size,
      bound: true,
      conflict: false,
      verified: true,
    });
    expect(JSON.stringify(await confirmNativeMacDocumentOpen(file))).not.toContain("/Users/");
    await abandonNativeMacDocumentOpen();
    expect(abandon).toHaveBeenCalledOnce();
  });

  it("delivers a native slide selection as one durable batch", async () => {
    const importFile = vi.fn();
    const importFiles = vi.fn(async () => undefined);
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeInstallAppBridge: vi.fn(() => () => undefined),
    });
    const cleanup = installNativeMacAppBridge({ command: vi.fn(), importFile, importFiles });
    const files = [
      new File(["first"], "first.png", { type: "image/png" }),
      new File(["second"], "second.png", { type: "image/png" }),
    ];

    await expect(dispatchNativeMacFiles("slides", files)).resolves.toBe(true);
    expect(importFiles).toHaveBeenCalledOnce();
    expect(importFiles).toHaveBeenCalledWith("slides", files);
    expect(importFile).not.toHaveBeenCalled();
    cleanup();
  });

  it("propagates a React project rejection to the native delivery caller", async () => {
    const rejection = new DOMException("Project verification failed.", "DataError");
    const importFile = vi.fn(async () => { throw rejection; });
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeInstallAppBridge: vi.fn(() => () => undefined),
    });
    const cleanup = installNativeMacAppBridge({ command: vi.fn(), importFile });
    const file = new File(["broken"], "broken.pitched", {
      type: "application/vnd.pitchdog.pitched+zip",
    });

    await expect(dispatchNativeMacFiles("project", [file])).rejects.toBe(rejection);
    expect(importFile).toHaveBeenCalledOnce();
    cleanup();
  });

  it("reports authoritative state without carrying confidential notice text into AppKit", () => {
    const report = vi.fn();
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeReportClientState: report,
    });

    reportNativeMacClientState({
      exportInProgress: true,
      projectBusy: true,
      saveState: "failed",
      lastNotice: "/Users/example/Clients/Unannounced Film/Secret Deck.pitched could not open",
    });

    expect(report).toHaveBeenCalledWith({
      exportInProgress: true,
      projectBusy: true,
      saveState: "failed",
      lastNotice: "present",
      document: {
        bound: false,
        dirty: true,
        revertible: false,
        conflict: false,
      },
    });
    expect(JSON.stringify(report.mock.calls)).not.toContain("Secret Deck");
    expect(JSON.stringify(report.mock.calls)).not.toContain("/Users/");
  });

  it("clears the native notice signal when the renderer has no active notice", () => {
    const report = vi.fn();
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeReportClientState: report,
    });

    reportNativeMacClientState({
      exportInProgress: false,
      projectBusy: false,
      saveState: "saved",
      lastNotice: null,
    });

    expect(report).toHaveBeenCalledWith({
      exportInProgress: false,
      projectBusy: false,
      saveState: "saved",
      lastNotice: null,
      document: {
        bound: false,
        dirty: true,
        revertible: false,
        conflict: false,
      },
    });
  });

  it("opens the explicit native slide picker and releases every opaque grant", async () => {
    const first = new File(["one"], "one.png", { type: "image/png" });
    const second = new File(["two"], "two.jpg", { type: "image/jpeg" });
    const releases = [vi.fn(async () => undefined), vi.fn(async () => undefined)];
    const handles = [first, second].map((file, index) => ({
      getFile: vi.fn(async () => file),
      _release: releases[index],
    }));
    const picker = vi.fn(async () => handles);
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      showOpenFilePicker: picker,
    });

    await expect(pickNativeMacFiles("slides")).resolves.toEqual([first, second]);
    expect(picker).toHaveBeenCalledWith({
      multiple: true,
      types: [{
        description: "Pitch-deck media",
        accept: {
          "image/png": [".png"],
          "image/jpeg": [".jpg", ".jpeg"],
          "image/webp": [".webp"],
          "image/avif": [".avif"],
          "video/mp4": [".mp4"],
          "video/quicktime": [".mov"],
          "video/webm": [".webm"],
        },
      }],
    });
    expect(releases[0]).toHaveBeenCalledOnce();
    expect(releases[1]).toHaveBeenCalledOnce();
  });

  it("treats native picker cancellation as a handled empty selection", async () => {
    const picker = vi.fn(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      showOpenFilePicker: picker,
    });

    await expect(pickNativeMacFiles("presenter", false)).resolves.toEqual([]);
    expect(picker).toHaveBeenCalledWith({
      multiple: false,
      types: [{
        description: "Presenter video",
        accept: {
          "video/mp4": [".mp4"],
          "video/quicktime": [".mov"],
          "video/webm": [".webm"],
        },
      }],
    });
  });

  it("releases native grants even when one selected file cannot be read", async () => {
    const release = vi.fn(async () => undefined);
    const picker = vi.fn(async () => [{
      getFile: vi.fn(async () => { throw new Error("read failed"); }),
      _release: release,
    }]);
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      showOpenFilePicker: picker,
    });

    await expect(pickNativeMacFiles("project", false)).rejects.toThrow("read failed");
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not report export success until the native staged save resolves", async () => {
    let resolveSave: (() => void) | undefined;
    const save = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeSaveBlob: save,
    });
    const blob = new Blob(["master"], { type: "application/octet-stream" });

    let settled = false;
    const saving = saveNativeMacBlob(blob, "drift-master.bin").then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();

    expect(save).toHaveBeenCalledWith(blob, "drift-master.bin");
    expect(settled).toBe(false);
    resolveSave?.();
    await expect(saving).resolves.toBe(true);
    expect(settled).toBe(true);
  });

  it("derives path-free bound, dirty, revertible, and conflict client facts", () => {
    const untitled = createProjectRevisionState();
    expect(nativeMacDocumentClientState(untitled, false)).toEqual({
      bound: false,
      dirty: true,
      revertible: false,
      conflict: false,
    });
    const dirty = recordProjectMutation(untitled);
    expect(nativeMacDocumentClientState(dirty, true)).toEqual({
      bound: true,
      dirty: true,
      revertible: true,
      conflict: false,
    });
    expect(nativeMacDocumentClientState(dirty, true, true)).toEqual({
      bound: true,
      dirty: true,
      revertible: false,
      conflict: true,
    });
  });

  it("reports explicit document facts without filenames or paths", () => {
    const report = vi.fn();
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeReportClientState: report,
    });
    const facts = nativeMacDocumentClientState(
      recordProjectMutation(createProjectRevisionState()),
      true,
    );

    reportNativeMacClientState({
      exportInProgress: false,
      projectBusy: false,
      saveState: "saved",
      lastNotice: "/Users/example/Secret.pitched",
      document: facts,
    });

    expect(report).toHaveBeenCalledWith({
      exportInProgress: false,
      projectBusy: false,
      saveState: "saved",
      lastNotice: "present",
      document: facts,
    });
    expect(JSON.stringify(report.mock.calls)).not.toContain("Secret.pitched");
    expect(JSON.stringify(report.mock.calls)).not.toContain("/Users/");
  });

  it("verifies Save receipts and leaves edits made during the transaction dirty", async () => {
    const transaction = vi.fn(async (request: NativeMacDocumentTransactionRequest) => {
      if (request.operation === "revert") throw new Error("unexpected revert");
      return {
        operation: request.operation,
        transactionId: request.transactionId,
        sequence: request.sequence,
        revision: request.revision,
        sha256: request.expectedSha256,
        byteLength: request.byteLength,
        bound: true,
        conflict: false,
        path: "/Users/example/Secret.pitched",
      };
    });
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeDocumentTransaction: transaction,
    });
    let state = recordProjectMutation(createProjectRevisionState());
    const started = beginProjectSave(state);
    state = started.state;
    const blob = new Blob(["portable project bytes"]);

    const saving = saveNativeMacDocument({
      transactionId: "save-1",
      ticket: started.ticket,
      blob,
    });
    state = recordProjectMutation(state);
    const receipt = await saving;

    expect(receipt).toMatchObject({
      operation: "save",
      transactionId: "save-1",
      sequence: 1,
      revision: 1,
      sha256: await sha256NativeDocumentBlob(blob),
      byteLength: blob.size,
      bound: true,
      conflict: false,
      verified: true,
    });
    expect(JSON.stringify(receipt)).not.toContain("Secret.pitched");
    expect(JSON.stringify(receipt)).not.toContain("/Users/");
    state = completeNativeMacDocumentSave(state, started.ticket, receipt!);
    expect(state).toMatchObject({ currentRevision: 2, savedRevision: 1 });
    expect(projectIsDirty(state)).toBe(true);
  });

  it("uses a distinct Save As transaction token and fails closed on digest mismatch or conflict", async () => {
    const state = recordProjectMutation(createProjectRevisionState());
    const started = beginProjectSave(state);
    const blob = new Blob(["save as bytes"]);
    const mismatch = vi.fn(async (request: NativeMacDocumentTransactionRequest) => ({
      operation: request.operation,
      transactionId: request.transactionId,
      sequence: request.operation === "revert" ? null : request.sequence,
      revision: request.operation === "revert" ? null : request.revision,
      sha256: "0".repeat(64),
      byteLength: request.operation === "revert" ? 0 : request.byteLength,
      bound: true,
      conflict: false,
    }));
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeDocumentTransaction: mismatch,
    });

    await expect(saveNativeMacDocumentAs({
      transactionId: "save-as-1",
      ticket: started.ticket,
      blob,
    })).rejects.toMatchObject({ name: "DataError" });
    expect(mismatch.mock.calls[0]?.[0]).toMatchObject({ operation: "save-as" });

    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeDocumentTransaction: vi.fn(async (request: NativeMacDocumentTransactionRequest) => ({
        operation: request.operation,
        transactionId: request.transactionId,
        sequence: request.operation === "revert" ? null : request.sequence,
        revision: request.operation === "revert" ? null : request.revision,
        conflict: true,
      })),
    });
    await expect(saveNativeMacDocument({
      transactionId: "save-conflict",
      ticket: started.ticket,
      blob,
    })).rejects.toMatchObject({ name: "InvalidModificationError", operation: "save" });
  });

  it("verifies Revert bytes against the last bound SHA-256 receipt", async () => {
    const blob = new Blob(["saved portable project"]);
    const expectedSha256 = await sha256NativeDocumentBlob(blob);
    const transaction = vi.fn(async (request: NativeMacDocumentTransactionRequest) => ({
      operation: request.operation,
      transactionId: request.transactionId,
      sequence: null,
      revision: null,
      sha256: expectedSha256,
      byteLength: blob.size,
      bound: true,
      conflict: false,
      blob,
      filename: "Secret.pitched",
    }));
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeDocumentTransaction: transaction,
    });

    const reverted = await revertNativeMacDocument({ transactionId: "revert-1", expectedSha256 });

    expect(reverted?.blob).toBe(blob);
    expect(reverted?.receipt).toEqual({
      operation: "revert",
      transactionId: "revert-1",
      sequence: null,
      revision: null,
      sha256: expectedSha256,
      byteLength: blob.size,
      bound: true,
      conflict: false,
      verified: true,
    });
    expect(JSON.stringify(reverted?.receipt)).not.toContain("Secret.pitched");

    const changed = new Blob(["externally changed bytes"]);
    setWindow({
      __DRIFT_NATIVE_MAC__: nativeMarker(),
      __driftNativeDocumentTransaction: vi.fn(async (request: NativeMacDocumentTransactionRequest) => ({
        operation: request.operation,
        transactionId: request.transactionId,
        sequence: null,
        revision: null,
        sha256: expectedSha256,
        byteLength: changed.size,
        bound: true,
        conflict: false,
        blob: changed,
      })),
    });
    await expect(revertNativeMacDocument({
      transactionId: "revert-stale",
      expectedSha256,
    })).rejects.toMatchObject({ name: "DataError" });
  });

  it("fails closed when a native runtime lacks the document transaction hook", async () => {
    setWindow({ __DRIFT_NATIVE_MAC__: nativeMarker() });
    const started = beginProjectSave(recordProjectMutation(createProjectRevisionState()));
    await expect(saveNativeMacDocument({
      transactionId: "missing-hook",
      ticket: started.ticket,
      blob: new Blob(["project"]),
    })).rejects.toMatchObject({ name: "NotSupportedError" });
  });
});
