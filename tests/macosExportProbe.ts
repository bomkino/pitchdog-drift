import {
  exportMp4,
  exportPngStill,
  type DecodedPresenterFrame,
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

let mode: ProbeMode = "mp4";

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

function postResult(result: unknown): void {
  const handler = window.webkit?.messageHandlers?.driftExportProbe;
  if (handler) {
    handler.postMessage(result);
    return;
  }
  const pre = document.createElement("pre");
  pre.id = "drift-export-probe-result";
  pre.textContent = JSON.stringify(result, null, 2);
  document.body.append(pre);
}

async function run(): Promise<void> {
  const started = performance.now();
  const settings = { width: 320, height: 568, fps: 30, duration: 3 } as const;
  mode = "mp4";
  const mp4 = await exportMp4({
    canvas,
    renderAt,
    settings,
  });
  if (!mp4.blob || mp4.blob.size <= 0) {
    throw new Error("Buffer-backed MP4 export returned no bytes.");
  }
  const mp4Prefix = Array.from(new Uint8Array(await mp4.blob.slice(0, 16).arrayBuffer()));

  mode = "png";
  const png = await exportPngStill({
    canvas,
    renderAt,
    settings,
    time: 1.5,
    requireAlpha: true,
    requireTransparentPixels: true,
  });
  if (png.blob.size <= 0) throw new Error("PNG export returned no bytes.");
  const pngPrefix = Array.from(new Uint8Array(await png.blob.slice(0, 8).arrayBuffer()));

  const result = {
    schemaVersion: 1,
    ok: true,
    elapsedMs: Math.round((performance.now() - started) * 100) / 100,
    userAgent: navigator.userAgent,
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
  };
  postResult(result);
}

window.addEventListener("error", (event) => {
  postResult({
    schemaVersion: 1,
    ok: false,
    phase: "window-error",
    error: serializeError(event.error ?? event.message),
  });
}, { once: true });

window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  postResult({
    schemaVersion: 1,
    ok: false,
    phase: "unhandled-rejection",
    error: serializeError(event.reason),
  });
}, { once: true });

void run().catch((error: unknown) => {
  postResult({
    schemaVersion: 1,
    ok: false,
    phase: "export",
    error: serializeError(error),
  });
});
