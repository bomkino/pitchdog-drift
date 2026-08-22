import type { StudioAsset } from "../../model";
import {
  DRIFT_PROJECT_VERSION,
  type DriftProjectV3,
  type DriftProjectV4,
  type SlideDirective,
} from "../project/schema";
import { deriveSlideGeometry, type SlideGeometry } from "../spatial/spatial";
import { evaluateFrame } from "../timeline/evaluateFrame";
import type { EvaluatedFrameSlide, FrameEvaluation } from "../timeline/FrameEvaluation";

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
}

export interface ProjectFrameEvaluation {
  frame: FrameEvaluation;
  geometry: SlideGeometry;
  renderables: ProjectFrameRenderableItem[];
}

export interface EvaluateProjectFrameInput {
  /** A Project V4 value that has already passed validateDriftProjectV4. */
  project: DriftProjectV4;
  time: number;
  /** Export frame identity is explicit. Preview callers pass null. */
  frameIndex: number | null;
  /** Decoded moving-track assets in exact project.media.order order. */
  assets: readonly StudioAsset[];
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
    if (asset.kind !== "image" || asset.kind !== descriptor.kind) mismatch(assetId, "kind");
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

/**
 * Pure Project V4-to-frame boundary for the canonical renderer. V4-only
 * compatibility metadata never enters V1-compatible evaluation, while every
 * creative value remains the exact value owned by the validated project.
 */
export function evaluateProjectFrame(input: EvaluateProjectFrameInput): ProjectFrameEvaluation {
  assertFrameIndex(input.frameIndex);
  assertOrderedAssets(input.project, input.assets);

  const compatibleProject = creativeTreeForV1Compat(input.project);
  const frame = evaluateFrame(compatibleProject, input.time, { frameIndex: input.frameIndex });
  const geometry = deriveSlideGeometry(compatibleProject, input.assets.length);
  const renderables = frame.slides.map((evaluated) => {
    const assetId = input.project.media.order[evaluated.sourceIndex];
    const asset = input.assets[evaluated.sourceIndex];
    const directive = assetId ? input.project.slides[assetId] : undefined;
    if (!assetId || !asset || !directive || directive.assetId !== asset.id) {
      throw new ProjectFrameAdapterError(
        `Evaluated source ${evaluated.sourceIndex} cannot be resolved to an ordered Project V4 slide.`,
      );
    }
    return {
      asset,
      directive: { ...directive },
      evaluated,
    };
  });

  return { frame, geometry, renderables };
}
