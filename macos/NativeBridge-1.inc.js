    }

    async abort(reason) {
      const writer = this.getWriter();
      try {
        await writer.abort(reason);
      } finally {
        writer.releaseLock();
      }
    }
  }

  class NativeFileHandle {
    constructor(token, name, mimeType = "application/octet-stream") {
      this.kind = "file";
      this.name = name;
      this._token = token;
      this._mimeType = mimeType;
    }

    async createWritable(options = {}) {
      return new NativeWritableFileStream(this._token, options);
    }

    async getFile() {
      const info = await callNative("file-info", { token: this._token });
      if (!Number.isSafeInteger(info.size) || info.size < 0 || info.size > MAX_READBACK_BYTES) {
        throw new DOMException(
          "This persisted file is too large for safe in-memory verification. Reduce output size or duration.",
          "QuotaExceededError",
        );
      }
      const parts = [];
      for (let offset = 0; offset < info.size; offset += READ_CHUNK_BYTES) {
        const result = await callNative("file-read", {
          token: this._token,
          offset,
          length: Math.min(READ_CHUNK_BYTES, info.size - offset),
        });
        const bytes = base64ToBytes(result.data);
        if (bytes.byteLength !== result.length) {
          throw new DOMException("Native file readback returned inconsistent bytes.", "DataError");
        }
        parts.push(bytes);
      }
      return new File(parts, info.name || this.name, {
        type: info.mimeType || this._mimeType,
        lastModified: info.lastModified || Date.now(),
      });
    }

    async isSameEntry(other) {
      return other instanceof NativeFileHandle && other._token === this._token;
    }

    async queryPermission() { return "granted"; }
    async requestPermission() { return "granted"; }
  }

  class NativeDirectoryHandle {
    constructor(token, name) {
      this.kind = "directory";
      this.name = name;
      this._token = token;
    }

    async getFileHandle(name, options = {}) {
      const safeName = clampFilename(name, "frame.png");
      if (safeName !== name) {
        throw new DOMException("File names may not contain path separators or control characters.", "TypeError");
      }
      const result = await callNative("directory-get-file", {
        token: this._token,
        name: safeName,
        create: options.create === true,
      });
      return new NativeFileHandle(result.token, result.name, result.mimeType);
    }

    async removeEntry(name, options = {}) {
      if (options.recursive) {
        throw new DOMException(
          "Recursive directory deletion is not exposed to the renderer.",
          "NotSupportedError",
        );
      }
      const safeName = clampFilename(name, "frame.png");
      if (safeName !== name) {
        throw new DOMException("File names may not contain path separators or control characters.", "TypeError");
      }
      await callNative("directory-remove-entry", { token: this._token, name: safeName });
    }

    async isSameEntry(other) {
      return other instanceof NativeDirectoryHandle && other._token === this._token;
    }

    async queryPermission() { return "granted"; }
    async requestPermission() { return "granted"; }
  }

  async function showSaveFilePicker(options = {}) {
    const result = await callNative("pick-save", normalizePickerOptions(options));
    if (result.cancelled) throw new DOMException("The save panel was cancelled.", "AbortError");
    return new NativeFileHandle(result.token, result.name, result.mimeType);
  }

  async function showDirectoryPicker() {
    const result = await callNative("pick-directory");
    if (result.cancelled) throw new DOMException("The directory panel was cancelled.", "AbortError");
    return new NativeDirectoryHandle(result.token, result.name);
  }

  function ensureNativeToastStyles() {
    if (document.getElementById("drift-native-toast-styles")) return;
    const style = document.createElement("style");
    style.id = "drift-native-toast-styles";
    style.textContent = `
      html[data-drift-native-save="active"] .notice { display: none !important; }
      #drift-native-toast-host {
        position: fixed; inset: auto 24px 24px auto; z-index: 2147483647;
        display: grid; gap: 8px; max-width: min(420px, calc(100vw - 48px));
        pointer-events: none; font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .drift-native-toast {
        padding: 12px 14px; border-radius: 14px; color: rgba(255,255,255,.96);
        background: rgba(22,22,26,.92); border: 1px solid rgba(255,255,255,.14);
        box-shadow: 0 18px 48px rgba(0,0,0,.35); backdrop-filter: blur(18px);
      }
      .drift-native-toast[data-kind="error"] { border-color: rgba(255,110,110,.55); }
    `;
    document.head.append(style);
  }

  function showNativeToast(message, kind = "quiet", persistent = false) {
    ensureNativeToastStyles();
    let host = document.getElementById("drift-native-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "drift-native-toast-host";
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      document.body.append(host);
    }
    const toast = document.createElement("div");
    toast.className = "drift-native-toast";
    toast.dataset.kind = kind;
    toast.textContent = message;
    host.append(toast);
    if (!persistent) {
      const timer = window.setTimeout(() => {
        nativeToastTimers.delete(timer);
        toast.remove();
        if (!host?.childElementCount) host?.remove();
      }, kind === "error" ? 8000 : 4200);
      nativeToastTimers.add(timer);
    }
    return () => toast.remove();
  }

  async function saveBlob(blob, suggestedName) {
    const name = clampFilename(suggestedName);
    const extension = name.includes(".") ? name.split(".").pop() : "";
    const handle = await showSaveFilePicker({
      suggestedName: name,
      types: [{ accept: { [blob.type || "application/octet-stream"]: extension ? [`.${extension}`] : [] } }],
    });
    const writable = await handle.createWritable({ keepExistingData: false });
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      await writable.abort(error).catch(() => undefined);
      throw error;
    }
  }

  function downloadableAnchor(event) {
    for (const node of event.composedPath?.() ?? []) {
      if (node instanceof HTMLAnchorElement && node.download && node.href.startsWith("blob:")) return node;
    }
    return null;
  }

  document.addEventListener("click", (event) => {
    const anchor = downloadableAnchor(event);
    if (!anchor) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    void (async () => {
      document.documentElement.dataset.driftNativeSave = "active";
      nativeSaveActive = true;
      scheduleClientStateReport();
      const dismissProgress = showNativeToast(`Choose where to save ${anchor.download || "the export"}…`, "quiet", true);
      window.dispatchEvent(new CustomEvent("drift-native-save", {
        detail: { status: "started", name: anchor.download },
      }));
      try {
        const response = await fetch(anchor.href);
        if (!response.ok) throw new Error(`Could not read generated download (${response.status}).`);
        const blob = await response.blob();
        await saveBlob(blob, anchor.download);
        dismissProgress();
        showNativeToast(`Saved ${anchor.download || "export"}.`, "good");
        window.dispatchEvent(new CustomEvent("drift-native-save", {
          detail: { status: "complete", name: anchor.download },
        }));
      } catch (error) {
        dismissProgress();
        const cancelled = error?.name === "AbortError";
