import type { StudioAsset } from "../model";

export type ExportArtifactKind = "master" | "still" | "frames" | "project" | "recovery";

const GENERIC_STEMS = new Set([
  "deck",
  "drift-study",
  "export",
  "frame",
  "frames",
  "image",
  "images",
  "img",
  "page",
  "pages",
  "presentation",
  "slide",
  "slides",
  "untitled",
]);

function withoutExtension(name: string): string {
  const leaf = name.replace(/\\/gu, "/").split("/").at(-1) ?? name;
  const dot = leaf.lastIndexOf(".");
  return dot > 0 ? leaf.slice(0, dot) : leaf;
}

function withoutSequenceSuffix(value: string): string {
  return value
    .replace(/(?:[-_\s]+(?:slide|page|frame|screen|artboard))?[-_\s]*\d+$/iu, "")
    .replace(/[-_\s]+$/gu, "");
}

function safeStem(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-+/gu, "-")
    .toLowerCase()
    .slice(0, 56)
    .replace(/-+$/gu, "");
}

export function deckStem(
  assets: readonly Pick<StudioAsset, "name" | "demo">[],
): string {
  const candidates = assets
    .filter((asset) => asset.demo !== true)
    .map((asset) => safeStem(withoutSequenceSuffix(withoutExtension(asset.name))))
    .filter(Boolean);
  if (!candidates.length) return "drift";

  const counts = new Map<string, number>();
  for (const candidate of candidates) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  const ranked = [...counts.entries()]
    .filter(([candidate]) => !GENERIC_STEMS.has(candidate))
    .sort((a, b) => b[1] - a[1] || candidates.indexOf(a[0]) - candidates.indexOf(b[0]));
  return ranked[0]?.[0] ?? (GENERIC_STEMS.has(candidates[0]!) ? "drift" : candidates[0]!);
}

export function timestampSlug(date = new Date()): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/u, "Z")
    .replace(/:/gu, "-");
}

export function exportFileName(
  kind: ExportArtifactKind,
  extension: string,
  assets: readonly Pick<StudioAsset, "name" | "demo">[],
  date = new Date(),
): string {
  const suffix = extension.replace(/^\.+/u, "").toLowerCase();
  return `${deckStem(assets)}-${kind}-${timestampSlug(date)}.${suffix}`;
}

export function framePrefixForAssets(
  assets: readonly Pick<StudioAsset, "name" | "demo">[],
): string {
  return `${deckStem(assets)}-frame`;
}
