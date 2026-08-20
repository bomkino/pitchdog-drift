export const COMPOSITION_GUIDE_MODES = ["off", "thirds", "title-safe", "social-safe"] as const;
export type CompositionGuideMode = (typeof COMPOSITION_GUIDE_MODES)[number];

export interface CompositionGuide {
  id: CompositionGuideMode;
  name: string;
  description: string;
}

export const COMPOSITION_GUIDES: readonly CompositionGuide[] = [
  { id: "off", name: "Guides off", description: "Unobstructed preview." },
  { id: "thirds", name: "Rule of thirds", description: "Two-by-two composition lines for balance and focal placement." },
  { id: "title-safe", name: "Title safe", description: "A conservative inner frame for essential type and faces." },
  { id: "social-safe", name: "Social UI safe", description: "A deliberately conservative guide for common vertical-interface overlays; verify in the publishing app." },
] as const;

export function getCompositionGuide(id: CompositionGuideMode): CompositionGuide {
  return COMPOSITION_GUIDES.find((guide) => guide.id === id) ?? COMPOSITION_GUIDES[0]!;
}

export function nextCompositionGuide(id: CompositionGuideMode): CompositionGuideMode {
  const index = COMPOSITION_GUIDE_MODES.indexOf(id);
  return COMPOSITION_GUIDE_MODES[(index + 1) % COMPOSITION_GUIDE_MODES.length]!;
}
