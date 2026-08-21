import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installNativeMacAppBridge,
  isNativeMacRuntime,
  pickNativeMacFiles,
  reportNativeMacClientState,
  saveNativeMacBlob,
  type NativeMacAppBridge,
} from "../src/lib/nativeMac";

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
    documentAuthority: "native-issued",
  };
}

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

describe("native macOS app contract", () => {
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
  });

  it("rejects a macOS marker without native-issued document authority", () => {
    setWindow({
      __DRIFT_NATIVE_MAC__: {
        bridgeVersion: 2,
        platform: "macOS",
        systemCodecsOnly: true,
      },
    });
    expect(isNativeMacRuntime()).toBe(false);
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
        description: "Pitch-deck images",
        accept: {
          "image/png": [".png"],
          "image/jpeg": [".jpg", ".jpeg"],
          "image/webp": [".webp"],
          "image/avif": [".avif"],
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
});
