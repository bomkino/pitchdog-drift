(() => {
  "use strict";

  const DRIFT_NATIVE_BRIDGE_VERSION = 1;
  const handler = window.webkit?.messageHandlers?.driftNative;
  if (!handler) return;

  const pending = new Map();
  let requestCounter = 0;
  const TRANSFER_CHUNK_BYTES = 384 * 1024;
  const READ_CHUNK_BYTES = 1024 * 1024;

  function nextRequestId() {
    requestCounter += 1;
    return `drift-${Date.now().toString(36)}-${requestCounter.toString(36)}`;
  }

  function nativeError(raw) {
    const name = typeof raw?.name === "string" ? raw.name : "InvalidStateError";
    const message = typeof raw?.message === "string" ? raw.message : "The macOS bridge could not complete that operation.";
    return new DOMException(message, name);
  }

  function callNative(command, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = nextRequestId();
      pending.set(id, { resolve, reject });
      try {
        handler.postMessage({ id, command, payload });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  Object.defineProperty(window, "__driftNativeResolve", {
    configurable: false,
    enumerable: false,
    writable: false,
    value(id, envelope) {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      if (envelope?.ok) request.resolve(envelope.value);
      else request.reject(nativeError(envelope?.error));
    },
  });

  function clampFilename(value, fallback = "Drift Export") {
    const source = typeof value === "string" ? value : fallback;
    const leaf = source.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
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
          if (/^[A-Za-z0-9]{1,16}$/.test(normalized)) extensions.push(normalized.toLowerCase());
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
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
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
      await callNative("write-chunk", {
        session,
        position: cursor,
        data: bytesToBase64(part),
      });
      cursor += part.byteLength;
    }
    return cursor;
  }

  class NativeWritableFileStream extends WritableStream {
    constructor(fileToken, options = {}) {
      const state = {
        fileToken,
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
              const bytes = await toBytes(chunk.data);
              state.position = await writeBytes(session, bytes, position);
              return;
            }
          }

          const bytes = await toBytes(chunk);
          state.position = await writeBytes(session, bytes, state.position);
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
            // Opening may itself have failed or been cancelled. Nothing persistent
            // is then available for the bridge to roll back.
          }
        },
      });
    }

    async write(data) {
      const writer = this.getWriter();
      try {
        await writer.write(data);
      } finally {
        writer.releaseLock();
      }
    }

    async seek(position) {
      await this.write({ type: "seek", position });
    }

    async truncate(size) {
      await this.write({ type: "truncate", size });
    }

    async close() {
      const writer = this.getWriter();
      try {
        await writer.close();
      } finally {
        writer.releaseLock();
      }
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
      const parts = [];
      for (let offset = 0; offset < info.size; offset += READ_CHUNK_BYTES) {
        const result = await callNative("file-read", {
          token: this._token,
          offset,
          length: Math.min(READ_CHUNK_BYTES, info.size - offset),
        });
        parts.push(base64ToBytes(result.data));
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
      const result = await callNative("directory-get-file", {
        token: this._token,
        name: clampFilename(name, "frame.png"),
        create: options.create === true,
      });
      return new NativeFileHandle(result.token, result.name, result.mimeType);
    }

    async removeEntry(name, options = {}) {
      if (options.recursive) {
        throw new DOMException("Recursive directory deletion is not exposed to the renderer.", "NotSupportedError");
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
      window.dispatchEvent(new CustomEvent("drift-native-save", { detail: { status: "started", name: anchor.download } }));
      try {
        const response = await fetch(anchor.href);
        if (!response.ok) throw new Error(`Could not read generated download (${response.status}).`);
        await saveBlob(await response.blob(), anchor.download);
        window.dispatchEvent(new CustomEvent("drift-native-save", { detail: { status: "complete", name: anchor.download } }));
      } catch (error) {
        if (error?.name !== "AbortError") console.error("Native save failed", error);
        window.dispatchEvent(new CustomEvent("drift-native-save", {
          detail: { status: error?.name === "AbortError" ? "cancelled" : "failed", name: anchor.download },
        }));
      }
    })();
  }, true);

  Object.defineProperties(window, {
    showSaveFilePicker: { configurable: true, writable: true, value: showSaveFilePicker },
    showDirectoryPicker: { configurable: true, writable: true, value: showDirectoryPicker },
    __driftNativeSaveBlob: { configurable: false, writable: false, value: saveBlob },
    __DRIFT_NATIVE_MAC__: {
      configurable: false,
      writable: false,
      value: Object.freeze({ bridgeVersion: DRIFT_NATIVE_BRIDGE_VERSION, platform: "macOS" }),
    },
  });

  if (typeof window.FileSystemFileHandle === "undefined") {
    Object.defineProperty(window, "FileSystemFileHandle", { configurable: true, value: NativeFileHandle });
  }
  if (typeof window.FileSystemDirectoryHandle === "undefined") {
    Object.defineProperty(window, "FileSystemDirectoryHandle", { configurable: true, value: NativeDirectoryHandle });
  }

  void callNative("runtime-info").then((runtime) => {
    window.dispatchEvent(new CustomEvent("drift-native-ready", { detail: runtime }));
  }).catch((error) => console.error("Drift native bridge failed to initialize", error));
})();
