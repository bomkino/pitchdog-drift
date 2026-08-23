import treatmentLedger from "./assets/treatments.json";
import { loadEmbeddedRecordingBase64 } from "./embeddedRecordings";

export type SonicPalette = "studio" | "cinematic" | "paper";

export type SonicCue =
  | "passage"
  | "air"
  | "contact"
  | "grab"
  | "release"
  | "settle"
  | "control"
  | "success"
  | "failure";

export const SONIC_CUES: readonly SonicCue[] = [
  "passage",
  "air",
  "contact",
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
    name: "Editorial",
    description: "Cards, cloth, paper grain and close contact. Dry visual-journalism tactility.",
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

export interface SonicAssetSpec {
  /** Build-hashed, same-origin URL for the untouched committed CC0 file. */
  uri: string;
  /** Human-readable source filename for diagnostics and treatment receipts. */
  name: string;
  /** Non-destructive source offset in seconds. */
  trimStart: number;
  /** Non-destructive dead-tail removal in seconds. */
  trimEnd: number;
  /** Auditable level compensation in decibels. */
  gainDb: number;
  /** Linear compensation before the cue-family and master gains. */
  gain: number;
}

type SonicAssetVariants = readonly [SonicAssetSpec, ...SonicAssetSpec[]];

function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

interface SonicTreatmentRecord {
  name: string;
  trimStart: number;
  trimEnd: number;
  gainDb: number;
}

const TREATMENTS = new Map<string, SonicTreatmentRecord>(
  treatmentLedger.assets.map((treatment) => [treatment.name, treatment]),
);

function recording(name: string): SonicAssetSpec {
  const treatment = TREATMENTS.get(name);
  if (!treatment) {
    throw new Error(`Missing tactile treatment metadata for ${name}.`);
  }
  return Object.freeze({
    uri: `embedded:${name}`,
    name,
    trimStart: treatment.trimStart,
    trimEnd: treatment.trimEnd,
    gainDb: treatment.gainDb,
    gain: dbToGain(treatment.gainDb),
  });
}

/**
 * Editorial treatments are intentionally metadata, not destructive edits.
 * The committed WAVs therefore continue to match their pinned upstream hashes.
 * Values are measured against the committed PCM: active event energy is held
 * within a narrow range and meaningful sound begins promptly without erasing
 * the physical attack. The machine-readable ledger is enforced during build.
 */
const ASSETS = {
  bookClose: recording("book-close.wav"),
  bookFlip1: recording("book-flip-1.wav"),
  bookFlip2: recording("book-flip-2.wav"),
  bookPlace1: recording("book-place-1.wav"),
  bookPlace3: recording("book-place-3.wav"),
  cardPlace2: recording("card-place-2.wav"),
  cardPlace3: recording("card-place-3.wav"),
  cardShove1: recording("card-shove-1.wav"),
  cardShove2: recording("card-shove-2.wav"),
  cardSlide1: recording("card-slide-1.wav"),
  cardSlide2: recording("card-slide-2.wav"),
  cloth2: recording("cloth-2.wav"),
  cloth4: recording("cloth-4.wav"),
  genericImpact1: recording("generic-impact-1.wav"),
  genericImpact2: recording("generic-impact-2.wav"),
  leatherDrop: recording("leather-drop.wav"),
  leatherHandle1: recording("leather-handle-1.wav"),
  leatherHandle2: recording("leather-handle-2.wav"),
  metalClick: recording("metal-click.wav"),
  metalLatch: recording("metal-latch.wav"),
  softImpact1: recording("soft-impact-1.wav"),
  softImpact2: recording("soft-impact-2.wav"),
  woodImpact1: recording("wood-impact-1.wav"),
} as const;

const CATALOG: Readonly<Record<
  SonicPalette,
  Readonly<Record<SonicCue, SonicAssetVariants>>
>> = {
  studio: {
    passage: [ASSETS.cardSlide1, ASSETS.cardSlide2, ASSETS.bookFlip1],
    air: [ASSETS.cloth2, ASSETS.cloth4, ASSETS.leatherHandle1],
    contact: [ASSETS.metalClick, ASSETS.cardPlace2, ASSETS.bookClose],
    grab: [ASSETS.leatherHandle1, ASSETS.leatherHandle2],
    release: [ASSETS.cardPlace2, ASSETS.cardPlace3],
    settle: [ASSETS.softImpact1, ASSETS.softImpact2],
    control: [ASSETS.metalClick, ASSETS.bookClose],
    success: [ASSETS.bookPlace1, ASSETS.cardPlace3],
    failure: [ASSETS.leatherDrop],
  },
  cinematic: {
    passage: [ASSETS.cardShove1, ASSETS.cardShove2],
    air: [ASSETS.cloth2, ASSETS.leatherHandle2, ASSETS.cardSlide1],
    contact: [ASSETS.metalClick, ASSETS.metalLatch, ASSETS.woodImpact1],
    grab: [ASSETS.metalLatch, ASSETS.leatherHandle2],
    release: [ASSETS.woodImpact1, ASSETS.genericImpact2],
    settle: [ASSETS.genericImpact1, ASSETS.softImpact2],
    control: [ASSETS.metalLatch, ASSETS.metalClick],
    success: [ASSETS.cardPlace3, ASSETS.bookPlace1],
    failure: [ASSETS.leatherDrop, ASSETS.genericImpact2],
  },
  paper: {
    passage: [ASSETS.bookFlip1, ASSETS.cardSlide2, ASSETS.cloth2],
    air: [ASSETS.cloth2, ASSETS.cloth4, ASSETS.bookFlip1],
    contact: [ASSETS.bookClose, ASSETS.cardPlace2, ASSETS.metalClick],
    grab: [ASSETS.cloth4, ASSETS.leatherHandle1],
    release: [ASSETS.bookFlip2, ASSETS.bookPlace3],
    settle: [ASSETS.bookPlace1, ASSETS.softImpact1],
    control: [ASSETS.bookClose, ASSETS.metalClick],
    success: [ASSETS.bookPlace3, ASSETS.bookPlace1],
    failure: [ASSETS.leatherDrop],
  },
};

const byteLoads = new Map<string, Promise<ArrayBuffer>>();

function variantIndex(length: number, variant: number): number {
  if (!Number.isFinite(variant) || length <= 1) return 0;
  return ((Math.trunc(variant) % length) + length) % length;
}

export function getSonicAssetVariantCount(
  palette: SonicPalette,
  cue: SonicCue,
): number {
  return CATALOG[palette][cue].length;
}

export function getSonicAssetSpec(
  palette: SonicPalette,
  cue: SonicCue,
  variant = 0,
): SonicAssetSpec {
  const variants = CATALOG[palette][cue];
  return variants[variantIndex(variants.length, variant)]!;
}

export function getSonicAssetUri(
  palette: SonicPalette,
  cue: SonicCue,
  variant = 0,
): string {
  return getSonicAssetSpec(palette, cue, variant).uri;
}


function cancelledAssetLoad(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException("Tactile asset loading was cancelled.", "AbortError");
}

async function awaitAssetLoad(
  load: Promise<ArrayBuffer>,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  if (!signal) return await load;
  if (signal.aborted) throw cancelledAssetLoad(signal);
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(cancelledAssetLoad(signal));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    void load.then(
      (bytes) => {
        cleanup();
        resolve(bytes);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
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
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const uri = getSonicAssetUri(palette, cue, variant);
  if (uri.startsWith("embedded:")) {
    const encoded = (await loadEmbeddedRecordingBase64(uri.slice("embedded:".length))).replace(/\s+/g, "");
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  }
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

  const bytes = await awaitAssetLoad(load, signal);
  return bytes.slice(0);
}
