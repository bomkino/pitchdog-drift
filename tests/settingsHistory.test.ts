import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";
import {
  SETTINGS_HISTORY_LIMIT,
  beginContinuousSettingsChange,
  canRedoSettings,
  canUndoSettings,
  createSettingsHistory,
  finalizeContinuousSettingsChange,
  recordCommittedSettingsChange,
  redoSettingsChange,
  undoSettingsChange,
} from "../src/settingsHistory";

describe("settings history", () => {
  it("coalesces a slider gesture into one human decision", () => {
    const initial = cloneSettings(DEFAULT_SETTINGS);
    const history = beginContinuousSettingsChange(createSettingsHistory(), initial);
    const changed = cloneSettings(initial);
    changed.motion.speed = 0.92;
    const settled = finalizeContinuousSettingsChange(history);

    expect(settled.past).toHaveLength(1);
    expect(settled.past[0]?.motion.speed).toBe(initial.motion.speed);
    const undone = undoSettingsChange(settled, changed);
    expect(undone?.settings.motion.speed).toBe(initial.motion.speed);
  });

  it("undoes an active gesture before it has settled", () => {
    const initial = cloneSettings(DEFAULT_SETTINGS);
    const history = beginContinuousSettingsChange(createSettingsHistory(), initial);
    const changed = cloneSettings(initial);
    changed.optics.softFocus = 0.81;

    const undone = undoSettingsChange(history, changed);
    expect(undone?.settings.optics.softFocus).toBe(initial.optics.softFocus);
    expect(canRedoSettings(undone!.history)).toBe(true);
  });

  it("keeps discrete directions reversible in order", () => {
    const initial = cloneSettings(DEFAULT_SETTINGS);
    const first = cloneSettings(initial);
    first.themeId = "dread";
    const second = cloneSettings(first);
    second.motion.speed = 0.7;

    let history = recordCommittedSettingsChange(createSettingsHistory(), initial);
    history = recordCommittedSettingsChange(history, first);
    const undoSecond = undoSettingsChange(history, second)!;
    expect(undoSecond.settings.themeId).toBe("dread");
    expect(undoSecond.settings.motion.speed).toBe(initial.motion.speed);
    const undoFirst = undoSettingsChange(undoSecond.history, undoSecond.settings)!;
    expect(undoFirst.settings.themeId).toBe(initial.themeId);
    const redoFirst = redoSettingsChange(undoFirst.history, undoFirst.settings)!;
    expect(redoFirst.settings.themeId).toBe("dread");
  });

  it("clears redo when a new direction is committed", () => {
    const initial = cloneSettings(DEFAULT_SETTINGS);
    const changed = cloneSettings(initial);
    changed.motion.speed = 0.8;
    const history = recordCommittedSettingsChange(createSettingsHistory(), initial);
    const undone = undoSettingsChange(history, changed)!;
    expect(canRedoSettings(undone.history)).toBe(true);
    const replaced = recordCommittedSettingsChange(undone.history, undone.settings);
    expect(canRedoSettings(replaced)).toBe(false);
    expect(canUndoSettings(replaced)).toBe(true);
  });

  it("bounds history without mutating snapshots", () => {
    let history = createSettingsHistory();
    let current = cloneSettings(DEFAULT_SETTINGS);
    for (let index = 0; index < SETTINGS_HISTORY_LIMIT + 12; index += 1) {
      history = recordCommittedSettingsChange(history, current);
      current = cloneSettings(current);
      current.background.seed = index + 1;
    }
    expect(history.past).toHaveLength(SETTINGS_HISTORY_LIMIT);
    current.background.seed = 999_999;
    expect(history.past.at(-1)?.background.seed).not.toBe(999_999);
  });
});
