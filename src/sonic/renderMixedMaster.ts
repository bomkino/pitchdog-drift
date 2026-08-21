import { AudioBufferSink } from "mediabunny";
import type { InputAudioTrack } from "mediabunny";

const MIX_SAMPLE_RATE = 48_000;
const MIX_CHANNELS = 2;
const DUCK_ATTACK_SECONDS = 0.025;
const DUCK_RELEASE_SECONDS = 0.12;

export interface PresenterCoverageInterval {
  start: number;
  end: number;
}

export interface MixedPresenterMasterOptions {
  track: InputAudioTrack;
  timelineStart: number;
  duration: number;
  soundtrack: AudioBuffer;
  soundtrackGain: number;
  signal?: AbortSignal;
  onPresenterCoverage?: (coveredSeconds: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Mixed audio rendering was canceled.", "AbortError");
}

async function renderInterruptibly(
  context: OfflineAudioContext,
  signal?: AbortSignal,
): Promise<AudioBuffer> {
  throwIfAborted(signal);
  const rendering = context.startRendering();
  if (!signal) return await rendering;

  // OfflineAudioContext exposes no cancel method. Keep the losing render branch
  // observed, but let the export transaction stop immediately and discard it.
  void rendering.catch(() => undefined);
  let onAbort: (() => void) | null = null;
  const cancellation = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(
      signal.reason instanceof Error
        ? signal.reason
        : new DOMException("Mixed audio rendering was canceled.", "AbortError"),
    );
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([rendering, cancellation]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Combines decoded presenter coverage into stable dialogue regions. Brief codec
 * packet gaps stay ducked to avoid pumping; meaningful pauses remain available
 * for the tactile bed to breathe at full level.
 */
export function mergePresenterCoverage(
  intervals: readonly PresenterCoverageInterval[],
  duration: number,
): PresenterCoverageInterval[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const normalized = intervals
    .filter((interval) => (
      Number.isFinite(interval.start)
      && Number.isFinite(interval.end)
      && interval.end > interval.start
    ))
    .map((interval) => ({
      start: clamp(interval.start, 0, duration),
      end: clamp(interval.end, 0, duration),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: PresenterCoverageInterval[] = [];
  const bridge = DUCK_ATTACK_SECONDS + DUCK_RELEASE_SECONDS;
  for (const interval of normalized) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end + bridge) {
      merged.push({ ...interval });
      continue;
    }
    previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

function scheduleUnderVoiceEnvelope(
  gain: AudioParam,
  coverage: readonly PresenterCoverageInterval[],
  underVoiceGain: number,
  duration: number,
): void {
  gain.cancelScheduledValues(0);
  gain.setValueAtTime(1, 0);
  if (underVoiceGain >= 0.999 || coverage.length === 0) return;

  for (const interval of coverage) {
    const attackStart = Math.max(0, interval.start - DUCK_ATTACK_SECONDS);
    const releaseEnd = Math.min(duration, interval.end + DUCK_RELEASE_SECONDS);

    if (interval.start <= 0) {
      gain.setValueAtTime(underVoiceGain, 0);
    } else {
      gain.setValueAtTime(1, attackStart);
      gain.linearRampToValueAtTime(underVoiceGain, interval.start);
    }
    gain.setValueAtTime(underVoiceGain, interval.end);
    if (releaseEnd > interval.end) {
      gain.linearRampToValueAtTime(1, releaseEnd);
    }
  }
}

/**
 * Builds one exact-duration 48 kHz stereo master before AAC encoding.
 *
 * Presenter buffers retain their real timestamps, including intentional gaps.
 * The tactile bed spans the complete export independently, so foley cannot
 * disappear merely because a presenter packet is absent. Routing through a
 * stereo offline context also preserves lateral motion when narration is mono.
 */
export async function renderMixedPresenterMaster(
  options: MixedPresenterMasterOptions,
): Promise<AudioBuffer> {
  throwIfAborted(options.signal);
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("This browser cannot render a mixed presenter master offline.");
  }
  if (!Number.isFinite(options.duration) || options.duration <= 0) {
    throw new TypeError("Mixed master duration must be positive.");
  }
  if (!Number.isFinite(options.timelineStart)) {
    throw new TypeError("Presenter timeline start must be finite.");
  }
  if (
    !Number.isFinite(options.soundtrackGain)
    || options.soundtrackGain < 0
    || options.soundtrackGain > 1
  ) {
    throw new TypeError("Tactile under-voice gain must be between 0 and 1.");
  }

  const frameCount = Math.max(1, Math.round(options.duration * MIX_SAMPLE_RATE));
  if (
    options.soundtrack.sampleRate !== MIX_SAMPLE_RATE
    || options.soundtrack.numberOfChannels !== MIX_CHANNELS
    || options.soundtrack.length !== frameCount
  ) {
    throw new TypeError("Tactile soundtrack must exactly match the stereo 48 kHz master timeline.");
  }

  const context = new OfflineAudioContext(
    MIX_CHANNELS,
    frameCount,
    MIX_SAMPLE_RATE,
  );
  const mixBus = context.createGain();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -2.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.09;
  mixBus.connect(limiter);
  limiter.connect(context.destination);

  const tactileSource = context.createBufferSource();
  const tactileGain = context.createGain();
  tactileSource.buffer = options.soundtrack;
  tactileSource.connect(tactileGain);
  tactileGain.connect(mixBus);

  const rangeStart = options.timelineStart;
  const rangeEnd = rangeStart + options.duration;
  const sink = new AudioBufferSink(options.track);
  const presenterCoverage: PresenterCoverageInterval[] = [];
  let scheduledBuffers = 0;
  let coveredUntil = 0;

  for await (const wrapped of sink.buffers(rangeStart, rangeEnd)) {
    throwIfAborted(options.signal);
    const sourceStart = Math.max(rangeStart, wrapped.timestamp);
    const sourceEnd = Math.min(
      rangeEnd,
      wrapped.timestamp + wrapped.duration,
    );
    const sourceOffset = Math.max(0, sourceStart - wrapped.timestamp);
    const availableDuration = Math.max(
      0,
      wrapped.buffer.duration - sourceOffset,
    );
    const segmentDuration = Math.min(
      Math.max(0, sourceEnd - sourceStart),
      availableDuration,
    );
    if (segmentDuration <= 0) continue;

    const presenterSource = context.createBufferSource();
    presenterSource.buffer = wrapped.buffer;
    presenterSource.connect(mixBus);
    const outputStart = sourceStart - rangeStart;
    const outputEnd = Math.min(
      options.duration,
      outputStart + segmentDuration,
    );
    presenterSource.start(outputStart, sourceOffset, segmentDuration);
    presenterCoverage.push({ start: outputStart, end: outputEnd });
    scheduledBuffers += 1;
    coveredUntil = Math.max(coveredUntil, outputEnd);
    options.onPresenterCoverage?.(Math.min(coveredUntil, options.duration));
  }

  if (scheduledBuffers === 0) {
    throw new Error("Presenter declares audio, but no decodable samples cover this export.");
  }

  const coverage = mergePresenterCoverage(
    presenterCoverage,
    options.duration,
  );
  scheduleUnderVoiceEnvelope(
    tactileGain.gain,
    coverage,
    options.soundtrackGain,
    options.duration,
  );
  tactileSource.start(0, 0, options.duration);

  const rendered = await renderInterruptibly(context, options.signal);
  throwIfAborted(options.signal);
  if (
    rendered.sampleRate !== MIX_SAMPLE_RATE
    || rendered.numberOfChannels !== MIX_CHANNELS
    || rendered.length !== frameCount
  ) {
    throw new Error("Mixed presenter master returned an unexpected audio shape.");
  }
  return rendered;
}
