import type { StudioSettings } from "../model";
import {
  getSonicAssetBytes,
  getSonicAssetSpec,
  getSonicAssetVariantCount,
  type SonicAssetSpec,
  type SonicCue,
} from "./catalog";
import { buildSonicTimeline } from "./plan";
import { buildSonicLayerTimeline } from "./orchestrate";
import {
  configureSonicCompressor,
  SONIC_OUTPUT_HEADROOM,
} from "./dynamics";
import {
  createSonicFilters,
  getSonicEnvelopePoints,
} from "./graph";

export const SONIC_SAMPLE_RATE = 48_000;
export const SONIC_CHANNELS = 2;

interface DecodedSonicAsset {
  buffer: AudioBuffer;
  spec: SonicAssetSpec;
}

type SonicDecodeCache = Map<string, Promise<AudioBuffer>>;

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

  // OfflineAudioContext cannot be canceled. Reject promptly, keep the losing
  // render observed, and discard it after the transaction aborts.
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
  decodes: SonicDecodeCache,
  signal?: AbortSignal,
): Promise<readonly DecodedSonicAsset[]> {
  const variantCount = getSonicAssetVariantCount(palette, cue);
  return await Promise.all(
    Array.from({ length: variantCount }, async (_, variant) => {
      throwIfAborted(signal);
      const spec = getSonicAssetSpec(palette, cue, variant);
      let decode = decodes.get(spec.uri);
      if (!decode) {
        decode = getSonicAssetBytes(palette, cue, variant, signal)
          .then(async (bytes) => {
            throwIfAborted(signal);
            return await context.decodeAudioData(bytes);
          });
        decodes.set(spec.uri, decode);
        void decode.catch(() => {
          if (decodes.get(spec.uri) === decode) decodes.delete(spec.uri);
        });
      }
      return {
        buffer: await decode,
        spec,
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
 * Renders semantic edit events through the shared body/air/contact/landing
 * grammar into an exact-length 48 kHz stereo buffer. Preview and export share
 * source selection, timing, filters, envelopes, gain, pitch and pan.
 */
export async function renderSonicSoundtrack(
  settings: StudioSettings,
  assetCount: number,
  duration = settings.output.duration,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> {
  throwIfAborted(signal);
  const semanticEvents = buildSonicTimeline(settings, assetCount, duration);
  if (semanticEvents.length === 0) return null;
  const events = buildSonicLayerTimeline(settings, semanticEvents, duration);
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
  const assetDecodes: SonicDecodeCache = new Map();
  const decoded = new Map<SonicCue, readonly DecodedSonicAsset[]>();
  await Promise.all(requiredCues.map(async (cue) => {
    decoded.set(
      cue,
      await decodeCueVariants(
        context,
        settings.sound.palette,
        cue,
        assetDecodes,
        signal,
      ),
    );
  }));
  throwIfAborted(signal);

  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const output = context.createGain();
  master.gain.value = Math.min(
    1,
    Math.max(0, settings.sound.masterGain * settings.sound.motionGain),
  );
  configureSonicCompressor(compressor);
  output.gain.value = SONIC_OUTPUT_HEADROOM;
  master.connect(compressor);
  compressor.connect(output);
  output.connect(context.destination);

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
    const filters = createSonicFilters(context, event.filters);
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
    const { attackEnd, releaseStart } = getSonicEnvelopePoints(
      start,
      end,
      event.envelope,
    );
    const treatedGain = event.gain * asset.spec.gain;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(treatedGain, attackEnd);
    gain.gain.setValueAtTime(treatedGain, releaseStart);
    gain.gain.linearRampToValueAtTime(0, end);

    let tail: AudioNode = source;
    for (const filter of filters) {
      tail.connect(filter);
      tail = filter;
    }
    tail.connect(gain);
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
