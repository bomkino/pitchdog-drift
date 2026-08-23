import {
  obstructionRectsFromInsets,
  unionNormalizedRects,
  validateNormalizedInsets,
} from "./geometry";
import type {
  NormalizedInsets,
  PlatformGuideProfile,
  PlatformGuideProfileId,
  PlatformGuideRegistry,
} from "./types";

export const PLATFORM_GUIDE_REGISTRY_VERSION = 1 as const;
export const PLATFORM_GUIDE_LAST_VERIFIED = "2026-08-23";
export const INSTAGRAM_PORTRAIT_ASPECT = 9 / 16;

export const META_STORY_SAFE_AREA_URL =
  "https://www.facebook.com/help/instagram/192168966243613";
export const META_REELS_CREATIVE_GUIDANCE_URL =
  "https://www.facebook.com/business/ads/facebook-instagram-reels-ads";
export const META_SOCIAL_BEST_PRACTICES_PDF_URL =
  "https://communityforums.atmeta.com/t5/s/hucou38897/attachments/hucou38897/General_Development_Discussion/538/1/GTMA_Unfold_Social_Best_Practices-1.pdf";

export const INSTAGRAM_STORY_SAFE_INSETS: NormalizedInsets = Object.freeze({
  top: 0.14,
  right: 0,
  bottom: 0.20,
  left: 0,
});

/**
 * Conservative screenshot-observed app chrome, not a permanent Meta promise.
 * The top/header, right action rail, and lower caption/audio tray intentionally
 * remain separate authored facts so a later dated source review is a small diff.
 */
export const INSTAGRAM_REEL_SAFE_INSETS: NormalizedInsets = Object.freeze({
  top: 0.10,
  right: 0.18,
  bottom: 0.22,
  left: 0,
});

const INSTAGRAM_REEL_OBSTRUCTIONS = unionNormalizedRects([
  { x: 0, y: 0, width: 1, height: INSTAGRAM_REEL_SAFE_INSETS.top },
  {
    x: 1 - INSTAGRAM_REEL_SAFE_INSETS.right,
    y: INSTAGRAM_REEL_SAFE_INSETS.top,
    width: INSTAGRAM_REEL_SAFE_INSETS.right,
    height: 1 - INSTAGRAM_REEL_SAFE_INSETS.top - INSTAGRAM_REEL_SAFE_INSETS.bottom,
  },
  {
    x: 0,
    y: 1 - INSTAGRAM_REEL_SAFE_INSETS.bottom,
    width: 1,
    height: INSTAGRAM_REEL_SAFE_INSETS.bottom,
  },
]);

function freezeProfile(profile: PlatformGuideProfile): PlatformGuideProfile {
  return Object.freeze({
    ...profile,
    sourceUrls: Object.freeze([...profile.sourceUrls]),
    obstructions: unionNormalizedRects(profile.obstructions),
    safeInsets: profile.safeInsets
      ? validateNormalizedInsets(profile.safeInsets, `${profile.id}.safeInsets`)
      : undefined,
  });
}

const NONE = freezeProfile({
  id: "none",
  label: "None",
  aspect: null,
  lastVerified: PLATFORM_GUIDE_LAST_VERIFIED,
  sourceUrls: [],
  obstructions: [],
  status: "custom",
});

const INSTAGRAM_STORY = freezeProfile({
  id: "instagram-story",
  label: "Instagram Story",
  aspect: INSTAGRAM_PORTRAIT_ASPECT,
  lastVerified: PLATFORM_GUIDE_LAST_VERIFIED,
  sourceUrls: [META_STORY_SAFE_AREA_URL, META_SOCIAL_BEST_PRACTICES_PDF_URL],
  obstructions: obstructionRectsFromInsets(INSTAGRAM_STORY_SAFE_INSETS),
  safeInsets: INSTAGRAM_STORY_SAFE_INSETS,
  status: "official",
});

const INSTAGRAM_REEL = freezeProfile({
  id: "instagram-reel",
  label: "Instagram Reel",
  aspect: INSTAGRAM_PORTRAIT_ASPECT,
  lastVerified: PLATFORM_GUIDE_LAST_VERIFIED,
  sourceUrls: [META_REELS_CREATIVE_GUIDANCE_URL, META_SOCIAL_BEST_PRACTICES_PDF_URL],
  obstructions: INSTAGRAM_REEL_OBSTRUCTIONS,
  safeInsets: INSTAGRAM_REEL_SAFE_INSETS,
  status: "conservative-observed",
});

const INSTAGRAM_COMBINED_SAFE_INSETS: NormalizedInsets = Object.freeze({
  top: Math.max(INSTAGRAM_STORY_SAFE_INSETS.top, INSTAGRAM_REEL_SAFE_INSETS.top),
  right: Math.max(INSTAGRAM_STORY_SAFE_INSETS.right, INSTAGRAM_REEL_SAFE_INSETS.right),
  bottom: Math.max(INSTAGRAM_STORY_SAFE_INSETS.bottom, INSTAGRAM_REEL_SAFE_INSETS.bottom),
  left: Math.max(INSTAGRAM_STORY_SAFE_INSETS.left, INSTAGRAM_REEL_SAFE_INSETS.left),
});

const INSTAGRAM_COMBINED = freezeProfile({
  id: "instagram-combined",
  label: "Instagram Story + Reel",
  aspect: INSTAGRAM_PORTRAIT_ASPECT,
  lastVerified: PLATFORM_GUIDE_LAST_VERIFIED,
  sourceUrls: [
    META_STORY_SAFE_AREA_URL,
    META_REELS_CREATIVE_GUIDANCE_URL,
    META_SOCIAL_BEST_PRACTICES_PDF_URL,
  ],
  obstructions: unionNormalizedRects([
    ...INSTAGRAM_STORY.obstructions,
    ...INSTAGRAM_REEL.obstructions,
  ]),
  safeInsets: INSTAGRAM_COMBINED_SAFE_INSETS,
  status: "conservative-observed",
});

const CUSTOM = freezeProfile({
  id: "custom",
  label: "Custom",
  aspect: null,
  lastVerified: PLATFORM_GUIDE_LAST_VERIFIED,
  sourceUrls: [],
  obstructions: [],
  safeInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  status: "custom",
});

export const PLATFORM_GUIDE_PROFILE_ORDER: readonly PlatformGuideProfileId[] = Object.freeze([
  "none",
  "instagram-story",
  "instagram-reel",
  "instagram-combined",
  "custom",
]);

export const PLATFORM_GUIDE_REGISTRY: PlatformGuideRegistry = Object.freeze({
  schemaVersion: PLATFORM_GUIDE_REGISTRY_VERSION,
  profiles: Object.freeze({
    none: NONE,
    "instagram-story": INSTAGRAM_STORY,
    "instagram-reel": INSTAGRAM_REEL,
    "instagram-combined": INSTAGRAM_COMBINED,
    custom: CUSTOM,
  }),
});

export function getPlatformGuideProfile(id: PlatformGuideProfileId): PlatformGuideProfile {
  return PLATFORM_GUIDE_REGISTRY.profiles[id];
}

/** Builds the session-authored custom profile without mutating the registry template. */
export function createCustomPlatformGuide(insets: NormalizedInsets): PlatformGuideProfile {
  const safeInsets = validateNormalizedInsets(insets, "custom.safeInsets");
  return freezeProfile({
    ...CUSTOM,
    safeInsets,
    obstructions: obstructionRectsFromInsets(safeInsets),
  });
}
