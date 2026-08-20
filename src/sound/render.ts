import type { SoundCharacter, SoundSettings } from './model';
import { normalizeSoundSettings } from './model';
import { DeterministicRandom, mixSeed } from './prng';

export const SOUND_SAMPLE_RATE = 48_000;

export interface SoundCue {
  timeSeconds: number;
  strength: number;
  kind: 'passage' | 'accent' | 'settle';
  index: number;
}

export interface RenderedSoundtrack {
  sampleRate: number;
  channelData: readonly [Float32Array, Float32Array];
  durationSeconds: number;
  eventCount: number;
  peak: number;
  checksum: string;
}

export interface SoundtrackRenderOptions {
  sound: unknown;
  durationSeconds: number;
  sampleRate?: number;
  loop?: boolean;
  motion?: unknown;
  slideCount?: number;
  reducedMotion?: boolean;
}

interface CharacterProfile {
  duration: number;
  centerHz: number;
  resonanceHz: number;
  thumpHz: number;
  noise: number;
  tone: number;
  click: number;
  roughness: number;
}

const PROFILES: Record<SoundCharacter, CharacterProfile> = {
  paper: { duration: 0.29, centerHz: 1_850, resonanceHz: 4_200, thumpHz: 118, noise: 0.92, tone: 0.08, click: 0.18, roughness: 0.72 },
  air: { duration: 0.46, centerHz: 980, resonanceHz: 2_100, thumpHz: 76, noise: 1, tone: 0.03, click: 0.03, roughness: 0.24 },
  celluloid: { duration: 0.25, centerHz: 2_450, resonanceHz: 5_300, thumpHz: 104, noise: 0.64, tone: 0.13, click: 0.68, roughness: 0.86 },
  glass: { duration: 0.36, centerHz: 3_400, resonanceHz: 7_100, thumpHz: 146, noise: 0.26, tone: 0.76, click: 0.36, roughness: 0.14 },
  felt: { duration: 0.24, centerHz: 540, resonanceHz: 1_420, thumpHz: 64, noise: 0.48, tone: 0.22, click: 0.04, roughness: 0.31 },
  mechanism: { duration: 0.22, centerHz: 1_520, resonanceHz: 3_800, thumpHz: 92, noise: 0.38, tone: 0.31, click: 0.94, roughness: 0.63 },
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const readFinite = (value: unknown, fallback: number): number => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function deepNumericHint(value: unknown, names: readonly string[], fallback: number): number {
  const root = asRecord(value);
  if (!root) return fallback;
  const queue: Record<string, unknown>[] = [root];
  const visited = new Set<object>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const name of names) {
      if (name in current) {
        const candidate = readFinite(current[name], Number.NaN);
        if (Number.isFinite(candidate)) return candidate;
      }
    }
    for (const child of Object.values(current)) {
      const record = asRecord(child);
      if (record) queue.push(record);
    }
  }
  return fallback;
}

export function deriveCueSchedule(options: SoundtrackRenderOptions): SoundCue[] {
  const sound = normalizeSoundSettings(options.sound);
  const duration = clamp(readFinite(options.durationSeconds, 8), 0.05, 600);
  if (!sound.enabled || !sound.includeInExport) return [];
  if (options.reducedMotion && sound.respectReducedMotion) return [];

  const rawSpeed = Math.abs(deepNumericHint(options.motion, ['speed', 'velocity', 'autoplaySpeed', 'travelSpeed'], 1));
  const speed = clamp(rawSpeed, 0.2, 4.5);
  const slides = clamp(Math.round(readFinite(options.slideCount, 8)), 1, 200);
  const nominalRate = clamp(0.68 + speed * 0.54 + sound.density * 1.05, 0.55, 3.4);
  const countByRate = Math.max(1, Math.round(duration * nominalRate));
  const eventCount = Math.max(1, Math.min(240, Math.max(countByRate, Math.min(slides, countByRate + 2))));
  const interval = duration / eventCount;
  const phase = (mixSeed(sound.seed, eventCount) % 10_000) / 10_000;
  const cues: SoundCue[] = [];

  for (let index = 0; index < eventCount; index += 1) {
    const jitterRandom = new DeterministicRandom(mixSeed(sound.seed, index, 0x51f15e));
    const jitter = jitterRandom.bipolar() * interval * 0.055 * sound.texture;
    let timeSeconds = (index + 0.5 + (phase - 0.5) * 0.12) * interval + jitter;
    if (options.loop) {
      timeSeconds = ((timeSeconds % duration) + duration) % duration;
    } else {
      timeSeconds = clamp(timeSeconds, 0.025, Math.max(0.025, duration - 0.025));
    }
    const accentEvery = sound.density > 0.72 ? 3 : sound.density > 0.38 ? 4 : 5;
    const isAccent = index % accentEvery === 0;
    cues.push({
      timeSeconds,
      strength: clamp(0.62 + jitterRandom.unit() * 0.22 + (isAccent ? sound.accent * 0.32 : 0), 0, 1.25),
      kind: isAccent ? 'accent' : 'passage',
      index,
    });
  }

  if (!options.loop && duration > 0.7) {
    cues.push({
      timeSeconds: Math.max(0.02, duration - 0.22),
      strength: 0.56 + sound.accent * 0.26,
      kind: 'settle',
      index: eventCount,
    });
  }

  return cues.sort((a, b) => a.timeSeconds - b.timeSeconds || a.index - b.index);
}

function addWrapped(channel: Float32Array, index: number, value: number, loop: boolean): void {
  if (loop) {
    const wrapped = ((index % channel.length) + channel.length) % channel.length;
    channel[wrapped] += value;
  } else if (index >= 0 && index < channel.length) {
    channel[index] += value;
  }
}

function synthesizeCue(
  left: Float32Array,
  right: Float32Array,
  cue: SoundCue,
  settings: SoundSettings,
  sampleRate: number,
  loop: boolean,
): void {
  const profile = PROFILES[settings.character];
  const duration = profile.duration * (0.82 + settings.air * 0.52) * (cue.kind === 'settle' ? 1.18 : 1);
  const samples = Math.max(32, Math.round(duration * sampleRate));
  const start = Math.round(cue.timeSeconds * sampleRate);
  const random = new DeterministicRandom(mixSeed(settings.seed, cue.index, cue.kind.length));
  const panBase = Math.sin((cue.index + 1) * 2.399963229728653) * settings.stereoWidth;
  const pan = clamp(panBase + random.bipolar() * 0.12 * settings.stereoWidth, -0.92, 0.92);
  const leftPan = Math.cos((pan + 1) * Math.PI * 0.25);
  const rightPan = Math.sin((pan + 1) * Math.PI * 0.25);
  const baseGain = settings.level * cue.strength * 0.31;
  const attack = cue.kind === 'settle' ? 0.012 : 0.018;
  const center = profile.centerHz * (0.86 + random.unit() * 0.28);
  const resonance = profile.resonanceHz * (0.9 + random.unit() * 0.2);
  const thump = profile.thumpHz * (0.92 + random.unit() * 0.16);
  const lowAlpha = 1 - Math.exp((-2 * Math.PI * Math.min(center, sampleRate * 0.35)) / sampleRate);
  const highAlpha = 1 - Math.exp((-2 * Math.PI * Math.min(resonance, sampleRate * 0.44)) / sampleRate);
  let low = 0;
  let highSmooth = 0;
  let previousNoise = 0;

  for (let local = 0; local < samples; local += 1) {
    const time = local / sampleRate;
    const progress = local / Math.max(1, samples - 1);
    const attackEnvelope = smoothstep(0, attack / Math.max(duration, 0.001), progress);
    const decayShape = Math.exp(-progress * (4.6 - settings.air * 1.7));
    const envelope = attackEnvelope * decayShape;
    const white = random.bipolar();
    low += lowAlpha * (white - low);
    const high = white - low;
    highSmooth += highAlpha * (high - highSmooth);
    const differentiated = white - previousNoise;
    previousNoise = white;
    const rough = highSmooth * (0.72 + settings.texture * 0.52)
      + differentiated * profile.roughness * settings.texture * 0.12;
    const airBody = (rough * profile.noise + low * settings.air * 0.38) * envelope;
    const tonal = Math.sin(2 * Math.PI * resonance * time + cue.index * 0.61)
      * Math.exp(-time * (11 - settings.air * 4.4))
      * profile.tone;
    const impact = Math.sin(2 * Math.PI * thump * time)
      * Math.exp(-time * (18 - settings.accent * 4))
      * (0.16 + settings.accent * 0.34);
    const clickEnvelope = Math.exp(-time * (95 - settings.texture * 30));
    const clickCarrier = Math.sin(2 * Math.PI * center * (1 + time * 7) * time);
    const click = clickCarrier * clickEnvelope * profile.click * (cue.kind === 'accent' ? 1.2 : 0.82);
    const fiber = settings.character === 'paper' || settings.character === 'celluloid'
      ? (random.unit() > 0.985 - settings.texture * 0.008 ? random.bipolar() * envelope * 0.18 : 0)
      : 0;
    const value = (airBody + tonal + impact + click + fiber) * baseGain;
    addWrapped(left, start + local, value * leftPan, loop);
    addWrapped(right, start + local, value * rightPan, loop);
  }
}

function softLimit(value: number): number {
  const driven = value * 1.12;
  return driven / (1 + Math.abs(driven) * 0.54);
}

function checksumChannels(channels: readonly Float32Array[]): string {
  let hash = 0x811c9dc5;
  for (const channel of channels) {
    const stride = Math.max(1, Math.floor(channel.length / 8192));
    for (let index = 0; index < channel.length; index += stride) {
      const quantized = Math.round(clamp(channel[index], -1, 1) * 8_388_607);
      hash ^= quantized & 0xff;
      hash = Math.imul(hash, 0x01000193);
      hash ^= (quantized >>> 8) & 0xff;
      hash = Math.imul(hash, 0x01000193);
      hash ^= (quantized >>> 16) & 0xff;
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function renderSoundtrack(options: SoundtrackRenderOptions): RenderedSoundtrack {
  const settings = normalizeSoundSettings(options.sound);
  const sampleRate = Math.round(clamp(readFinite(options.sampleRate, SOUND_SAMPLE_RATE), 8_000, 96_000));
  const durationSeconds = clamp(readFinite(options.durationSeconds, 8), 0.05, 600);
  const frameCount = Math.max(1, Math.round(durationSeconds * sampleRate));
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  const cues = deriveCueSchedule({ ...options, sound: settings, durationSeconds });

  for (const cue of cues) synthesizeCue(left, right, cue, settings, sampleRate, Boolean(options.loop));

  let peak = 0;
  for (let index = 0; index < frameCount; index += 1) {
    left[index] = softLimit(left[index]);
    right[index] = softLimit(right[index]);
    peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
  }

  if (peak > 0.965) {
    const gain = 0.965 / peak;
    peak = 0;
    for (let index = 0; index < frameCount; index += 1) {
      left[index] *= gain;
      right[index] *= gain;
      peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
    }
  }

  return {
    sampleRate,
    channelData: [left, right],
    durationSeconds: frameCount / sampleRate,
    eventCount: cues.length,
    peak,
    checksum: checksumChannels([left, right]),
  };
}

export function renderAuditionCue(sound: unknown, sampleRate = SOUND_SAMPLE_RATE): RenderedSoundtrack {
  const settings = normalizeSoundSettings(sound);
  const durationSeconds = PROFILES[settings.character].duration * (1 + settings.air * 0.34) + 0.08;
  const left = new Float32Array(Math.ceil(durationSeconds * sampleRate));
  const right = new Float32Array(left.length);
  synthesizeCue(left, right, { timeSeconds: 0.015, strength: 0.94, kind: 'accent', index: 0 }, settings, sampleRate, false);
  let peak = 0;
  for (let index = 0; index < left.length; index += 1) {
    left[index] = softLimit(left[index]);
    right[index] = softLimit(right[index]);
    peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
  }
  return {
    sampleRate,
    channelData: [left, right],
    durationSeconds: left.length / sampleRate,
    eventCount: 1,
    peak,
    checksum: checksumChannels([left, right]),
  };
}
