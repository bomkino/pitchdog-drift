import type { StudioAsset } from "../../model";
import {
  DRIFT_V2_RENDER_CONTRACT,
  DRIFT_PROJECT_VERSION,
  type DriftProjectV3,
  type DriftProjectV4,
  type SlideDirective,
} from "../project/schema";
import { deriveSlideGeometry, type SlideGeometry } from "../spatial/spatial";
import { evaluateFrame } from "../timeline/evaluateFrame";
import { evaluateV2Frame } from "../timeline/evaluateV2Frame";
import type { EvaluatedFrameSlide, FrameEvaluation } from "../timeline/FrameEvaluation";
import type { PerformanceLifecycleSample } from "../timeline/performanceLifecycle";
import {
  resolvePinnedFramePresentation,
  type PinnedFramePresentation,
} from "../presenter/presentation";

export class ProjectFrameAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFrameAdapterError";
  }
}

export interface ProjectFrameRenderableItem {
  asset: StudioAsset;
  directive: SlideDirective;
  evaluated: EvaluatedFrameSlide;
  /** Index in the complete Project V4 media order, not the filtered track. */
  sourceIndex: number;
}

export interface ProjectFrameEvaluation {
  /** Exact validated Project V4 creative authority used for this frame. */
  project: DriftProjectV4;
  frame: FrameEvaluation;
  lifecycle: PerformanceLifecycleSample | null;
  geometry: SlideGeometry;
  renderables: ProjectFrameRenderableItem[];
  sourceOrder: string[];
  projectAxis: DriftProjectV4["motion"]["transport"]["axis"];
  pinnedFrame: PinnedFramePresentation;
}

export interface EvaluateProjectFrameInput {
  /** A Project V4 value that has already passed validateDriftProjectV4. */
  project: DriftProjectV4;
  time: number;
  /** Export frame identity is explicit. Preview callers pass null. */
  frameIndex: number | null;
  /** Decoded moving-track assets in exact project.media.order order. */
  assets: readonly StudioAsset[];
  /** Session-only preview accessibility state. Export leaves this false. */
  reducedMotion?: boolean;
  /**
   * Session-only preview travel in stage pixels. It enters the same spatial
   * evaluator as authored motion; export callers omit it.
   */
  interactionDistancePx?: number;
}

function creativeTreeForV1Compat(project: DriftProjectV4): DriftProjectV3 {
  return {
    schema: project.schema,
    formatVersion: DRIFT_PROJECT_VERSION,
    projectId: project.projectId,
    projectSeed: project.projectSeed,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    composition: project.composition,
    media: project.media,
    slides: project.slides,
    motion: project.motion,
    card: project.card,
    material: project.material,
    lighting: project.lighting,
    atmosphere: project.atmosphere,
    lens: project.lens,
    sound: project.sound,
    presenter: project.presenter,
    master: project.master,
    provenance: project.provenance,
  };
}

function mismatch(assetId: string, field: string): never {
  throw new ProjectFrameAdapterError(`Slide asset ${assetId} ${field} does not match Project V4 media authority.`);
}

function assertOrderedAssets(project: DriftProjectV4, assets: readonly StudioAsset[]): void {
  const order = project.media.order;
  if (assets.length !== order.length) {
    throw new ProjectFrameAdapterError(
      `Project V4 media order contains ${order.length} slides, but the renderer received ${assets.length}.`,
    );
  }

  for (let sourceIndex = 0; sourceIndex < order.length; sourceIndex += 1) {
    const assetId = order[sourceIndex]!;
    const asset = assets[sourceIndex]!;
    if (asset.id !== assetId) {
      throw new ProjectFrameAdapterError(
        `Project V4 media order mismatch at source ${sourceIndex}: expected ${assetId}, received ${asset.id}.`,
      );
    }

    const descriptor = project.media.assets[assetId];
    if (!descriptor) mismatch(assetId, "descriptor");
    if ((asset.kind !== "image" && asset.kind !== "video") || asset.kind !== descriptor.kind) mismatch(assetId, "kind");
    if (asset.name !== descriptor.name) mismatch(assetId, "name");
    if (asset.mimeType !== descriptor.mimeType) mismatch(assetId, "MIME type");
    if (asset.width !== descriptor.width || asset.height !== descriptor.height) mismatch(assetId, "dimensions");
    if ((asset.duration ?? null) !== (descriptor.duration ?? null)) mismatch(assetId, "duration");
    if (asset.blob.size !== descriptor.byteLength) mismatch(assetId, "byte length");
    if (asset.hash !== descriptor.hash) mismatch(assetId, "SHA-256 identity");
  }
}

function assertFrameIndex(frameIndex: number | null): void {
  if (frameIndex !== null && (!Number.isSafeInteger(frameIndex) || frameIndex < 0)) {
    throw new ProjectFrameAdapterError(
      `Frame identity must be null or a non-negative safe integer; received ${frameIndex}.`,
    );
  }
}

function assertInteractionDistance(value: number | undefined): void {
  if (value !== undefined && !Number.isFinite(value)) {
    throw new ProjectFrameAdapterError(
      `Preview interaction distance must be finite; received ${value}.`,
    );
  }
}

function movingSourceOrder(project: DriftProjectV4): string[] {
  const pinnedOnlyId = project.presenter.enabled
    && project.presenter.trackMode === "pinned-only"
    && project.presenter.assetId !== null
    && project.media.assets[project.presenter.assetId]?.kind === "image"
    ? project.presenter.assetId
    : null;
  return project.media.order.filter((assetId) => assetId !== pinnedOnlyId);
}

function assertV2FrameAuthority(project: DriftProjectV4, time: number, frameIndex: number | null): void {
  if (project.renderContract !== DRIFT_V2_RENDER_CONTRACT || frameIndex === null) return;
  const expected = frameIndex / project.master.fps;
  if (Math.abs(time - expected) > 1e-9) {
    throw new ProjectFrameAdapterError(
      `V2 export frame ${frameIndex} owns time ${expected}; received conflicting time ${time}.`,
    );
  }
}

/**
 * Pure Project V4-to-frame boundary for the canonical renderer. V4-only
 * compatibility metadata never enters V1-compatible evaluation, while every
 * creative value remains the exact value owned by the validated project.
 */
export function evaluateProjectFrame(input: EvaluateProjectFrameInput): ProjectFrameEvaluation {
  assertFrameIndex(input.frameIndex);
  assertInteractionDistance(input.interactionDistancePx);
  assertOrderedAssets(input.project, input.assets);
  assertV2FrameAuthority(input.project, input.time, input.frameIndex);

  const sourceOrder = movingSourceOrder(input.project);
  const pinnedFrame = resolvePinnedFramePresentation(
    input.project.presenter,
    input.project.master.duration,
    input.time,
  );
  const canonicalGeometry = deriveSlideGeometry(input.project, sourceOrder.length);
  const interactionSlides = sourceOrder.length > 0
    ? (input.interactionDistancePx ?? 0) / Math.max(1, canonicalGeometry.stride)
    : 0;
  const v2Active = input.project.renderContract === DRIFT_V2_RENDER_CONTRACT;
  const v2 = v2Active
    ? evaluateV2Frame(input.project, sourceOrder, input.time, {
        frameIndex: input.frameIndex,
        reducedMotion: input.reducedMotion,
        interactionSlides,
      })
    : null;
  const compatibleProject = v2Active ? null : creativeTreeForV1Compat(input.project);
  const frame = v2?.frame ?? evaluateFrame(compatibleProject!, input.time, { frameIndex: input.frameIndex });
  const renderOrder = v2Active ? sourceOrder : input.project.media.order;
  const geometry = deriveSlideGeometry(v2Active ? input.project : compatibleProject!, renderOrder.length);
  const projectSourceIndex = new Map(input.project.media.order.map((assetId, index) => [assetId, index]));
  const renderables = frame.slides.map((evaluated) => {
    const assetId = renderOrder[evaluated.sourceIndex];
    const sourceIndex = assetId === undefined ? undefined : projectSourceIndex.get(assetId);
    const asset = sourceIndex === undefined ? undefined : input.assets[sourceIndex];
    const directive = assetId ? input.project.slides[assetId] : undefined;
    if (!assetId || sourceIndex === undefined || !asset || !directive || directive.assetId !== asset.id) {
      throw new ProjectFrameAdapterError(
        `Evaluated source ${evaluated.sourceIndex} cannot be resolved to an ordered Project V4 slide.`,
      );
    }
    return {
      asset,
      directive: { ...directive },
      evaluated,
      sourceIndex,
    };
  });

  return {
    project: input.project,
    frame,
    lifecycle: v2?.lifecycle ?? null,
    geometry,
    renderables,
    sourceOrder: [...renderOrder],
    projectAxis: input.project.motion.transport.axis,
    pinnedFrame,
  };
}
