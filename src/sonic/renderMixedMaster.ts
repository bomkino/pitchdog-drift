import { AudioBufferSink } from "mediabunny";
import type { InputAudioTrack } from "mediabunny";

const MIX_SAMPLE_RATE = 48_000;
const MIX_CHANNELS = 2;
const DUCK_ATTACK_SECONDS = 0.025;
const DUCK_RELEASE_SECONDS = 0.12;
const ACTIVITY_WINDOW_SECONDS = 0.02;
const MIN_ACTIVITY_RMS = 0.0015;

export interface PresenterCoverageInterval {
  start: number;
  end: number;
}

export interface PresenterActivityWindow extends PresenterCoverageInterval {
  rms: number;
}

export interface ReadablePresenterBuffer {
  readonly sampleRate: number;
  readonly length: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
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
 * Measures short-window decoded energy. This distinguishes real narration from
 * zero-filled decoder coverage: some media sinks return a continuous AudioBuffer
 * across packet gaps, so timestamps alone are not a voice-activity signal.
 */
export function measurePresenterActivity(
  buffer: ReadablePresenterBuffer,
  sourceOffset: number,
  segmentDuration: number,
  outputStart: number,
): PresenterActivityWindow[] {
  if (
    !buffer
    || !Number.isFinite(buffer.sampleRate)
    || buffer.sampleRate <= 0
    || !Number.isInteger(buffer.length)
    || buffer.length <= 0
    || !Number.isInteger(buffer.numberOfChannels)
    || buffer.numberOfChannels <= 0
    || !Number.isFinite(sourceOffset)
    || !Number.isFinite(segmentDuration)
    || !Number.isFinite(outputStart)
    || segmentDuration <= 0
  ) return [];

  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel),
  );
  if (channels.some((channel) => (
    !(channel instanceof Float32Array) || channel.length !== buffer.length
  ))) return [];

  const firstFrame = clamp(
    Math.floor(Math.max(0, sourceOffset) * buffer.sampleRate),
    0,
    buffer.length,
  );
  const lastFrame = clamp(
    Math.ceil((Math.max(0, sourceOffset) + segmentDuration) * buffer.sampleRate),
    firstFrame,
    buffer.length,
  );
  const windowFrames = Math.max(
    1,
    Math.round(ACTIVITY_WINDOW_SECONDS * buffer.sampleRate),
  );
  const windows: PresenterActivityWindow[] = [];

  for (let startFrame = firstFrame; startFrame < lastFrame; startFrame += windowFrames) {
    const endFrame = Math.min(lastFrame, startFrame + windowFrames);
    let squareSum = 0;
    let sampleCount = 0;
    for (const channel of channels) {
      for (let frame = startFrame; frame < endFrame; frame += 1) {
        const value = channel[frame]!;
        squareSum += value * value;
        sampleCount += 1;
      }
    }
    const relativeStart = (startFrame - firstFrame) / buffer.sampleRate;
    const relativeEnd = (endFrame - firstFrame) / buffer.sampleRate;
    windows.push({
      start: outputStart + relativeStart,
      end: outputStart + relativeEnd,
      rms: sampleCount > 0 ? Math.sqrt(squareSum / sampleCount) : 0,
    });
  }
  return windows;
}

/**
 * Uses an adaptive threshold: absolute silence stays silent, a measured noise
 * floor does not permanently duck foley, and genuinely quiet speech still
 * receives protection. The threshold is capped below the strongest region so
 * a valid but low-level track cannot classify itself entirely inactive.
 */
export function getPresenterActivityThreshold(
  windows: readonly PresenterActivityWindow[],
): number {
  const levels = windows
    .map((window) => window.rms)
    .filter((level) => Number.isFinite(level) && level >= 0)
    .sort((a, b) => a - b);
  if (levels.length === 0) return Number.POSITIVE_INFINITY;
  const maximum = levels.at(-1)!;
  if (maximum < MIN_ACTIVITY_RMS) return Number.POSITIVE_INFINITY;
  const noiseFloor = levels[Math.floor((levels.length - 1) * 0.2)] ?? 0;
  const candidate = Math.max(
    MIN_ACTIVITY_RMS,
    noiseFloor * 2.5,
    maximum * 0.06,
  );
  return Math.min(candidate, maximum * 0.65);
}

/**
 * Combines voice-active windows into stable dialogue regions. Brief codec or
 * consonant gaps stay ducked to avoid pumping; meaningful pauses remain
 * available for the tactile bed to breathe at full level.
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

export function getPresenterVoiceRegions(
  windows: readonly PresenterActivityWindow[],
  duration: number,
): PresenterCoverageInterval[] {
  const threshold = getPresenterActivityThreshold(windows);
  if (!Number.isFinite(threshold)) return [];
  return mergePresenterCoverage(
    windows.filter((window) => window.rms >= threshold),
    duration,
  );
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
 * Presenter buffers retain their real timestamps. Voice activity is measured
 * from decoded PCM rather than inferred from packet coverage, so zero-filled
 * gaps release the tactile bed. Routing through a stereo offline context also
 * preserves lateral motion when narration is mono.
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
  const activityWindows: PresenterActivityWindow[] = [];
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
    activityWindows.push(...measurePresenterActivity(
      wrapped.buffer,
      sourceOffset,
      segmentDuration,
      outputStart,
    ));
    scheduledBuffers += 1;
    coveredUntil = Math.max(coveredUntil, outputEnd);
    options.onPresenterCoverage?.(Math.min(coveredUntil, options.duration));
  }

  if (scheduledBuffers === 0) {
    throw new Error("Presenter declares audio, but no decodable samples cover this export.");
  }

  scheduleUnderVoiceEnvelope(
    tactileGain.gain,
    getPresenterVoiceRegions(activityWindows, options.duration),
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
