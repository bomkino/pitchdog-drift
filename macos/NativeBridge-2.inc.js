          cancelled ? "Save cancelled. No completed file was written." : (error?.message || "The export could not be saved."),
          cancelled ? "quiet" : "error",
        );
        if (!cancelled) console.error("Native save failed", error);
        window.dispatchEvent(new CustomEvent("drift-native-save", {
          detail: { status: cancelled ? "cancelled" : "failed", name: anchor.download },
        }));
      } finally {
        window.setTimeout(() => {
          delete document.documentElement.dataset.driftNativeSave;
        }, 4500);
      }
    })();
  }, true);


  async function readGrantedFile(descriptor) {
    const info = await callNative("file-info", { token: descriptor.token });
    if (!Number.isSafeInteger(info.size) || info.size < 0 || info.size > MAX_READBACK_BYTES) {
      throw new DOMException(
        `${descriptor.name || "Selected file"} is too large to import safely.`,
        "QuotaExceededError",
      );
    }
    const parts = [];
    for (let offset = 0; offset < info.size; offset += READ_CHUNK_BYTES) {
      const result = await callNative("file-read", {
        token: descriptor.token,
        offset,
        length: Math.min(READ_CHUNK_BYTES, info.size - offset),
      });
      const bytes = base64ToBytes(result.data);
      if (bytes.byteLength !== result.length) {
        throw new DOMException("Native import readback returned inconsistent bytes.", "DataError");
      }
      parts.push(bytes);
    }
    return new File(parts, info.name || descriptor.name || "Drift Import", {
      type: info.mimeType || descriptor.mimeType || "application/octet-stream",
      lastModified: info.lastModified || Date.now(),
    });
  }

  function inputForImportKind(kind) {
    if (kind === "images") return document.querySelector('input[type="file"][accept^="image/"][multiple]');
    if (kind === "presenter") return document.querySelector('input[type="file"][accept^="video/"]');
    if (kind === "project") return document.querySelector('input[type="file"][accept*=".pitched"]');
    return null;
  }

  async function importGrantedDescriptors(kind, descriptors) {
    const input = inputForImportKind(kind);
    if (!(input instanceof HTMLInputElement) || input.disabled) return false;
    const entries = Array.isArray(descriptors) ? descriptors : [];
    if (!entries.length) return false;
    const transfer = new DataTransfer();
    for (const descriptor of entries) transfer.items.add(await readGrantedFile(descriptor));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function importThroughNativePanel(kind) {
    const result = await callNative("pick-open-files", { kind });
    if (result.cancelled) return false;
    return importGrantedDescriptors(kind, result.files);
  }

  async function runNativeCommandSafely(command) {
    try {
      return await runNativeCommand(command);
    } catch (error) {
      const cancelled = error?.name === "AbortError";
      if (!cancelled) {
        console.error(`Native command ${command} failed`, error);
        showNativeToast(error?.message || "The native command could not be completed.", "error");
      }
      return false;
    }
  }

  function findButton(label) {
    const wanted = label.trim().toLowerCase();
    return [...document.querySelectorAll("button")].find((button) => (
      button.textContent?.trim().replace(/\s+/g, " ").toLowerCase() === wanted
    ));
  }

  function clickAvailable(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element instanceof HTMLButtonElement && element.disabled) return false;
    if (element instanceof HTMLInputElement && element.disabled) return false;
    element.click();
    return true;
  }

  async function runNativeCommand(command) {
    switch (command) {
      case "add-slides":
        return importThroughNativePanel("images");
      case "add-presenter":
        return importThroughNativePanel("presenter");
      case "open-project":
        return importThroughNativePanel("project");
      case "save-project":
        return clickAvailable(findButton("Save portable project"));
      case "export-mp4":
        return clickAvailable(findButton("Export MP4 master"));
      case "export-png":
        return clickAvailable(findButton("Save transparent-safe PNG"));
      case "export-frames":
        return clickAvailable(findButton("Export PNG sequence"));
      case "cancel-export":
        return clickAvailable(document.querySelector(".export-overlay button"));
      case "play-pause":
        return clickAvailable(document.querySelector(".play-button"));
      case "previous-slide":
        return clickAvailable(document.querySelector('button[aria-label="Previous slide"]'));
      case "next-slide":
        return clickAvailable(document.querySelector('button[aria-label="Next slide"]'));
      case "toggle-focus":
        return clickAvailable(document.querySelector(".focus-button"));
      default:
        throw new DOMException(`Unknown Drift command: ${command}`, "NotSupportedError");
    }
  }

  Object.defineProperties(window, {
    showSaveFilePicker: { configurable: true, writable: true, value: showSaveFilePicker },
    showDirectoryPicker: { configurable: true, writable: true, value: showDirectoryPicker },
    __driftNativeSaveBlob: { configurable: false, writable: false, value: saveBlob },
    __driftNativeCommand: { configurable: false, writable: false, value: runNativeCommandSafely },
    __driftNativeImportGranted: { configurable: false, writable: false, value: importGrantedDescriptors },
    __DRIFT_NATIVE_MAC__: {
      configurable: false,
      writable: false,
      value: Object.freeze({ bridgeVersion: DRIFT_NATIVE_BRIDGE_VERSION, platform: "macOS" }),
    },
  });

  if (typeof window.FileSystemFileHandle === "undefined") {
    Object.defineProperty(window, "FileSystemFileHandle", {
      configurable: true,
      value: NativeFileHandle,
    });
  }
  if (typeof window.FileSystemDirectoryHandle === "undefined") {
    Object.defineProperty(window, "FileSystemDirectoryHandle", {
      configurable: true,
      value: NativeDirectoryHandle,
    });
  }

  function currentClientState() {
    const header = document.querySelector(".header-status")?.textContent?.toLowerCase() ?? "";
    return {
      ready: Boolean(document.getElementById("studio")),
      exporting: Boolean(document.querySelector(".export-overlay")),
      saving: header.includes("saving locally"),
    };
  }

  function reportClientState() {
    stateReportScheduled = false;
    const state = currentClientState();
    const serialized = JSON.stringify(state);
    if (serialized === lastReportedState) return;
    lastReportedState = serialized;
    void callNative("client-state", state).catch((error) => {
      console.error("Could not report Drift client state", error);
    });
  }

  function scheduleClientStateReport() {
    if (stateReportScheduled) return;
    stateReportScheduled = true;
    queueMicrotask(reportClientState);
  }

  const observer = new MutationObserver(scheduleClientStateReport);
  const startObserver = () => {
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-busy", "data-kind"],
    });
    scheduleClientStateReport();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }
  window.addEventListener("pagehide", scheduleClientStateReport);
  document.addEventListener("visibilitychange", scheduleClientStateReport);

  void callNative("runtime-info").then((runtime) => {
    document.documentElement.dataset.driftNative = "macos";
    window.dispatchEvent(new CustomEvent("drift-native-ready", { detail: runtime }));
    scheduleClientStateReport();
  }).catch((error) => {
    console.error("Drift native bridge failed to initialize", error);
    showNativeToast("The macOS bridge could not initialize. Native saving is unavailable.", "error");
  });
})();
