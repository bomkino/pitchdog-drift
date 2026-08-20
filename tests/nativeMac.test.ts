import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installNativeMacAppBridge,
  isNativeMacRuntime,
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
    await expect(saveNativeMacBlob(new Blob(["browser"]), "browser.txt")).resolves.toBe(false);
  });

  it("installs the typed React bridge and returns the native cleanup", () => {
    const cleanup = vi.fn();
    const installer = vi.fn(() => cleanup);
    setWindow({
      __DRIFT_NATIVE_MAC__: {
        bridgeVersion: 2,
        platform: "macOS",
        systemCodecsOnly: true,
      },
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
      __DRIFT_NATIVE_MAC__: {
        bridgeVersion: 2,
        platform: "macOS",
        systemCodecsOnly: true,
      },
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
      __DRIFT_NATIVE_MAC__: {
        bridgeVersion: 2,
        platform: "macOS",
        systemCodecsOnly: true,
      },
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

  it("does not report export success until the native staged save resolves", async () => {
    let resolveSave: (() => void) | undefined;
    const save = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    setWindow({
      __DRIFT_NATIVE_MAC__: {
        bridgeVersion: 2,
        platform: "macOS",
        systemCodecsOnly: true,
      },
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
