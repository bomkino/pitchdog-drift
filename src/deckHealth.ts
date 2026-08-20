import type { StudioAsset, StudioSettings } from "./model";

export type DeckHealthStatus = "empty" | "ready" | "warning";

export interface DeckHealth {
  status: DeckHealthStatus;
  ratioLabel: string;
  mixedRatios: boolean;
  lowResolutionCount: number;
  frameRatioMismatch: boolean;
  suggestedAspectWidth: number;
  suggestedAspectHeight: number;
  sourceCount: number;
  smallestSource: { width: number; height: number } | null;
}

const COMMON_RATIOS = [
  { width: 16, height: 9, label: "16:9" },
  { width: 4, height: 3, label: "4:3" },
  { width: 3, height: 2, label: "3:2" },
  { width: 1, height: 1, label: "1:1" },
  { width: 4, height: 5, label: "4:5" },
  { width: 9, height: 16, label: "9:16" },
] as const;

function relativeDistance(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(0.0001, b);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function approximateRatio(value: number): { width: number; height: number } {
  let best = { width: 1, height: 1, error: Number.POSITIVE_INFINITY };
  for (let height = 1; height <= 64; height += 1) {
    const width = Math.min(64, Math.max(1, Math.round(value * height)));
    const error = relativeDistance(width / height, value);
    if (error < best.error) best = { width, height, error };
  }
  return { width: best.width, height: best.height };
}

export function assessDeckHealth(assets: readonly StudioAsset[], settings: StudioSettings): DeckHealth {
  if (assets.length === 0) {
    return {
      status: "empty",
      ratioLabel: "—",
      mixedRatios: false,
      lowResolutionCount: 0,
      frameRatioMismatch: false,
      suggestedAspectWidth: settings.slide.aspectWidth,
      suggestedAspectHeight: settings.slide.aspectHeight,
      sourceCount: 0,
      smallestSource: null,
    };
  }

  const ratios = assets.map((asset) => asset.width / Math.max(1, asset.height));
  const representative = median(ratios);
  const minimum = Math.min(...ratios);
  const maximum = Math.max(...ratios);
  const mixedRatios = relativeDistance(maximum, minimum) > 0.035;
  const common = COMMON_RATIOS.find((candidate) => relativeDistance(candidate.width / candidate.height, representative) <= 0.025);
  const suggested = common ?? approximateRatio(representative);
  const frameRatio = settings.slide.aspectWidth / Math.max(0.01, settings.slide.aspectHeight);
  const frameRatioMismatch = !mixedRatios && relativeDistance(frameRatio, representative) > 0.03;

  const planeWidth = settings.output.width * settings.slide.scale;
  const planeHeight = planeWidth / frameRatio;
  const lowResolutionCount = assets.filter((asset) => {
    const coverScale = Math.max(planeWidth / Math.max(1, asset.width), planeHeight / Math.max(1, asset.height));
    const containScale = Math.min(planeWidth / Math.max(1, asset.width), planeHeight / Math.max(1, asset.height));
    const sourceScale = settings.slide.fit === "cover" ? coverScale : containScale;
    return sourceScale > 1.15;
  }).length;

  const smallest = assets.reduce((current, asset) => {
    const area = asset.width * asset.height;
    const currentArea = current.width * current.height;
    return area < currentArea ? asset : current;
  });

  return {
    status: mixedRatios || lowResolutionCount > 0 || frameRatioMismatch ? "warning" : "ready",
    ratioLabel: common?.label ?? `${suggested.width}:${suggested.height}`,
    mixedRatios,
    lowResolutionCount,
    frameRatioMismatch,
    suggestedAspectWidth: suggested.width,
    suggestedAspectHeight: suggested.height,
    sourceCount: assets.length,
    smallestSource: { width: smallest.width, height: smallest.height },
  };
}
