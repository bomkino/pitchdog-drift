export const SOUND_CHARACTER_IDS = [
  'paper',
  'air',
  'celluloid',
  'glass',
  'felt',
  'mechanism',
] as const;

export type SoundCharacter = (typeof SOUND_CHARACTER_IDS)[number];

export interface SoundSettings {
  enabled: boolean;
  previewEnabled: boolean;
  includeInExport: boolean;
  character: SoundCharacter;
  level: number;
  air: number;
  accent: number;
  texture: number;
  density: number;
  stereoWidth: number;
  duckUnderVoice: number;
  seed: number;
  respectReducedMotion: boolean;
}

export const DEFAULT_SOUND_SETTINGS: Readonly<SoundSettings> = Object.freeze({
  enabled: true,
  previewEnabled: true,
  includeInExport: true,
  character: 'paper',
  level: 0.56,
  air: 0.48,
  accent: 0.44,
  texture: 0.52,
  density: 0.46,
  stereoWidth: 0.62,
  duckUnderVoice: 0.48,
  seed: 4127,
  respectReducedMotion: true,
});

const clamp01 = (value: unknown, fallback: number): number => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
};

const toBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const isCharacter = (value: unknown): value is SoundCharacter =>
  typeof value === 'string' && (SOUND_CHARACTER_IDS as readonly string[]).includes(value);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export function normalizeSoundSettings(value: unknown): SoundSettings {
  const source = asRecord(value) ?? {};
  return {
    enabled: toBoolean(source.enabled, DEFAULT_SOUND_SETTINGS.enabled),
    previewEnabled: toBoolean(source.previewEnabled, DEFAULT_SOUND_SETTINGS.previewEnabled),
    includeInExport: toBoolean(source.includeInExport, DEFAULT_SOUND_SETTINGS.includeInExport),
    character: isCharacter(source.character)
      ? source.character
      : DEFAULT_SOUND_SETTINGS.character,
    level: clamp01(source.level, DEFAULT_SOUND_SETTINGS.level),
    air: clamp01(source.air, DEFAULT_SOUND_SETTINGS.air),
    accent: clamp01(source.accent, DEFAULT_SOUND_SETTINGS.accent),
    texture: clamp01(source.texture, DEFAULT_SOUND_SETTINGS.texture),
    density: clamp01(source.density, DEFAULT_SOUND_SETTINGS.density),
    stereoWidth: clamp01(source.stereoWidth, DEFAULT_SOUND_SETTINGS.stereoWidth),
    duckUnderVoice: clamp01(source.duckUnderVoice, DEFAULT_SOUND_SETTINGS.duckUnderVoice),
    seed: Number.isFinite(Number(source.seed))
      ? Math.max(0, Math.min(2_147_483_647, Math.trunc(Number(source.seed))))
      : DEFAULT_SOUND_SETTINGS.seed,
    respectReducedMotion: toBoolean(
      source.respectReducedMotion,
      DEFAULT_SOUND_SETTINGS.respectReducedMotion,
    ),
  };
}

export const cloneDefaultSoundSettings = (): SoundSettings => ({
  ...DEFAULT_SOUND_SETTINGS,
});
