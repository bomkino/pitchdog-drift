import { useEffect, useRef, useState } from "react";
import {
  dispatchNativeMacFiles,
  isNativeMacRuntime,
  pickNativeMacFiles,
  type NativeMacImportKind,
} from "../lib/nativeMac";
import { WarningCircleIcon, XIcon } from "./icons";

const INPUT_BRIDGE_ERROR_EVENT = "drift-native-file-input-error";

export function nativeImportKindForInput(input: HTMLInputElement): NativeMacImportKind {
  const accept = input.accept.toLowerCase();
  if (accept.includes(".pitched") || accept.includes("pitchdog.pitched")) return "project";
  if (accept.includes("video/") || accept.includes(".mp4") || accept.includes(".mov") || accept.includes(".webm")) {
    return "presenter";
  }
  return "slides";
}

/** Browser-only compatibility helper retained for ordinary DOM input tests. */
export function assignFilesAndDispatchChange(input: HTMLInputElement, files: readonly File[]): void {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function userFacingError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "";
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The selected files could not be opened.";
}

/**
 * Native File-menu commands ultimately activate the same hidden inputs used by
 * the browser build. On macOS, intercept those activations before WebKit opens
 * its generic file panel and route them through Drift's explicit, typed native
 * picker instead. Verified File objects enter the installed React app bridge
 * directly because WKWebView does not reliably synthesize a writable FileList.
 */
export function NativeFileInputBridge() {
  const pickerActive = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "file" || input.disabled) return;
      if (!isNativeMacRuntime()) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (pickerActive.current) {
        setError("Finish or cancel the open file chooser before starting another import.");
        return;
      }

      pickerActive.current = true;
      setError(null);
      const kind = nativeImportKindForInput(input);
      void pickNativeMacFiles(kind, input.multiple)
        .then(async (files) => {
          if (files === null) {
            throw new Error("Drift's native file bridge is unavailable. Reload the studio and try again.");
          }
          if (files.length > 0 && !await dispatchNativeMacFiles(kind, files)) {
            throw new Error("Drift's React import bridge is unavailable. Reload the studio and try again.");
          }
        })
        .catch((caught: unknown) => {
          const message = userFacingError(caught);
          if (message) {
            setError(message);
            window.dispatchEvent(new CustomEvent(INPUT_BRIDGE_ERROR_EVENT, { detail: { message } }));
          }
        })
        .finally(() => {
          pickerActive.current = false;
        });
    };

    document.documentElement.dataset.driftNativeFileInputBridge = "ready";
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      delete document.documentElement.dataset.driftNativeFileInputBridge;
    };
  }, []);

  if (!error) return null;
  return (
    <div className="notice" data-kind="error" role="alert" aria-live="assertive">
      <WarningCircleIcon className="notice-icon" />
      <p>{error}</p>
      <button type="button" onClick={() => setError(null)} aria-label="Dismiss native file error"><XIcon /></button>
    </div>
  );
}
