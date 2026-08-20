(() => {
  "use strict";

  const DRIFT_NATIVE_BRIDGE_VERSION = 2;
  const handler = window.webkit?.messageHandlers?.driftNative;
  if (!handler || typeof handler.postMessage !== "function") return;

  const TRANSFER_CHUNK_BYTES = 384 * 1024;
  const READ_CHUNK_BYTES = 1024 * 1024;
  const MAX_READBACK_BYTES = 512 * 1024 * 1024;
  const nativeToastTimers = new Set();
  let lastReportedState = "";
  let stateReportScheduled = false;
  let nativeSaveActive = false;

  function nativeError(raw) {
    const name = typeof raw?.name === "string" ? raw.name : "InvalidStateError";
    const message = typeof raw?.message === "string"
      ? raw.message
      : "The macOS bridge could not complete that operation.";
    return new DOMException(message, name);
  }

  async function callNative(command, payload = {}) {
    const envelope = await handler.postMessage({ command, payload });
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
        if (typeof mimeType === "string" && mimeType.length > 0 && mimeType.length <= 128) {
          mimeTypes.push(mimeType);
        }
        for (const extension of Array.isArray(values) ? values : []) {
          if (typeof extension !== "string") continue;
          const normalized = extension.startsWith(".") ? extension.slice(1) : extension;
          if (/^[A-Za-z0-9]{1,16}$/.test(normalized)) extensions.push(normalized.toLowerCase());
        }
      }
    }
    return {
      suggestedName: clampFilename(options.suggestedName),
      extensions: [...new Set(extensions)].slice(0, 16),
      mimeTypes: [...new Set(mimeTypes)].slice(0, 16),
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
    throw new DOMException(
      "Writable data must be a Blob, string, ArrayBuffer, or typed array.",
      "TypeError",
    );
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
        throw new DOMException("macOS reported an incomplete export write.", "InvalidStateError");
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
        state.position = options.keepExistingData === true ? result.size : 0;
        return result;
      });

      super({
        async write(chunk) {
          if (state.finished) {
            throw new DOMException("The writable file is already closed.", "InvalidStateError");
          }
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
            // Opening may itself have failed. No committed artifact exists then.
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
