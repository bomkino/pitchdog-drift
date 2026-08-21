import type { StudioSettings } from "../model";
import {
  getSonicAssetBytes,
  getSonicAssetSpec,
  getSonicAssetVariantCount,
  type SonicAssetSpec,
  type SonicCue,
} from "./catalog";
import { buildSonicTimeline } from "./plan";

export const SONIC_SAMPLE_RATE = 48_000;
export const SONIC_CHANNELS = 2;

interface DecodedSonicAsset {
  buffer: AudioBuffer;
  spec: SonicAssetSpec;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Soundtrack rendering was canceled.", "AbortError");
}

async function renderInterruptibly(
  context: OfflineAudioContext,
  signal?: AbortSignal,
): Promise<AudioBuffer> {
  throwIfAborted(signal);
  const rendering = context.startRendering();
  if (!signal) return await rendering;

  // OfflineAudioContext cannot be canceled. Reject the export transaction as
  // soon as the user aborts, keep the losing render observed, and discard it.
  void rendering.catch(() => undefined);
  let onAbort: (() => void) | null = null;
  const cancellation = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(
      signal.reason instanceof Error
        ? signal.reason
        : new DOMException("Soundtrack rendering was canceled.", "AbortError"),
    );
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([rendering, cancellation]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

async function decodeCueVariants(
  context: BaseAudioContext,
  palette: StudioSettings["sound"]["palette"],
  cue: SonicCue,
  signal?: AbortSignal,
): Promise<readonly DecodedSonicAsset[]> {
  const variantCount = getSonicAssetVariantCount(palette, cue);
  return await Promise.all(
    Array.from({ length: variantCount }, async (_, variant) => {
      throwIfAborted(signal);
      const bytes = await getSonicAssetBytes(palette, cue, variant, signal);
      throwIfAborted(signal);
      return {
        buffer: await context.decodeAudioData(bytes),
        spec: getSonicAssetSpec(palette, cue, variant),
      };
    }),
  );
}

function selectVariant(
  variants: readonly DecodedSonicAsset[],
  variant: number,
): DecodedSonicAsset | undefined {
  if (variants.length === 0) return undefined;
  const index = ((Math.trunc(variant) % variants.length) + variants.length)
    % variants.length;
  return variants[index];
}

function playbackWindow(asset: DecodedSonicAsset): Readonly<{
  offset: number;
  duration: number;
}> {
  const offset = clamp(asset.spec.trimStart, 0, asset.buffer.duration);
  const remaining = Math.max(0, asset.buffer.duration - offset);
  const tail = clamp(asset.spec.trimEnd, 0, remaining);
  return {
    offset,
    duration: Math.max(0, remaining - tail),
  };
}

/**
 * Renders the authored cue plan into an exact-length 48 kHz stereo buffer.
 * Source selection, timing, pitch, gain, pan and non-destructive recording
 * treatments are deterministic. Export later mixes this effects bed beneath
 * presenter speech into one verified AAC track.
 */
export async function renderSonicSoundtrack(
  settings: StudioSettings,
  assetCount: number,
  duration = settings.output.duration,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> {
  throwIfAborted(signal);
  const events = buildSonicTimeline(settings, assetCount, duration);
  if (events.length === 0) return null;
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("This browser cannot render the tactile sound track offline.");
  }

  const frameCount = Math.max(1, Math.round(duration * SONIC_SAMPLE_RATE));
  const context = new OfflineAudioContext(
    SONIC_CHANNELS,
    frameCount,
    SONIC_SAMPLE_RATE,
  );
  const requiredCues = [...new Set(events.map((event) => event.cue))];
  const decoded = new Map<SonicCue, readonly DecodedSonicAsset[]>();
  await Promise.all(requiredCues.map(async (cue) => {
    decoded.set(
      cue,
      await decodeCueVariants(
        context,
        settings.sound.palette,
        cue,
        signal,
      ),
    );
  }));
  throwIfAborted(signal);

  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  master.gain.value = Math.min(
    1,
    Math.max(0, settings.sound.masterGain * settings.sound.motionGain),
  );
  compressor.threshold.value = -18;
  compressor.knee.value = 22;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.16;
  master.connect(compressor);
  compressor.connect(context.destination);

  for (const event of events) {
    const variants = decoded.get(event.cue);
    const asset = variants
      ? selectVariant(variants, event.variant)
      : undefined;
    if (!asset) continue;

    const window = playbackWindow(asset);
    if (window.duration <= 0) continue;

    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    source.buffer = asset.buffer;
    source.playbackRate.value = event.playbackRate;
    panner.pan.value = event.pan;

    const start = Math.max(0, event.time);
    const audibleDuration = window.duration / Math.max(
      0.01,
      event.playbackRate,
    );
    const end = Math.min(duration, start + audibleDuration);
    if (end <= start) continue;
    const attackEnd = Math.min(
      end,
      start + Math.min(0.012, audibleDuration * 0.2),
    );
    const releaseStart = Math.max(
      attackEnd,
      end - Math.min(0.032, audibleDuration * 0.28),
    );
    const treatedGain = event.gain * asset.spec.gain;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(treatedGain, attackEnd);
    gain.gain.setValueAtTime(treatedGain, releaseStart);
    gain.gain.linearRampToValueAtTime(0, end);

    source.connect(gain);
    gain.connect(panner);
    panner.connect(master);
    const renderedDuration = Math.max(0, end - start);
    const sourceDuration = Math.min(
      window.duration,
      renderedDuration * source.playbackRate.value,
    );
    source.start(start, window.offset, sourceDuration);
    source.stop(end);
  }

  const rendered = await renderInterruptibly(context, signal);
  throwIfAborted(signal);
  if (
    rendered.sampleRate !== SONIC_SAMPLE_RATE
    || rendered.numberOfChannels !== SONIC_CHANNELS
    || rendered.length !== frameCount
  ) {
    throw new Error("Offline tactile sound track returned an unexpected audio shape.");
  }
  return rendered;
}
