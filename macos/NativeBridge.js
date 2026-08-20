(() => {
  "use strict";

  const DRIFT_NATIVE_BRIDGE_VERSION = 2;
  const handler = window.webkit?.messageHandlers?.driftNative;
  if (!handler || window.top !== window) return;

  const TRANSFER_CHUNK_BYTES = 384 * 1024;
  const READ_CHUNK_BYTES = 1024 * 1024;
  const MAX_READBACK_BYTES = 512 * 1024 * 1024;
  const nativeInputClick = HTMLInputElement.prototype.click;
  let nativeSavePending = false;
  let stateTimer = 0;
  let statusHost = null;

  function nativeError(raw) {
    const name = typeof raw?.name === "string" ? raw.name : "InvalidStateError";
    const message = typeof raw?.message === "string"
      ? raw.message
      : "The macOS bridge could not complete that operation.";
    return new DOMException(message, name);
  }

  async function callNative(command, payload = {}) {
    let envelope;
    try {
      envelope = await handler.postMessage({ command, payload });
    } catch (error) {
      throw error instanceof Error ? error : new DOMException(String(error), "InvalidStateError");
    }
    if (envelope?.ok) return envelope.value;
    throw nativeError(envelope?.error);
  }

  function clampFilename(value, fallback = "Drift Export") {
    const source = typeof value === "string" ? value : fallback;
    const leaf = source
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\u0000-\u001f\u007f]/g, "")
      .trim();
    if (!leaf || leaf === "." || leaf === "..") return fallback;
    return [...leaf].slice(0, 240).join("");
  }

  function normalizePickerOptions(options = {}) {
    const extensions = [];
    const mimeTypes = [];
    for (const type of Array.isArray(options.types) ? options.types : []) {
      if (!type || typeof type !== "object" || !type.accept || typeof type.accept !== "object") continue;
      for (const [mimeType, values] of Object.entries(type.accept)) {
        if (typeof mimeType === "string" && mimeType.length > 0) mimeTypes.push(mimeType);
        for (const extension of Array.isArray(values) ? values : []) {
          if (typeof extension !== "string") continue;
          const normalized = extension.startsWith(".") ? extension.slice(1) : extension;
          if (/^[A-Za-z0-9]{1,24}$/.test(normalized)) extensions.push(normalized.toLowerCase());
        }
      }
    }
    return {
      suggestedName: clampFilename(options.suggestedName),
      extensions: [...new Set(extensions)],
      mimeTypes: [...new Set(mimeTypes)],
    };
  }

  function assertSafeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new DOMException(`${label} must be a non-negative safe integer.`, "TypeError");
    }
    return value;
  }

  async function toBytes(value) {
    if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (typeof value === "string") return new TextEncoder().encode(value);
    throw new DOMException("Writable data must be a Blob, string, ArrayBuffer, or typed array.", "TypeError");
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const block = 0x8000;
    for (let offset = 0; offset < bytes.byteLength; offset += block) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + block, bytes.byteLength)));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function writeBytes(session, bytes, position) {
    let cursor = position;
    for (let offset = 0; offset < bytes.byteLength; offset += TRANSFER_CHUNK_BYTES) {
      const part = bytes.subarray(offset, Math.min(offset + TRANSFER_CHUNK_BYTES, bytes.byteLength));
      const result = await callNative("write-chunk", {
        session,
        position: cursor,
        data: bytesToBase64(part),
      });
      if (result?.bytesWritten !== part.byteLength) {
        throw new DOMException("Native write completed with a short byte count.", "DataError");
      }
      cursor += part.byteLength;
    }
    return cursor;
  }

  class NativeWritableFileStream extends WritableStream {
    constructor(fileToken, options = {}) {
      const state = {
        position: 0,
        session: null,
        opening: null,
        finished: false,
      };
      state.opening = callNative("write-open", {
        token: fileToken,
        keepExistingData: options.keepExistingData === true,
      }).then((result) => {
        state.session = result.session;
        return result;
      });

      super({
        async write(chunk) {
          if (state.finished) throw new DOMException("The writable file is already closed.", "InvalidStateError");
          const opened = await state.opening;
          const session = state.session ?? opened.session;

          if (chunk && typeof chunk === "object" && typeof chunk.type === "string") {
            if (chunk.type === "seek") {
              state.position = assertSafeInteger(chunk.position, "Seek position");
              return;
            }
            if (chunk.type === "truncate") {
              const size = assertSafeInteger(chunk.size, "Truncate size");
              await callNative("write-truncate", { session, size });
              state.position = Math.min(state.position, size);
              return;
            }
            if (chunk.type === "write") {
              const position = chunk.position === undefined
                ? state.position
                : assertSafeInteger(chunk.position, "Write position");
              state.position = await writeBytes(session, await toBytes(chunk.data), position);
              return;
            }
          }

          state.position = await writeBytes(session, await toBytes(chunk), state.position);
        },
        async close() {
          if (state.finished) return;
          const opened = await state.opening;
          state.finished = true;
          await callNative("write-close", { session: state.session ?? opened.session });
        },
        async abort(reason) {
          if (state.finished) return;
          state.finished = true;
          try {
            const opened = await state.opening;
            await callNative("write-abort", {
              session: state.session ?? opened.session,
              reason: reason instanceof Error ? reason.message : String(reason ?? "aborted"),
            });
          } catch {
            // If opening failed, no native staging file exists to roll back.
          }
        },
      });
    }

    async write(data) {
      const writer = this.getWriter();
      try { await writer.write(data); } finally { writer.releaseLock(); }
    }

    async seek(position) { await this.write({ type: "seek", position }); }
    async truncate(size) { await this.write({ type: "truncate", size }); }

    async close() {
      const writer = this.getWriter();
      try { await writer.close(); } finally { writer.releaseLock(); }
    }

    async abort(reason) {
      const writer = this.getWriter();
      try { await writer.abort(reason); } finally { writer.releaseLock(); }
    }
  }

  class NativeFileHandle {
    constructor(token, name, mimeType = "application/octet-stream", size = 0, lastModified = Date.now()) {
      this.kind = "file";
      this.name = name;
      this._token = token;
      this._mimeType = mimeType;
      this._size = size;
      this._lastModified = lastModified;
    }

    async createWritable(options = {}) {
      return new NativeWritableFileStream(this._token, options);
    }

    async getFile() {
      const info = await callNative("file-info", { token: this._token });
      if (!Number.isSafeInteger(info.size) || info.size < 0 || info.size > MAX_READBACK_BYTES) {
        throw new DOMException("Native readback exceeds the 512 MiB safety limit.", "QuotaExceededError");
      }
      const parts = [];
      for (let offset = 0; offset < info.size; offset += READ_CHUNK_BYTES) {
        const expected = Math.min(READ_CHUNK_BYTES, info.size - offset);
        const result = await callNative("file-read", {
          token: this._token,
          offset,
          length: expected,
        });
        const bytes = base64ToBytes(result.data);
        if (result.length !== bytes.byteLength || bytes.byteLength !== expected) {
          throw new DOMException("Native file readback returned a short or inconsistent chunk.", "DataError");
        }
        parts.push(bytes);
      }
      return new File(parts, info.name || this.name, {
        type: info.mimeType || this._mimeType,
        lastModified: info.lastModified || this._lastModified,
      });
    }

    async isSameEntry(other) {
      return other instanceof NativeFileHandle && other._token === this._token;
    }

    async queryPermission() { return "granted"; }
    async requestPermission() { return "granted"; }
    async _release() { await callNative("file-release", { token: this._token }).catch(() => undefined); }
  }

  class NativeDirectoryHandle {
    constructor(token, name) {
      this.kind = "directory";
      this.name = name;
      this._token = token;
    }

    async getFileHandle(name, options = {}) {
      const result = await callNative("directory-get-file", {
        token: this._token,
        name: clampFilename(name, "frame.png"),
        create: options.create === true,
      });
      return new NativeFileHandle(
        result.token,
        result.name,
        result.mimeType,
        result.size,
        result.lastModified,
      );
    }

    async removeEntry(name, options = {}) {
      if (options.recursive) {
        throw new DOMException("Recursive directory deletion is not exposed to Drift’s renderer.", "NotSupportedError");
      }
      await callNative("directory-remove-entry", {
        token: this._token,
        name: clampFilename(name, "frame.png"),
      });
    }

    async isSameEntry(other) {
      return other instanceof NativeDirectoryHandle && other._token === this._token;
    }

    async queryPermission() { return "granted"; }
    async requestPermission() { return "granted"; }
    async _release() { await callNative("directory-release", { token: this._token }).catch(() => undefined); }
  }

  function fileHandleFromDescriptor(result) {
    return new NativeFileHandle(
      result.token,
      result.name,
      result.mimeType,
      result.size,
      result.lastModified,
    );
  }

  async function showSaveFilePicker(options = {}) {
    const result = await callNative("pick-save", normalizePickerOptions(options));
    if (result.cancelled) throw new DOMException("The save panel was cancelled.", "AbortError");
    return fileHandleFromDescriptor(result);
  }

  async function showDirectoryPicker() {
    const result = await callNative("pick-directory");
    if (result.cancelled) throw new DOMException("The directory panel was cancelled.", "AbortError");
    return new NativeDirectoryHandle(result.token, result.name);
  }

  async function showOpenFilePicker(options = {}) {
    const accepts = normalizePickerOptions(options);
    const kind = accepts.extensions.includes("pitched")
      ? "project"
      : accepts.mimeTypes.some((value) => value.startsWith("video/"))
        ? "presenter"
        : "slides";
    const result = await callNative("pick-open-files", {
      kind,
      multiple: options.multiple === true,
      extensions: accepts.extensions,
      mimeTypes: accepts.mimeTypes,
    });
    if (result.cancelled) throw new DOMException("The open panel was cancelled.", "AbortError");
    return result.files.map(fileHandleFromDescriptor);
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

  function kindForInput(input) {
    const accept = String(input.accept || "").toLowerCase();
    if (accept.includes("image/")) return "slides";
    if (accept.includes("video/")) return "presenter";
    return "project";
  }

  function recordInputIntent(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
    const accepts = String(input.accept || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    void callNative("input-intent", {
      kind: kindForInput(input),
      accepts,
      multiple: input.multiple,
    }).catch(() => undefined);
  }

  HTMLInputElement.prototype.click = function patchedFileInputClick() {
    if (this.type === "file") recordInputIntent(this);
    return nativeInputClick.call(this);
  };

  document.addEventListener("pointerdown", (event) => {
    const input = event.composedPath?.().find((node) => node instanceof HTMLInputElement && node.type === "file");
    if (input) recordInputIntent(input);
  }, true);

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
    nativeSavePending = true;
    showNativeStatus(`Choose where to save ${clampFilename(anchor.download)}…`, "working");

    void (async () => {
      try {
        const response = await fetch(anchor.href);
        if (!response.ok) throw new Error(`Could not read the generated file (${response.status}).`);
        await saveBlob(await response.blob(), anchor.download);
        showNativeStatus("Saved. Use File → Reveal Last Export in Finder.", "complete");
      } catch (error) {
        if (error?.name === "AbortError") {
          showNativeStatus("Save cancelled. No file was written.", "quiet");
        } else {
          console.error("Native save failed", error);
          showNativeStatus(error?.message || "The file could not be saved.", "failed");
        }
      } finally {
        nativeSavePending = false;
        scheduleStateReport();
      }
    })();
  }, true);

  async function descriptorToFile(descriptor) {
    const handle = fileHandleFromDescriptor(descriptor);
    try {
      return await handle.getFile();
    } finally {
      await handle._release();
    }
  }

  async function importGranted(descriptor, kind = "project") {
    try {
      const file = await descriptorToFile(descriptor);
      let input;
      if (kind === "slides") input = document.querySelector('input[type="file"][accept*="image/"]');
      else if (kind === "presenter") input = document.querySelector('input[type="file"][accept*="video/"]');
      else input = document.querySelector('input[type="file"][accept*=".pitched"]');
      if (!(input instanceof HTMLInputElement)) {
        throw new Error("The matching Drift import control is not available yet.");
      }
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (error) {
      console.error("Native import failed", error);
      showNativeStatus(error?.message || "The selected project could not be opened.", "failed");
    }
  }

  function clickByText(text) {
    const button = [...document.querySelectorAll("button")]
      .find((candidate) => candidate.textContent?.trim() === text && !candidate.disabled);
    if (!(button instanceof HTMLButtonElement)) {
      showNativeStatus(`“${text}” is unavailable while Drift is busy.`, "quiet");
      return false;
    }
    button.click();
    return true;
  }

  function clickInput(selector) {
    const input = document.querySelector(selector);
    if (!(input instanceof HTMLInputElement) || input.disabled) {
      showNativeStatus("That import is unavailable while Drift is busy.", "quiet");
      return false;
    }
    input.click();
    return true;
  }

  function nativeCommand(command) {
    switch (command) {
      case "open-project": return clickInput('input[type="file"][accept*=".pitched"]');
      case "add-slides": return clickInput('input[type="file"][accept*="image/"]');
      case "add-presenter": return clickInput('input[type="file"][accept*="video/"]');
      case "save-project": return clickByText("Save portable project");
      case "export-mp4": return clickByText("Export MP4 master");
      case "export-still": return clickByText("Save transparent-safe PNG");
      case "export-frames": return clickByText("Export PNG sequence");
      case "toggle-playback": {
        const button = document.querySelector('button[aria-label="Play preview"], button[aria-label="Pause preview"]');
        if (button instanceof HTMLButtonElement && !button.disabled) { button.click(); return true; }
        return false;
      }
      case "previous-slide": {
        const button = document.querySelector('button[aria-label="Previous slide"]');
        if (button instanceof HTMLButtonElement && !button.disabled) { button.click(); return true; }
        return false;
      }
      case "next-slide": {
        const button = document.querySelector('button[aria-label="Next slide"]');
        if (button instanceof HTMLButtonElement && !button.disabled) { button.click(); return true; }
        return false;
      }
      case "toggle-focus": return clickByText("Full frame") || clickByText("Exit full frame");
      default: return false;
    }
  }

  function ensureNativeStyle() {
    document.documentElement.dataset.driftNativeMac = "true";
    const style = document.createElement("style");
    style.id = "drift-native-mac-style";
    style.textContent = `
      html[data-drift-native-mac="true"] .app-header {
        padding-left: max(96px, 6vw) !important;
      }
      #drift-native-status-host {
        position: fixed;
        left: 50%;
        bottom: 28px;
        z-index: 2147483647;
        transform: translateX(-50%);
        max-width: min(560px, calc(100vw - 40px));
        padding: 10px 14px;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 999px;
        background: rgba(18,18,22,.9);
        color: rgba(255,255,255,.92);
        box-shadow: 0 18px 60px rgba(0,0,0,.38);
        font: 500 12px/1.35 -apple-system, BlinkMacSystemFont, sans-serif;
        letter-spacing: .01em;
        backdrop-filter: blur(22px) saturate(1.2);
        -webkit-backdrop-filter: blur(22px) saturate(1.2);
        pointer-events: none;
        opacity: 0;
        transition: opacity 160ms ease, transform 160ms ease;
      }
      #drift-native-status-host[data-visible="true"] {
        opacity: 1;
        transform: translateX(-50%) translateY(-2px);
      }
      #drift-native-status-host[data-kind="failed"] {
        border-color: rgba(255,112,112,.35);
      }
    `;
    document.head.append(style);
  }

  function showNativeStatus(message, kind = "quiet") {
    if (!document.body) return;
    if (!statusHost) {
      statusHost = document.createElement("div");
      statusHost.id = "drift-native-status-host";
      statusHost.setAttribute("role", kind === "failed" ? "alert" : "status");
      statusHost.setAttribute("aria-live", "polite");
      document.body.append(statusHost);
    }
    statusHost.textContent = String(message);
    statusHost.dataset.kind = kind;
    statusHost.dataset.visible = "true";
    clearTimeout(statusHost._hideTimer);
    statusHost._hideTimer = setTimeout(() => {
      if (statusHost) statusHost.dataset.visible = "false";
    }, kind === "failed" ? 9000 : kind === "working" ? 12000 : 5200);
  }

  function readClientState() {
    const statusText = [...document.querySelectorAll(".header-status span")]
      .map((node) => node.textContent?.trim() || "")
      .find((text) => /loading local project|saving locally|local save failed|recovery locked|saved locally/.test(text)) || "loading local project";
    let saveState = "loading";
    if (statusText.includes("saving")) saveState = "saving";
    else if (statusText.includes("failed")) saveState = "failed";
    else if (statusText.includes("recovery")) saveState = "recovery";
    else if (statusText.includes("saved")) saveState = "saved";

    const notice = document.querySelector(".notice p")?.textContent?.trim() || null;
    return {
      exportInProgress: Boolean(document.querySelector(".export-overlay")),
      projectBusy: document.querySelector("main.app")?.getAttribute("aria-busy") === "true"
        || Boolean(document.querySelector('.media-library[aria-busy="true"], .inspector[aria-busy="true"]')),
      saveState,
      lastNotice: notice,
    };
  }

  function suppressPrematureBrowserSuccess() {
    if (!nativeSavePending) return;
    const notice = document.querySelector('.notice[data-kind="good"] p');
    if (!(notice instanceof HTMLElement)) return;
    const text = notice.textContent || "";
    if (/portable project saved|PNG captured|ZIP/.test(text)) {
      notice.textContent = "Choose a destination in the macOS save panel…";
      notice.closest(".notice")?.setAttribute("data-kind", "quiet");
    }
  }

  function scheduleStateReport() {
    clearTimeout(stateTimer);
    stateTimer = setTimeout(() => {
      suppressPrematureBrowserSuccess();
      void callNative("client-state", readClientState()).catch(() => undefined);
    }, 60);
  }

  function installGlobals() {
    Object.defineProperties(window, {
      showSaveFilePicker: { configurable: true, writable: true, value: showSaveFilePicker },
      showDirectoryPicker: { configurable: true, writable: true, value: showDirectoryPicker },
      showOpenFilePicker: { configurable: true, writable: true, value: showOpenFilePicker },
      __driftNativeSaveBlob: { configurable: false, writable: false, value: saveBlob },
      __driftNativeImportGranted: { configurable: false, writable: false, value: importGranted },
      __driftNativeCommand: { configurable: false, writable: false, value: nativeCommand },
      __DRIFT_NATIVE_MAC__: {
        configurable: false,
        writable: false,
        value: Object.freeze({
          bridgeVersion: DRIFT_NATIVE_BRIDGE_VERSION,
          platform: "macOS",
          systemCodecsOnly: true,
        }),
      },
    });

    try {
      Object.defineProperty(window, "FileSystemFileHandle", { configurable: true, value: NativeFileHandle });
      Object.defineProperty(window, "FileSystemDirectoryHandle", { configurable: true, value: NativeDirectoryHandle });
    } catch {
      // Constructors are only capability markers for Drift; existing WebKit
      // globals may be non-configurable, while picker results still use ours.
    }
  }

  installGlobals();

  const boot = () => {
    ensureNativeStyle();
    const observer = new MutationObserver(scheduleStateReport);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    scheduleStateReport();
    void callNative("runtime-info").then((runtime) => {
      window.dispatchEvent(new CustomEvent("drift-native-ready", { detail: runtime }));
    }).catch((error) => {
      console.error("Drift native bridge failed to initialize", error);
      showNativeStatus("The native macOS bridge could not initialize.", "failed");
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
