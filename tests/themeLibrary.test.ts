import { describe, expect, it } from "vitest";
import { cloneSettings } from "../src/model";
import { getTheme, THEMES } from "../src/themes";
import {
  THEME_INTENTS,
  filterThemes,
  themeLookIsModified,
} from "../src/themeLibrary";

describe("intent-first film-world library", () => {
  it("classifies every world through the exhaustive registry", () => {
    expect(Object.keys(THEME_INTENTS).sort()).toEqual(THEMES.map((theme) => theme.id).sort());
    for (const theme of THEMES) expect(THEME_INTENTS[theme.id].length).toBeGreaterThan(0);
  });

  it("searches authored language and intent tags token by token", () => {
    expect(filterThemes(THEMES, "cyanotype evidence", "all").map((theme) => theme.id)).toEqual(["archival-blue"]);
    expect(filterThemes(THEMES, "human", "dark").map((theme) => theme.id)).toEqual(["velvet-crime"]);
    expect(filterThemes(THEMES, "does not exist", "all")).toEqual([]);
  });

  it("detects look edits but ignores delivery/session edits", () => {
    const theme = getTheme("road-memory");
    const settings = cloneSettings(theme.settings);
    expect(themeLookIsModified(settings, theme)).toBe(false);
    settings.motion.autoplay = false;
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 4;
    settings.motion.dragSensitivity = 2.2;
    expect(themeLookIsModified(settings, theme)).toBe(false);
    settings.motion.distortion += 0.1;
    expect(themeLookIsModified(settings, theme)).toBe(true);
  });
});
