import { resolveMovingMedia } from "../project/movingMedia";
import type { AssetDescriptor, DriftProjectV4, SlideDirective } from "../project/schema";
import { deriveSlideGeometry } from "../spatial/spatial";

export type SlideHealthSeverity = "healthy" | "note" | "warning" | "blocker";

export interface SlideHealthIssue {
  readonly id: "missing" | "invalid-dimensions" | "low-resolution" | "unusual-ratio" | "mixed-ratio" | "focal-edge" | "pinned-only";
  readonly severity: Exclude<SlideHealthSeverity, "healthy">;
  readonly message: string;
}

export interface SlideHealth {
  readonly assetId: string;
  readonly severity: SlideHealthSeverity;
  readonly issues: readonly SlideHealthIssue[];
  readonly requiredWidth: number;
  readonly requiredHeight: number;
}

const SEVERITY_ORDER: Readonly<Record<SlideHealthSeverity, number>> = Object.freeze({
  healthy: 0,
  note: 1,
  warning: 2,
  blocker: 3,
});

function slideDirective(project: DriftProjectV4, assetId: string): SlideDirective {
  return project.slides[assetId] ?? {
    assetId,
    fit: project.card.defaultFit,
    focalX: 0.5,
    focalY: 0.5,
    scaleOffset: 0,
  };
}

function deckRatios(project: DriftProjectV4): number[] {
  return project.media.order.flatMap((assetId) => {
    const asset = project.media.assets[assetId];
    return asset && asset.width > 0 && asset.height > 0 ? [asset.width / asset.height] : [];
  });
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1]! + ordered[middle]!) / 2
    : ordered[middle]!;
}

function focalPinnedToCropEdge(
  asset: AssetDescriptor,
  directive: SlideDirective,
  targetAspect: number,
): boolean {
  if (directive.fit !== "cover" || asset.width <= 0 || asset.height <= 0) return false;
  const sourceAspect = asset.width / asset.height;
  if (sourceAspect > targetAspect) {
    const visibleFraction = targetAspect / sourceAspect;
    const half = visibleFraction / 2;
    return directive.focalX < half || directive.focalX > 1 - half;
  }
  if (sourceAspect < targetAspect) {
    const visibleFraction = sourceAspect / targetAspect;
    const half = visibleFraction / 2;
    return directive.focalY < half || directive.focalY > 1 - half;
  }
  return false;
}

function lowResolution(
  asset: AssetDescriptor,
  directive: SlideDirective,
  requiredWidth: number,
  requiredHeight: number,
): boolean {
  if (asset.width <= 0 || asset.height <= 0) return false;
  const scale = directive.fit === "cover"
    ? Math.max(requiredWidth / asset.width, requiredHeight / asset.height)
    : Math.min(requiredWidth / asset.width, requiredHeight / asset.height);
  return scale > 1.001;
}

/** Pure metadata health. It never guesses at legibility, meaning, or taste. */
export function evaluateSlideHealth(project: DriftProjectV4, assetId: string): SlideHealth {
  const asset = project.media.assets[assetId];
  const directive = slideDirective(project, assetId);
  const moving = resolveMovingMedia(project);
  const geometry = deriveSlideGeometry(project, moving.count);
  const directedScale = Math.max(0.25, 1 + directive.scaleOffset);
  const requiredWidth = Math.max(1, Math.ceil(geometry.width * directedScale));
  const requiredHeight = Math.max(1, Math.ceil(geometry.height * directedScale));
  const issues: SlideHealthIssue[] = [];

  if (!asset) {
    issues.push({ id: "missing", severity: "blocker", message: "The project manifest cannot find this slide source." });
  } else if (asset.width <= 0 || asset.height <= 0 || !Number.isFinite(asset.width) || !Number.isFinite(asset.height)) {
    issues.push({ id: "invalid-dimensions", severity: "blocker", message: "The source has invalid pixel dimensions and cannot render reliably." });
  } else {
    const sourceAspect = asset.width / asset.height;
    const targetAspect = requiredWidth / requiredHeight;
    if (lowResolution(asset, directive, requiredWidth, requiredHeight)) {
      issues.push({
        id: "low-resolution",
        severity: "warning",
        message: `${asset.width} × ${asset.height} px is below this slide's projected ${requiredWidth} × ${requiredHeight} px footprint.`,
      });
    }
    if (sourceAspect < 0.35 || sourceAspect > 3.2) {
      issues.push({ id: "unusual-ratio", severity: "note", message: `The source ratio ${sourceAspect.toFixed(2)}:1 is unusually extreme.` });
    }
    const deckMedian = median(deckRatios(project));
    if (deckMedian !== null && project.media.order.length > 1 && Math.abs(Math.log(sourceAspect / deckMedian)) > Math.log(1.2)) {
      issues.push({ id: "mixed-ratio", severity: "note", message: "Its source ratio differs materially from the middle of this deck." });
    }
    if (focalPinnedToCropEdge(asset, directive, targetAspect)) {
      issues.push({ id: "focal-edge", severity: "warning", message: "The focal point reaches beyond the movable crop range and is pinned to an edge." });
    }
  }

  if (moving.excludedPinnedOnlyAssetId === assetId) {
    issues.push({ id: "pinned-only", severity: "note", message: "Still-only: excluded from carousel timing and deck-pass counts." });
  }

  const severity = issues.reduce<SlideHealthSeverity>((current, issue) => (
    SEVERITY_ORDER[issue.severity] > SEVERITY_ORDER[current] ? issue.severity : current
  ), "healthy");
  return Object.freeze({
    assetId,
    severity,
    issues: Object.freeze(issues),
    requiredWidth,
    requiredHeight,
  });
}

export function evaluateDeckSlideHealth(project: DriftProjectV4): Readonly<Record<string, SlideHealth>> {
  return Object.freeze(Object.fromEntries(
    project.media.order.map((assetId) => [assetId, evaluateSlideHealth(project, assetId)]),
  ));
}
