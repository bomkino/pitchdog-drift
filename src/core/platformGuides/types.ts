export interface NormalizedRect {
  /** Left edge in stage space, where zero is the stage's left edge. */
  readonly x: number;
  /** Top edge in stage space, where zero is the stage's top edge. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface NormalizedBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface NormalizedInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type PlatformGuideStatus = "official" | "conservative-observed" | "custom";

export interface PlatformGuideProfile {
  readonly id: string;
  readonly label: string;
  /** Width divided by height, or null when the guide is aspect-agnostic. */
  readonly aspect: number | null;
  /** ISO calendar date for the source review represented by this profile. */
  readonly lastVerified: string;
  readonly sourceUrls: readonly string[];
  readonly obstructions: readonly NormalizedRect[];
  readonly safeInsets?: NormalizedInsets;
  readonly status: PlatformGuideStatus;
}

export type PlatformGuideProfileId =
  | "none"
  | "instagram-story"
  | "instagram-reel"
  | "instagram-combined"
  | "custom";

export type GuideOverlapSubject = "presenter" | "slide";

export interface PlatformGuideOverlap {
  readonly subject: GuideOverlapSubject;
  readonly subjectBounds: NormalizedBounds;
  readonly overlaps: boolean;
  /** Exact, non-overlapping intersections with the active obstruction union. */
  readonly intersections: readonly NormalizedRect[];
  readonly overlapArea: number;
  readonly subjectArea: number;
  /** Fraction of the subject footprint hidden by the guide, from zero to one. */
  readonly overlapRatio: number;
}

export interface PlatformGuideRegistry {
  readonly schemaVersion: 1;
  readonly profiles: Readonly<Record<PlatformGuideProfileId, PlatformGuideProfile>>;
}
