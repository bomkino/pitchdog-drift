import {
  captureDirectorLook,
  directorLookEqual,
} from "./lib/directorSession";
import type { StudioSettings, ThemeId } from "./model";
import type { ThemePreset } from "./themes";

export const THEME_INTENT_OPTIONS = [
  { id: "all", label: "All" },
  { id: "quiet", label: "Quiet" },
  { id: "human", label: "Human" },
  { id: "dark", label: "Dark" },
  { id: "graphic", label: "Graphic" },
  { id: "kinetic", label: "Kinetic" },
] as const;

export type ThemeIntent = (typeof THEME_INTENT_OPTIONS)[number]["id"];
type SpecificThemeIntent = Exclude<ThemeIntent, "all">;

export const THEME_INTENTS: Record<ThemeId, readonly SpecificThemeIntent[]> = {
  "editorial-drift": ["quiet", "human", "graphic"],
  "road-memory": ["human", "kinetic"],
  dread: ["dark"],
  "noir-contact": ["quiet", "graphic"],
  "tender-light": ["quiet", "human"],
  "chrome-dream": ["graphic", "kinetic"],
  "projector-bloom": ["quiet", "human"],
  "midnight-run": ["dark", "kinetic"],
  "salt-air": ["quiet", "human"],
  "winter-celluloid": ["quiet", "human"],
  "folklore-ember": ["human"],
  "acid-matinee": ["graphic", "kinetic"],
  "archival-blue": ["quiet", "graphic"],
  "desert-heat": ["human", "kinetic"],
  "lunar-signal": ["dark", "graphic", "kinetic"],
  "velvet-crime": ["dark", "human"],
  "body-static": ["dark", "graphic", "kinetic"],
  "daylight-intimacy": ["quiet", "human"],
};

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

export function themeSearchText(theme: ThemePreset): string {
  return normalize([
    theme.name,
    theme.eyebrow,
    theme.description,
    ...THEME_INTENTS[theme.id],
  ].join(" "));
}

export function filterThemes(
  themes: readonly ThemePreset[],
  query: string,
  intent: ThemeIntent,
): ThemePreset[] {
  const terms = normalize(query).split(" ").filter(Boolean);
  return themes.filter((theme) => {
    if (intent !== "all" && !THEME_INTENTS[theme.id].includes(intent)) return false;
    if (!terms.length) return true;
    const searchable = themeSearchText(theme);
    return terms.every((term) => searchable.includes(term));
  });
}

export function themeLookIsModified(
  settings: StudioSettings,
  theme: ThemePreset,
): boolean {
  return !directorLookEqual(captureDirectorLook(settings), captureDirectorLook(theme.settings));
}
