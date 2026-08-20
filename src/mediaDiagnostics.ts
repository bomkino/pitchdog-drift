import type { StudioAsset } from "./model";

export type MediaDiagnosticLevel = "ready" | "note";

export interface MediaDiagnostic {
  level: MediaDiagnosticLevel;
  label: string;
  detail: string;
  dominantRatio: string | null;
  duplicateCount: number;
}

const KNOWN_RATIOS = [
  { label: "2.39:1", value: 2.39 },
  { label: "16:9", value: 16 / 9 },
  { label: "3:2", value: 3 / 2 },
  { label: "4:3", value: 4 / 3 },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "9:16", value: 9 / 16 },
] as const;

function ratioLabel(width: number, height: number): string {
  const ratio = width / Math.max(1, height);
  const known = KNOWN_RATIOS
    .map((candidate) => ({
      ...candidate,
      error: Math.abs(ratio - candidate.value) / candidate.value,
    }))
    .sort((a, b) => a.error - b.error)[0];
  if (known && known.error <= 0.025) return known.label;
  return `${ratio.toFixed(2)}:1`;
}

export function buildMediaDiagnostic(
  assets: readonly Pick<StudioAsset, "width" | "height" | "hash" | "demo">[],
): MediaDiagnostic {
  if (assets.length === 0) {
    return {
      level: "ready",
      label: "No moving slides",
      detail: "Drop a deck to begin. Drift accepts PNG, JPEG, WebP, and AVIF images.",
      dominantRatio: null,
      duplicateCount: 0,
    };
  }

  const ratios = assets.map((asset) => ratioLabel(asset.width, asset.height));
  const counts = new Map<string, number>();
  for (const ratio of ratios) counts.set(ratio, (counts.get(ratio) ?? 0) + 1);
  const [dominantRatio, dominantCount] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!;

  const hashes = new Map<string, number>();
  for (const asset of assets) {
    const hash = asset.hash?.trim();
    if (hash) hashes.set(hash, (hashes.get(hash) ?? 0) + 1);
  }
  const duplicateCount = [...hashes.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
  const allDemo = assets.every((asset) => asset.demo === true);
  const mixed = counts.size > 1;
  const duplicateNote = duplicateCount > 0
    ? ` ${duplicateCount} repeated file${duplicateCount === 1 ? "" : "s"} detected; repeats may be intentional.`
    : "";

  if (allDemo) {
    return {
      level: "ready",
      label: `Live study · ${assets.length} slides`,
      detail: `The starter sequence is ${dominantRatio}. Your first real import replaces it automatically.${duplicateNote}`,
      dominantRatio,
      duplicateCount,
    };
  }

  if (!mixed) {
    return {
      level: duplicateCount > 0 ? "note" : "ready",
      label: `${dominantRatio} aligned`,
      detail: `${assets.length} source slide${assets.length === 1 ? "" : "s"} share one ratio.${duplicateNote}`,
      dominantRatio,
      duplicateCount,
    };
  }

  return {
    level: "note",
    label: "Mixed source ratios",
    detail: `${dominantCount}/${assets.length} slides are ${dominantRatio}. The global Cover setting may crop the rest; use Contain or normalize the source deck.${duplicateNote}`,
    dominantRatio,
    duplicateCount,
  };
}
