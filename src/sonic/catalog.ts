import type { SonicPalette } from "../model";

import cinematicDragStart from "./assets/cinematic/drag-start.ogg?inline";
import cinematicDrop from "./assets/cinematic/drop.ogg?inline";
import cinematicError from "./assets/cinematic/error.ogg?inline";
import cinematicPress from "./assets/cinematic/press.ogg?inline";
import cinematicSnap from "./assets/cinematic/snap.ogg?inline";
import cinematicSuccess from "./assets/cinematic/success.ogg?inline";
import cinematicSwipe from "./assets/cinematic/swipe.ogg?inline";
import studioDragStart from "./assets/studio/drag-start.ogg?inline";
import studioDrop from "./assets/studio/drop.ogg?inline";
import studioError from "./assets/studio/error.ogg?inline";
import studioPress from "./assets/studio/press.ogg?inline";
import studioSnap from "./assets/studio/snap.ogg?inline";
import studioSuccess from "./assets/studio/success.ogg?inline";
import studioSwipe from "./assets/studio/swipe.ogg?inline";
import zenDragStart from "./assets/zen/drag-start.ogg?inline";
import zenDrop from "./assets/zen/drop.ogg?inline";
import zenError from "./assets/zen/error.ogg?inline";
import zenPress from "./assets/zen/press.ogg?inline";
import zenSnap from "./assets/zen/snap.ogg?inline";
import zenSuccess from "./assets/zen/success.ogg?inline";
import zenSwipe from "./assets/zen/swipe.ogg?inline";

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
    description: "Warm editorial precision. Tactile, clipped, restrained.",
  },
  cinematic: {
    name: "Cinema",
    description: "Deeper passages and broader physical weight.",
  },
  paper: {
    name: "Paper",
    description: "Dry, soft-edged gestures for quieter compositions.",
  },
};

const CATALOG: Readonly<Record<SonicPalette, Readonly<Record<SonicCue, string>>>> = {
  studio: {
    passage: studioSwipe,
    grab: studioDragStart,
    release: studioDrop,
    settle: studioSnap,
    control: studioPress,
    success: studioSuccess,
    failure: studioError,
  },
  cinematic: {
    passage: cinematicSwipe,
    grab: cinematicDragStart,
    release: cinematicDrop,
    settle: cinematicSnap,
    control: cinematicPress,
    success: cinematicSuccess,
    failure: cinematicError,
  },
  paper: {
    passage: zenSwipe,
    grab: zenDragStart,
    release: zenDrop,
    settle: zenSnap,
    control: zenPress,
    success: zenSuccess,
    failure: zenError,
  },
};

export function getSonicAssetUri(palette: SonicPalette, cue: SonicCue): string {
  return CATALOG[palette][cue];
}

/**
 * Vite's `?inline` contract compiles these local OGG files into data URIs. A
 * non-inline value is rejected rather than fetched: Drift's production runtime
 * has no network path, including for its sound vocabulary.
 */
export function getSonicAssetBytes(palette: SonicPalette, cue: SonicCue): ArrayBuffer {
  const uri = getSonicAssetUri(palette, cue);
  const comma = uri.indexOf(",");
  if (!uri.startsWith("data:") || comma < 0) {
    throw new Error(`Sonic asset ${palette}/${cue} was not compiled inline.`);
  }

  const metadata = uri.slice(0, comma);
  const payload = uri.slice(comma + 1);
  if (metadata.endsWith(";base64")) {
    const decoded = atob(payload);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
    return bytes.buffer;
  }

  return new TextEncoder().encode(decodeURIComponent(payload)).buffer;
}
