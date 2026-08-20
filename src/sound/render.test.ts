import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND_SETTINGS } from './model';
import { deriveCueSchedule, renderSoundtrack } from './render';
import { encodePcm24Wav } from './wav';

describe('procedural Foley renderer', () => {
  const options = {
    sound: DEFAULT_SOUND_SETTINGS,
    durationSeconds: 2,
    sampleRate: 48_000,
    loop: true,
    motion: { speed: 1.25 },
    slideCount: 7,
  } as const;

  it('is deterministic at sample level', () => {
    const first = renderSoundtrack(options);
    const second = renderSoundtrack(options);
    expect(first.checksum).toBe(second.checksum);
    expect(Array.from(first.channelData[0].slice(0, 2000))).toEqual(
      Array.from(second.channelData[0].slice(0, 2000)),
    );
  });

  it('changes when the authored seed changes', () => {
    const first = renderSoundtrack(options);
    const second = renderSoundtrack({
      ...options,
      sound: { ...DEFAULT_SOUND_SETTINGS, seed: DEFAULT_SOUND_SETTINGS.seed + 1 },
    });
    expect(first.checksum).not.toBe(second.checksum);
  });

  it('renders exact-length, finite, bounded stereo PCM', () => {
    const rendered = renderSoundtrack(options);
    expect(rendered.channelData[0]).toHaveLength(96_000);
    expect(rendered.channelData[1]).toHaveLength(96_000);
    expect(rendered.eventCount).toBeGreaterThan(0);
    expect(rendered.peak).toBeGreaterThan(0);
    expect(rendered.peak).toBeLessThanOrEqual(0.965001);
    expect(Array.from(rendered.channelData[0]).every(Number.isFinite)).toBe(true);
  });

  it('honours explicit silence and reduced-motion policy', () => {
    const disabled = renderSoundtrack({
      ...options,
      sound: { ...DEFAULT_SOUND_SETTINGS, enabled: false },
    });
    expect(disabled.eventCount).toBe(0);
    expect(disabled.peak).toBe(0);
    expect(deriveCueSchedule({ ...options, reducedMotion: true })).toEqual([]);
  });

  it('encodes a standards-shaped 24-bit stereo WAV', () => {
    const rendered = renderSoundtrack({ ...options, durationSeconds: 0.1 });
    const wav = encodePcm24Wav(rendered);
    const view = new DataView(wav);
    const ascii = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(wav, offset, length));
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint16(34, true)).toBe(24);
  });
});
