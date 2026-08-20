import type { StudioSettings } from "../model";
import { getSonicAssetBytes, type SonicCue } from "./catalog";
import { buildSonicTimeline } from "./plan";

export const SONIC_SAMPLE_RATE = 48_000;
export const SONIC_CHANNELS = 2;

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException("Soundtrack rendering was canceled.", "AbortError");
}

async function decodeCue(
  context: BaseAudioContext,
  palette: StudioSettings["sound"]["palette"],
  cue: SonicCue,
): Promise<AudioBuffer> {
  const bytes = getSonicAssetBytes(palette, cue);
  return await context.decodeAudioData(bytes.slice(0));
}

/**
 * Renders the authored cue plan into an exact-length 48 kHz stereo buffer.
 * The offline graph contains no wall clock or network dependency. Export later
 * mixes this one effects bed beneath presenter speech into a single AAC track.
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
  const context = new OfflineAudioContext(SONIC_CHANNELS, frameCount, SONIC_SAMPLE_RATE);
  const requiredCues = [...new Set(events.map((event) => event.cue))];
  const decoded = new Map<SonicCue, AudioBuffer>();
  await Promise.all(requiredCues.map(async (cue) => {
    decoded.set(cue, await decodeCue(context, settings.sound.palette, cue));
  }));
  throwIfAborted(signal);

  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  master.gain.value = Math.min(1, Math.max(0, settings.sound.masterGain * settings.sound.motionGain));
  compressor.threshold.value = -18;
  compressor.knee.value = 22;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.16;
  master.connect(compressor);
  compressor.connect(context.destination);

  for (const event of events) {
    const buffer = decoded.get(event.cue);
    if (!buffer) continue;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = event.playbackRate;
    panner.pan.value = event.pan;

    const start = Math.max(0, event.time);
    const audibleDuration = buffer.duration / Math.max(0.01, event.playbackRate);
    const end = Math.min(duration, start + audibleDuration);
    if (end <= start) continue;
    const attackEnd = Math.min(end, start + Math.min(0.012, audibleDuration * 0.2));
    const releaseStart = Math.max(attackEnd, end - Math.min(0.032, audibleDuration * 0.28));
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(event.gain, attackEnd);
    gain.gain.setValueAtTime(event.gain, releaseStart);
    gain.gain.linearRampToValueAtTime(0, end);

    source.connect(gain);
    gain.connect(panner);
    panner.connect(master);
    source.start(start);
    source.stop(end);
  }

  const rendered = await context.startRendering();
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
