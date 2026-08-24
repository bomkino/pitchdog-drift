export type ExportSettings = Readonly<{
  width: number;
  height: number;
  fps: number;
  /** Duration in seconds. */
  duration: number;
}>;

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
  | "PRESENTER_DECODE_TIMEOUT"
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

export const DEFAULT_ZIP_MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;

export const DEFAULT_EXPORT_SETTINGS = Object.freeze({
  width: 1080,
  height: 1920,
  fps: 30,
  duration: 8,
}) satisfies ExportSettings;

const MIN_DURATION_SECONDS = 0.5;
const MAX_DURATION_SECONDS = 300;
const MAX_EXPORT_DIMENSION = 8192;
const MAX_EXPORT_FPS = 60;
const ZIP_ENTRY_OVERHEAD_BYTES = 256;

function invalidSettings(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): ExportStudioError {
  return new ExportStudioError("INVALID_SETTINGS", message, details);
}

export function getExportFrameCount(settings: Pick<ExportSettings, "duration" | "fps">): number {
  return Math.round(settings.duration * settings.fps);
}

export function validateExportSettings(settings: ExportSettings): ExportSettings {
  if (!settings || typeof settings !== "object") {
    throw invalidSettings("Export settings are missing.");
  }
  if (!Number.isInteger(settings.width) || settings.width <= 0 || settings.width > MAX_EXPORT_DIMENSION) {
    throw invalidSettings(`Width must be an integer from 1 to ${MAX_EXPORT_DIMENSION}px.`, { width: settings.width });
  }
  if (!Number.isInteger(settings.height) || settings.height <= 0 || settings.height > MAX_EXPORT_DIMENSION) {
    throw invalidSettings(`Height must be an integer from 1 to ${MAX_EXPORT_DIMENSION}px.`, { height: settings.height });
  }
  if (!Number.isInteger(settings.fps) || settings.fps <= 0 || settings.fps > MAX_EXPORT_FPS) {
    throw invalidSettings(`Frame rate must be an integer from 1 to ${MAX_EXPORT_FPS}fps.`, { fps: settings.fps });
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
  return Math.ceil(activeCanvasBytes * 2 + (retainedPngBytes + zipOverhead) * 3);
}
