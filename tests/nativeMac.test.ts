import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installNativeMacAppBridge,
  isNativeMacRuntime,
  reportNativeMacClientState,
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
  it("stays inert in the ordinary browser and test runtime", () => {
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

  it("reports bounded authoritative app state instead of scraping rendered copy", () => {
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
      lastNotice: "x".repeat(2_100),
    });

    expect(report).toHaveBeenCalledWith({
      exportInProgress: true,
      projectBusy: true,
      saveState: "failed",
      lastNotice: "x".repeat(2_000),
    });
  });
});
