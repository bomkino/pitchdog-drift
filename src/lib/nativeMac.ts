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
  documentAuthority: "native-issued";
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
    __driftNativeSaveBlob?: (blob: Blob, suggestedName: string) => Promise<void>;
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

export function isNativeMacRuntime(): boolean {
  return typeof window !== "undefined"
    && window.__DRIFT_NATIVE_MAC__?.platform === "macOS"
    && window.__DRIFT_NATIVE_MAC__.bridgeVersion === 2
    && window.__DRIFT_NATIVE_MAC__.systemCodecsOnly === true
    && window.__DRIFT_NATIVE_MAC__.documentAuthority === "native-issued";
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
