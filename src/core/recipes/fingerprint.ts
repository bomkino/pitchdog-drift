import type { RecipeReference } from "../project/schema";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

/**
 * Stable, non-security identity for authored recipe state. Project and asset
 * integrity continue to use SHA-256; this compact fingerprint exists to detect
 * recipe drift and truthful Custom state without asynchronous hashing.
 */
export function recipeFingerprint(namespace: string, version: number, value: unknown): string {
  const input = `${namespace}@${version}:${canonical(value)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${namespace}@${version}:fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function recipeReference(id: string, version: number, value: unknown): RecipeReference {
  return {
    id,
    version,
    fingerprint: recipeFingerprint(id, version, value),
  };
}
