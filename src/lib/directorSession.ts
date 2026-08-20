import { cloneSettings, type StudioSettings } from "../model";

export interface DirectorLook {
  themeId: StudioSettings["themeId"];
  motion: StudioSettings["motion"];
  slide: StudioSettings["slide"];
  background: StudioSettings["background"];
}

export interface DirectorHistory {
  past: StudioSettings[];
  future: StudioSettings[];
  lastSignature: string;
  lastCommittedAt: number;
}

export const EMPTY_DIRECTOR_HISTORY: DirectorHistory = {
  past: [],
  future: [],
  lastSignature: "",
  lastCommittedAt: 0,
};

export function captureDirectorLook(settings: StudioSettings): DirectorLook {
  return {
    themeId: settings.themeId,
    motion: structuredClone(settings.motion),
    slide: structuredClone(settings.slide),
    background: structuredClone(settings.background),
  };
}

export function applyDirectorLook(
  current: StudioSettings,
  look: DirectorLook,
): StudioSettings {
  return {
    ...current,
    themeId: look.themeId,
    stage: {
      ...current.stage,
      transparent: look.background.style === "transparent",
    },
    motion: structuredClone(look.motion),
    slide: structuredClone(look.slide),
    background: structuredClone(look.background),
  };
}

function collectChangedPaths(
  previous: unknown,
  next: unknown,
  prefix: string,
  paths: string[],
): void {
  if (Object.is(previous, next)) return;
  if (
    typeof previous !== "object"
    || previous === null
    || typeof next !== "object"
    || next === null
    || Array.isArray(previous)
    || Array.isArray(next)
  ) {
    paths.push(prefix || "settings");
    return;
  }
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of [...keys].sort()) {
    collectChangedPaths(
      (previous as Record<string, unknown>)[key],
      (next as Record<string, unknown>)[key],
      prefix ? `${prefix}.${key}` : key,
      paths,
    );
  }
}

export function settingsChangeSignature(
  previous: StudioSettings,
  next: StudioSettings,
): string {
  const paths: string[] = [];
  collectChangedPaths(previous, next, "", paths);
  return paths.join("|");
}

export function settingsEqual(
  previous: StudioSettings,
  next: StudioSettings,
): boolean {
  return settingsChangeSignature(previous, next).length === 0;
}

export function recordDirectorChange(
  history: DirectorHistory,
  current: StudioSettings,
  signature: string,
  now: number,
  options: { coalesceWindowMs?: number; limit?: number } = {},
): DirectorHistory {
  const coalesceWindowMs = options.coalesceWindowMs ?? 720;
  const limit = options.limit ?? 80;
  const canCoalesce = Boolean(signature)
    && signature === history.lastSignature
    && now - history.lastCommittedAt <= coalesceWindowMs;
  const past = canCoalesce
    ? history.past
    : [...history.past, cloneSettings(current)].slice(-limit);
  return {
    past,
    future: [],
    lastSignature: signature,
    lastCommittedAt: now,
  };
}

export function undoDirectorChange(
  history: DirectorHistory,
  current: StudioSettings,
): { history: DirectorHistory; settings: StudioSettings | null } {
  const previous = history.past.at(-1);
  if (!previous) return { history, settings: null };
  return {
    settings: cloneSettings(previous),
    history: {
      past: history.past.slice(0, -1),
      future: [cloneSettings(current), ...history.future].slice(0, 80),
      lastSignature: "",
      lastCommittedAt: 0,
    },
  };
}

export function redoDirectorChange(
  history: DirectorHistory,
  current: StudioSettings,
): { history: DirectorHistory; settings: StudioSettings | null } {
  const next = history.future[0];
  if (!next) return { history, settings: null };
  return {
    settings: cloneSettings(next),
    history: {
      past: [...history.past, cloneSettings(current)].slice(-80),
      future: history.future.slice(1),
      lastSignature: "",
      lastCommittedAt: 0,
    },
  };
}
