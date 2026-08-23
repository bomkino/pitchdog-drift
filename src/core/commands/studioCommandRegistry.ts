export type StudioCommandWorkspace = "slides" | "world" | "direct" | "master";
export type StudioCommandLocation = StudioCommandWorkspace | "global";

export type StudioCommandAction =
  | { readonly type: "workspace.switch"; readonly workspace: StudioCommandWorkspace }
  | { readonly type: "world.select" }
  | { readonly type: "theme.select" }
  | { readonly type: "preview.pause.toggle" }
  | { readonly type: "preview.focus.toggle" }
  | { readonly type: "guide.toggle" }
  | { readonly type: "comparison.toggle" }
  | { readonly type: "timing.mode.set"; readonly mode: "fixed-master" | "content-paced" }
  | { readonly type: "timing.close-at-cut" }
  | { readonly type: "media.slides.add" }
  | { readonly type: "media.presenter.add" }
  | { readonly type: "media.pin-selected" }
  | { readonly type: "media.pin-return" }
  | { readonly type: "export.still" }
  | { readonly type: "export.sequence" }
  | { readonly type: "export.mp4" }
  | { readonly type: "history.undo" }
  | { readonly type: "history.redo" };

export interface StudioCommandParameter {
  readonly name: "worldId" | "themeId";
  readonly source: "authored-worlds" | "legacy-themes";
  readonly required: true;
}

export interface StudioCommandDefinition {
  readonly id: string;
  readonly label: string;
  readonly keywords: readonly string[];
  /** Home workspace for filtering; global commands remain available everywhere. */
  readonly workspace: StudioCommandLocation;
  readonly action: StudioCommandAction;
  readonly parameter?: StudioCommandParameter;
}

export interface StudioCommandSearchOptions {
  readonly workspace?: StudioCommandWorkspace;
  readonly includeGlobal?: boolean;
  readonly limit?: number;
}

const WORKSPACES: readonly StudioCommandWorkspace[] = Object.freeze([
  "slides",
  "world",
  "direct",
  "master",
]);

function command(
  id: string,
  label: string,
  keywords: readonly string[],
  workspace: StudioCommandLocation,
  action: StudioCommandAction,
  parameter?: StudioCommandParameter,
): StudioCommandDefinition {
  return Object.freeze({
    id,
    label,
    keywords: Object.freeze([...keywords]),
    workspace,
    action: Object.freeze({ ...action }),
    ...(parameter ? { parameter: Object.freeze({ ...parameter }) } : {}),
  });
}

const DEFINITIONS: readonly StudioCommandDefinition[] = [
  command("workspace.slides", "Switch to Slides", ["media", "deck", "crop", "pin"], "global", { type: "workspace.switch", workspace: "slides" }),
  command("workspace.world", "Switch to World", ["look", "theme", "atmosphere", "direction"], "global", { type: "workspace.switch", workspace: "world" }),
  command("workspace.direct", "Switch to Direct", ["motion", "timing", "lens", "sound"], "global", { type: "workspace.switch", workspace: "direct" }),
  command("workspace.master", "Switch to Master", ["output", "export", "receipt", "guides"], "global", { type: "workspace.switch", workspace: "master" }),

  command("world.select", "Choose Film World…", ["direction", "look", "scene", "cinematic"], "world", { type: "world.select" }, {
    name: "worldId",
    source: "authored-worlds",
    required: true,
  }),
  command("theme.select", "Choose V1 Theme…", ["legacy", "compatibility", "look", "preset"], "world", { type: "theme.select" }, {
    name: "themeId",
    source: "legacy-themes",
    required: true,
  }),

  command("preview.pause.toggle", "Play or Pause Preview", ["playback", "space", "stop", "resume"], "global", { type: "preview.pause.toggle" }),
  command("preview.focus.toggle", "Toggle Full Frame", ["focus", "stage", "fullscreen", "preview"], "global", { type: "preview.focus.toggle" }),
  command("guide.toggle", "Toggle Platform Guides", ["safe area", "instagram", "story", "reel", "overlay"], "master", { type: "guide.toggle" }),
  command("comparison.toggle", "Toggle A/B Comparison", ["before", "after", "compare", "direction"], "global", { type: "comparison.toggle" }),

  command("timing.mode.fixed-master", "Use Exact Length", ["fixed master", "duration", "seconds", "protected"], "master", { type: "timing.mode.set", mode: "fixed-master" }),
  command("timing.mode.content-paced", "Use Reading Pace", ["dynamic length", "seconds per slide", "content paced", "protected"], "master", { type: "timing.mode.set", mode: "content-paced" }),
  command("timing.close-at-cut", "Close at Cut Tempo", ["seamless", "complete pass", "cadence", "endpoint", "repair"], "direct", { type: "timing.close-at-cut" }),

  command("media.slides.add", "Add Slides", ["import", "images", "deck", "media"], "slides", { type: "media.slides.add" }),
  command("media.presenter.add", "Add Presenter", ["import", "video", "speaker", "media"], "slides", { type: "media.presenter.add" }),
  command("media.pin-selected", "Keep Selected Media Still", ["pin", "pinned frame", "presenter", "sticky"], "slides", { type: "media.pin-selected" }),
  command("media.pin-return", "Return Pinned Media", ["unpin", "moving track", "restore", "presenter"], "slides", { type: "media.pin-return" }),

  command("export.still", "Save Transparent-safe PNG", ["export", "still", "image", "poster", "png"], "master", { type: "export.still" }),
  command("export.sequence", "Export PNG Sequence", ["export", "frames", "images", "zip", "png"], "master", { type: "export.sequence" }),
  command("export.mp4", "Export MP4 Master", ["export", "video", "movie", "h264", "mp4"], "master", { type: "export.mp4" }),

  command("history.undo", "Undo Direction", ["history", "revert", "command z"], "global", { type: "history.undo" }),
  command("history.redo", "Redo Direction", ["history", "restore", "shift command z"], "global", { type: "history.redo" }),
] as const;

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function validateParameter(commandDefinition: StudioCommandDefinition): void {
  const { action, parameter } = commandDefinition;
  if (action.type === "world.select") {
    if (parameter?.name !== "worldId" || parameter.source !== "authored-worlds") {
      throw new TypeError(`Studio command ${commandDefinition.id} requires the authored-worlds worldId parameter.`);
    }
    return;
  }
  if (action.type === "theme.select") {
    if (parameter?.name !== "themeId" || parameter.source !== "legacy-themes") {
      throw new TypeError(`Studio command ${commandDefinition.id} requires the legacy-themes themeId parameter.`);
    }
    return;
  }
  if (parameter !== undefined) {
    throw new TypeError(`Studio command ${commandDefinition.id} declares an unexpected parameter.`);
  }
}

/** Fails before a palette can expose ambiguous or malformed command identities. */
export function validateStudioCommandRegistry(
  registry: readonly StudioCommandDefinition[],
): void {
  const ids = new Set<string>();
  for (const entry of registry) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(entry.id)) {
      throw new TypeError(`Studio command id is invalid: ${entry.id}.`);
    }
    if (ids.has(entry.id)) throw new TypeError(`Duplicate studio command id: ${entry.id}.`);
    ids.add(entry.id);
    if (entry.label.trim() !== entry.label || entry.label.length === 0) {
      throw new TypeError(`Studio command ${entry.id} requires a non-empty trimmed label.`);
    }
    if (entry.workspace !== "global" && !WORKSPACES.includes(entry.workspace)) {
      throw new TypeError(`Studio command ${entry.id} names an unknown workspace.`);
    }
    const keywords = entry.keywords.map(normalizeSearchText);
    if (keywords.some((keyword) => keyword.length === 0)) {
      throw new TypeError(`Studio command ${entry.id} contains an empty keyword.`);
    }
    if (new Set(keywords).size !== keywords.length) {
      throw new TypeError(`Studio command ${entry.id} repeats a normalized keyword.`);
    }
    validateParameter(entry);
  }
}

validateStudioCommandRegistry(DEFINITIONS);

export const STUDIO_COMMAND_REGISTRY: readonly StudioCommandDefinition[] = Object.freeze(DEFINITIONS);

export function studioCommandById(id: string): StudioCommandDefinition | null {
  return STUDIO_COMMAND_REGISTRY.find((entry) => entry.id === id) ?? null;
}

function matchesWorkspace(
  entry: StudioCommandDefinition,
  options: StudioCommandSearchOptions,
): boolean {
  if (options.workspace === undefined) return true;
  if (entry.workspace === options.workspace) return true;
  return entry.workspace === "global" && options.includeGlobal !== false;
}

/** Stable workspace filtering in authored registry order. */
export function filterStudioCommands(
  options: StudioCommandSearchOptions = {},
): readonly StudioCommandDefinition[] {
  return STUDIO_COMMAND_REGISTRY.filter((entry) => matchesWorkspace(entry, options));
}

function scoreCommand(entry: StudioCommandDefinition, normalizedQuery: string): number | null {
  if (normalizedQuery.length === 0) return 0;
  const normalizedId = normalizeSearchText(entry.id);
  const normalizedLabel = normalizeSearchText(entry.label);
  const labelWords = normalizedLabel.split(" ");
  const keywords = entry.keywords.map(normalizeSearchText);
  const document = `${normalizedId} ${normalizedLabel} ${keywords.join(" ")}`;
  const tokens = normalizedQuery.split(" ");
  if (tokens.some((token) => !document.includes(token))) return null;

  let score = normalizedLabel === normalizedQuery || normalizedId === normalizedQuery ? 1_000 : 0;
  if (normalizedLabel.startsWith(normalizedQuery)) score += 300;
  if (normalizedId.startsWith(normalizedQuery)) score += 180;
  for (const token of tokens) {
    if (labelWords.includes(token)) score += 90;
    else if (labelWords.some((word) => word.startsWith(token))) score += 60;
    if (keywords.includes(token)) score += 45;
    else if (keywords.some((keyword) => keyword.split(" ").some((word) => word.startsWith(token)))) score += 25;
    if (normalizedId.includes(token)) score += 15;
  }
  return score;
}

/**
 * Deterministic token search. Equal scores retain the static registry order;
 * no locale, recency, mutable usage history, or fuzzy randomness affects rank.
 */
export function searchStudioCommands(
  query: string,
  options: StudioCommandSearchOptions = {},
): readonly StudioCommandDefinition[] {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  if (limit !== Number.POSITIVE_INFINITY && (!Number.isSafeInteger(limit) || limit < 0)) {
    throw new TypeError("Studio command search limit must be a non-negative safe integer.");
  }
  const normalizedQuery = normalizeSearchText(query);
  return STUDIO_COMMAND_REGISTRY
    .map((entry, index) => ({ entry, index, score: scoreCommand(entry, normalizedQuery) }))
    .filter((candidate): candidate is { entry: StudioCommandDefinition; index: number; score: number } => (
      candidate.score !== null && matchesWorkspace(candidate.entry, options)
    ))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
