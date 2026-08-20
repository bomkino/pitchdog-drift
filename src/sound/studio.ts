import type { StudioSettings } from '../model';
import { normalizeSoundSettings } from './model';
import { renderSoundtrack, type RenderedSoundtrack } from './render';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function findNumber(value: unknown, keys: readonly string[], fallback: number): number {
  const root = asRecord(value);
  if (!root) return fallback;
  const queue: Record<string, unknown>[] = [root];
  const seen = new Set<object>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const key of keys) {
      const candidate = current[key];
      const number = typeof candidate === 'number' ? candidate : Number(candidate);
      if (Number.isFinite(number)) return number;
    }
    for (const child of Object.values(current)) {
      const record = asRecord(child);
      if (record) queue.push(record);
    }
  }
  return fallback;
}

function findBoolean(value: unknown, keys: readonly string[], fallback: boolean): boolean {
  const root = asRecord(value);
  if (!root) return fallback;
  const queue: Record<string, unknown>[] = [root];
  const seen = new Set<object>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const key of keys) {
      if (typeof current[key] === 'boolean') return current[key] as boolean;
    }
    for (const child of Object.values(current)) {
      const record = asRecord(child);
      if (record) queue.push(record);
    }
  }
  return fallback;
}

export function studioDurationSeconds(settings: StudioSettings): number {
  return Math.min(600, Math.max(0.05, findNumber(settings.output, ['durationSeconds', 'duration', 'seconds'], 8)));
}

export function studioLoopEnabled(settings: StudioSettings): boolean {
  return findBoolean(settings.output, ['loop', 'seamlessLoop', 'loopEnabled'], true);
}

export function renderStudioSoundtrack(settings: StudioSettings, slideCount = 8): RenderedSoundtrack {
  return renderSoundtrack({
    sound: normalizeSoundSettings(settings.sound),
    durationSeconds: studioDurationSeconds(settings),
    loop: studioLoopEnabled(settings),
    motion: settings.motion,
    slideCount,
  });
}
