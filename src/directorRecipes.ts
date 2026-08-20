import type { Axis, ThemeId } from "./model";

export interface PresenterLayoutRecipe {
  width: number;
  x: number;
  y: number;
}

export interface DirectorRecipe {
  id: string;
  name: string;
  effect: string;
  reason: string;
  themeId: ThemeId;
  themeName: string;
  speed: number;
  gap: number;
  lensEnergy: number;
  peripheralSoftness: number;
  focusLift: number;
  slideSize: number;
  axis?: Axis;
  presenter?: PresenterLayoutRecipe;
}

/**
 * These are direction sentences, not style thumbnails. Each recipe begins with
 * a coherent film world, then adjusts the few controls that most strongly
 * determine audience experience. Values stay inside the editor's safe control
 * surface and deliberately leave the advanced inspector available for the last
 * ten percent.
 */
export const DIRECTOR_RECIPES = [
  {
    id: "quiet-reveal",
    name: "Quiet Reveal",
    effect: "Let the work arrive before the motion announces itself.",
    reason: "Best for elegant decks, restrained drama, and opening beats.",
    themeId: "editorial-drift",
    themeName: "Editorial Drift",
    speed: 0.22,
    gap: 28,
    lensEnergy: 18,
    peripheralSoftness: 28,
    focusLift: 11,
    slideSize: 78,
    axis: "vertical",
  },
  {
    id: "human-warmth",
    name: "Human Warmth",
    effect: "Close frames, soft glass, and an almost-touching horizontal orbit.",
    reason: "Built for romance, family, character, and emotionally direct work.",
    themeId: "tender-light",
    themeName: "Tender Light",
    speed: 0.19,
    gap: 8,
    lensEnergy: 25,
    peripheralSoftness: 42,
    focusLift: 13,
    slideSize: 80,
    axis: "horizontal",
  },
  {
    id: "clean-evidence",
    name: "Clean Evidence",
    effect: "A disciplined contact sheet with almost no optical theatre.",
    reason: "For documentaries, factual pitches, case studies, and proof-heavy decks.",
    themeId: "noir-contact",
    themeName: "Noir Contact",
    speed: 0.38,
    gap: 16,
    lensEnergy: 10,
    peripheralSoftness: 8,
    focusLift: 3,
    slideSize: 66,
    axis: "horizontal",
  },
  {
    id: "road-story",
    name: "Road Story",
    effect: "A sun-struck lateral passage with memory at the edges.",
    reason: "For travel, movement, landscape, youth, and lived-in adventure.",
    themeId: "road-memory",
    themeName: "Road Memory",
    speed: 0.3,
    gap: 30,
    lensEnergy: 22,
    peripheralSoftness: 20,
    focusLift: 8,
    slideSize: 72,
    axis: "horizontal",
  },
  {
    id: "slow-dread",
    name: "Slow Dread",
    effect: "An upward crawl with pressure in the lens and air missing from the room.",
    reason: "For horror, paranoia, threat, and any reveal that should not feel safe.",
    themeId: "dread",
    themeName: "Dread",
    speed: 0.14,
    gap: 48,
    lensEnergy: 50,
    peripheralSoftness: 36,
    focusLift: 4,
    slideSize: 73,
    axis: "vertical",
  },
  {
    id: "archive-pulse",
    name: "Archive Pulse",
    effect: "Emulsion, evidence, and unstable memory without fake nostalgia.",
    reason: "For period work, biography, cultural memory, and found-image decks.",
    themeId: "archive-fever",
    themeName: "Archive Fever",
    speed: 0.24,
    gap: 24,
    lensEnergy: 38,
    peripheralSoftness: 30,
    focusLift: 7,
    slideSize: 69,
    axis: "horizontal",
  },
  {
    id: "electric-push",
    name: "Electric Push",
    effect: "Glossy depth and a controlled ultraviolet rush.",
    reason: "For music, fashion, nightlife, performance, and high-voltage worlds.",
    themeId: "chrome-dream",
    themeName: "Chrome Dream",
    speed: 0.58,
    gap: 28,
    lensEnergy: 66,
    peripheralSoftness: 26,
    focusLift: 15,
    slideSize: 62,
    axis: "horizontal",
  },
  {
    id: "open-water",
    name: "Open Water",
    effect: "Long breath, submerged light, and generous distance between images.",
    reason: "For contemplative stories, nature, grief, memory, and interior scale.",
    themeId: "ocean-memory",
    themeName: "Ocean Memory",
    speed: 0.21,
    gap: 34,
    lensEnergy: 34,
    peripheralSoftness: 48,
    focusLift: 12,
    slideSize: 70,
    axis: "vertical",
  },
  {
    id: "daylight-wit",
    name: "Daylight Wit",
    effect: "Clean momentum, bright air, and just enough snap to land a joke.",
    reason: "For comedy, optimistic work, brand films, and fast tonal clarity.",
    themeId: "daybreak-comedy",
    themeName: "Daybreak Comedy",
    speed: 0.42,
    gap: 12,
    lensEnergy: 18,
    peripheralSoftness: 14,
    focusLift: 8,
    slideSize: 72,
    axis: "horizontal",
  },
  {
    id: "presenter-runway",
    name: "Presenter Runway",
    effect: "Smaller moving frames leave a clean right-hand lane for the speaker.",
    reason: "A practical starting composition for talking-head commentary over a deck.",
    themeId: "editorial-drift",
    themeName: "Editorial Drift",
    speed: 0.28,
    gap: 26,
    lensEnergy: 16,
    peripheralSoftness: 22,
    focusLift: 7,
    slideSize: 52,
    axis: "vertical",
    presenter: { width: 28, x: 82, y: 50 },
  },
] as const satisfies readonly DirectorRecipe[];

export interface PaceRecipe {
  id: string;
  name: string;
  description: string;
  speed: number;
  lensEnergy: number;
  gap: number;
}

export const PACE_RECIPES = [
  { id: "hold", name: "Hold", description: "Near-still, deliberate, and legibility-first.", speed: 0.14, lensEnergy: 12, gap: 32 },
  { id: "breathe", name: "Breathe", description: "A long editorial sentence.", speed: 0.26, lensEnergy: 24, gap: 24 },
  { id: "glide", name: "Glide", description: "Confident movement without hurry.", speed: 0.42, lensEnergy: 42, gap: 18 },
  { id: "surge", name: "Surge", description: "Fast, bounded, and still readable.", speed: 0.68, lensEnergy: 68, gap: 14 },
] as const satisfies readonly PaceRecipe[];

export interface MasterPreset {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  fps: 24 | 25 | 30 | 50 | 60;
  duration: number;
  seamless: boolean;
}

export const MASTER_PRESETS = [
  { id: "reel", name: "Reel", description: "9:16 · primary vertical master", width: 1080, height: 1920, fps: 30, duration: 8, seamless: true },
  { id: "feed", name: "Feed", description: "4:5 · taller feed composition", width: 1080, height: 1350, fps: 30, duration: 8, seamless: true },
  { id: "square", name: "Square", description: "1:1 · compact and platform-neutral", width: 1080, height: 1080, fps: 30, duration: 8, seamless: true },
  { id: "screen", name: "Screen", description: "16:9 · presentation and landscape", width: 1920, height: 1080, fps: 24, duration: 10, seamless: false },
] as const satisfies readonly MasterPreset[];

export type DirectorAuditTone = "pass" | "note" | "warning" | "error";

export interface DirectorAuditInput {
  slideCount: number;
  speed: number;
  lensEnergy: number;
  slideSize: number;
  background: string;
  seamless: boolean;
  presenterSelected: boolean;
  webglReady: boolean;
}

export interface DirectorAuditItem {
  id: string;
  tone: DirectorAuditTone;
  label: string;
  detail: string;
  fix?: "speed" | "lens" | "size" | "seamless";
}

export function deriveDirectorAudit(input: DirectorAuditInput): DirectorAuditItem[] {
  const items: DirectorAuditItem[] = [];

  if (!input.webglReady) {
    items.push({
      id: "webgl",
      tone: "error",
      label: "Cinematic renderer unavailable",
      detail: "Media remains safe, but this browser cannot preview or export the WebGL master.",
    });
  } else {
    items.push({ id: "webgl", tone: "pass", label: "Renderer ready", detail: "Preview and fixed-step export share the same scene path." });
  }

  if (input.slideCount === 0) {
    items.push({ id: "slides", tone: "error", label: "No moving frames", detail: "Add at least one slide before judging motion or exporting." });
  } else if (input.slideCount < 3) {
    items.push({ id: "slides", tone: "note", label: `${input.slideCount} moving frame${input.slideCount === 1 ? "" : "s"}`, detail: "Valid, but repetition will be conspicuous. Three or more frames usually create a richer passage." });
  } else {
    items.push({ id: "slides", tone: "pass", label: `${input.slideCount} moving frames`, detail: "Enough material for the loop to develop rather than merely repeat." });
  }

  if (input.speed > 0.72) {
    items.push({ id: "speed", tone: "warning", label: "Reading time is tight", detail: "The track is moving faster than most text-heavy deck slides can be read.", fix: "speed" });
  } else {
    items.push({ id: "speed", tone: "pass", label: "Pace is inside the readable band", detail: "Final judgment still depends on how much copy the slides carry." });
  }

  if (input.lensEnergy > 72) {
    items.push({ id: "lens", tone: "warning", label: "Optics may become the subject", detail: "High blur and RGB separation can overpower typography and faces.", fix: "lens" });
  } else {
    items.push({ id: "lens", tone: "pass", label: "Lens energy is bounded", detail: "Motion can leave an optical trace while focal frames remain useful." });
  }

  if (input.slideSize < 48) {
    items.push({ id: "size", tone: "warning", label: "Slides may read as thumbnails", detail: "Small frames can work around a presenter, but need unusually bold slide design.", fix: "size" });
  }

  if (input.background === "transparent") {
    items.push({ id: "alpha", tone: "note", label: "Transparent composition", detail: "Use PNG still or PNG sequence for alpha. H.264 masters remain opaque." });
  }

  if (!input.seamless) {
    items.push({ id: "seamless", tone: "note", label: "Loop closure is unlocked", detail: "Enable the seamless lock when the clip must repeat without an end-to-start jump.", fix: "seamless" });
  } else {
    items.push({ id: "seamless", tone: "pass", label: "Loop closure locked", detail: "Track and procedural atmosphere close on exact deterministic cycles." });
  }

  items.push(input.presenterSelected
    ? { id: "presenter", tone: "pass", label: "Pinned media selected", detail: "The speaker frame stays independent from moving-track transforms." }
    : { id: "presenter", tone: "note", label: "Deck-only composition", detail: "This is valid. Pin an image or presenter video only when the story needs a stable anchor." });

  return items;
}
