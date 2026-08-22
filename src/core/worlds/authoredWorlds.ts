import {
  BACKGROUND_COMPOSITIONS,
  BACKGROUND_STUDIES,
  type BackgroundStudy,
} from "../../backgrounds";
import type {
  DriftProjectV4,
  ProjectDomain,
  WorldVariant,
} from "../project/schema";
import { applyLensRecipe } from "../recipes/lens";
import { applyLightingRecipe } from "../recipes/lighting";
import { applyFinishRecipe, applyMaterialRecipe } from "../recipes/material";
import {
  applyEditorialCut,
  applyMotionCharacter,
  applyPerformanceRecipe,
} from "../recipes/motion";
import { recipeReference } from "../recipes/fingerprint";
import { applyPathRecipe } from "../spatial/spatial";
import {
  PUBLIC_WORLD_VARIANTS,
  WORLD_IDENTITIES,
  WORLD_RATIO_DIMENSIONS,
  type PublicWorldVariant,
  type WorldId,
  type WorldRatioId,
} from "./worldRegistry";

export const AUTHORED_WORLD_VERSION = 1 as const;

export interface PortraitScene {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  direction: 1 | -1;
  pathId: string;
  backgroundStudyId: string;
  scale: number;
  gap: number;
  presenterAnchor: { x: number; y: number };
}

export interface AuthoredWorldDirection {
  id: WorldId;
  name: string;
  eyebrow: string;
  cutId: string;
  performanceId: string;
  characterId: "direct" | "weighted" | "spring" | "drift";
  pathId: string;
  materialId: string;
  finishId: string;
  lightingId: string;
  backgroundStudyId: string;
  lensId: string;
  portraitScenes: readonly [PortraitScene, PortraitScene];
}

function scene(
  id: string,
  name: string,
  eyebrow: string,
  description: string,
  direction: 1 | -1,
  pathId: string,
  backgroundStudyId: string,
  scale: number,
  gap: number,
  x: number,
  y: number,
): PortraitScene {
  return { id, name, eyebrow, description, direction, pathId, backgroundStudyId, scale, gap, presenterAnchor: { x, y } };
}

export const AUTHORED_WORLDS: readonly AuthoredWorldDirection[] = [
  {
    id: "editorial-drift", name: "Editorial Drift", eyebrow: "INK · PAPER · LONG BREATH",
    cutId: "paper-argument", performanceId: "long-take", characterId: "weighted", pathId: "ribbon",
    materialId: "paper", finishId: "16mm-breath", lightingId: "studio-soft", backgroundStudyId: "orbiting-bloom-study", lensId: "clean-gate",
    portraitScenes: [
      scene("editorial-reading-spine", "Reading Spine", "ASCENDING ESSAY", "Pages rise through a central reading corridor with an open presenter lane.", -1, "ribbon", "orbiting-bloom-study", 0.76, 0.24, 0.79, 0.6),
      scene("editorial-margin-notes", "Margin Notes", "DESCENDING PAPER", "A quieter descending proof with wider margins and a low tungsten room.", 1, "cascade", "tungsten-wash", 0.7, 0.3, 0.22, 0.58),
    ],
  },
  {
    id: "noir-contact", name: "Noir Contact", eyebrow: "SILVER · PROOF · BLACK",
    cutId: "clean-data", performanceId: "cut-on-breath", characterId: "direct", pathId: "straight",
    materialId: "card", finishId: "16mm-breath", lightingId: "noir-slice", backgroundStudyId: "contact-sheet", lensId: "bleach-bypass",
    portraitScenes: [
      scene("noir-evidence-column", "Evidence Column", "DESCENDING PROOF", "A narrow silver column descends with hard registration and clean source labels.", 1, "straight", "contact-sheet", 0.64, 0.18, 0.78, 0.36),
      scene("noir-rain-ledger", "Rain Ledger", "ASCENDING NEGATIVE", "Blue-black evidence climbs through rain scratches and a protected side witness.", -1, "switchback", "rain-negative", 0.6, 0.22, 0.22, 0.62),
    ],
  },
  {
    id: "sunstruck-atlas", name: "Sunstruck Atlas", eyebrow: "TRAVEL · HEAT · LATITUDE",
    cutId: "documentary-glide", performanceId: "long-take", characterId: "drift", pathId: "arc",
    materialId: "paper", finishId: "16mm-breath", lightingId: "window-rake", backgroundStudyId: "road-memory-field", lensId: "soft-print",
    portraitScenes: [
      scene("atlas-latitude-rise", "Latitude Rise", "UPWARD ROAD", "Locations climb from baked earth into pale open sky with long looking time.", -1, "arc", "road-memory-field", 0.7, 0.32, 0.76, 0.32),
      scene("atlas-road-mirage", "Road Mirage", "DOWNWARD HEAT", "A descending road line shimmers low while the hero remains photographically clean.", 1, "ribbon", "heat-mirage", 0.66, 0.36, 0.24, 0.66),
    ],
  },
  {
    id: "dread", name: "Dread", eyebrow: "VOID · CRIMSON · WITHHELD",
    cutId: "paper-argument", performanceId: "held-nerve", characterId: "weighted", pathId: "tunnel",
    materialId: "card", finishId: "ghost-focus", lightingId: "noir-slice", backgroundStudyId: "breathing-slit-study", lensId: "night-terror",
    portraitScenes: [
      scene("dread-narrow-ascent", "Narrow Ascent", "UPWARD UNEASE", "Cards crawl upward through a thin safe corridor and reluctant crimson light.", -1, "tunnel", "breathing-slit-study", 0.66, 0.44, 0.76, 0.72),
      scene("dread-black-tide", "Black Tide", "DESCENDING PRESSURE", "A descending route yields to submerged wave fronts and deep negative space.", 1, "switchback", "black-tide", 0.62, 0.4, 0.22, 0.3),
    ],
  },
  {
    id: "tender-light", name: "Tender Light", eyebrow: "ROSE · HUMAN · CLOSE AIR",
    cutId: "documentary-glide", performanceId: "silk-dolly", characterId: "drift", pathId: "orbit",
    materialId: "silk", finishId: "dream-glass", lightingId: "overcast-window", backgroundStudyId: "rose-chamber", lensId: "dream-glass",
    portraitScenes: [
      scene("tender-close-rise", "Close Rise", "ASCENDING LISTENING", "Faces rise slowly through rose air with enough stillness to listen.", -1, "orbit", "rose-chamber", 0.78, 0.1, 0.76, 0.64),
      scene("tender-window-fall", "Window Fall", "DESCENDING DAYLIGHT", "A soft descent through daylight paper with warmth held at the edges.", 1, "ribbon", "dusk-aperture", 0.74, 0.14, 0.24, 0.38),
    ],
  },
  {
    id: "velvet-fever", name: "Velvet Fever", eyebrow: "FASHION · SATURATION · PULSE",
    cutId: "explainer-cut", performanceId: "silk-dolly", characterId: "spring", pathId: "helix",
    materialId: "silk", finishId: "dream-glass", lightingId: "electric-rim", backgroundStudyId: "stained-light", lensId: "dream-glass",
    portraitScenes: [
      scene("velvet-fold-ascent", "Fold Ascent", "UPWARD SATURATION", "Portrait frames rise through slow luminous folds and close electric air.", -1, "helix", "stained-light", 0.8, 0.12, 0.8, 0.55),
      scene("velvet-prism-drop", "Prism Drop", "DESCENDING GLAMOUR", "A controlled descent through ultraviolet bands with a clean central face corridor.", 1, "cascade", "prism-weather", 0.76, 0.16, 0.2, 0.48),
    ],
  },
  {
    id: "celluloid-archive", name: "Celluloid Archive", eyebrow: "EMULSION · DUST · HISTORY",
    cutId: "documentary-glide", performanceId: "twelve-frame-hand", characterId: "weighted", pathId: "straight",
    materialId: "paper", finishId: "16mm-breath", lightingId: "projector-haze", backgroundStudyId: "silver-emulsion", lensId: "bleach-bypass",
    portraitScenes: [
      scene("archive-projector-rise", "Projector Rise", "UPWARD REEL", "A hand-wound reel climbs through silver emulsion and restrained projector breath.", -1, "straight", "silver-emulsion", 0.7, 0.22, 0.78, 0.68),
      scene("archive-dust-ledger", "Dust Ledger", "DESCENDING RECORD", "Documents descend through a tungsten ledger with stable dust and long scratches.", 1, "cascade", "dust-ledger", 0.68, 0.24, 0.22, 0.34),
    ],
  },
  {
    id: "night-run", name: "Night Run", eyebrow: "SODIUM · ROAD · VELOCITY",
    cutId: "explainer-cut", performanceId: "forward-rush", characterId: "spring", pathId: "cylinder",
    materialId: "gel", finishId: "panic-lens", lightingId: "headlight-sweep", backgroundStudyId: "night-exposure", lensId: "anamorphic-night",
    portraitScenes: [
      scene("night-headlight-climb", "Headlight Climb", "UPWARD CHASE", "A fast upward route crossed by travelling headlight beams and wet asphalt colour.", -1, "cylinder", "night-exposure", 0.62, 0.22, 0.78, 0.66),
      scene("night-sodium-drop", "Sodium Drop", "DESCENDING CITY", "Frames fall through sodium weather with a narrow optical centre and hard momentum.", 1, "switchback", "split-signal", 0.58, 0.18, 0.22, 0.34),
    ],
  },
] as const;

function worldById(id: string): AuthoredWorldDirection {
  const world = AUTHORED_WORLDS.find((entry) => entry.id === id);
  if (!world) throw new Error(`Unknown authored World: ${id}`);
  return world;
}

function studyById(id: string): BackgroundStudy {
  const study = BACKGROUND_STUDIES.find((entry) => entry.id === id);
  if (!study) throw new Error(`Unknown authored background study: ${id}`);
  return study;
}

function unlocked(project: DriftProjectV4, domain: ProjectDomain): boolean {
  return !project.provenance.lockedDomains.includes(domain);
}

function applyAtmosphere(project: DriftProjectV4, studyId: string, recut: number): void {
  const study = studyById(studyId);
  const composition = BACKGROUND_COMPOSITIONS[study.family][study.composition]!;
  project.atmosphere = {
    ...project.atmosphere,
    enabled: true,
    family: study.family,
    composition: composition.id,
    paletteId: study.paletteId,
    treatment: "cinema",
    recut,
    seedOffset: (study.variation + recut * 37 + project.projectSeed) % 100,
    presence: "balanced",
    intensity: study.background.intensity,
    motion: study.background.motion,
    grain: study.background.grain,
    vignette: study.background.vignette,
    colourA: study.background.colorA,
    colourB: study.background.colorB,
    accent: study.background.accent,
  };
}

function pressureFactor(variant: PublicWorldVariant): number {
  if (variant === "restrained") return 0.78;
  if (variant === "fever") return 1.18;
  return 1;
}

export function applyAuthoredWorld(
  project: DriftProjectV4,
  worldId: WorldId,
  variant: PublicWorldVariant,
  ratio: WorldRatioId,
  sceneIndex = 0,
  recut = 0,
): DriftProjectV4 {
  const world = worldById(worldId);
  const portrait = ratio === "9:16" || ratio === "4:5";
  const portraitScene = world.portraitScenes[Math.abs(Math.round(sceneIndex)) % 2]!;
  const factor = pressureFactor(variant);

  if (unlocked(project, "composition")) {
    const size = WORLD_RATIO_DIMENSIONS[ratio];
    project.composition = { ...project.composition, ...size };
  }
  if (unlocked(project, "motion")) {
    applyEditorialCut(project, world.cutId);
    applyPerformanceRecipe(project, world.performanceId);
    applyMotionCharacter(project, world.characterId);
    applyPathRecipe(project, portrait ? portraitScene.pathId : world.pathId);
    project.motion.transport.axis = portrait ? "vertical" : "horizontal";
    project.motion.transport.direction = portrait
      ? portraitScene.direction
      : WORLD_IDENTITIES.find((entry) => entry.id === world.id)!.axes.horizontal.preferredDirection;
    project.motion.transport.slidesPerSecond = Math.min(1.5, project.motion.transport.slidesPerSecond * (variant === "fever" ? 1.18 : variant === "restrained" ? 0.88 : 1));
    project.motion.path.gap = portrait ? portraitScene.gap : project.motion.path.gap;
    project.motion.performance.take = 1 + ((project.projectSeed + recut * 17) % 999);
  }
  if (unlocked(project, "card")) {
    project.card.scale = portrait ? portraitScene.scale : Math.min(0.84, project.card.scale);
    project.card.borderOpacity = variant === "restrained" ? 0.34 : variant === "fever" ? 0.62 : 0.46;
  }
  if (unlocked(project, "material")) {
    applyMaterialRecipe(project, world.materialId);
    applyFinishRecipe(project, world.finishId);
    project.material.flex = Math.min(1, project.material.flex * factor);
  }
  if (unlocked(project, "lighting")) {
    applyLightingRecipe(project, world.lightingId);
    project.lighting.enabled = true;
    project.lighting.keyIntensity = Math.min(2, project.lighting.keyIntensity * factor);
    project.lighting.backgroundSpill = Math.min(1, project.lighting.backgroundSpill * factor);
  }
  if (unlocked(project, "atmosphere")) {
    applyAtmosphere(project, portrait ? portraitScene.backgroundStudyId : world.backgroundStudyId, recut);
    project.atmosphere.intensity = Math.min(1, project.atmosphere.intensity * factor);
    project.atmosphere.motion = Math.min(1, project.atmosphere.motion * factor);
    project.atmosphere.presence = variant === "restrained" ? "whisper" : variant === "fever" ? "statement" : "balanced";
  }
  if (unlocked(project, "lens")) {
    applyLensRecipe(project, world.lensId);
    project.lens.presence = Math.min(1, project.lens.presence * factor);
  }
  if (unlocked(project, "presenter") && portrait) {
    project.presenter.x = portraitScene.presenterAnchor.x;
    project.presenter.y = portraitScene.presenterAnchor.y;
  }

  project.provenance.world = recipeReference(`world/${world.id}`, AUTHORED_WORLD_VERSION, {
    variant,
    ratio,
    scene: portrait ? portraitScene.id : "landscape",
    recut,
  });
  project.provenance.worldVariant = variant as WorldVariant;
  project.extensions["dog.pitch.drift.world-scene"] = {
    worldId: world.id,
    ratio,
    sceneId: portrait ? portraitScene.id : "landscape",
    sceneName: portrait ? portraitScene.name : `${world.name} Landscape`,
    recut,
  };
  return project;
}

export function currentAuthoredWorld(project: DriftProjectV4): AuthoredWorldDirection | null {
  const id = project.provenance.world?.id.replace(/^world\//u, "");
  return AUTHORED_WORLDS.find((entry) => id === entry.id || id?.startsWith(`${entry.id}/`)) ?? null;
}

export function currentPublicVariant(project: DriftProjectV4): PublicWorldVariant {
  return PUBLIC_WORLD_VARIANTS.includes(project.provenance.worldVariant as PublicWorldVariant)
    ? project.provenance.worldVariant as PublicWorldVariant
    : "directed";
}
