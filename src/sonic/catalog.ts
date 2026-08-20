import type { SonicPalette } from "../model";

import bookClose from "./assets/recordings/book-close.wav?no-inline";
import bookFlip1 from "./assets/recordings/book-flip-1.wav?no-inline";
import bookFlip2 from "./assets/recordings/book-flip-2.wav?no-inline";
import bookPlace1 from "./assets/recordings/book-place-1.wav?no-inline";
import bookPlace3 from "./assets/recordings/book-place-3.wav?no-inline";
import cardPlace2 from "./assets/recordings/card-place-2.wav?no-inline";
import cardPlace3 from "./assets/recordings/card-place-3.wav?no-inline";
import cardShove1 from "./assets/recordings/card-shove-1.wav?no-inline";
import cardShove2 from "./assets/recordings/card-shove-2.wav?no-inline";
import cardSlide1 from "./assets/recordings/card-slide-1.wav?no-inline";
import cardSlide2 from "./assets/recordings/card-slide-2.wav?no-inline";
import cloth2 from "./assets/recordings/cloth-2.wav?no-inline";
import cloth4 from "./assets/recordings/cloth-4.wav?no-inline";
import genericImpact1 from "./assets/recordings/generic-impact-1.wav?no-inline";
import genericImpact2 from "./assets/recordings/generic-impact-2.wav?no-inline";
import leatherDrop from "./assets/recordings/leather-drop.wav?no-inline";
import leatherHandle1 from "./assets/recordings/leather-handle-1.wav?no-inline";
import leatherHandle2 from "./assets/recordings/leather-handle-2.wav?no-inline";
import metalClick from "./assets/recordings/metal-click.wav?no-inline";
import metalLatch from "./assets/recordings/metal-latch.wav?no-inline";
import softImpact1 from "./assets/recordings/soft-impact-1.wav?no-inline";
import softImpact2 from "./assets/recordings/soft-impact-2.wav?no-inline";
import woodImpact1 from "./assets/recordings/wood-impact-1.wav?no-inline";

export type SonicCue =
  | "passage"
  | "grab"
  | "release"
  | "settle"
  | "control"
  | "success"
  | "failure";

export const SONIC_CUES: readonly SonicCue[] = [
  "passage",
  "grab",
  "release",
  "settle",
  "control",
  "success",
  "failure",
] as const;

export const SONIC_PALETTE_LABELS: Readonly<Record<SonicPalette, Readonly<{
  name: string;
  description: string;
}>>> = {
  studio: {
    name: "Studio",
    description: "Cards, leather, paper and soft landings. Dry editorial precision.",
  },
  cinematic: {
    name: "Cinema",
    description: "Card shoves, wood, metal and restrained physical weight.",
  },
  paper: {
    name: "Paper",
    description: "Page turns, cloth and book movement for quieter compositions.",
  },
};

type SonicAssetVariants = readonly [string, ...string[]];

const CATALOG: Readonly<Record<
  SonicPalette,
  Readonly<Record<SonicCue, SonicAssetVariants>>
>> = {
  studio: {
    passage: [cardSlide1, cardSlide2, bookFlip1],
    grab: [leatherHandle1, leatherHandle2],
    release: [cardPlace2, cardPlace3],
    settle: [softImpact1, softImpact2],
    control: [metalClick, bookClose],
    success: [bookPlace1, cardPlace3],
    failure: [leatherDrop],
  },
  cinematic: {
    passage: [cardShove1, cardShove2],
    grab: [metalLatch, leatherHandle2],
    release: [woodImpact1, genericImpact2],
    settle: [genericImpact1, softImpact2],
    control: [metalLatch, metalClick],
    success: [cardPlace3, bookPlace1],
    failure: [leatherDrop, genericImpact2],
  },
  paper: {
    passage: [bookFlip1, bookFlip2, cardSlide2],
    grab: [cloth2, leatherHandle1],
    release: [cloth4, bookPlace3],
    settle: [bookPlace1, softImpact1],
    control: [bookClose, metalClick],
    success: [bookPlace3, bookPlace1],
    failure: [leatherDrop],
  },
};

const byteLoads = new Map<string, Promise<ArrayBuffer>>();

function variantIndex(length: number, variant: number): number {
  if (!Number.isFinite(variant) || length <= 1) return 0;
  return ((Math.trunc(variant) % length) + length) % length;
}

export function getSonicAssetVariantCount(palette: SonicPalette, cue: SonicCue): number {
  return CATALOG[palette][cue].length;
}

export function getSonicAssetUri(
  palette: SonicPalette,
  cue: SonicCue,
  variant = 0,
): string {
  const variants = CATALOG[palette][cue];
  return variants[variantIndex(variants.length, variant)]!;
}

/**
 * Loads a committed, build-hashed WAV from Drift's own origin. Bytes are
 * cached once per asset, but each caller receives a copy because Web Audio
 * implementations may detach an ArrayBuffer while decoding it.
 */
export async function getSonicAssetBytes(
  palette: SonicPalette,
  cue: SonicCue,
  variant = 0,
): Promise<ArrayBuffer> {
  const uri = getSonicAssetUri(palette, cue, variant);
  let load = byteLoads.get(uri);
  if (!load) {
    load = fetch(uri, {
      cache: "force-cache",
      credentials: "same-origin",
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Tactile asset ${palette}/${cue}/${variant} returned HTTP ${response.status}.`,
        );
      }
      return await response.arrayBuffer();
    });
    byteLoads.set(uri, load);
    void load.catch(() => {
      if (byteLoads.get(uri) === load) byteLoads.delete(uri);
    });
  }

  const bytes = await load;
  return bytes.slice(0);
}
