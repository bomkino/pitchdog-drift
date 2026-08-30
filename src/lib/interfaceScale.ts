export const INTERFACE_SCALE_MIN = 75;
export const INTERFACE_SCALE_MAX = 200;
export const INTERFACE_SCALE_STEP = 5;
export const INTERFACE_SCALE_DEFAULT = 100;
export const INTERFACE_SCALE_STORAGE_KEY = "pitchdog.drift.interface-scale.v1";
export const INTERFACE_SINGLE_PANEL_VIEWPORT_FLOOR = 1120;

export type InterfaceScale = number;
export type InterfaceScaleLayout = "three-panel" | "single-panel";
export type InterfaceScaleCommand =
  | Readonly<{ type: "set"; value: unknown }>
  | Readonly<{ type: "smaller" }>
  | Readonly<{ type: "larger" }>
  | Readonly<{ type: "reset" }>;

export interface InterfaceScaleSnapshot {
  readonly value: InterfaceScale;
  readonly label: string;
  readonly layout: InterfaceScaleLayout;
  /** Local presentation revision. Never a Project/document revision. */
  readonly revision: number;
}

export interface InterfaceScalePreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface InterfaceScalePreferenceStore {
  getSnapshot(): InterfaceScaleSnapshot;
  dispatch(command: InterfaceScaleCommand): InterfaceScaleSnapshot;
  subscribe(listener: (snapshot: InterfaceScaleSnapshot) => void): () => void;
}

function numericScale(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeInterfaceScale(value: unknown): InterfaceScale {
  const numeric = numericScale(value);
  if (numeric === null) return INTERFACE_SCALE_DEFAULT;
  const clamped = Math.min(INTERFACE_SCALE_MAX, Math.max(INTERFACE_SCALE_MIN, numeric));
  return Math.round(clamped / INTERFACE_SCALE_STEP) * INTERFACE_SCALE_STEP;
}

export function interfaceScaleLayout(value: InterfaceScale): InterfaceScaleLayout {
  return normalizeInterfaceScale(value) >= 150 ? "single-panel" : "three-panel";
}

export function interfaceScaleSinglePanelMaximum(value: InterfaceScale): number {
  return Math.max(
    INTERFACE_SINGLE_PANEL_VIEWPORT_FLOOR,
    Math.ceil(440 + 752 * (normalizeInterfaceScale(value) / 100)),
  );
}

export function interfaceScaleUsesSinglePanel(value: InterfaceScale, viewportWidth: number): boolean {
  return interfaceScaleLayout(value) === "single-panel"
    || viewportWidth <= interfaceScaleSinglePanelMaximum(value);
}

export function applyInterfaceScaleCommand(
  current: InterfaceScale,
  command: InterfaceScaleCommand,
): InterfaceScale {
  const normalizedCurrent = normalizeInterfaceScale(current);
  switch (command.type) {
  case "set":
    return normalizeInterfaceScale(command.value);
  case "smaller":
    return normalizeInterfaceScale(normalizedCurrent - INTERFACE_SCALE_STEP);
  case "larger":
    return normalizeInterfaceScale(normalizedCurrent + INTERFACE_SCALE_STEP);
  case "reset":
    return INTERFACE_SCALE_DEFAULT;
  }
}

function snapshot(value: InterfaceScale, revision: number): InterfaceScaleSnapshot {
  const normalized = normalizeInterfaceScale(value);
  return Object.freeze({
    value: normalized,
    label: `${normalized}%`,
    layout: interfaceScaleLayout(normalized),
    revision,
  });
}

function browserStorage(): InterfaceScalePreferenceStorage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

export function createInterfaceScalePreferenceStore(
  storage: InterfaceScalePreferenceStorage | null = browserStorage(),
): InterfaceScalePreferenceStore {
  let current = snapshot(readPersistedScale(storage), 0);
  const listeners = new Set<(next: InterfaceScaleSnapshot) => void>();

  return Object.freeze({
    getSnapshot: () => current,
    dispatch: (command: InterfaceScaleCommand) => {
      const value = applyInterfaceScaleCommand(current.value, command);
      if (value === current.value) return current;
      storage?.setItem(INTERFACE_SCALE_STORAGE_KEY, String(value));
      current = snapshot(value, current.revision + 1);
      for (const listener of listeners) listener(current);
      return current;
    },
    subscribe: (listener: (next: InterfaceScaleSnapshot) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

function readPersistedScale(storage: InterfaceScalePreferenceStorage | null): InterfaceScale {
  if (!storage) return INTERFACE_SCALE_DEFAULT;
  try {
    return normalizeInterfaceScale(storage.getItem(INTERFACE_SCALE_STORAGE_KEY));
  } catch {
    return INTERFACE_SCALE_DEFAULT;
  }
}
