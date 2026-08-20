import type { RenderedSoundtrack } from './render';
import { mixSeed } from './prng';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function deterministicTpdf(index: number, channel: number): number {
  const first = (mixSeed(index, channel, 0x91e10da5) & 0xffff) / 0xffff;
  const second = (mixSeed(index, channel, 0x7f4a7c15) & 0xffff) / 0xffff;
  return (first - second) / 8_388_607;
}

export function encodePcm24Wav(soundtrack: RenderedSoundtrack): ArrayBuffer {
  const channels = soundtrack.channelData.length;
  if (channels !== 2) throw new Error('Pitchdog sound masters must be stereo.');
  const frames = soundtrack.channelData[0].length;
  if (soundtrack.channelData[1].length !== frames) {
    throw new Error('Soundtrack channels must contain the same number of frames.');
  }
  const bytesPerSample = 3;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, soundtrack.sampleRate, true);
  view.setUint32(28, soundtrack.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = clamp(soundtrack.channelData[channel][frame] + deterministicTpdf(frame, channel), -1, 1);
      const integer = sample < 0 ? Math.round(sample * 8_388_608) : Math.round(sample * 8_388_607);
      view.setUint8(offset, integer & 0xff);
      view.setUint8(offset + 1, (integer >> 8) & 0xff);
      view.setUint8(offset + 2, (integer >> 16) & 0xff);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

export function soundMasterBlob(soundtrack: RenderedSoundtrack): Blob {
  return new Blob([encodePcm24Wav(soundtrack)], { type: 'audio/wav' });
}
