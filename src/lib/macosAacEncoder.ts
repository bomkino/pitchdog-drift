import {
  CustomAudioEncoder,
  EncodedPacket,
  registerEncoder,
  type AudioCodec,
  type AudioSample,
} from "mediabunny";
import { isNativeMacRuntime } from "./nativeMac";

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const BIT_RATE = 192_000;
const BYTES_PER_FRAME = CHANNELS * Float32Array.BYTES_PER_ELEMENT;
const AAC_PACKET_FRAMES = 1_024;
const AAC_AUDIO_SPECIFIC_CONFIG = new Uint8Array([0x11, 0x90]);
const MAX_APPEND_BYTES = 2 * 1024 * 1024;

type NativeEnvelope =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; error?: Readonly<{ name?: unknown; message?: unknown }> }>;

type NativePacketReceipt = Readonly<{
  dataBase64: string;
  byteCount: number;
  frameCount: number;
  variableFrames: number;
}>;

export type NativeAacReceipt = Readonly<{
  schemaVersion: number;
  codec: string;
  codecString: string;
  encoded: boolean;
  sampleRate: number;
  numberOfChannels: number;
  bitRate: number;
  packetFrames: number;
  packetCount: number;
  totalPacketBytes: number;
  inputFrames: number;
  leadingFrames: number;
  trailingFrames: number;
  representedFrames: number;
  frameEquationHolds: boolean;
  audioSpecificConfigBase64: string;
  magicCookieBase64: string;
  magicCookieBytes: number;
  firstTimestamp: number;
  packets: readonly NativePacketReceipt[];
}>;

type NativeAacSession = Readonly<{
  token: string;
  maximumAppendBytes: number;
}>;

interface NativeMessageHandler {
  postMessage(message: unknown): Promise<unknown>;
}

interface NativeWebKit {
  messageHandlers?: {
    driftNative?: NativeMessageHandler;
  };
}

function nativeHandler(): NativeMessageHandler | null {
  if (typeof window === "undefined" || !isNativeMacRuntime()) return null;
  const nativeWindow = window as unknown as { webkit?: NativeWebKit };
  const handler = nativeWindow.webkit?.messageHandlers?.driftNative;
  return handler && typeof handler.postMessage === "function" ? handler : null;
}

async function callNative(command: string, payload: Readonly<Record<string, unknown>>): Promise<unknown> {
  const handler = nativeHandler();
  if (!handler) {
    throw new DOMException(
      "Drift’s native AAC bridge is unavailable in this runtime.",
      "NotSupportedError",
    );
  }

  const response = await handler.postMessage({ command, payload }) as NativeEnvelope;
  if (!response || typeof response !== "object" || typeof response.ok !== "boolean") {
    throw new DOMException("Native AAC returned a malformed reply.", "DataError");
  }
  if (!response.ok) {
    const name = typeof response.error?.name === "string"
      ? response.error.name
      : "OperationError";
    const message = typeof response.error?.message === "string"
      ? response.error.message
      : "Native AAC operation failed.";
    throw new DOMException(message, name);
  }
  return response.value;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32 * 1024;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(value: string, label: string): Uint8Array {
  if (typeof value !== "string" || value.length === 0) {
    throw new DOMException(`${label} is missing.`, "DataError");
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch (error) {
    throw new DOMException(
      `${label} is not valid base64: ${error instanceof Error ? error.message : String(error)}`,
      "DataError",
    );
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new DOMException(`${label} must be a safe integer of at least ${minimum}.`, "DataError");
  }
  return value as number;
}

function exactNumber(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new DOMException(`${label} must be a finite number of at least ${minimum}.`, "DataError");
  }
  return value;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength
    && left.every((value, index) => value === right[index]);
}

export function validateNativeAacReceipt(value: unknown): NativeAacReceipt {
  if (!isRecord(value)) {
    throw new DOMException("Native AAC receipt is not an object.", "DataError");
  }

  const schemaVersion = exactInteger(value.schemaVersion, "AAC receipt schemaVersion", 1);
  const sampleRate = exactInteger(value.sampleRate, "AAC receipt sampleRate", 1);
  const numberOfChannels = exactInteger(value.numberOfChannels, "AAC receipt numberOfChannels", 1);
  const bitRate = exactInteger(value.bitRate, "AAC receipt bitRate", 1);
  const packetFrames = exactInteger(value.packetFrames, "AAC receipt packetFrames", 1);
  const packetCount = exactInteger(value.packetCount, "AAC receipt packetCount", 1);
  const totalPacketBytes = exactInteger(value.totalPacketBytes, "AAC receipt totalPacketBytes", 1);
  const inputFrames = exactInteger(value.inputFrames, "AAC receipt inputFrames", 1);
  const leadingFrames = exactInteger(value.leadingFrames, "AAC receipt leadingFrames");
  const trailingFrames = exactInteger(value.trailingFrames, "AAC receipt trailingFrames");
  const representedFrames = exactInteger(value.representedFrames, "AAC receipt representedFrames", 1);
  const magicCookieBytes = exactInteger(value.magicCookieBytes, "AAC receipt magicCookieBytes", 1);
  const firstTimestamp = exactNumber(value.firstTimestamp, "AAC receipt firstTimestamp");

  if (
    schemaVersion !== 1
    || value.codec !== "aac"
    || value.codecString !== "mp4a.40.2"
    || value.encoded !== true
    || sampleRate !== SAMPLE_RATE
    || numberOfChannels !== CHANNELS
    || bitRate !== BIT_RATE
    || packetFrames !== AAC_PACKET_FRAMES
    || value.frameEquationHolds !== true
  ) {
    throw new DOMException("Native AAC receipt changed Drift’s codec contract.", "DataError");
  }

  if (
    packetCount * packetFrames !== representedFrames
    || leadingFrames + inputFrames + trailingFrames !== representedFrames
    || trailingFrames >= packetFrames
  ) {
    throw new DOMException("Native AAC receipt failed exact frame accounting.", "DataError");
  }

  const audioSpecificConfig = base64ToBytes(
    typeof value.audioSpecificConfigBase64 === "string" ? value.audioSpecificConfigBase64 : "",
    "AAC AudioSpecificConfig",
  );
  if (!sameBytes(audioSpecificConfig, AAC_AUDIO_SPECIFIC_CONFIG)) {
    throw new DOMException("Native AAC AudioSpecificConfig is not AAC-LC 48 kHz stereo.", "DataError");
  }
  const magicCookie = base64ToBytes(
    typeof value.magicCookieBase64 === "string" ? value.magicCookieBase64 : "",
    "AAC magic cookie",
  );
  if (magicCookie.byteLength !== magicCookieBytes) {
    throw new DOMException("Native AAC magic-cookie byte count disagrees with its receipt.", "DataError");
  }

  if (!Array.isArray(value.packets) || value.packets.length !== packetCount) {
    throw new DOMException("Native AAC packet list does not match packetCount.", "DataError");
  }

  let observedPacketBytes = 0;
  for (const [index, packetValue] of value.packets.entries()) {
    if (!isRecord(packetValue)) {
      throw new DOMException(`Native AAC packet ${index + 1} is malformed.`, "DataError");
    }
    const byteCount = exactInteger(packetValue.byteCount, `AAC packet ${index + 1} byteCount`, 1);
    const frameCount = exactInteger(packetValue.frameCount, `AAC packet ${index + 1} frameCount`, 1);
    const variableFrames = exactInteger(packetValue.variableFrames, `AAC packet ${index + 1} variableFrames`);
    const data = base64ToBytes(
      typeof packetValue.dataBase64 === "string" ? packetValue.dataBase64 : "",
      `AAC packet ${index + 1}`,
    );
    if (
      data.byteLength !== byteCount
      || frameCount !== AAC_PACKET_FRAMES
      || (variableFrames !== 0 && variableFrames !== AAC_PACKET_FRAMES)
    ) {
      throw new DOMException(`Native AAC packet ${index + 1} failed its packet contract.`, "DataError");
    }
    observedPacketBytes += data.byteLength;
  }

  if (observedPacketBytes !== totalPacketBytes) {
    throw new DOMException("Native AAC packet bytes do not match totalPacketBytes.", "DataError");
  }

  return value as unknown as NativeAacReceipt;
}

export function buildNativeAacPacketTimeline(
  firstTimestamp: number,
  leadingFrames: number,
  packetCount: number,
  sampleRate = SAMPLE_RATE,
  packetFrames = AAC_PACKET_FRAMES,
): readonly Readonly<{ timestamp: number; duration: number; sequenceNumber: number }>[] {
  if (
    !Number.isFinite(firstTimestamp)
    || firstTimestamp < 0
    || !Number.isSafeInteger(leadingFrames)
    || leadingFrames < 0
    || !Number.isSafeInteger(packetCount)
    || packetCount <= 0
    || !Number.isSafeInteger(sampleRate)
    || sampleRate <= 0
    || !Number.isSafeInteger(packetFrames)
    || packetFrames <= 0
  ) {
    throw new TypeError("Native AAC packet-timeline inputs are invalid.");
  }

  const duration = packetFrames / sampleRate;
  const start = firstTimestamp - leadingFrames / sampleRate;
  return Array.from({ length: packetCount }, (_, sequenceNumber) => ({
    timestamp: start + sequenceNumber * duration,
    duration,
    sequenceNumber,
  }));
}

class NativeMacAacEncoder extends CustomAudioEncoder {
  private session: NativeAacSession | null = null;
  private firstTimestamp: number | null = null;
  private inputFrames = 0;
  private flushed = false;
  private closed = false;

  static override supports(codec: AudioCodec, config: AudioEncoderConfig): boolean {
    return codec === "aac"
      && config.sampleRate === SAMPLE_RATE
      && config.numberOfChannels === CHANNELS
      && config.bitrate === BIT_RATE
      && nativeHandler() !== null;
  }

  async init(): Promise<void> {
    if (!nativeHandler()) {
      throw new DOMException(
        "Drift’s native AudioToolbox AAC encoder is unavailable.",
        "NotSupportedError",
      );
    }
  }

  async encode(audioSample: AudioSample): Promise<void> {
    if (this.closed || this.flushed) {
      throw new DOMException("Native AAC encoder is already closed.", "InvalidStateError");
    }
    if (
      audioSample.sampleRate !== SAMPLE_RATE
      || audioSample.numberOfChannels !== CHANNELS
      || audioSample.numberOfFrames <= 0
    ) {
      throw new DOMException(
        "Native AAC accepts positive 48 kHz stereo samples only.",
        "NotSupportedError",
      );
    }

    const sampleStartFrame = Math.round(audioSample.timestamp * SAMPLE_RATE);
    if (this.firstTimestamp === null) {
      this.firstTimestamp = sampleStartFrame / SAMPLE_RATE;
      this.session = await this.createSession(this.firstTimestamp);
    } else {
      const expectedStartFrame = Math.round(this.firstTimestamp * SAMPLE_RATE) + this.inputFrames;
      if (Math.abs(sampleStartFrame - expectedStartFrame) > 1) {
        throw new DOMException(
          `Presenter PCM timeline is discontinuous by ${sampleStartFrame - expectedStartFrame} frames.`,
          "DataError",
        );
      }
    }

    const totalBytes = audioSample.allocationSize({ format: "f32", planeIndex: 0 });
    const bytes = new Uint8Array(totalBytes);
    audioSample.copyTo(bytes, { format: "f32", planeIndex: 0 });
    if (bytes.byteLength !== audioSample.numberOfFrames * BYTES_PER_FRAME) {
      throw new DOMException("Presenter PCM byte count does not match its frame count.", "DataError");
    }

    const maximumAppendBytes = Math.min(
      this.session?.maximumAppendBytes ?? MAX_APPEND_BYTES,
      MAX_APPEND_BYTES,
    );
    const maximumAppendFrames = Math.max(1, Math.floor(maximumAppendBytes / BYTES_PER_FRAME));
    for (let frameOffset = 0; frameOffset < audioSample.numberOfFrames; frameOffset += maximumAppendFrames) {
      const frameCount = Math.min(maximumAppendFrames, audioSample.numberOfFrames - frameOffset);
      const byteOffset = frameOffset * BYTES_PER_FRAME;
      const chunk = bytes.subarray(byteOffset, byteOffset + frameCount * BYTES_PER_FRAME);
      await callNative("aac-append", {
        token: this.session!.token,
        frameCount,
        dataBase64: bytesToBase64(chunk),
      });
    }
    this.inputFrames += audioSample.numberOfFrames;
  }

  async flush(): Promise<void> {
    if (this.closed) {
      throw new DOMException("Native AAC encoder is closed.", "InvalidStateError");
    }
    if (this.flushed) return;
    if (!this.session || this.firstTimestamp === null || this.inputFrames <= 0) {
      throw new DOMException("Native AAC received no presenter samples.", "DataError");
    }

    const receipt = validateNativeAacReceipt(
      await callNative("aac-finish", { token: this.session.token }),
    );
    if (
      Math.abs(receipt.firstTimestamp - this.firstTimestamp) > 1 / SAMPLE_RATE
      || receipt.inputFrames !== this.inputFrames
    ) {
      throw new DOMException("Native AAC receipt does not describe the supplied PCM timeline.", "DataError");
    }

    const timeline = buildNativeAacPacketTimeline(
      this.firstTimestamp,
      receipt.leadingFrames,
      receipt.packetCount,
    );
    const metadata: EncodedAudioChunkMetadata = {
      decoderConfig: {
        codec: "mp4a.40.2",
        numberOfChannels: CHANNELS,
        sampleRate: SAMPLE_RATE,
        description: AAC_AUDIO_SPECIFIC_CONFIG,
      },
    };

    for (let index = 0; index < receipt.packets.length; index += 1) {
      const packetReceipt = receipt.packets[index]!;
      const timing = timeline[index]!;
      const data = base64ToBytes(packetReceipt.dataBase64, `AAC packet ${index + 1}`);
      const packet = new EncodedPacket(
        data,
        "key",
        timing.timestamp,
        timing.duration,
        timing.sequenceNumber,
      );
      this.onPacket(packet, index === 0 ? metadata : undefined);
    }
    this.flushed = true;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const token = this.session?.token;
    this.session = null;
    if (token) {
      await callNative("aac-close", { token }).catch(() => undefined);
    }
  }

  private async createSession(firstTimestamp: number): Promise<NativeAacSession> {
    const value = await callNative("aac-create", {
      codec: "aac",
      sampleRate: SAMPLE_RATE,
      numberOfChannels: CHANNELS,
      bitRate: BIT_RATE,
      firstTimestamp,
    });
    if (!isRecord(value) || typeof value.token !== "string" || value.token.length === 0) {
      throw new DOMException("Native AAC create returned no bounded session token.", "DataError");
    }
    const maximumAppendBytes = exactInteger(
      value.maximumAppendBytes,
      "Native AAC maximumAppendBytes",
      BYTES_PER_FRAME,
    );
    return {
      token: value.token,
      maximumAppendBytes,
    };
  }
}

let registered = false;

/**
 * Registers Drift's macOS AudioToolbox AAC-LC encoder with Mediabunny.
 *
 * Browser builds continue to use the pinned open-source software extension.
 * The macOS bundle aliases that package to this file because WKWebView exposes
 * no AudioEncoder API. The old shim was “Intentionally empty”; this one
 * preserves presenter audio without adding FFmpeg WASM to Drift.app.
 */
export function registerAacEncoder(): void {
  if (registered) return;
  registered = true;
  registerEncoder(NativeMacAacEncoder);
}
