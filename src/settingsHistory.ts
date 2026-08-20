import { cloneSettings, type StudioSettings } from "./model";

export const SETTINGS_HISTORY_LIMIT = 80;
export type SettingsChangeMode = "continuous" | "commit";

export interface SettingsHistory {
  past: StudioSettings[];
  future: StudioSettings[];
  continuousOrigin: StudioSettings | null;
}

export interface SettingsHistoryResult {
  history: SettingsHistory;
  settings: StudioSettings;
}

export function createSettingsHistory(): SettingsHistory {
  return { past: [], future: [], continuousOrigin: null };
}

function settingsSignature(settings: StudioSettings): string {
  return JSON.stringify(settings);
}

export function settingsEqual(left: StudioSettings, right: StudioSettings): boolean {
  return left === right || settingsSignature(left) === settingsSignature(right);
}

function appendBounded(stack: StudioSettings[], settings: StudioSettings): StudioSettings[] {
  const next = [...stack, cloneSettings(settings)];
  return next.length > SETTINGS_HISTORY_LIMIT ? next.slice(next.length - SETTINGS_HISTORY_LIMIT) : next;
}

export function beginContinuousSettingsChange(
  history: SettingsHistory,
  current: StudioSettings,
): SettingsHistory {
  if (history.continuousOrigin) return history;
  return {
    ...history,
    future: [],
    continuousOrigin: cloneSettings(current),
  };
}

export function finalizeContinuousSettingsChange(history: SettingsHistory): SettingsHistory {
  if (!history.continuousOrigin) return history;
  return {
    past: appendBounded(history.past, history.continuousOrigin),
    future: history.future,
    continuousOrigin: null,
  };
}

export function recordCommittedSettingsChange(
  history: SettingsHistory,
  current: StudioSettings,
): SettingsHistory {
  const settled = finalizeContinuousSettingsChange(history);
  const last = settled.past.at(-1);
  return {
    past: last && settingsEqual(last, current) ? settled.past : appendBounded(settled.past, current),
    future: [],
    continuousOrigin: null,
  };
}

export function undoSettingsChange(
  history: SettingsHistory,
  current: StudioSettings,
): SettingsHistoryResult | null {
  if (history.continuousOrigin) {
    return {
      settings: cloneSettings(history.continuousOrigin),
      history: {
        past: history.past,
        future: appendBounded(history.future, current),
        continuousOrigin: null,
      },
    };
  }
  const previous = history.past.at(-1);
  if (!previous) return null;
  return {
    settings: cloneSettings(previous),
    history: {
      past: history.past.slice(0, -1),
      future: appendBounded(history.future, current),
      continuousOrigin: null,
    },
  };
}

export function redoSettingsChange(
  history: SettingsHistory,
  current: StudioSettings,
): SettingsHistoryResult | null {
  const settled = finalizeContinuousSettingsChange(history);
  const next = settled.future.at(-1);
  if (!next) return null;
  return {
    settings: cloneSettings(next),
    history: {
      past: appendBounded(settled.past, current),
      future: settled.future.slice(0, -1),
      continuousOrigin: null,
    },
  };
}

export function canUndoSettings(history: SettingsHistory): boolean {
  return Boolean(history.continuousOrigin || history.past.length);
}

export function canRedoSettings(history: SettingsHistory): boolean {
  return history.future.length > 0;
}
