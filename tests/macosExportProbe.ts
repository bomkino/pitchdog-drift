import {
  exportMp4,
  exportPngStill,
  type DecodedPresenterFrame,
  type ExportProgress,
  type RenderAtContext,
} from "../src/lib/exportStudio";

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        driftExportProbe?: {
          postMessage(value: unknown): void;
        };
      };
    };
  }
}

type ProbeMode = "mp4" | "png";

const canvas = (() => {
  const element = document.querySelector<HTMLCanvasElement>("#probe");
  if (!element) throw new Error("Export probe canvas is missing.");
  return element;
})();

const context = (() => {
  const value = canvas.getContext("2d", { alpha: true, willReadFrequently: false });
  if (!value) throw new Error("Export probe could not create a 2D canvas context.");
  return value;
})();

const startedAt = performance.now();
let mode: ProbeMode = "mp4";
let lastProgressKey = "";
let heartbeatPhase = "boot";
let heartbeatDetails: Record<string, unknown> = {};

function elapsedMs(): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function postMessage(value: unknown): void {
  const handler = window.webkit?.messageHandlers?.driftExportProbe;
  if (handler) {
    handler.postMessage(value);
    return;
  }
  const pre = document.querySelector<HTMLPreElement>("#drift-export-probe-result")
    ?? document.body.appendChild(document.createElement("pre"));
  pre.id = "drift-export-probe-result";
  pre.textContent = JSON.stringify(value, null, 2);
}

function postProgress(phase: string, details: Record<string, unknown> = {}): void {
  heartbeatPhase = phase;
  heartbeatDetails = details;
  document.title = `Drift export probe · ${phase}`;
  postMessage({
    kind: "progress",
    schemaVersion: 1,
    phase,
    elapsedMs: elapsedMs(),
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus(),
    canvas: { width: canvas.width, height: canvas.height },
    ...details,
  });
}

function reportEncoderProgress(scope: string, progress: ExportProgress): void {
  const bucket = Math.min(20, Math.max(0, Math.floor(progress.ratio * 20)));
  const key = `${scope}:${progress.phase}:${bucket}`;
  if (key === lastProgressKey) return;
  lastProgressKey = key;
  postProgress(`${scope}:${progress.phase}`, {
    completed: progress.completed,
    total: progress.total,
    ratio: Math.round(progress.ratio * 10_000) / 10_000,
    frameIndex: progress.frameIndex ?? null,
  });
}

function drawFrame(timeSeconds: number): void {
  const width = canvas.width;
  const height = canvas.height;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.clearRect(0, 0, width, height);

  if (mode === "mp4") {
    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#08090c");
    background.addColorStop(0.55, "#27242b");
    background.addColorStop(1, "#b48a4d");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  }

  const cycle = (timeSeconds / 3) % 1;
  const x = 32 + cycle * (width - 112);
  const y = height * 0.38 + Math.sin(timeSeconds * Math.PI * 2) * 34;
  context.save();
  context.translate(x, y);
  context.rotate(Math.sin(timeSeconds * 1.7) * 0.18);
  context.fillStyle = mode === "png" ? "rgba(220, 160, 92, 0.72)" : "rgba(255, 248, 232, 0.94)";
  context.fillRect(-30, -52, 60, 104);
  context.restore();

  context.strokeStyle = mode === "png" ? "rgba(10, 12, 18, 0.58)" : "rgba(6, 8, 12, 0.72)";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(width * 0.18, height * 0.75);
  context.bezierCurveTo(
    width * 0.36,
    height * (0.67 + Math.sin(timeSeconds) * 0.04),
    width * 0.68,
    height * (0.82 + Math.cos(timeSeconds * 1.3) * 0.04),
    width * 0.84,
    height * 0.72,
  );
  context.stroke();
}

async function renderAt(
  timeSeconds: number,
  _presenter?: DecodedPresenterFrame,
  renderContext?: RenderAtContext,
): Promise<void> {
  if (renderContext?.signal?.aborted) {
    throw renderContext.signal.reason ?? new DOMException("Probe aborted.", "AbortError");
  }
  drawFrame(timeSeconds);
  await Promise.resolve();
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const candidate = error as Error & {
      code?: unknown;
      userMessage?: unknown;
      details?: unknown;
    };
    return {
      name: error.name,
      message: error.message,
      code: candidate.code ?? null,
      userMessage: candidate.userMessage ?? null,
      details: candidate.details ?? null,
      stack: error.stack ?? null,
    };
  }
  return { name: "Error", message: String(error) };
}

async function nextCompositedFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function run(): Promise<void> {
  const settings = { width: 320, height: 568, fps: 30, duration: 3 } as const;
  postProgress("boot", {
    userAgent: navigator.userAgent,
    readyState: document.readyState,
    videoEncoder: typeof VideoEncoder,
    videoDecoder: typeof VideoDecoder,
    offscreenCanvas: typeof OffscreenCanvas,
    createImageBitmap: typeof createImageBitmap,
  });

  await nextCompositedFrame();
  postProgress("compositor-ready");

  mode = "mp4";
  postProgress("mp4:calling-export");
  const mp4 = await exportMp4({
    canvas,
    renderAt,
    settings,
    onProgress: (progress) => reportEncoderProgress("mp4", progress),
  });
  postProgress("mp4:returned", {
    bytes: mp4.blob?.size ?? 0,
    frameCount: mp4.frameCount,
    decodedProbeFrames: mp4.verification.decodedProbeFrames,
  });
  if (!mp4.blob || mp4.blob.size <= 0) {
    throw new Error("Buffer-backed MP4 export returned no bytes.");
  }
  const mp4Prefix = Array.from(new Uint8Array(await mp4.blob.slice(0, 16).arrayBuffer()));
  postProgress("mp4:prefix-read", { prefix: mp4Prefix });

  mode = "png";
  postProgress("png:calling-export");
  const png = await exportPngStill({
    canvas,
    renderAt,
    settings,
    time: 1.5,
    requireAlpha: true,
    requireTransparentPixels: true,
    onProgress: (progress) => reportEncoderProgress("png", progress),
  });
  postProgress("png:returned", {
    bytes: png.blob.size,
    hasAlphaChannel: png.hasAlphaChannel,
    hasTransparentPixels: png.hasTransparentPixels,
  });
  if (png.blob.size <= 0) throw new Error("PNG export returned no bytes.");
  const pngPrefix = Array.from(new Uint8Array(await png.blob.slice(0, 8).arrayBuffer()));

  postMessage({
    schemaVersion: 1,
    ok: true,
    elapsedMs: elapsedMs(),
    userAgent: navigator.userAgent,
    visibilityState: document.visibilityState,
    mp4: {
      bytes: mp4.blob.size,
      prefix: mp4Prefix,
      width: mp4.width,
      height: mp4.height,
      fps: mp4.fps,
      frameCount: mp4.frameCount,
      duration: mp4.duration,
      videoCodec: mp4.videoCodec,
      audio: mp4.audio,
      verification: mp4.verification,
    },
    png: {
      bytes: png.blob.size,
      prefix: pngPrefix,
      width: png.width,
      height: png.height,
      hasAlphaChannel: png.hasAlphaChannel,
      hasTransparentPixels: png.hasTransparentPixels,
    },
  });
}

const heartbeat = window.setInterval(() => {
  postProgress(`heartbeat:${heartbeatPhase}`, heartbeatDetails);
}, 15_000);

window.addEventListener("error", (event) => {
  window.clearInterval(heartbeat);
  postMessage({
    schemaVersion: 1,
    ok: false,
    phase: "window-error",
    elapsedMs: elapsedMs(),
    error: serializeError(event.error ?? event.message),
  });
}, { once: true });

window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  window.clearInterval(heartbeat);
  postMessage({
    schemaVersion: 1,
    ok: false,
    phase: "unhandled-rejection",
    elapsedMs: elapsedMs(),
    error: serializeError(event.reason),
  });
}, { once: true });

void run().then(
  () => window.clearInterval(heartbeat),
  (error: unknown) => {
    window.clearInterval(heartbeat);
    postMessage({
      schemaVersion: 1,
      ok: false,
      phase: heartbeatPhase,
      elapsedMs: elapsedMs(),
      error: serializeError(error),
    });
  },
);
