import { DEFAULT_PROJECT_BUNDLE_LIMITS } from "./projectStore";

export interface SizedMedia {
  size: number;
}

export const PROJECT_MEDIA_LIMITS = Object.freeze({
  maxAssetBytes: DEFAULT_PROJECT_BUNDLE_LIMITS.maxAssetBytes,
  maxTotalBytes: DEFAULT_PROJECT_BUNDLE_LIMITS.maxTotalAssetBytes,
});

export interface ProjectMediaSelection<T> {
  accepted: T[];
  rejectedTooLarge: T[];
  rejectedForBudget: T[];
  rejectedForCount: T[];
  remainingBytes: number;
}

export function projectAssetBytes(assets: readonly { blob: SizedMedia }[]): number {
  return assets.reduce((total, asset) => total + asset.blob.size, 0);
}

export function selectProjectMediaWithinBudget<T extends SizedMedia>(
  candidates: readonly T[],
  existingBytes: number,
  availableSlots: number,
): ProjectMediaSelection<T> {
  if (!Number.isSafeInteger(existingBytes) || existingBytes < 0) {
    throw new TypeError("Existing project media bytes must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(availableSlots) || availableSlots < 0) {
    throw new TypeError("Available project media slots must be a non-negative safe integer.");
  }

  const accepted: T[] = [];
  const rejectedTooLarge: T[] = [];
  const rejectedForBudget: T[] = [];
  const rejectedForCount: T[] = [];
  let remainingBytes = Math.max(0, PROJECT_MEDIA_LIMITS.maxTotalBytes - existingBytes);

  for (const candidate of candidates) {
    if (!Number.isSafeInteger(candidate.size) || candidate.size <= 0) {
      rejectedTooLarge.push(candidate);
      continue;
    }
    if (candidate.size > PROJECT_MEDIA_LIMITS.maxAssetBytes) {
      rejectedTooLarge.push(candidate);
      continue;
    }
    if (accepted.length >= availableSlots) {
      rejectedForCount.push(candidate);
      continue;
    }
    if (candidate.size > remainingBytes) {
      rejectedForBudget.push(candidate);
      continue;
    }
    accepted.push(candidate);
    remainingBytes -= candidate.size;
  }

  return {
    accepted,
    rejectedTooLarge,
    rejectedForBudget,
    rejectedForCount,
    remainingBytes,
  };
}

export function projectMediaViolation(candidateBytes: number, existingBytes: number): string | null {
  if (!Number.isSafeInteger(candidateBytes) || candidateBytes <= 0) {
    return "Media must contain at least one readable byte.";
  }
  if (!Number.isSafeInteger(existingBytes) || existingBytes < 0) {
    return "Existing project media accounting is invalid.";
  }
  if (candidateBytes > PROJECT_MEDIA_LIMITS.maxAssetBytes) {
    return `One project media file may be at most ${formatProjectMiB(PROJECT_MEDIA_LIMITS.maxAssetBytes)}.`;
  }
  if (existingBytes + candidateBytes > PROJECT_MEDIA_LIMITS.maxTotalBytes) {
    return `This project may contain at most ${formatProjectMiB(PROJECT_MEDIA_LIMITS.maxTotalBytes)} of original media.`;
  }
  return null;
}

export function formatProjectMiB(bytes: number): string {
  const value = bytes / (1024 * 1024);
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} MiB`;
}
