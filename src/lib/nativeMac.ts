export const NATIVE_MAC_COMMANDS = [
  "open-project",
  "add-slides",
  "add-presenter",
  "save-project",
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

export interface NativeMacClientState {
  exportInProgress: boolean;
  projectBusy: boolean;
  saveState: NativeMacSaveState;
  lastNotice: string | null;
}

export interface NativeMacAppBridge {
  command: (command: NativeMacCommand) => boolean | void | Promise<boolean | void>;
  importFile: (kind: NativeMacImportKind, file: File) => void | Promise<void>;
}

interface NativeMacRuntimeMarker {
  bridgeVersion: number;
  platform: "macOS";
  systemCodecsOnly: true;
}

declare global {
  interface Window {
    __DRIFT_NATIVE_MAC__?: Readonly<NativeMacRuntimeMarker>;
    __driftNativeInstallAppBridge?: (bridge: NativeMacAppBridge) => void | (() => void);
    __driftNativeReportClientState?: (state: NativeMacClientState) => void;
    __driftNativeSaveBlob?: (blob: Blob, suggestedName: string) => Promise<void>;
  }
}

export function isNativeMacRuntime(): boolean {
  return typeof window !== "undefined"
    && window.__DRIFT_NATIVE_MAC__?.platform === "macOS"
    && window.__DRIFT_NATIVE_MAC__.bridgeVersion === 2;
}

export function installNativeMacAppBridge(bridge: NativeMacAppBridge): () => void {
  if (!isNativeMacRuntime() || typeof window.__driftNativeInstallAppBridge !== "function") {
    return () => undefined;
  }
  const cleanup = window.__driftNativeInstallAppBridge(bridge);
  return typeof cleanup === "function" ? cleanup : () => undefined;
}

export function reportNativeMacClientState(state: NativeMacClientState): void {
  if (!isNativeMacRuntime() || typeof window.__driftNativeReportClientState !== "function") return;
  window.__driftNativeReportClientState({
    exportInProgress: state.exportInProgress,
    projectBusy: state.projectBusy,
    saveState: state.saveState,
    // Notices can include confidential deck or media filenames. AppKit needs
    // only a presence signal for diagnostics; the renderer keeps the real copy.
    lastNotice: state.lastNotice ? "present" : null,
  });
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
