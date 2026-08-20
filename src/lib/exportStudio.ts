import { unzipSync, zipSync } from "fflate";
import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  VideoSampleSink,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import type {
  AudioSample,
  InputAudioTrack,
  InputVideoTrack,
  MaybePromise,
  StreamTargetChunk,
  Target,
  VideoSample,
} from "mediabunny";

export const AVC_BITRATE = 16_000_000;
export const AAC_BITRATE = 192_000;
export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_CHANNELS = 2;
export const AAC_SAMPLES_PER_PACKET = 1024;
export const DEFAULT_ZIP_MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;

export const DEFAULT_EXPORT_SETTINGS = Object.freeze({
  width: 1080,
  height: 1920,
  fps: 30,
  duration: 8,
}) satisfies ExportSettings;

let softwareAacRegistration: Promise<void> | null = null;

async function ensureSoftwareAacEncoder(): Promise<void> {
  softwareAacRegistration ??= import("@mediabunny/aac-encoder").then(({ registerAacEncoder }) => {
    registerAacEncoder();
  });
  await softwareAacRegistration;
}

const MIN_DURATION_SECONDS = 3;
const MAX_DURATION_SECONDS = 30;
const MAX_EXPORT_DIMENSION = 8192;
const MAX_EXPORT_FPS = 60;
const ZIP_ENTRY_OVERHEAD_BYTES = 256;
const SAMPLE_COVERAGE_EPSILON_SECONDS = 1e-7;
// fflate reads local date fields for DOS timestamps. UTC midnight becomes 1979
// in western time zones and is rejected, so this must be local midnight.
const FIXED_ZIP_MTIME = createDeterministicZipMtime();

export type ExportCanvas = HTMLCanvasElement | OffscreenCanvas;

export type ExportSettings = Readonly<{
  width: number;
  height: number;
  fps: number;
  /** Duration in seconds. */
  duration: number;
}>;

export type ExportFrame = Readonly<{
  index: number;
  time: number;
  duration: number;
}>;

export type DecodedPresenterFrame = Readonly<{
  /** Stable canvas copy suitable for a Three.js CanvasTexture. */
  image: ExportCanvas;
  /** Valid only until renderAt resolves. */
  sample: VideoSample;
  timelineTime: number;
  sourceTime: number;
}>;

export type RenderAtContext = Readonly<{
  frameIndex: number;
  frameCount: number;
  frameDuration: number;
  width: number;
  height: number;
  signal?: AbortSignal;
}>;

/**
 * Render one complete scene state. The presenter frame is already copied to a
 * stable canvas; update any CanvasTexture inside this callback before drawing.
 */
export type RenderAt = (
  timeSeconds: number,
  presenterFrame?: DecodedPresenterFrame,
  context?: RenderAtContext,
) => MaybePromise<void>;

export type ExportProgressPhase =
  | "preparing"
  | "video"
  | "audio"
  | "rendering"
  | "writing"
  | "finalizing"
  | "complete";

export type ExportProgress = Readonly<{
  phase: ExportProgressPhase;
  completed: number;
  total: number;
  ratio: number;
  frameIndex?: number;
}>;

export type ExportProgressHandler = (progress: ExportProgress) => void;

export type ExportErrorCode =
  | "INVALID_SETTINGS"
  | "CANCELLED"
  | "AVC_UNSUPPORTED"
  | "AAC_UNSUPPORTED"
  | "CANVAS_EXPORT_UNSUPPORTED"
  | "PRESENTER_FORMAT_UNSUPPORTED"
  | "PRESENTER_VIDEO_MISSING"
  | "PRESENTER_VIDEO_UNDECODABLE"
  | "PRESENTER_AUDIO_UNDECODABLE"
  | "PRESENTER_AV_SYNC"
  | "PRESENTER_DECODE_FAILED"
  | "RENDER_FAILED"
  | "CANVAS_SIZE_CHANGED"
  | "ENCODE_FAILED"
  | "OUTPUT_VERIFICATION_FAILED"
  | "PNG_ENCODING_FAILED"
  | "PNG_INVALID"
  | "PNG_ALPHA_MISSING"
  | "ZIP_MEMORY_LIMIT"
  | "DIRECTORY_FILE_EXISTS"
  | "DIRECTORY_WRITE_FAILED"
  | "TARGET_FINALIZE_FAILED";

export class ExportStudioError extends Error {
  readonly code: ExportErrorCode;
  readonly userMessage: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: ExportErrorCode,
    userMessage: string,
    details: Readonly<Record<string, unknown>> = {},
    options?: ErrorOptions,
  ) {
    super(userMessage, options);
    this.name = "ExportStudioError";
    this.code = code;
    this.userMessage = userMessage;
    this.details = details;
  }
}

export type ExportCapabilityReport = Readonly<{
  mp4: Readonly<{
    supported: boolean;
    avc: boolean;
    aac: boolean;
    presenterAudioFpsSupported: boolean;
    maximumPresenterAudioFps: 30;
    reasons: readonly string[];
  }>;
  png: Readonly<{
    still: boolean;
    sequenceZip: boolean;
    sequenceDirectory: boolean;
  }>;
  presenter: Readonly<{
    videoDecoderApi: boolean;
    audioDecoderApi: boolean;
  }>;
  futureStreamTarget: boolean;
}>;

export interface Mp4TargetAdapter {
  readonly target: Target;
  readonly kind: string;
  /** Return null when a future streaming destination owns the completed bytes. */
  complete(mimeType: string): MaybePromise<Blob | null>;
  /** Supplies completed bytes for mandatory readback when complete returns null. */
  verificationBlob?(): MaybePromise<Blob>;
  /** Must roll back or neutralize a partial persistent artifact. */
  abort(reason?: unknown): MaybePromise<void>;
}

export type Mp4ExportOptions = Readonly<{
  canvas: ExportCanvas;
  renderAt: RenderAt;
  settings: ExportSettings;
  presenter?: Blob;
  /** Defaults true. Set false when the pinned presenter is muted. */
  includePresenterAudio?: boolean;
  signal?: AbortSignal;
  onProgress?: ExportProgressHandler;
  target?: Mp4TargetAdapter;
}>;

export type Mp4ExportResult = Readonly<{
  blob: Blob | null;
  destination: string;
  mimeType: string;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  duration: number;
  videoCodec: "avc";
  videoBitrate: typeof AVC_BITRATE;
  audio: null | Readonly<{
    codec: "aac";
    bitrate: typeof AAC_BITRATE;
    sampleRate: typeof AUDIO_SAMPLE_RATE;
    channels: typeof AUDIO_CHANNELS;
    duration: number;
  }>;
  verification: Mp4VerificationReport;
}>;

export type Mp4VerificationReport = Readonly<{
  verified: true;
  container: "mp4";
  videoCodec: "avc";
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  duration: number;
  opaque: true;
  colorSpace: VideoColorSpaceInit;
  decodedProbeFrames: number;
  audio: null | Readonly<{
    codec: "aac";
    sampleRate: typeof AUDIO_SAMPLE_RATE;
    channels: typeof AUDIO_CHANNELS;
    start: number;
    duration: number;
    decoded: true;
  }>;
}>;

type CommonPngOptions = Readonly<{
  canvas: ExportCanvas;
  renderAt: RenderAt;
  settings: ExportSettings;
  presenter?: Blob;
  signal?: AbortSignal;
  onProgress?: ExportProgressHandler;
  /** Defaults true. Fails if encoded PNG does not advertise an alpha channel. */
  requireAlpha?: boolean;
  /**
   * Defaults false. When true, decoded pixels must contain both visible content
   * and at least one non-opaque pixel, proving usable transparency.
   */
  requireTransparentPixels?: boolean;
}>;

export type PngStillOptions = CommonPngOptions & Readonly<{
  time?: number;
}>;

export type PngStillResult = Readonly<{
  blob: Blob;
  width: number;
  height: number;
  time: number;
  hasAlphaChannel: boolean;
  hasTransparentPixels: boolean;
}>;

export type PngSequenceOptions = CommonPngOptions & Readonly<{
  framePrefix?: string;
}> & (
    | Readonly<{
      destination: "directory";
      directory: FileSystemDirectoryHandle;
    }>
    | Readonly<{
      destination: "zip";
      memoryLimitBytes?: number;
    }>
  );

export type PngSequenceResult = Readonly<{
  destination: "directory" | "zip";
  blob: Blob | null;
  filenames: readonly string[];
  bytesWritten: number;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  duration: number;
}>;

type PreparedPresenter = {
  input: Input;
  videoTrack: InputVideoTrack;
  audioTrack: InputAudioTrack | null;
  videoSink: VideoSampleSink;
  timelineStart: number;
  presenterCanvas: ExportCanvas | null;
  presenterContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  dispose: () => void;
};

export type AvSyncAssessment = Readonly<{
  holds: boolean;
  toleranceSeconds: number;
  startOffsetSeconds: number;
  endOffsetSeconds: number;
  videoCoverageGapSeconds: number;
  audioCoverageGapSeconds: number;
}>;

export type AudioTrimWindow = Readonly<{
  startFrame: number;
  endFrame: number;
  outputTimestamp: number;
}>;

export type PngInspection = Readonly<{
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  hasAlphaChannel: boolean;
}>;

export type PngAlphaInspection = Readonly<{
  hasVisiblePixels: boolean;
  hasTransparentPixels: boolean;
}>;

export function validateExportSettings(settings: ExportSettings): ExportSettings {
  if (!settings || typeof settings !== "object") {
    throw invalidSettings("Export settings are missing.");
  }

  if (!Number.isInteger(settings.width) || settings.width <= 0 || settings.width > MAX_EXPORT_DIMENSION) {
    throw invalidSettings(`Width must be an integer from 1 to ${MAX_EXPORT_DIMENSION}px.`, {
      width: settings.width,
    });
  }
  if (!Number.isInteger(settings.height) || settings.height <= 0 || settings.height > MAX_EXPORT_DIMENSION) {
    throw invalidSettings(`Height must be an integer from 1 to ${MAX_EXPORT_DIMENSION}px.`, {
      height: settings.height,
    });
  }
  if (!Number.isInteger(settings.fps) || settings.fps <= 0 || settings.fps > MAX_EXPORT_FPS) {
    throw invalidSettings(`Frame rate must be an integer from 1 to ${MAX_EXPORT_FPS}fps.`, {
      fps: settings.fps,
    });
  }
  if (
    !Number.isFinite(settings.duration)
    || settings.duration < MIN_DURATION_SECONDS
    || settings.duration > MAX_DURATION_SECONDS
  ) {
    throw invalidSettings(
      `Duration must be from ${MIN_DURATION_SECONDS} to ${MAX_DURATION_SECONDS} seconds.`,
      { duration: settings.duration },
    );
  }

  const frameCount = getExportFrameCount(settings);
  if (!Number.isSafeInteger(frameCount) || frameCount <= 0) {
    throw invalidSettings("Duration and frame rate do not produce a valid frame count.", { frameCount });
  }

  return settings;
}

export function getExportFrameCount(settings: Pick<ExportSettings, "duration" | "fps">): number {
  return Math.round(settings.duration * settings.fps);
}

export function getExportFrameTime(frameIndex: number, fps: number): number {
  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw invalidSettings("Frame index must be a non-negative integer.", { frameIndex });
  }
  if (!Number.isInteger(fps) || fps <= 0) {
    throw invalidSettings("Frame rate must be a positive integer.", { fps });
  }
  return frameIndex / fps;
}

export function buildExportFramePlan(settings: ExportSettings): readonly ExportFrame[] {
  validateExportSettings(settings);
  const frameCount = getExportFrameCount(settings);
  const frameDuration = 1 / settings.fps;

  return Array.from({ length: frameCount }, (_, index) => ({
    index,
    time: getExportFrameTime(index, settings.fps),
    duration: frameDuration,
  }));
}

export function makePngFrameFilename(
  frameIndex: number,
  frameCount: number,
  prefix = "frame",
): string {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= frameCount) {
    throw invalidSettings("PNG frame index is outside the sequence.", { frameIndex, frameCount });
  }
  if (!Number.isInteger(frameCount) || frameCount <= 0) {
    throw invalidSettings("PNG frame count must be a positive integer.", { frameCount });
  }
  validateFramePrefix(prefix);
  const digits = Math.max(6, String(frameCount).length);
  return `${prefix}_${String(frameIndex + 1).padStart(digits, "0")}.png`;
}

/**
 * fflate serializes DOS timestamps with local getters. Returning local 1980
 * midnight keeps deterministic ZIPs valid in UTC-west time zones too.
 */
export function createDeterministicZipMtime(): Date {
  return new Date(1980, 0, 1, 0, 0, 0, 0);
}

export function verifyPngZipEntries(
  expected: Readonly<Record<string, Uint8Array>>,
  observed: Readonly<Record<string, Uint8Array>>,
  filenames: readonly string[],
): void {
  const expectedNames = [...filenames].sort();
  const observedNames = Object.keys(observed).sort();
  if (
    observedNames.length !== expectedNames.length
    || observedNames.some((name, index) => name !== expectedNames[index])
  ) {
    throw new ExportStudioError(
      "PNG_INVALID",
      "Completed PNG ZIP did not round-trip the exact numbered entry set.",
      { expectedNames, observedNames },
    );
  }

  for (const filename of expectedNames) {
    const before = expected[filename];
    const after = observed[filename];
    if (!before || !after || before.byteLength !== after.byteLength) {
      throw new ExportStudioError(
        "PNG_INVALID",
        `PNG ZIP entry ${filename} changed size during round-trip verification.`,
        { filename, expectedBytes: before?.byteLength ?? null, actualBytes: after?.byteLength ?? null },
      );
    }
    for (let index = 0; index < before.byteLength; index += 1) {
      if (before[index] !== after[index]) {
        throw new ExportStudioError(
          "PNG_INVALID",
          `PNG ZIP entry ${filename} changed bytes during round-trip verification.`,
          { filename, byteOffset: index },
        );
      }
    }
  }
}

/** Conservative peak for collecting PNGs plus building a stored ZIP in memory. */
export function estimatePngZipMemoryBytes(
  settings: Pick<ExportSettings, "width" | "height" | "fps" | "duration">,
): number {
  const frameCount = getExportFrameCount(settings);
  const scanlineBytes = settings.height * (1 + settings.width * 4);
  const pngUpperBoundPerFrame = Math.ceil(scanlineBytes * 1.05) + 64 * 1024;
  const retainedPngBytes = frameCount * pngUpperBoundPerFrame;
  const zipOverhead = frameCount * ZIP_ENTRY_OVERHEAD_BYTES + 22;
  const activeCanvasBytes = settings.width * settings.height * 4;

  // PNG Blob/ArrayBuffer coexist during capture; all input arrays coexist with
  // ZIP output during zipSync. Factor three stays deliberately conservative.
  return Math.ceil(activeCanvasBytes * 2 + (retainedPngBytes + zipOverhead) * 3);
}

export function assertPngZipMemoryBudget(settings: ExportSettings, memoryLimitBytes: number): void {
  validateExportSettings(settings);
  if (!Number.isSafeInteger(memoryLimitBytes) || memoryLimitBytes < 16 * 1024 * 1024) {
    throw invalidSettings("ZIP memory cap must be a safe integer of at least 16MiB.", { memoryLimitBytes });
  }

  const estimatedBytes = estimatePngZipMemoryBytes(settings);
  if (estimatedBytes > memoryLimitBytes) {
    throw new ExportStudioError(
      "ZIP_MEMORY_LIMIT",
      "This PNG sequence is too large for a safe in-memory ZIP. Export to a directory, or reduce size or duration.",
      { estimatedBytes, memoryLimitBytes },
    );
  }
}

export function assessPresenterAvSync(
  videoStart: number,
  videoEnd: number,
  audioStart: number,
  audioEnd: number,
  timelineStart: number,
  fps: number,
  requiredDuration?: number,
): AvSyncAssessment {
  const normalizedVideoStart = Math.max(videoStart, timelineStart) - timelineStart;
  const normalizedAudioStart = Math.max(audioStart, timelineStart) - timelineStart;
  const normalizedVideoEnd = Math.max(
    Math.min(videoEnd - timelineStart, requiredDuration ?? Infinity),
    0,
  );
  const normalizedAudioEnd = Math.max(
    Math.min(audioEnd - timelineStart, requiredDuration ?? Infinity),
    0,
  );
  const toleranceSeconds = 1 / fps;
  const startOffsetSeconds = Math.abs(normalizedVideoStart - normalizedAudioStart);
  const endOffsetSeconds = Math.abs(normalizedVideoEnd - normalizedAudioEnd);
  const videoCoverageGapSeconds = requiredDuration === undefined
    ? 0
    : Math.max(requiredDuration - normalizedVideoEnd, 0);
  const audioCoverageGapSeconds = requiredDuration === undefined
    ? 0
    : Math.max(requiredDuration - normalizedAudioEnd, 0);

  return {
    holds:
      startOffsetSeconds <= toleranceSeconds + Number.EPSILON
      && endOffsetSeconds <= toleranceSeconds + Number.EPSILON
      && videoCoverageGapSeconds <= toleranceSeconds + Number.EPSILON
      && audioCoverageGapSeconds <= toleranceSeconds + Number.EPSILON,
    toleranceSeconds,
    startOffsetSeconds,
    endOffsetSeconds,
    videoCoverageGapSeconds,
    audioCoverageGapSeconds,
  };
}

export function getAudioTrimWindow(
  sampleTimestamp: number,
  sampleFrameCount: number,
  sampleRate: number,
  rangeStart: number,
  rangeEnd: number,
): AudioTrimWindow | null {
  if (
    !Number.isFinite(sampleTimestamp)
    || !Number.isInteger(sampleFrameCount)
    || sampleFrameCount < 0
    || !Number.isInteger(sampleRate)
    || sampleRate <= 0
    || !Number.isFinite(rangeStart)
    || !Number.isFinite(rangeEnd)
    || rangeEnd < rangeStart
  ) {
    throw invalidSettings("Audio trim inputs are invalid.");
  }

  const sampleEnd = sampleTimestamp + sampleFrameCount / sampleRate;
  if (sampleEnd <= rangeStart || sampleTimestamp >= rangeEnd || sampleFrameCount === 0) {
    return null;
  }

  const startFrame = Math.max(0, Math.round((rangeStart - sampleTimestamp) * sampleRate));
  const endFrame = Math.min(sampleFrameCount, Math.round((rangeEnd - sampleTimestamp) * sampleRate));
  if (endFrame <= startFrame) {
    return null;
  }

  return {
    startFrame,
    endFrame,
    outputTimestamp: Math.max(sampleTimestamp + startFrame / sampleRate - rangeStart, 0),
  };
}

export function inspectPngHeader(bytes: Uint8Array): PngInspection {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength < 26 || signature.some((value, index) => bytes[index] !== value)) {
    throw new ExportStudioError("PNG_INVALID", "Captured still is not a valid PNG file.");
  }
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") {
    throw new ExportStudioError("PNG_INVALID", "Captured PNG has no readable IHDR header.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = bytes[24]!;
  const colorType = bytes[25]!;

  return {
    width,
    height,
    bitDepth,
    colorType,
    hasAlphaChannel: colorType === 4 || colorType === 6,
  };
}

export function inspectRgbaAlpha(bytes: Uint8ClampedArray): PngAlphaInspection {
  if (bytes.byteLength === 0 || bytes.byteLength % 4 !== 0) {
    throw new ExportStudioError(
      "PNG_INVALID",
      "Decoded PNG pixels are not a complete RGBA buffer.",
      { byteLength: bytes.byteLength },
    );
  }

  let hasVisiblePixels = false;
  let hasTransparentPixels = false;
  for (let index = 3; index < bytes.byteLength; index += 4) {
    const alpha = bytes[index]!;
    hasVisiblePixels ||= alpha > 0;
    hasTransparentPixels ||= alpha < 255;
    if (hasVisiblePixels && hasTransparentPixels) break;
  }
  return { hasVisiblePixels, hasTransparentPixels };
}

export async function probeExportCapabilities(
  settings: ExportSettings = DEFAULT_EXPORT_SETTINGS,
): Promise<ExportCapabilityReport> {
  validateExportSettings(settings);
  const reasons: string[] = [];
  const evenDimensions = settings.width % 2 === 0 && settings.height % 2 === 0;
  if (!evenDimensions) reasons.push("H.264 export requires even pixel dimensions.");

  let avc = false;
  let aac = false;
  try {
    avc = evenDimensions && await canEncodeVideo("avc", {
      width: settings.width,
      height: settings.height,
      quality: avcQuality(),
      latencyMode: "quality",
      alpha: "discard",
    });
  } catch {
    avc = false;
  }
  if (!avc) reasons.push("Browser has no compatible H.264/AVC encoder for these dimensions.");

  try {
    await ensureSoftwareAacEncoder();
    aac = await canEncodeAudio("aac", {
      numberOfChannels: AUDIO_CHANNELS,
      sampleRate: AUDIO_SAMPLE_RATE,
      quality: aacQuality(),
    });
  } catch {
    aac = false;
  }
  if (!aac) reasons.push("Browser has no compatible AAC encoder; presenter audio cannot be exported safely.");
  const presenterAudioFpsSupported = settings.fps <= 30;
  if (!presenterAudioFpsSupported) {
    reasons.push("Presenter audio is limited to 30 fps; mute it for a higher-frame-rate master.");
  }

  const pngStill = supportsCanvasPngEncoding();

  return {
    mp4: {
      supported: avc,
      avc,
      aac,
      presenterAudioFpsSupported,
      maximumPresenterAudioFps: 30,
      reasons,
    },
    png: {
      still: pngStill,
      sequenceZip: pngStill,
      sequenceDirectory: pngStill && typeof FileSystemDirectoryHandle !== "undefined",
    },
    presenter: {
      videoDecoderApi: typeof VideoDecoder !== "undefined",
      audioDecoderApi: typeof AudioDecoder !== "undefined",
    },
    futureStreamTarget: typeof WritableStream !== "undefined",
  };
}

export function resolvePresenterAudioEnabled(includePresenterAudio?: boolean): boolean {
  return includePresenterAudio ?? true;
}

export function assertPresenterAudioFpsSupported(fps: number, hasPresenterAudio: boolean): void {
  if (!hasPresenterAudio || fps <= 30) return;

  throw new ExportStudioError(
    "PRESENTER_AV_SYNC",
    "Presenter audio can only be exported at 30 fps or lower. Choose 30 fps, or mute the presenter for a higher-frame-rate master.",
    {
      fps,
      maximumPresenterAudioFps: 30,
      frameToleranceSeconds: 1 / fps,
      aacPacketDurationSeconds: AAC_SAMPLES_PER_PACKET / AUDIO_SAMPLE_RATE,
    },
  );
}

/**
 * The pinned software AAC-LC encoder emits one priming packet. Limiting source
 * PCM to a whole packet boundary bounds the finalized tail to exactly one AAC
 * packet (21.33ms), below one frame at every supported presenter-audio rate.
 */
export function getAacInputFrameLimit(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw invalidSettings("AAC input duration must be a positive finite number.", { duration });
  }
  const requestedFrames = Math.round(duration * AUDIO_SAMPLE_RATE);
  return Math.floor(requestedFrames / AAC_SAMPLES_PER_PACKET) * AAC_SAMPLES_PER_PACKET;
}

export function createBufferMp4Target(): Mp4TargetAdapter {
  const target = new BufferTarget();
  return {
    target,
    kind: "buffer",
    complete(mimeType) {
      if (!target.buffer) {
        throw new ExportStudioError(
          "TARGET_FINALIZE_FAILED",
          "MP4 encoder finalized without producing output bytes.",
        );
      }
      return new Blob([target.buffer], { type: mimeType });
    },
    abort() {
      // BufferTarget has no persistent partial artifact.
    },
  };
}

class RollbackFileStreamTarget extends StreamTarget {
  private committed = false;
  private abortReason: unknown = new Error("MP4 file export cancelled.");

  get hasCommitted(): boolean {
    return this.committed;
  }

  async _finalize(): Promise<void> {
    const base = StreamTarget.prototype as unknown as {
      _finalize(this: StreamTarget): Promise<void>;
    };
    await base._finalize.call(this);
    this.committed = true;
  }

  async _close(): Promise<void> {
    const internals = this as unknown as {
      _streamWriter: WritableStreamDefaultWriter<StreamTargetChunk> | null;
      _writable: WritableStream<StreamTargetChunk>;
    };
    if (this.committed) {
      const base = StreamTarget.prototype as unknown as {
        _close(this: StreamTarget): Promise<void>;
      };
      await base._close.call(this).catch((error: unknown) => {
        if (!hasErrorName(error, "InvalidStateError")) throw error;
      });
      return;
    }

    if (internals._streamWriter) {
      await internals._streamWriter.abort(this.abortReason).catch((error: unknown) => {
        if (!hasErrorName(error, "InvalidStateError")) throw error;
      });
    } else {
      await internals._writable.abort(this.abortReason).catch((error: unknown) => {
        if (!hasErrorName(error, "InvalidStateError")) throw error;
      });
    }
  }

  async abortPending(reason?: unknown): Promise<void> {
    this.abortReason = reason;
    if (!this.committed) await this._close();
  }
}

/**
 * First-class disk destination. Writes stay in browser-managed temporary state
 * until finalization. Cancellation aborts that state; cancellation after commit
 * truncates the newly written file because a file handle cannot delete itself.
 */
export async function createFileSystemMp4Target(
  fileHandle: FileSystemFileHandle,
  signal?: AbortSignal,
): Promise<Mp4TargetAdapter> {
  if (!fileHandle || typeof fileHandle.createWritable !== "function") {
    throw invalidSettings("A writable File System Access file handle is required.");
  }

  throwIfAborted(signal);
  const opening = fileHandle.createWritable({ keepExistingData: false });
  let openingAborted = false;
  let onAbort: (() => void) | null = null;
  const cancellation = signal
    ? new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        openingAborted = true;
        reject(cancelledError(signal));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    })
    : null;

  void opening.then(
    (lateWritable) => {
      if (openingAborted) void lateWritable.abort(signal?.reason).catch(() => undefined);
    },
    () => undefined,
  );

  let writable: FileSystemWritableFileStream;
  try {
    writable = await (cancellation ? Promise.race([opening, cancellation]) : opening);
  } catch (error) {
    if (signal?.aborted) throw cancelledError(signal);
    throw wrapError(
      error,
      "TARGET_FINALIZE_FAILED",
      "Could not open the selected MP4 destination for a rollback-safe write.",
    );
  } finally {
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }

  if (signal?.aborted) {
    await writable.abort(signal.reason).catch(() => undefined);
    throw cancelledError(signal);
  }
  const target = new RollbackFileStreamTarget(
    writable as unknown as WritableStream<StreamTargetChunk>,
    { chunked: true },
  );

  return {
    target,
    kind: "file-system",
    complete() {
      return null;
    },
    verificationBlob() {
      return fileHandle.getFile();
    },
    async abort(reason) {
      if (!target.hasCommitted) {
        await target.abortPending(reason);
        // A WritableStream abort queues behind an already-started close. If
        // close won that race, _finalize marked the file committed while this
        // abort was pending; fall through and neutralize that committed file.
        if (!target.hasCommitted) return;
      }

      // The finalized replacement has already committed. A FileSystemFileHandle
      // has no remove API, so leave an unmistakable zero-byte partial instead of
      // an apparently valid but canceled MP4.
      const cleanup = await fileHandle.createWritable({ keepExistingData: false });
      await cleanup.truncate(0);
      await cleanup.close();
    },
  };
}

/**
 * Mediabunny 1.55.1 deliberately makes Output.cancel() a no-op once
 * finalization starts. Race finalization with the AbortSignal and invoke the
 * destination rollback directly, so cancellation no longer depends on that
 * no-op. A platform stream close already in progress may itself be
 * non-preemptible; the file adapter waits for that race and neutralizes any
 * commit. The finalization promise remains observed because browser codecs
 * cannot be synchronously preempted and may settle after cancellation wins.
 *
 * Exported as a narrow seam for deterministic cancellation tests and future
 * streaming destinations.
 */
export async function finalizeInterruptibly<T>(
  finalize: () => Promise<T>,
  abortDestination: (reason?: unknown) => MaybePromise<void>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) {
    return await finalize();
  }

  if (signal.aborted) {
    await abortDestination(signal.reason);
    throw cancelledError(signal);
  }

  const finalization = Promise.resolve().then(finalize);
  // If cancellation wins, the codec/muxer may reject later. Keep that losing
  // branch observed instead of leaking an unhandled rejection.
  void finalization.catch(() => undefined);

  let onAbort: (() => void) | null = null;
  const cancellation = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      void Promise.resolve()
        .then(() => abortDestination(signal.reason))
        .then(
          () => reject(cancelledError(signal)),
          reject,
        );
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([finalization, cancellation]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export async function exportMp4(options: Mp4ExportOptions): Promise<Mp4ExportResult> {
  const target = options?.target ?? createBufferMp4Target();
  let targetAbortPromise: Promise<void> | null = null;
  const abortTarget = (reason?: unknown): Promise<void> => {
    targetAbortPromise ??= Promise.resolve().then(() => target.abort(reason));
    return targetAbortPromise;
  };
  let settings: ExportSettings;

  try {
    validateCommonOptions(options);
    settings = validateExportSettings(options.settings);
    if (settings.width % 2 !== 0 || settings.height % 2 !== 0) {
      throw new ExportStudioError(
        "INVALID_SETTINGS",
        "H.264 export requires even width and height values.",
        { width: settings.width, height: settings.height },
      );
    }
    throwIfAborted(options.signal);
    setCanvasSize(options.canvas, settings.width, settings.height);
    report(options.onProgress, "preparing", 0, 1, 0);

    const avcSupported = await canEncodeVideo("avc", {
      width: settings.width,
      height: settings.height,
      quality: avcQuality(),
      latencyMode: "quality",
      alpha: "discard",
    });
    if (!avcSupported) {
      throw new ExportStudioError(
        "AVC_UNSUPPORTED",
        "This browser cannot encode H.264 at the requested size. Use current desktop Chromium or Brave, or reduce size.",
        { width: settings.width, height: settings.height, bitrate: AVC_BITRATE },
      );
    }
  } catch (error) {
    try {
      await abortTarget(error);
    } catch (cleanupError) {
      throw new ExportStudioError(
        "TARGET_FINALIZE_FAILED",
        "MP4 preflight failed and destination cleanup also failed. A partial destination file may remain.",
        { exportError: errorMessage(error), cleanupError: errorMessage(cleanupError) },
        { cause: error },
      );
    }
    if (options?.signal?.aborted) throw cancelledError(options.signal);
    throw wrapError(error, "ENCODE_FAILED", "MP4 export preflight failed before encoding began.");
  }

  let presenter: PreparedPresenter | null = null;
  let output: Output | null = null;
  let outputAbortHandler: (() => void) | null = null;
  const includePresenterAudio = resolvePresenterAudioEnabled(options.includePresenterAudio);
  const framePlan = buildExportFramePlan(settings);
  const frameCount = framePlan.length;
  const encodedDuration = frameCount / settings.fps;
  const encoderConfigs: {
    video: VideoEncoderConfig | null;
    audio: AudioEncoderConfig | null;
  } = { video: null, audio: null };

  try {
    if (options.presenter) {
      presenter = await preparePresenter(
        options.presenter,
        settings.fps,
        includePresenterAudio,
        options.signal,
        encodedDuration,
      );
    }
    assertPresenterAudioFpsSupported(settings.fps, presenter?.audioTrack != null);
    throwIfAborted(options.signal);

    if (presenter?.audioTrack) {
      // Native WebCodecs AAC does not expose priming delay and can shift real
      // audio while inflating the MP4 duration. The bundled open-source FFmpeg
      // encoder is selected deliberately so this path is testable and stable.
      await ensureSoftwareAacEncoder();
      const aacSupported = await canEncodeAudio("aac", {
        numberOfChannels: AUDIO_CHANNELS,
        sampleRate: AUDIO_SAMPLE_RATE,
        quality: aacQuality(),
      });
      if (!aacSupported) {
        throw new ExportStudioError(
          "AAC_UNSUPPORTED",
          "Presenter contains audio, but this browser cannot encode AAC. Audio will not be dropped silently.",
          { sampleRate: AUDIO_SAMPLE_RATE, channels: AUDIO_CHANNELS, bitrate: AAC_BITRATE },
        );
      }
    }

    const format = new Mp4OutputFormat({ fastStart: false });
    output = new Output({ format, target: target.target });
    const videoSource = new CanvasSource(options.canvas, {
      codec: "avc",
      quality: avcQuality(),
      keyFrameInterval: 2,
      sizeChangeBehavior: "deny",
      alpha: "discard",
      latencyMode: "quality",
      onEncoderConfig(config) {
        encoderConfigs.video = { ...config };
      },
    });
    output.addVideoTrack(videoSource, {
      frameRate: settings.fps,
      maximumPacketCount: frameCount,
      name: "pitch.dog composition",
    });

    let audioSource: AudioSampleSource | null = null;
    if (presenter?.audioTrack) {
      const audioInputFrameLimit = getAacInputFrameLimit(encodedDuration);
      let acceptedAudioFrames = 0;
      audioSource = new AudioSampleSource({
        codec: "aac",
        quality: aacQuality(),
        transform: {
          numberOfChannels: AUDIO_CHANNELS,
          sampleRate: AUDIO_SAMPLE_RATE,
          process(sample) {
            const remainingFrames = audioInputFrameLimit - acceptedAudioFrames;
            if (remainingFrames <= 0) return null;

            const acceptedFrames = Math.min(sample.numberOfFrames, remainingFrames);
            acceptedAudioFrames += acceptedFrames;
            return acceptedFrames === sample.numberOfFrames
              ? sample
              : sample.trim(0, acceptedFrames);
          },
        },
        onEncoderConfig(config) {
          encoderConfigs.audio = { ...config };
        },
      });
      output.addAudioTrack(audioSource, { name: "Presenter audio" });
    }

    await output.start();
    if (options.signal) {
      outputAbortHandler = () => {
        if (output && output.state !== "finalized" && output.state !== "canceled") {
          void output.cancel().catch(() => undefined);
        }
      };
      options.signal.addEventListener("abort", outputAbortHandler, { once: true });
    }
    await renderFrames({
      ...options,
      settings,
      framePlan,
      presenter,
      afterRender: async (frame) => {
        try {
          await videoSource.add(frame.time, frame.duration, {
            keyFrame: frame.index % Math.max(1, settings.fps * 2) === 0,
          });
        } catch (error) {
          throw wrapError(
            error,
            "ENCODE_FAILED",
            `H.264 encoder failed at frame ${frame.index + 1}.`,
            { frameIndex: frame.index, time: frame.time },
          );
        }
      },
      phase: "video",
      progressStart: 0.03,
      progressEnd: presenter?.audioTrack ? 0.78 : 0.94,
    });
    videoSource.close();

    if (presenter?.audioTrack && audioSource) {
      await encodePresenterAudio(
        presenter,
        audioSource,
        encodedDuration,
        options.signal,
        options.onProgress,
      );
      audioSource.close();
    }

    assertEncoderConfigurations(encoderConfigs, settings, presenter?.audioTrack != null);
    throwIfAborted(options.signal);
    report(options.onProgress, "finalizing", 0, 1, 0.97);
    await finalizeInterruptibly(
      () => output!.finalize(),
      abortTarget,
      options.signal,
    );
    throwIfAborted(options.signal);
    const mimeType = await output.getMimeType();
    const blob = await finalizeInterruptibly(
      () => Promise.resolve(target.complete(mimeType)),
      abortTarget,
      options.signal,
    );
    throwIfAborted(options.signal);
    const verificationBlob = blob ?? await finalizeInterruptibly(
      () => Promise.resolve(target.verificationBlob?.()),
      abortTarget,
      options.signal,
    );
    throwIfAborted(options.signal);
    if (!verificationBlob) {
      throw new ExportStudioError(
        "OUTPUT_VERIFICATION_FAILED",
        "MP4 destination did not provide bytes for mandatory readback verification.",
        { destination: target.kind },
      );
    }
    const verification = await verifyMp4Artifact(
      verificationBlob,
      settings,
      presenter?.audioTrack !== null && presenter?.audioTrack !== undefined,
      options.signal,
    );
    throwIfAborted(options.signal);
    report(options.onProgress, "complete", 1, 1, 1);

    return {
      blob,
      destination: target.kind,
      mimeType,
      width: settings.width,
      height: settings.height,
      fps: settings.fps,
      frameCount,
      duration: encodedDuration,
      videoCodec: "avc",
      videoBitrate: AVC_BITRATE,
      verification,
      audio: presenter?.audioTrack
        ? {
          codec: "aac",
          bitrate: AAC_BITRATE,
          sampleRate: AUDIO_SAMPLE_RATE,
          channels: AUDIO_CHANNELS,
          duration: verification.audio!.duration,
        }
        : null,
    };
  } catch (error) {
    if (output && output.state !== "finalized" && output.state !== "canceled") {
      await output.cancel().catch(() => undefined);
    }
    try {
      await abortTarget(error);
    } catch (cleanupError) {
      throw new ExportStudioError(
        "TARGET_FINALIZE_FAILED",
        "MP4 export failed and destination cleanup also failed. A partial destination file may remain.",
        { exportError: errorMessage(error), cleanupError: errorMessage(cleanupError) },
        { cause: error },
      );
    }
    if (options.signal?.aborted) throw cancelledError(options.signal);
    throw wrapError(error, "ENCODE_FAILED", "MP4 export failed before a usable file was produced.");
  } finally {
    if (options.signal && outputAbortHandler) {
      options.signal.removeEventListener("abort", outputAbortHandler);
    }
    presenter?.dispose();
  }
}

export async function verifyMp4Artifact(
  blob: Blob,
  settings: ExportSettings,
  expectAudio: boolean,
  signal?: AbortSignal,
): Promise<Mp4VerificationReport> {
  validateExportSettings(settings);
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw verificationError("Completed MP4 is empty or unreadable.", { size: blob?.size ?? 0 });
  }

  const frameCount = getExportFrameCount(settings);
  const expectedDuration = frameCount / settings.fps;
  const timestampTolerance = Math.min(0.0005, 1 / (settings.fps * 100));
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(blob, { maxCacheSize: 16 * 1024 * 1024 }),
  });
  const abortInput = () => input.dispose();
  signal?.addEventListener("abort", abortInput, { once: true });
  if (signal?.aborted) abortInput();

  try {
    const mimeType = await input.getMimeType();
    if (!mimeType.startsWith("video/mp4")) {
      throw verificationError("Completed artifact is not an MP4 container.", { mimeType });
    }

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw verificationError("Completed MP4 contains no video track.");
    const [
      videoCodec,
      width,
      height,
      videoDuration,
      transparent,
      videoDecodable,
      trackColorSpace,
    ] = await Promise.all([
      videoTrack.getCodec(),
      videoTrack.getDisplayWidth(),
      videoTrack.getDisplayHeight(),
      videoTrack.computeDuration(),
      videoTrack.canBeTransparent(),
      videoTrack.canDecode(),
      videoTrack.getColorSpace(),
    ]);
    if (videoCodec !== "avc") {
      throw verificationError("Completed MP4 video is not H.264/AVC.", { videoCodec });
    }
    if (width !== settings.width || height !== settings.height) {
      throw verificationError("Completed MP4 dimensions do not match the request.", {
        expectedWidth: settings.width,
        expectedHeight: settings.height,
        width,
        height,
      });
    }
    if (transparent) {
      throw verificationError("H.264 output unexpectedly advertises transparency.");
    }
    if (!videoDecodable) {
      throw verificationError("Completed H.264 track cannot be decoded by this browser.");
    }
    if (Math.abs(videoDuration - expectedDuration) > timestampTolerance * 4) {
      throw verificationError("Completed MP4 duration differs from its fixed-step timeline.", {
        expectedDuration,
        videoDuration,
        tolerance: timestampTolerance * 4,
      });
    }

    const packetSink = new EncodedPacketSink(videoTrack);
    const packetTimeline: Array<{ timestamp: number; duration: number }> = [];
    for await (const packet of packetSink.packets(undefined, undefined, { metadataOnly: true })) {
      throwIfAborted(signal);
      packetTimeline.push({ timestamp: packet.timestamp, duration: packet.duration });
    }
    packetTimeline.sort((a, b) => a.timestamp - b.timestamp);
    if (packetTimeline.length !== frameCount) {
      throw verificationError("Completed MP4 frame count does not match the fixed-step plan.", {
        expectedFrameCount: frameCount,
        packetCount: packetTimeline.length,
      });
    }
    for (let index = 0; index < packetTimeline.length; index += 1) {
      const packet = packetTimeline[index]!;
      const expected = index / settings.fps;
      if (Math.abs(packet.timestamp - expected) > timestampTolerance) {
        throw verificationError("Completed MP4 frame timestamps left the n/fps grid.", {
          frameIndex: index,
          expected,
          actual: packet.timestamp,
          tolerance: timestampTolerance,
        });
      }
      if (Math.abs(packet.duration - 1 / settings.fps) > timestampTolerance) {
        throw verificationError("Completed MP4 frame duration differs from one fixed timeline step.", {
          frameIndex: index,
          expectedDuration: 1 / settings.fps,
          actualDuration: packet.duration,
          tolerance: timestampTolerance,
        });
      }
    }

    const probeIndices = [...new Set([0, Math.floor((frameCount - 1) / 2), frameCount - 1])];
    const videoSamples = new VideoSampleSink(videoTrack);
    let decodedProbeFrames = 0;
    let decodedColorSpace: VideoColorSpaceInit | null = null;
    for await (const sample of videoSamples.samplesAtTimestamps(
      probeIndices.map((index) => index / settings.fps),
    )) {
      throwIfAborted(signal);
      if (!sample) {
        throw verificationError("Completed MP4 failed first/middle/last frame decode.", {
          probeIndex: decodedProbeFrames,
        });
      }
      try {
        if (sample.displayWidth !== settings.width || sample.displayHeight !== settings.height) {
          throw verificationError("Decoded MP4 frame dimensions do not match the request.", {
            width: sample.displayWidth,
            height: sample.displayHeight,
          });
        }
        decodedColorSpace ??= sample.colorSpace.toJSON();
        decodedProbeFrames += 1;
      } finally {
        sample.close();
      }
    }
    if (decodedProbeFrames !== probeIndices.length) {
      throw verificationError("Completed MP4 did not yield every decode probe frame.", {
        expected: probeIndices.length,
        decodedProbeFrames,
      });
    }

    const colorSpace = mergeColorSpace(trackColorSpace, decodedColorSpace);
    if (!isRec709Sdr(colorSpace)) {
      throw verificationError("Completed MP4 is not verified SDR Rec.709.", { colorSpace });
    }

    const audioTracks = await input.getAudioTracks();
    if (!expectAudio && audioTracks.length !== 0) {
      throw verificationError("Muted presenter export unexpectedly contains audio.", {
        audioTrackCount: audioTracks.length,
      });
    }
    if (expectAudio && audioTracks.length === 0) {
      throw verificationError("Presenter audio was requested but completed MP4 has no audio track.");
    }

    let audioVerification: Mp4VerificationReport["audio"] = null;
    if (expectAudio) {
      const audioTrack = await input.getPrimaryAudioTrack();
      if (!audioTrack) throw verificationError("Completed MP4 has no primary audio track.");
      const [codec, sampleRate, channels, start, duration, decodable] = await Promise.all([
        audioTrack.getCodec(),
        audioTrack.getSampleRate(),
        audioTrack.getNumberOfChannels(),
        audioTrack.getFirstTimestamp(),
        audioTrack.computeDuration(),
        audioTrack.canDecode(),
      ]);
      if (codec !== "aac" || sampleRate !== AUDIO_SAMPLE_RATE || channels !== AUDIO_CHANNELS) {
        throw verificationError("Completed presenter audio does not match AAC 48kHz stereo.", {
          codec,
          sampleRate,
          channels,
        });
      }
      if (!decodable) throw verificationError("Completed AAC track cannot be decoded by this browser.");

      const videoStart = packetTimeline[0]?.timestamp ?? 0;
      const sync = assessPresenterAvSync(
        videoStart,
        videoDuration,
        start,
        duration,
        0,
        settings.fps,
      );
      if (!sync.holds) {
        throw verificationError("Finalized AAC and H.264 tracks differ by more than one frame.", sync);
      }

      const audioProbeTimes = [
        Math.max(start, 0),
        Math.max(start, (start + duration) / 2),
        Math.max(start, duration - 1 / AUDIO_SAMPLE_RATE),
      ];
      let decodedAudioProbes = 0;
      for await (const audioSample of new AudioSampleSink(audioTrack).samplesAtTimestamps(audioProbeTimes)) {
        throwIfAborted(signal);
        if (!audioSample) {
          throw verificationError("Completed AAC track failed start/middle/end decode readback.", {
            probeIndex: decodedAudioProbes,
            probeTime: audioProbeTimes[decodedAudioProbes],
          });
        }
        audioSample.close();
        decodedAudioProbes += 1;
      }
      if (decodedAudioProbes !== audioProbeTimes.length) {
        throw verificationError("Completed AAC track did not yield every decode probe sample.", {
          expected: audioProbeTimes.length,
          decodedAudioProbes,
        });
      }
      audioVerification = {
        codec: "aac",
        sampleRate: AUDIO_SAMPLE_RATE,
        channels: AUDIO_CHANNELS,
        start,
        duration,
        decoded: true,
      };
    }

    return {
      verified: true,
      container: "mp4",
      videoCodec: "avc",
      width,
      height,
      fps: settings.fps,
      frameCount,
      duration: videoDuration,
      opaque: true,
      colorSpace,
      decodedProbeFrames,
      audio: audioVerification,
    };
  } catch (error) {
    if (signal?.aborted) throw cancelledError(signal);
    if (error instanceof ExportStudioError) throw error;
    throw verificationError("Completed MP4 failed readback verification.", {
      cause: errorMessage(error),
    }, error);
  } finally {
    signal?.removeEventListener("abort", abortInput);
    input.dispose();
  }
}

export async function exportPngStill(options: PngStillOptions): Promise<PngStillResult> {
  validateCommonOptions(options);
  const settings = validateExportSettings(options.settings);
  const time = options.time ?? 0;
  if (!Number.isFinite(time) || time < 0 || time > settings.duration) {
    throw invalidSettings("Still time must fall inside the export duration.", { time });
  }
  if (!supportsCanvasPngEncoding()) {
    throw new ExportStudioError(
      "CANVAS_EXPORT_UNSUPPORTED",
      "This browser cannot encode the canvas as PNG.",
    );
  }

  throwIfAborted(options.signal);
  setCanvasSize(options.canvas, settings.width, settings.height);
  let presenter: PreparedPresenter | null = null;

  try {
    if (options.presenter) {
      presenter = await preparePresenter(
        options.presenter,
        settings.fps,
        false,
        options.signal,
        Math.min(time + 1 / settings.fps, settings.duration),
      );
    }
    const frameCount = getExportFrameCount(settings);
    const frameIndex = Math.min(Math.floor(time * settings.fps), frameCount - 1);
    const sample = presenter
      ? await presenter.videoSink.getSample(presenter.timelineStart + time)
      : null;
    const requestedPresenterTime = presenter ? presenter.timelineStart + time : 0;
    if (
      presenter
      && (
        !sample
        || sample.timestamp + sample.duration - requestedPresenterTime <= SAMPLE_COVERAGE_EPSILON_SECONDS
      )
    ) {
      sample?.close();
      throw new ExportStudioError(
        "PRESENTER_DECODE_FAILED",
        "Presenter video does not cover the requested still time.",
        {
          time,
          sourceTime: requestedPresenterTime,
          decodedFrameStart: sample?.timestamp ?? null,
          decodedFrameEnd: sample ? sample.timestamp + sample.duration : null,
        },
      );
    }

    try {
      const decodedFrame = sample && presenter
        ? drawPresenterFrame(presenter, sample, time)
        : undefined;
      await renderScene(options, time, frameIndex, frameCount, decodedFrame);
    } finally {
      sample?.close();
    }

    throwIfAborted(options.signal);
    const blob = await canvasToPngBlob(options.canvas);
    const inspection = await validatePngBlob(
      blob,
      settings.width,
      settings.height,
      options.requireAlpha ?? true,
      true,
      options.requireTransparentPixels ?? false,
    );
    report(options.onProgress, "complete", 1, 1, 1);

    return {
      blob,
      width: settings.width,
      height: settings.height,
      time,
      hasAlphaChannel: inspection.hasAlphaChannel,
      hasTransparentPixels: inspection.hasTransparentPixels,
    };
  } catch (error) {
    if (options.signal?.aborted) throw cancelledError(options.signal);
    throw wrapError(error, "PNG_ENCODING_FAILED", "PNG still capture failed.");
  } finally {
    presenter?.dispose();
  }
}

export async function exportPngSequence(options: PngSequenceOptions): Promise<PngSequenceResult> {
  validateCommonOptions(options);
  const settings = validateExportSettings(options.settings);
  if (!supportsCanvasPngEncoding()) {
    throw new ExportStudioError(
      "CANVAS_EXPORT_UNSUPPORTED",
      "This browser cannot encode the canvas as PNG.",
    );
  }
  const prefix = options.framePrefix ?? "frame";
  validateFramePrefix(prefix);
  const framePlan = buildExportFramePlan(settings);
  const filenames = framePlan.map((frame) => makePngFrameFilename(frame.index, framePlan.length, prefix));
  const encodedDuration = framePlan.length / settings.fps;
  throwIfAborted(options.signal);
  setCanvasSize(options.canvas, settings.width, settings.height);

  if (options.destination === "zip") {
    const memoryLimitBytes = options.memoryLimitBytes ?? DEFAULT_ZIP_MEMORY_LIMIT_BYTES;
    assertPngZipMemoryBudget(settings, memoryLimitBytes);
    return exportPngSequenceZip(options, framePlan, filenames, encodedDuration, memoryLimitBytes);
  }

  return exportPngSequenceDirectory(options, framePlan, filenames, encodedDuration);
}

async function exportPngSequenceZip(
  options: Extract<PngSequenceOptions, { destination: "zip" }>,
  framePlan: readonly ExportFrame[],
  filenames: readonly string[],
  encodedDuration: number,
  memoryLimitBytes: number,
): Promise<PngSequenceResult> {
  let presenter: PreparedPresenter | null = null;
  const files: Record<string, Uint8Array> = {};
  let retainedBytes = 0;

  try {
    if (options.presenter) {
      presenter = await preparePresenter(
        options.presenter,
        options.settings.fps,
        false,
        options.signal,
        encodedDuration,
      );
    }
    await renderFrames({
      ...options,
      framePlan,
      presenter,
      phase: "rendering",
      progressStart: 0.02,
      progressEnd: 0.82,
      afterRender: async (frame) => {
        const blob = await canvasToPngBlob(options.canvas);
        await validatePngBlob(
          blob,
          options.settings.width,
          options.settings.height,
          options.requireAlpha ?? true,
          options.requireTransparentPixels ?? false,
          options.requireTransparentPixels ?? false,
        );
        const bytes = new Uint8Array(await blob.arrayBuffer());
        retainedBytes += bytes.byteLength;
        const observedPeak = options.settings.width * options.settings.height * 8 + retainedBytes * 3;
        if (observedPeak > memoryLimitBytes) {
          throw new ExportStudioError(
            "ZIP_MEMORY_LIMIT",
            "PNG sequence exceeded its in-memory ZIP safety cap. Export to a directory instead.",
            { observedPeak, memoryLimitBytes, frameIndex: frame.index },
          );
        }
        files[filenames[frame.index]!] = bytes;
        report(
          options.onProgress,
          "writing",
          frame.index + 1,
          framePlan.length,
          0.82 + 0.12 * ((frame.index + 1) / framePlan.length),
          frame.index,
        );
      },
    });

    throwIfAborted(options.signal);
    report(options.onProgress, "finalizing", 0, 1, 0.95);
    const zipped = zipSync(files, { level: 0, mtime: FIXED_ZIP_MTIME });
    const verificationPeak =
      options.settings.width * options.settings.height * 8
      + retainedBytes * 2
      + zipped.byteLength;
    if (verificationPeak > memoryLimitBytes) {
      throw new ExportStudioError(
        "ZIP_MEMORY_LIMIT",
        "ZIP readback would exceed its strict memory safety cap. Export to a directory instead.",
        { verificationPeak, memoryLimitBytes },
      );
    }

    const roundTripFiles = unzipSync(zipped);
    verifyPngZipEntries(files, roundTripFiles, filenames);
    throwIfAborted(options.signal);
    const blob = new Blob([zipped], { type: "application/zip" });
    report(options.onProgress, "complete", 1, 1, 1);

    return {
      destination: "zip",
      blob,
      filenames,
      bytesWritten: blob.size,
      width: options.settings.width,
      height: options.settings.height,
      fps: options.settings.fps,
      frameCount: framePlan.length,
      duration: encodedDuration,
    };
  } catch (error) {
    if (options.signal?.aborted) throw cancelledError(options.signal);
    throw wrapError(error, "PNG_ENCODING_FAILED", "PNG ZIP sequence export failed.");
  } finally {
    presenter?.dispose();
  }
}

async function exportPngSequenceDirectory(
  options: Extract<PngSequenceOptions, { destination: "directory" }>,
  framePlan: readonly ExportFrame[],
  filenames: readonly string[],
  encodedDuration: number,
): Promise<PngSequenceResult> {
  let presenter: PreparedPresenter | null = null;
  const createdNames: string[] = [];
  let bytesWritten = 0;

  try {
    await assertDirectoryFilesAbsent(options.directory, filenames, options.signal);
    if (options.presenter) {
      presenter = await preparePresenter(
        options.presenter,
        options.settings.fps,
        false,
        options.signal,
        encodedDuration,
      );
    }

    await renderFrames({
      ...options,
      framePlan,
      presenter,
      phase: "rendering",
      progressStart: 0.02,
      progressEnd: 0.96,
      afterRender: async (frame) => {
        const blob = await canvasToPngBlob(options.canvas);
        await validatePngBlob(
          blob,
          options.settings.width,
          options.settings.height,
          options.requireAlpha ?? true,
          options.requireTransparentPixels ?? false,
          options.requireTransparentPixels ?? false,
        );
        const filename = filenames[frame.index]!;
        const fileHandle = await options.directory.getFileHandle(filename, { create: true });
        createdNames.push(filename);
        const writable = await fileHandle.createWritable();
        try {
          throwIfAborted(options.signal);
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          await writable.abort(error).catch(() => undefined);
          throw error;
        }
        throwIfAborted(options.signal);
        const writtenBlob = await fileHandle.getFile();
        await validatePngBlob(
          writtenBlob,
          options.settings.width,
          options.settings.height,
          options.requireAlpha ?? true,
          options.requireTransparentPixels ?? false,
          options.requireTransparentPixels ?? false,
        );
        if (writtenBlob.size !== blob.size) {
          throw new ExportStudioError(
            "DIRECTORY_WRITE_FAILED",
            "PNG frame changed size after the directory write completed.",
            { filename, expectedBytes: blob.size, actualBytes: writtenBlob.size },
          );
        }
        bytesWritten += writtenBlob.size;
        report(
          options.onProgress,
          "writing",
          frame.index + 1,
          framePlan.length,
          0.02 + 0.94 * ((frame.index + 1) / framePlan.length),
          frame.index,
        );
      },
    });

    report(options.onProgress, "complete", 1, 1, 1);
    return {
      destination: "directory",
      blob: null,
      filenames,
      bytesWritten,
      width: options.settings.width,
      height: options.settings.height,
      fps: options.settings.fps,
      frameCount: framePlan.length,
      duration: encodedDuration,
    };
  } catch (error) {
    const cleanupFailures = await cleanupDirectoryFiles(options.directory, createdNames);
    if (cleanupFailures.length > 0) {
      throw new ExportStudioError(
        "DIRECTORY_WRITE_FAILED",
        "PNG directory export failed, and some partial frames could not be removed.",
        { cleanupFailures, cause: errorMessage(error) },
        { cause: error },
      );
    }
    if (options.signal?.aborted) throw cancelledError(options.signal);
    throw wrapError(error, "DIRECTORY_WRITE_FAILED", "PNG directory export failed; partial frames were removed.");
  } finally {
    presenter?.dispose();
  }
}

type RenderFramesOptions = Pick<
  Mp4ExportOptions,
  "canvas" | "renderAt" | "settings" | "signal" | "onProgress"
>;

async function renderFrames(options: RenderFramesOptions & {
  framePlan: readonly ExportFrame[];
  presenter: PreparedPresenter | null;
  afterRender: (frame: ExportFrame) => MaybePromise<void>;
  phase: ExportProgressPhase;
  progressStart: number;
  progressEnd: number;
}): Promise<void> {
  const { framePlan, presenter } = options;
  const frameCount = framePlan.length;

  const renderOne = async (frame: ExportFrame, sample: VideoSample | null) => {
    throwIfAborted(options.signal);
    const requestedSourceTime = presenter ? presenter.timelineStart + frame.time : 0;
    if (
      presenter
      && (
        !sample
        || sample.timestamp + sample.duration - requestedSourceTime <= SAMPLE_COVERAGE_EPSILON_SECONDS
      )
    ) {
      sample?.close();
      throw new ExportStudioError(
        "PRESENTER_DECODE_FAILED",
        `Presenter video does not cover export frame ${frame.index + 1}.`,
        {
          frameIndex: frame.index,
          time: frame.time,
          sourceTime: requestedSourceTime,
          decodedFrameStart: sample?.timestamp ?? null,
          decodedFrameEnd: sample ? sample.timestamp + sample.duration : null,
        },
      );
    }
    let presenterFrame: DecodedPresenterFrame | undefined;
    try {
      if (sample && presenter) presenterFrame = drawPresenterFrame(presenter, sample, frame.time);
      await renderScene(options, frame.time, frame.index, frameCount, presenterFrame);
      await options.afterRender(frame);
    } finally {
      sample?.close();
    }

    const fraction = (frame.index + 1) / frameCount;
    report(
      options.onProgress,
      options.phase,
      frame.index + 1,
      frameCount,
      options.progressStart + (options.progressEnd - options.progressStart) * fraction,
      frame.index,
    );
  };

  if (!presenter) {
    for (const frame of framePlan) await renderOne(frame, null);
    return;
  }

  const timestamps = framePlan.map((frame) => presenter.timelineStart + frame.time);
  let yielded = 0;
  for await (const sample of presenter.videoSink.samplesAtTimestamps(timestamps)) {
    const frame = framePlan[yielded];
    if (!frame) {
      sample?.close();
      throw new ExportStudioError(
        "PRESENTER_DECODE_FAILED",
        "Presenter decoder returned more frames than requested.",
      );
    }
    await renderOne(frame, sample);
    yielded += 1;
  }

  if (yielded !== frameCount) {
    throw new ExportStudioError(
      "PRESENTER_DECODE_FAILED",
      "Presenter decoder ended before every export frame was rendered.",
      { expectedFrames: frameCount, decodedFrames: yielded },
    );
  }
}

async function renderScene(
  options: Pick<CommonPngOptions, "canvas" | "renderAt" | "settings" | "signal">,
  time: number,
  frameIndex: number,
  frameCount: number,
  presenterFrame?: DecodedPresenterFrame,
): Promise<void> {
  try {
    await options.renderAt(time, presenterFrame, {
      frameIndex,
      frameCount,
      frameDuration: 1 / options.settings.fps,
      width: options.settings.width,
      height: options.settings.height,
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw cancelledError(options.signal);
    throw wrapError(
      error,
      "RENDER_FAILED",
      `Scene render failed at frame ${frameIndex + 1}.`,
      { frameIndex, time },
    );
  }

  if (options.canvas.width !== options.settings.width || options.canvas.height !== options.settings.height) {
    throw new ExportStudioError(
      "CANVAS_SIZE_CHANGED",
      "Render callback changed the export canvas size. Every frame must keep the requested dimensions.",
      {
        expectedWidth: options.settings.width,
        expectedHeight: options.settings.height,
        actualWidth: options.canvas.width,
        actualHeight: options.canvas.height,
        frameIndex,
      },
    );
  }
}

async function preparePresenter(
  blob: Blob,
  fps: number,
  includeAudio: boolean,
  signal?: AbortSignal,
  requiredDuration?: number,
): Promise<PreparedPresenter> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(blob, { maxCacheSize: 16 * 1024 * 1024 }),
  });
  const abortInput = () => input.dispose();
  signal?.addEventListener("abort", abortInput, { once: true });
  if (signal?.aborted) abortInput();

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new ExportStudioError(
        "PRESENTER_VIDEO_MISSING",
        "Presenter file contains no video track.",
      );
    }
    if (!(await videoTrack.canDecode())) {
      throw new ExportStudioError(
        "PRESENTER_VIDEO_UNDECODABLE",
        "This browser cannot decode the presenter video codec.",
        { codec: await videoTrack.getCodec() },
      );
    }

    const audioTrack = includeAudio ? await input.getPrimaryAudioTrack() : null;
    if (audioTrack && !(await audioTrack.canDecode())) {
      throw new ExportStudioError(
        "PRESENTER_AUDIO_UNDECODABLE",
        "This browser cannot decode the presenter audio codec. Audio will not be dropped silently.",
        { codec: await audioTrack.getCodec() },
      );
    }

    const [videoStart, videoEnd] = await Promise.all([
      videoTrack.getFirstTimestamp(),
      videoTrack.computeDuration(),
    ]);
    let timelineStart = Math.max(videoStart, 0);

    if (audioTrack) {
      const [audioStart, audioEnd] = await Promise.all([
        audioTrack.getFirstTimestamp(),
        audioTrack.computeDuration(),
      ]);
      const sourceTimelineStart = Math.max(Math.min(videoStart, audioStart), 0);
      const sourceSync = assessPresenterAvSync(
        videoStart,
        videoEnd,
        audioStart,
        audioEnd,
        sourceTimelineStart,
        fps,
        requiredDuration,
      );
      if (!sourceSync.holds) {
        throw new ExportStudioError(
          "PRESENTER_AV_SYNC",
          "Presenter audio and video differ by more than one export frame. Export stopped instead of producing drift.",
          sourceSync,
        );
      }

      // Crop from the first timestamp where both requested tracks exist. This
      // preserves their sub-frame offset while guaranteeing frame zero never
      // silently loses the pinned presenter.
      timelineStart = Math.max(videoStart, audioStart, 0);
      const alignedSync = assessPresenterAvSync(
        videoStart,
        videoEnd,
        audioStart,
        audioEnd,
        timelineStart,
        fps,
        requiredDuration,
      );
      if (!alignedSync.holds) {
        throw new ExportStudioError(
          "PRESENTER_AV_SYNC",
          "Presenter tracks do not cover the requested export after start alignment.",
          alignedSync,
        );
      }
    } else if (
      requiredDuration !== undefined
      && videoEnd < timelineStart + requiredDuration - 1 / fps - Number.EPSILON
    ) {
      throw new ExportStudioError(
        "PRESENTER_AV_SYNC",
        "Presenter video ends before the export timeline. Export stopped instead of freezing the pinned frame.",
        {
          videoStart,
          videoEnd,
          requiredEnd: timelineStart + requiredDuration,
          toleranceSeconds: 1 / fps,
        },
      );
    }

    return {
      input,
      videoTrack,
      audioTrack,
      videoSink: new VideoSampleSink(videoTrack),
      timelineStart,
      presenterCanvas: null,
      presenterContext: null,
      dispose() {
        signal?.removeEventListener("abort", abortInput);
        input.dispose();
      },
    };
  } catch (error) {
    signal?.removeEventListener("abort", abortInput);
    input.dispose();
    if (signal?.aborted) throw cancelledError(signal);
    if (error instanceof ExportStudioError) throw error;
    throw wrapError(
      error,
      "PRESENTER_FORMAT_UNSUPPORTED",
      "Presenter file could not be opened. Use a browser-decodable MP4 or WebM file.",
    );
  }
}

function drawPresenterFrame(
  presenter: PreparedPresenter,
  sample: VideoSample,
  timelineTime: number,
): DecodedPresenterFrame {
  const width = sample.displayWidth;
  const height = sample.displayHeight;
  if (!presenter.presenterCanvas) {
    presenter.presenterCanvas = createScratchCanvas(width, height);
    presenter.presenterContext = presenter.presenterCanvas.getContext("2d", { alpha: true });
    if (!presenter.presenterContext) {
      throw new ExportStudioError(
        "PRESENTER_DECODE_FAILED",
        "Could not create a 2D surface for decoded presenter frames.",
      );
    }
  }
  if (presenter.presenterCanvas.width !== width || presenter.presenterCanvas.height !== height) {
    presenter.presenterCanvas.width = width;
    presenter.presenterCanvas.height = height;
    presenter.presenterContext = presenter.presenterCanvas.getContext("2d", { alpha: true });
  }
  if (!presenter.presenterContext) {
    throw new ExportStudioError(
      "PRESENTER_DECODE_FAILED",
      "Presenter frame surface became unavailable.",
    );
  }

  presenter.presenterContext.clearRect(0, 0, width, height);
  sample.draw(presenter.presenterContext, 0, 0, width, height);

  return {
    image: presenter.presenterCanvas,
    sample,
    timelineTime,
    sourceTime: sample.timestamp,
  };
}

async function encodePresenterAudio(
  presenter: PreparedPresenter,
  source: AudioSampleSource,
  duration: number,
  signal?: AbortSignal,
  onProgress?: ExportProgressHandler,
): Promise<number> {
  const track = presenter.audioTrack;
  if (!track) return 0;
  const sink = new AudioSampleSink(track);
  const rangeStart = presenter.timelineStart;
  const rangeEnd = rangeStart + duration;
  let encodedSamples = 0;
  let lastEnd = 0;

  try {
    for await (const decoded of sink.samples(rangeStart, rangeEnd)) {
      throwIfAborted(signal);
      let finalSample: AudioSample = decoded;
      try {
        const trim = getAudioTrimWindow(
          decoded.timestamp,
          decoded.numberOfFrames,
          decoded.sampleRate,
          rangeStart,
          rangeEnd,
        );
        if (!trim) continue;
        if (trim.startFrame !== 0 || trim.endFrame !== decoded.numberOfFrames) {
          finalSample = decoded.trim(trim.startFrame, trim.endFrame);
        }
        finalSample.setTimestamp(trim.outputTimestamp);
        await source.add(finalSample);
        encodedSamples += finalSample.numberOfFrames;
        lastEnd = Math.max(lastEnd, finalSample.timestamp + finalSample.duration);
        report(
          onProgress,
          "audio",
          Math.min(lastEnd, duration),
          duration,
          0.78 + 0.17 * Math.min(lastEnd / duration, 1),
        );
      } finally {
        if (finalSample !== decoded) finalSample.close();
        decoded.close();
      }
    }
  } catch (error) {
    if (signal?.aborted) throw cancelledError(signal);
    throw wrapError(
      error,
      "PRESENTER_DECODE_FAILED",
      "Presenter audio could not be decoded and encoded without loss.",
    );
  }

  if (encodedSamples === 0) {
    throw new ExportStudioError(
      "PRESENTER_DECODE_FAILED",
      "Presenter declares an audio track, but no audio samples were available for this export.",
    );
  }

  return Math.min(lastEnd, duration);
}

async function canvasToPngBlob(canvas: ExportCanvas): Promise<Blob> {
  try {
    if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
      return await canvas.convertToBlob({ type: "image/png" });
    }

    const htmlCanvas = canvas as HTMLCanvasElement;
    if (typeof htmlCanvas.toBlob !== "function") {
      throw new ExportStudioError(
        "CANVAS_EXPORT_UNSUPPORTED",
        "This browser cannot encode the canvas as PNG.",
      );
    }
    return await new Promise<Blob>((resolve, reject) => {
      htmlCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new ExportStudioError("PNG_ENCODING_FAILED", "Browser returned an empty PNG capture."));
      }, "image/png");
    });
  } catch (error) {
    throw wrapError(error, "PNG_ENCODING_FAILED", "Browser failed to encode a PNG frame.");
  }
}

async function validatePngBlob(
  blob: Blob,
  expectedWidth: number,
  expectedHeight: number,
  requireAlpha: boolean,
  inspectPixels = false,
  requireTransparentPixels = false,
): Promise<PngInspection & PngAlphaInspection> {
  if (blob.size === 0) {
    throw new ExportStudioError("PNG_INVALID", "Captured PNG is empty.");
  }
  const inspection = inspectPngHeader(new Uint8Array(await blob.slice(0, 33).arrayBuffer()));
  if (inspection.width !== expectedWidth || inspection.height !== expectedHeight) {
    throw new ExportStudioError(
      "PNG_INVALID",
      "Captured PNG dimensions do not match the requested export size.",
      { expectedWidth, expectedHeight, actualWidth: inspection.width, actualHeight: inspection.height },
    );
  }
  if (requireAlpha && !inspection.hasAlphaChannel) {
    throw new ExportStudioError(
      "PNG_ALPHA_MISSING",
      "Captured PNG does not contain an alpha channel. Transparent export stopped instead of returning an opaque file.",
      { colorType: inspection.colorType },
    );
  }

  if (typeof createImageBitmap !== "function") {
    throw new ExportStudioError(
      "CANVAS_EXPORT_UNSUPPORTED",
      "This browser cannot decode PNG output for mandatory readback verification.",
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch (error) {
    throw new ExportStudioError(
      "PNG_INVALID",
      "Captured PNG failed full decode readback.",
      { size: blob.size, cause: errorMessage(error) },
      { cause: error },
    );
  }

  try {
    if (bitmap.width !== expectedWidth || bitmap.height !== expectedHeight) {
      throw new ExportStudioError(
        "PNG_INVALID",
        "Decoded PNG dimensions do not match the requested export size.",
        {
          expectedWidth,
          expectedHeight,
          actualWidth: bitmap.width,
          actualHeight: bitmap.height,
        },
      );
    }

    let alphaInspection: PngAlphaInspection = {
      hasVisiblePixels: false,
      hasTransparentPixels: false,
    };
    if (inspectPixels || requireTransparentPixels) {
      const decodeCanvas = createScratchCanvas(expectedWidth, expectedHeight);
      const context = decodeCanvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new ExportStudioError(
          "PNG_INVALID",
          "Could not create a readback surface for decoded PNG pixels.",
        );
      }
      context.clearRect(0, 0, expectedWidth, expectedHeight);
      context.drawImage(bitmap, 0, 0, expectedWidth, expectedHeight);
      alphaInspection = inspectRgbaAlpha(
        context.getImageData(0, 0, expectedWidth, expectedHeight).data,
      );
    }

    if (
      requireTransparentPixels
      && (!alphaInspection.hasVisiblePixels || !alphaInspection.hasTransparentPixels)
    ) {
      throw new ExportStudioError(
        "PNG_ALPHA_MISSING",
        "Decoded PNG does not contain both visible content and transparent pixels.",
        alphaInspection,
      );
    }
    return { ...inspection, ...alphaInspection };
  } finally {
    bitmap.close();
  }
}

async function assertDirectoryFilesAbsent(
  directory: FileSystemDirectoryHandle,
  filenames: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  for (const filename of filenames) {
    throwIfAborted(signal);
    try {
      await directory.getFileHandle(filename);
      throw new ExportStudioError(
        "DIRECTORY_FILE_EXISTS",
        `Directory already contains ${filename}. Choose an empty folder; existing files are never overwritten.`,
        { filename },
      );
    } catch (error) {
      if (error instanceof ExportStudioError) throw error;
      if (!hasErrorName(error, "NotFoundError")) {
        throw wrapError(
          error,
          "DIRECTORY_WRITE_FAILED",
          "Could not verify that the export directory is safe to write.",
          { filename },
        );
      }
    }
  }
}

async function cleanupDirectoryFiles(
  directory: FileSystemDirectoryHandle,
  filenames: readonly string[],
): Promise<readonly string[]> {
  const failures: string[] = [];
  for (const filename of [...filenames].reverse()) {
    try {
      await directory.removeEntry(filename);
    } catch {
      failures.push(filename);
      continue;
    }

    try {
      await directory.getFileHandle(filename);
      failures.push(filename);
    } catch (error) {
      if (!hasErrorName(error, "NotFoundError")) failures.push(filename);
    }
  }
  return failures;
}

function createScratchCanvas(width: number, height: number): ExportCanvas {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  throw new ExportStudioError(
    "PRESENTER_DECODE_FAILED",
    "This environment cannot create a presenter frame surface.",
  );
}

function supportsCanvasPngEncoding(): boolean {
  const htmlCanvasSupport =
    typeof HTMLCanvasElement !== "undefined"
    && typeof HTMLCanvasElement.prototype.toBlob === "function";
  const offscreenSupport =
    typeof OffscreenCanvas !== "undefined"
    && typeof OffscreenCanvas.prototype.convertToBlob === "function";
  return (htmlCanvasSupport || offscreenSupport) && typeof createImageBitmap === "function";
}

function setCanvasSize(canvas: ExportCanvas, width: number, height: number): void {
  canvas.width = width;
  canvas.height = height;
}

function avcQuality(): Quality {
  return new Quality({ bitrate: AVC_BITRATE, bitrateMode: "variable" });
}

function aacQuality(): Quality {
  return new Quality({ bitrate: AAC_BITRATE, bitrateMode: "variable" });
}

function assertEncoderConfigurations(
  configs: Readonly<{
    video: VideoEncoderConfig | null;
    audio: AudioEncoderConfig | null;
  }>,
  settings: ExportSettings,
  expectAudio: boolean,
): void {
  const video = configs.video;
  if (!video) {
    throw new ExportStudioError(
      "ENCODE_FAILED",
      "H.264 encoder did not expose the configuration it actually used.",
    );
  }

  if (
    video.width !== settings.width
    || video.height !== settings.height
    || video.bitrate !== AVC_BITRATE
    || video.bitrateMode !== "variable"
    || video.latencyMode !== "quality"
  ) {
    throw new ExportStudioError(
      "ENCODE_FAILED",
      "H.264 encoder changed the requested master configuration; export stopped instead of mislabelling the file.",
      {
        expected: {
          width: settings.width,
          height: settings.height,
          bitrate: AVC_BITRATE,
          bitrateMode: "variable",
          latencyMode: "quality",
        },
        actual: {
          codec: video.codec,
          width: video.width,
          height: video.height,
          bitrate: video.bitrate,
          bitrateMode: video.bitrateMode,
          latencyMode: video.latencyMode,
        },
      },
    );
  }

  if (!expectAudio) {
    if (configs.audio) {
      throw new ExportStudioError(
        "ENCODE_FAILED",
        "Muted presenter export unexpectedly initialized an audio encoder.",
      );
    }
    return;
  }

  const audio = configs.audio;
  if (!audio) {
    throw new ExportStudioError(
      "ENCODE_FAILED",
      "AAC encoder did not expose the configuration it actually used.",
    );
  }
  if (
    audio.numberOfChannels !== AUDIO_CHANNELS
    || audio.sampleRate !== AUDIO_SAMPLE_RATE
    || audio.bitrate !== AAC_BITRATE
    || audio.bitrateMode !== "variable"
  ) {
    throw new ExportStudioError(
      "ENCODE_FAILED",
      "AAC encoder changed the requested presenter-audio configuration; export stopped instead of mislabelling the file.",
      {
        expected: {
          numberOfChannels: AUDIO_CHANNELS,
          sampleRate: AUDIO_SAMPLE_RATE,
          bitrate: AAC_BITRATE,
          bitrateMode: "variable",
        },
        actual: {
          codec: audio.codec,
          numberOfChannels: audio.numberOfChannels,
          sampleRate: audio.sampleRate,
          bitrate: audio.bitrate,
          bitrateMode: audio.bitrateMode,
        },
      },
    );
  }
}

function validateCommonOptions(
  options: Pick<CommonPngOptions, "canvas" | "renderAt" | "settings">,
): void {
  if (!options || typeof options !== "object") {
    throw invalidSettings("Export options are missing.");
  }
  if (!options.canvas || typeof options.canvas !== "object") {
    throw invalidSettings("Export canvas is missing.");
  }
  if (typeof options.renderAt !== "function") {
    throw invalidSettings("renderAt must be a function.");
  }
  validateExportSettings(options.settings);
}

function validateFramePrefix(prefix: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(prefix) || prefix === "." || prefix === "..") {
    throw invalidSettings(
      "Frame prefix must be 1–64 filename-safe characters using letters, numbers, dots, dashes, or underscores.",
      { prefix },
    );
  }
}

function invalidSettings(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): ExportStudioError {
  return new ExportStudioError("INVALID_SETTINGS", message, details);
}

function verificationError(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  cause?: unknown,
): ExportStudioError {
  return new ExportStudioError(
    "OUTPUT_VERIFICATION_FAILED",
    message,
    details,
    cause === undefined ? undefined : { cause },
  );
}

function mergeColorSpace(
  track: VideoColorSpaceInit,
  decoded: VideoColorSpaceInit | null,
): VideoColorSpaceInit {
  return {
    primaries: track.primaries ?? decoded?.primaries ?? null,
    transfer: track.transfer ?? decoded?.transfer ?? null,
    matrix: track.matrix ?? decoded?.matrix ?? null,
    fullRange: track.fullRange ?? decoded?.fullRange ?? null,
  };
}

function isRec709Sdr(colorSpace: VideoColorSpaceInit): boolean {
  return colorSpace.primaries === "bt709"
    && (colorSpace.transfer === "bt709" || colorSpace.transfer === "iec61966-2-1")
    && (colorSpace.matrix === "bt709" || colorSpace.matrix === "rgb");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelledError(signal);
}

function cancelledError(signal: AbortSignal): ExportStudioError {
  return new ExportStudioError(
    "CANCELLED",
    "Export cancelled. No completed artifact was returned.",
    { reason: errorMessage(signal.reason) },
    { cause: signal.reason },
  );
}

function wrapError(
  error: unknown,
  code: ExportErrorCode,
  userMessage: string,
  details: Readonly<Record<string, unknown>> = {},
): ExportStudioError {
  if (error instanceof ExportStudioError) return error;
  return new ExportStudioError(
    code,
    userMessage,
    { ...details, cause: errorMessage(error) },
    { cause: error },
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

function hasErrorName(error: unknown, name: string): boolean {
  return !!error && typeof error === "object" && "name" in error && error.name === name;
}

function report(
  handler: ExportProgressHandler | undefined,
  phase: ExportProgressPhase,
  completed: number,
  total: number,
  ratio: number,
  frameIndex?: number,
): void {
  if (!handler) return;
  try {
    handler({
      phase,
      completed,
      total,
      ratio: Math.max(0, Math.min(1, ratio)),
      ...(frameIndex === undefined ? {} : { frameIndex }),
    });
  } catch {
    // Progress UI must never corrupt an otherwise valid export.
  }
}
