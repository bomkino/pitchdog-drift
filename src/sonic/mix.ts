export interface ReadableAudioBuffer {
  readonly sampleRate: number;
  readonly length: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

function clampSample(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function validateBuffer(buffer: ReadableAudioBuffer): readonly Float32Array[] {
  if (
    !buffer
    || !Number.isInteger(buffer.sampleRate)
    || buffer.sampleRate <= 0
    || !Number.isInteger(buffer.length)
    || buffer.length <= 0
    || !Number.isInteger(buffer.numberOfChannels)
    || buffer.numberOfChannels <= 0
  ) throw new TypeError("Soundtrack buffer shape is invalid.");

  const channels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    if (!(data instanceof Float32Array) || data.length !== buffer.length) {
      throw new TypeError("Soundtrack channel data does not match its declared length.");
    }
    channels.push(data);
  }
  return channels;
}

function interpolated(
  channel: Float32Array,
  position: number,
): number {
  const before = Math.floor(position);
  if (before < 0 || before >= channel.length) return 0;
  const after = Math.min(channel.length - 1, before + 1);
  const fraction = position - before;
  return channel[before]! + (channel[after]! - channel[before]!) * fraction;
}

/**
 * Adds a soundtrack into planar PCM at an absolute timeline timestamp. The
 * soundtrack may have a different sample rate or channel count; interpolation
 * and channel mapping are explicit so export never depends on implicit browser
 * resampling or a second muxed audio track.
 */
export function mixSoundtrackIntoPlanar(
  destination: readonly Float32Array[],
  timestamp: number,
  sampleRate: number,
  soundtrack: ReadableAudioBuffer,
  gain: number,
): void {
  if (
    destination.length === 0
    || !destination.every((plane) => plane instanceof Float32Array && plane.length === destination[0]!.length)
  ) throw new TypeError("Destination PCM must contain equal-length Float32 planar channels.");
  if (!Number.isFinite(timestamp)) throw new TypeError("Destination timestamp must be finite.");
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new TypeError("Destination sample rate must be positive.");
  if (!Number.isFinite(gain) || gain < 0 || gain > 1) throw new TypeError("Soundtrack gain must be between 0 and 1.");
  if (gain === 0) return;

  const source = validateBuffer(soundtrack);
  const destinationChannels = destination.length;
  const sourceChannels = source.length;
  const ratio = soundtrack.sampleRate / sampleRate;
  const sourceOffset = timestamp * soundtrack.sampleRate;

  for (let frame = 0; frame < destination[0]!.length; frame += 1) {
    const sourcePosition = sourceOffset + frame * ratio;
    if (sourcePosition < 0) continue;
    if (sourcePosition >= soundtrack.length) break;

    const left = interpolated(source[0]!, sourcePosition);
    const right = sourceChannels > 1 ? interpolated(source[1]!, sourcePosition) : left;
    const mono = (left + right) * 0.5;

    for (let channel = 0; channel < destinationChannels; channel += 1) {
      const effect = destinationChannels === 1
        ? mono
        : channel === 0
          ? left
          : channel === 1
            ? right
            : mono;
      const plane = destination[channel]!;
      plane[frame] = clampSample(plane[frame]! + effect * gain);
    }
  }
}
