import type { ProjectCommand } from "../commands/projectCommand";
import type { DriftCreativeState, DriftProjectV3, MotionSettings } from "../project/schema";
import { refreshMotionRecipeProvenance } from "../recipes/motion";
import type { EvaluatedFrameSlide, FrameEvaluation } from "../timeline/FrameEvaluation";
import type { SpatialEvaluationContext } from "../timeline/evaluateFrame";
import { canonicalZero, clamp, positiveModulo, TAU } from "../timeline/math";

export const MAX_RESIDENT_SLIDES = 24;
export const PATH_RECIPE_VERSION = 1 as const;
export const PATH_IDS = [
  "straight",
  "arc",
  "ribbon",
  "cylinder",
  "tunnel",
  "helix",
  "orbit",
  "cascade",
  "figure-eight",
  "switchback",
] as const;
export type PathId = (typeof PATH_IDS)[number];

export interface PathRecipe {
  id: PathId;
  version: typeof PATH_RECIPE_VERSION;
  name: string;
  description: string;
  bestFor: string;
  avoidWhen: string;
  tags: readonly string[];
  path: Omit<MotionSettings["path"], "id">;
}

export interface SlideGeometry {
  width: number;
  height: number;
  stride: number;
  axisExtent: number;
  crossExtent: number;
  visibleRadius: number;
  virtualSlotCount: number;
}

interface PathPoint {
  cross: number;
  z: number;
}

interface PathDerivative {
  primary: number;
  cross: number;
  z: number;
  bend: number;
}

const DEG = Math.PI / 180;
const DERIVATIVE_STEP = 0.0015;

export const PATH_RECIPES: readonly PathRecipe[] = [
  {
    id: "straight",
    version: 1,
    name: "Straight",
    description: "A disciplined strip with almost no spatial rhetoric.",
    bestFor: "Charts, evidence, contact sheets, and neutral editorial delivery.",
    avoidWhen: "The sequence depends on depth, suspense, or an expressive spatial reveal.",
    tags: ["clean", "graphic", "evidence", "neutral"],
    path: { gap: 0.16, curvature: 0, depth: 0.08, banking: 0.8, focusScale: 0.02, edgeFade: 0.22 },
  },
  {
    id: "arc",
    version: 1,
    name: "Arc",
    description: "A one-sided cinematic bow with a quiet depth falloff.",
    bestFor: "Travel, portraits, memory, and patient lateral movement.",
    avoidWhen: "The visual system must remain geometrically strict.",
    tags: ["cinematic", "portrait", "travel", "soft"],
    path: { gap: 0.28, curvature: 0.46, depth: 0.28, banking: 2.2, focusScale: 0.06, edgeFade: 0.24 },
  },
  {
    id: "ribbon",
    version: 1,
    name: "Ribbon",
    description: "An S-curve with restrained lateral weave and soft depth.",
    bestFor: "Editorial drift, treatments, fashion, and lyrical sequences.",
    avoidWhen: "Small typography must remain perfectly planar throughout.",
    tags: ["editorial", "lyrical", "fashion", "flowing"],
    path: { gap: 0.22, curvature: 0.36, depth: 0.18, banking: 4.5, focusScale: 0.08, edgeFade: 0.28 },
  },
  {
    id: "cylinder",
    version: 1,
    name: "Cylinder",
    description: "A shallow wrap around a cylindrical wall with readable perspective.",
    bestFor: "Music, speculative work, glossy image-led sequences.",
    avoidWhen: "The deck is dense or the stage must feel flat and documentary.",
    tags: ["depth", "music", "speculative", "gloss"],
    path: { gap: 0.26, curvature: 0.68, depth: 0.48, banking: 9, focusScale: 0.14, edgeFade: 0.32 },
  },
  {
    id: "tunnel",
    version: 1,
    name: "Tunnel",
    description: "A focal centre with aggressive recession at the edges.",
    bestFor: "Horror, dread, revelation, and deep negative space.",
    avoidWhen: "Every slide needs equal visual authority or sustained small-text reading.",
    tags: ["horror", "depth", "focus", "dread"],
    path: { gap: 0.44, curvature: 0.72, depth: 0.56, banking: 8.5, focusScale: 0.04, edgeFade: 0.46 },
  },
  {
    id: "helix",
    version: 1,
    name: "Helix",
    description: "A corkscrew sweep whose tangent carries orientation and depth together.",
    bestFor: "Music, motion-led campaigns, sport, and heightened graphic work.",
    avoidWhen: "The sequence contains many diagrams or strict page geometry.",
    tags: ["kinetic", "music", "spiral", "graphic"],
    path: { gap: 0.28, curvature: 0.72, depth: 0.52, banking: 10, focusScale: 0.1, edgeFade: 0.34 },
  },
  {
    id: "orbit",
    version: 1,
    name: "Orbit",
    description: "A close circular sweep around the focal plane.",
    bestFor: "Tender image-led work, fashion, objects, and dreamy proximity.",
    avoidWhen: "The camera should feel observational rather than designed.",
    tags: ["orbit", "close", "dream", "fashion"],
    path: { gap: 0.22, curvature: 0.64, depth: 0.44, banking: 8, focusScale: 0.12, edgeFade: 0.3 },
  },
  {
    id: "cascade",
    version: 1,
    name: "Cascade",
    description: "Layered waves with stepped depth and an editorial sense of accumulation.",
    bestFor: "Process, collections, chapters, and layered evidence.",
    avoidWhen: "The composition needs one calm, singular focal plane.",
    tags: ["layered", "process", "collection", "editorial"],
    path: { gap: 0.2, curvature: 0.56, depth: 0.34, banking: 6.5, focusScale: 0.08, edgeFade: 0.3 },
  },
  {
    id: "figure-eight",
    version: 1,
    name: "Figure Eight",
    description: "A crossing lemniscate with a controlled spatial return.",
    bestFor: "Dualities, mirrored ideas, experimental and music-led work.",
    avoidWhen: "The crossing would confuse a linear argument or reading order.",
    tags: ["experimental", "crossing", "duality", "music"],
    path: { gap: 0.24, curvature: 0.74, depth: 0.46, banking: 9, focusScale: 0.11, edgeFade: 0.35 },
  },
  {
    id: "switchback",
    version: 1,
    name: "Switchback",
    description: "Harder lateral reversals with continuous depth and tangent-led orientation.",
    bestFor: "Thriller, urgency, road stories, and argumentative contrast.",
    avoidWhen: "The intended feeling is gentle, stable, or meditative.",
    tags: ["thriller", "contrast", "road", "urgent"],
    path: { gap: 0.18, curvature: 0.8, depth: 0.4, banking: 10, focusScale: 0.08, edgeFade: 0.38 },
  },
] as const;

export function pathRecipe(id: string): PathRecipe {
  const recipe = PATH_RECIPES.find((entry) => entry.id === id);
  if (!recipe) throw new Error(`Unknown spatial path: ${id}`);
  return recipe;
}

export function applyPathRecipe(project: DriftProjectV3, id: string): DriftProjectV3 {
  const recipe = pathRecipe(id);
  project.motion.path = { id: recipe.id, ...recipe.path };
  return refreshMotionRecipeProvenance(project);
}

export function applyPathCommand(id: string): ProjectCommand {
  return {
    id: `apply-path:${id}`,
    source: "spatial-path",
    ownedDomains: ["motion", "provenance"],
    apply: (project) => applyPathRecipe(project, id),
  };
}

export function deriveSlideGeometry(project: DriftCreativeState, sourceCount = project.media.order.length): SlideGeometry {
  const aspect = project.card.aspectWidth / Math.max(0.01, project.card.aspectHeight);
  const width = project.composition.width * clamp(project.card.scale, 0.2, 1.25);
  const height = width / aspect;
  const extent = project.motion.transport.axis === "horizontal" ? width : height;
  const stride = extent * (1 + clamp(project.motion.path.gap, 0, 1.5));
  const axisExtent = project.motion.transport.axis === "horizontal"
    ? project.composition.width
    : project.composition.height;
  const crossExtent = project.motion.transport.axis === "horizontal"
    ? project.composition.height
    : project.composition.width;
  const minimum = sourceCount > 0
    ? Math.ceil(axisExtent / Math.max(1, stride)) + 5
    : 0;
  const virtualSlotCount = sourceCount > 0
    ? Math.max(sourceCount, Math.ceil(minimum / sourceCount) * sourceCount)
    : 0;
  return {
    width,
    height,
    stride,
    axisExtent,
    crossExtent,
    visibleRadius: axisExtent / 2 + stride,
    virtualSlotCount,
  };
}

function pathPoint(
  id: string,
  normalized: number,
  curvature: number,
  depth: number,
  crossExtent: number,
): PathPoint {
  const n = normalized;
  const absN = Math.abs(n);
  const c = clamp(curvature, 0, 1);
  const d = Math.max(0, depth);
  const crossScale = crossExtent * c * 0.16;

  switch (id) {
    case "straight":
      return { cross: 0, z: -d * 0.22 * n * n };
    case "arc":
      return { cross: -crossScale * 0.56 * n * n, z: -d * 0.86 * n * n };
    case "ribbon":
      return {
        cross: Math.sin(n * Math.PI * 0.92) * crossScale * 0.74,
        z: -d * (0.18 * absN + 0.82 * n * n),
      };
    case "cylinder": {
      const angle = n * (0.9 + c * 1.55);
      return {
        cross: Math.sin(angle) * crossScale,
        z: -d * (1 - Math.cos(angle)) * 1.12,
      };
    }
    case "tunnel":
      return {
        cross: Math.sin(n * Math.PI * 1.18) * crossScale * 0.32,
        z: -d * Math.pow(absN, 1.35),
      };
    case "helix": {
      const angle = n * Math.PI * (1.25 + c * 2.4);
      return {
        cross: Math.sin(angle) * crossScale * 0.88,
        z: -d * (0.32 * absN + 0.68 * (1 - Math.cos(angle)) * 0.5),
      };
    }
    case "orbit": {
      const angle = n * Math.PI * (0.82 + c * 0.92);
      return {
        cross: Math.sin(angle) * crossScale * 1.08,
        z: -d * (1 - Math.cos(angle)) * 0.92,
      };
    }
    case "cascade": {
      const stair = Math.sin(n * Math.PI * 1.45) + 0.28 * Math.sin(n * Math.PI * 4.35);
      return {
        cross: stair * crossScale * 0.62,
        z: -d * (Math.pow(absN, 1.16) + 0.12 * Math.pow(Math.sin(n * Math.PI * 1.8), 2)),
      };
    }
    case "figure-eight": {
      const angle = n * Math.PI * (0.86 + c * 0.48);
      const sine = Math.sin(angle);
      const cosine = Math.cos(angle);
      const denominator = 1 + cosine * cosine;
      return {
        cross: (sine / denominator) * crossScale * 1.28,
        z: -d * ((1 - Math.cos(angle * 2)) * 0.42 + absN * 0.2),
      };
    }
    case "switchback": {
      const wave = Math.sin(n * Math.PI * 1.62) + 0.27 * Math.sin(n * Math.PI * 4.86);
      return {
        cross: wave * crossScale * 0.76,
        z: -d * (Math.pow(absN, 1.12) + 0.1 * (1 - Math.cos(n * Math.PI * 3.1))),
      };
    }
    default:
      return { cross: 0, z: 0 };
  }
}

function pathDerivative(
  id: string,
  normalized: number,
  curvature: number,
  depth: number,
  crossExtent: number,
  primaryScale: number,
): PathDerivative {
  const before = pathPoint(id, normalized - DERIVATIVE_STEP, curvature, depth, crossExtent);
  const center = pathPoint(id, normalized, curvature, depth, crossExtent);
  const after = pathPoint(id, normalized + DERIVATIVE_STEP, curvature, depth, crossExtent);
  const divisor = DERIVATIVE_STEP * 2;
  const primary = Math.max(1, primaryScale);
  const cross = (after.cross - before.cross) / divisor;
  const z = (after.z - before.z) / divisor;
  const length = Math.hypot(primary, cross, z) || 1;

  const prior = pathPoint(id, normalized - DERIVATIVE_STEP * 2, curvature, depth, crossExtent);
  const next = pathPoint(id, normalized + DERIVATIVE_STEP * 2, curvature, depth, crossExtent);
  const secondCross = (next.cross - 2 * center.cross + prior.cross) / Math.pow(DERIVATIVE_STEP * 2, 2);
  const secondZ = (next.z - 2 * center.z + prior.z) / Math.pow(DERIVATIVE_STEP * 2, 2);
  return {
    primary: primary / length,
    cross: cross / length,
    z: z / length,
    bend: clamp(Math.hypot(secondCross, secondZ) / Math.max(1, primaryScale * 8), 0, 1),
  };
}

function hash01(value: number): number {
  let seed = value | 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  seed ^= seed >>> 16;
  return (seed >>> 0) / 4_294_967_295;
}

function imperfection(
  project: DriftCreativeState,
  sourceIndex: number,
  visibleSlides: number,
  sourceCount: number,
  crossExtent: number,
): { cross: number; z: number; roll: number } {
  const amount = clamp(project.motion.performance.imperfection, 0, 1);
  if (amount <= 0 || sourceCount <= 0) return { cross: 0, z: 0, roll: 0 };
  const take = Math.max(1, Math.round(project.motion.performance.take));
  const phase = positiveModulo(Math.abs(visibleSlides) / sourceCount, 1) * TAU;
  const offset = hash01(sourceIndex * 17 + take * 101) * TAU;
  const harmonic = 2 + (take % 3);
  return {
    cross: Math.sin(phase * harmonic + offset) * crossExtent * amount * 0.012,
    z: Math.cos(phase * 2 + offset * 1.31) * crossExtent * amount * 0.009,
    roll: Math.sin(phase * (harmonic + 1) - offset * 0.73) * amount * 1.4 * DEG,
  };
}

function evaluateVirtualSlide(
  project: DriftCreativeState,
  frame: Omit<FrameEvaluation, "slides">,
  geometry: SlideGeometry,
  slot: number,
  sourceCount: number,
  sourceOrder: readonly string[],
): EvaluatedFrameSlide {
  const loopLength = geometry.virtualSlotCount * geometry.stride;
  let primary = positiveModulo(
    slot * geometry.stride - frame.track.visibleDistance * geometry.stride + loopLength / 2,
    loopLength,
  ) - loopLength / 2;
  if (Object.is(primary, -0)) primary = 0;

  const normalized = clamp(primary / Math.max(1, geometry.visibleRadius), -1.4, 1.4);
  const abs = Math.abs(normalized);
  const depth = clamp(project.motion.path.depth, 0, 1) * geometry.crossExtent;
  const point = pathPoint(
    project.motion.path.id,
    normalized,
    project.motion.path.curvature,
    depth,
    geometry.crossExtent,
  );
  const tangent = pathDerivative(
    project.motion.path.id,
    normalized,
    project.motion.path.curvature,
    depth,
    geometry.crossExtent,
    geometry.visibleRadius,
  );
  const sourceIndex = positiveModulo(slot, sourceCount);
  const organic = imperfection(project, sourceIndex, frame.track.visibleDistance, sourceCount, geometry.crossExtent);

  const bankingDegrees = clamp(project.motion.path.banking, -45, 45);
  const bankingSign = bankingDegrees < 0 ? -1 : 1;
  const bankAuthority = clamp(Math.abs(bankingDegrees) / 12, 0, 1);
  const tangentLimit = (4 + Math.abs(bankingDegrees) * 1.5) * DEG;
  const tangentRoll = Math.atan2(tangent.cross, Math.max(0.001, tangent.primary));
  const tangentPitch = Math.atan2(-tangent.z, Math.max(0.001, tangent.primary));
  const softTwist = Math.sin(normalized * Math.PI) * Math.abs(bankingDegrees) * DEG * 0.18;
  const bankedRoll = clamp(tangentRoll, -tangentLimit, tangentLimit) * bankAuthority * bankingSign;
  const bankedPitch = clamp(tangentPitch, -tangentLimit, tangentLimit) * bankAuthority;
  const combinedLimit = Math.abs(bankingDegrees) * DEG + tangentLimit * bankAuthority;

  let rotationX = 0;
  let rotationY = 0;
  let rotationZ = bankedRoll + softTwist * bankingSign + organic.roll;
  if (project.motion.transport.axis === "vertical") rotationX = bankedPitch;
  else rotationY = -bankedPitch;
  if (project.motion.path.id === "helix" || project.motion.path.id === "orbit") {
    rotationZ += Math.sin(normalized * Math.PI * 1.15) * tangentLimit * 0.34 * bankAuthority;
  }

  const focusWeight = 1 - clamp(abs, 0, 1);
  const depthScale = clamp(1 + (point.z + organic.z) / Math.max(1, geometry.visibleRadius) * 0.34, 0.62, 1.08);
  const directive = project.slides[sourceOrder[sourceIndex]!];
  const directiveScale = 1 + (directive?.scaleOffset ?? 0);
  const scale = clamp(
    depthScale * (1 + project.motion.path.focusScale * focusWeight) * directiveScale,
    0.24,
    1.6,
  );
  const opacity = clamp(1 - project.motion.path.edgeFade * Math.pow(abs, 1.6), 0.08, 1);

  return {
    logicalIndex: slot,
    sourceIndex,
    primary: canonicalZero(primary),
    cross: canonicalZero(point.cross + organic.cross),
    z: canonicalZero(point.z + organic.z),
    rotationX: canonicalZero(clamp(rotationX, -combinedLimit, combinedLimit)),
    rotationY: canonicalZero(clamp(rotationY, -combinedLimit, combinedLimit)),
    rotationZ: canonicalZero(clamp(rotationZ, -combinedLimit, combinedLimit)),
    scale,
    opacity,
    pathBend: clamp(tangent.bend + Math.abs(tangent.z) * 0.46 + Math.abs(tangent.cross) * 0.22, 0, 1),
    focusWeight,
  };
}

function renderOrder(slides: EvaluatedFrameSlide[]): EvaluatedFrameSlide[] {
  const visible = slides.filter((slide) => Math.abs(slide.primary) <= Number.MAX_SAFE_INTEGER);
  const selected = visible.length <= MAX_RESIDENT_SLIDES
    ? visible
    : [...visible]
        .sort((left, right) => Math.abs(left.primary) - Math.abs(right.primary))
        .slice(0, MAX_RESIDENT_SLIDES);
  return selected.sort((left, right) => left.z - right.z || left.logicalIndex - right.logicalIndex);
}

export function evaluateSpatialSlides(context: SpatialEvaluationContext): EvaluatedFrameSlide[] {
  const { project, sourceCount, frame } = context;
  return evaluateSpatialFrame(project, sourceCount, frame, project.media.order);
}

/** Pure spatial draw-plan boundary shared by canonical timeline evaluators. */
export function evaluateSpatialFrame(
  project: DriftCreativeState,
  sourceCount: number,
  frame: Omit<FrameEvaluation, "slides">,
  sourceOrder: readonly string[] = project.media.order,
): EvaluatedFrameSlide[] {
  if (sourceCount <= 0) return [];
  if (sourceOrder.length !== sourceCount) {
    throw new Error(`Spatial source order contains ${sourceOrder.length} entries for ${sourceCount} sources.`);
  }
  const geometry = deriveSlideGeometry(project, sourceCount);
  const slides = Array.from(
    { length: geometry.virtualSlotCount },
    (_, slot) => evaluateVirtualSlide(project, frame, geometry, slot, sourceCount, sourceOrder),
  ).filter((slide) => Math.abs(slide.primary) <= geometry.visibleRadius + geometry.stride * 1.25);
  return renderOrder(slides);
}
