import type { StudioAsset, StudioSettings } from "./model";
import { assessDeckHealth } from "./deckHealth";
import { assessLegibility } from "./legibility";

export const OUTPUT_PRESET_IDS = ["reel", "feed", "square", "landscape", "cinema"] as const;
export type OutputPresetId = (typeof OUTPUT_PRESET_IDS)[number];

export interface OutputPreset {
  id: OutputPresetId;
  name: string;
  ratio: string;
  width: number;
  height: number;
  fps: StudioSettings["output"]["fps"];
  description: string;
}

export const OUTPUT_PRESETS: readonly OutputPreset[] = [
  { id: "reel", name: "Reel / Story", ratio: "9:16", width: 1080, height: 1920, fps: 30, description: "Full-height social master." },
  { id: "feed", name: "Portrait feed", ratio: "4:5", width: 1080, height: 1350, fps: 30, description: "Maximum feed presence without a story crop." },
  { id: "square", name: "Square feed", ratio: "1:1", width: 1080, height: 1080, fps: 30, description: "A compact, platform-neutral frame." },
  { id: "landscape", name: "Landscape", ratio: "16:9", width: 1920, height: 1080, fps: 30, description: "Deck-native widescreen output." },
  { id: "cinema", name: "Cinema strip", ratio: "2.39:1", width: 1920, height: 804, fps: 24, description: "A wide editorial master with 24 fps cadence." },
] as const;

export function getOutputPreset(id: OutputPresetId): OutputPreset {
  const preset = OUTPUT_PRESETS.find((entry) => entry.id === id);
  if (!preset) throw new Error(`Unknown output preset: ${id}`);
  return preset;
}

export function findOutputPreset(settings: StudioSettings): OutputPresetId | "custom" {
  return OUTPUT_PRESETS.find((preset) => (
    preset.width === settings.output.width
    && preset.height === settings.output.height
    && preset.fps === settings.output.fps
  ))?.id ?? "custom";
}

export function applyOutputPreset(settings: StudioSettings, id: OutputPresetId): StudioSettings {
  const preset = getOutputPreset(id);
  return {
    ...settings,
    stage: { ...settings.stage, width: preset.width, height: preset.height },
    output: { ...settings.output, width: preset.width, height: preset.height, fps: preset.fps },
  };
}

export type ReadinessStatus = "ready" | "warning" | "blocked" | "checking";

export interface ReadinessCheck {
  id: string;
  status: ReadinessStatus;
  label: string;
  detail: string;
}

export interface OutputReadiness {
  status: ReadinessStatus;
  checks: ReadinessCheck[];
  estimatedBytes: number;
  blockingReason: string | null;
}

interface ReadinessContext {
  slideCount: number;
  slides?: readonly StudioAsset[];
  pinnedAsset: StudioAsset | null;
  mp4Supported: boolean | null;
}

export function estimateMp4Bytes(settings: StudioSettings, includeAudio: boolean): number {
  const bitsPerSecond = settings.output.videoBitrate + (includeAudio ? settings.output.audioBitrate : 0);
  return Math.ceil(bitsPerSecond * settings.output.duration / 8);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const megabytes = bytes / 1_000_000;
  return `${megabytes >= 100 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
}

export function assessOutputReadiness(settings: StudioSettings, context: ReadinessContext): OutputReadiness {
  const transparent = settings.stage.transparent || settings.background.style === "transparent";
  const presenterVideo = settings.presenter.enabled && context.pinnedAsset?.kind === "video";
  const includeAudio = Boolean(presenterVideo && !settings.presenter.muted);
  const checks: ReadinessCheck[] = [];

  checks.push(context.slideCount > 0
    ? { id: "slides", status: "ready", label: `${context.slideCount} moving slide${context.slideCount === 1 ? "" : "s"}`, detail: "The moving track has renderable media." }
    : { id: "slides", status: "blocked", label: "No moving slides", detail: "Add at least one slide before exporting a master." });

  const deckHealth = context.slides && context.slides.length > 0
    ? assessDeckHealth(context.slides, settings)
    : null;
  if (deckHealth?.mixedRatios) {
    checks.push({ id: "deck-ratio", status: "warning", label: "Mixed slide ratios", detail: "The global slide frame will crop or letterbox sources differently. Review the full loop before publishing." });
  } else if (deckHealth?.frameRatioMismatch) {
    checks.push({ id: "deck-ratio", status: "warning", label: `Deck is ${deckHealth.ratioLabel}; frame is ${settings.slide.aspectWidth}:${settings.slide.aspectHeight}`, detail: "Use Match slide frame in Media, or keep the mismatch deliberately and inspect the crop at both edges of the loop." });
  } else if (deckHealth) {
    checks.push({ id: "deck-ratio", status: "ready", label: `${deckHealth.ratioLabel} slide frame aligned`, detail: "The source deck and the moving-frame aspect ratio agree." });
  }

  if (deckHealth?.lowResolutionCount) {
    checks.push({ id: "deck-resolution", status: "warning", label: `${deckHealth.lowResolutionCount} source slide${deckHealth.lowResolutionCount === 1 ? "" : "s"} may soften`, detail: "Those images need more than 15% enlargement at this master size. Use higher-resolution sources or a smaller publishing master for a crisper export." });
  } else if (deckHealth) {
    checks.push({ id: "deck-resolution", status: "ready", label: "Source resolution holds", detail: "No slide needs more than 15% enlargement at the current frame and output size." });
  }

  const legibility = assessLegibility(settings);
  checks.push({ id: "legibility", status: legibility.status === "clear" ? "ready" : "warning", label: `Readability pressure ${legibility.status}`, detail: legibility.detail });

  checks.push(transparent
    ? { id: "alpha", status: "blocked", label: "Transparent canvas", detail: "H.264 cannot retain alpha. Use PNG stills or a PNG sequence, or choose an opaque atmosphere." }
    : { id: "alpha", status: "ready", label: "Opaque H.264 canvas", detail: "The selected atmosphere can be encoded into an MP4 master." });

  if (context.mp4Supported === null) {
    checks.push({ id: "encoder", status: "checking", label: "Checking encoder", detail: "Drift is probing the requested size, frame rate, and codec path." });
  } else if (context.mp4Supported) {
    checks.push({ id: "encoder", status: "ready", label: "H.264 path available", detail: "The browser reports a compatible AVC encoder for this master." });
  } else {
    checks.push({ id: "encoder", status: "blocked", label: "H.264 unavailable", detail: "Use a current desktop Chromium runtime or export verified PNG frames." });
  }

  if (includeAudio && settings.output.fps > 30) {
    checks.push({ id: "audio", status: "blocked", label: "Presenter audio at 50/60 fps", detail: "Mute presenter audio or choose 24, 25, or 30 fps so the current AAC timing gate can verify sync." });
  } else if (includeAudio) {
    checks.push({ id: "audio", status: "ready", label: "Presenter audio included", detail: "AAC will be aligned and checked against the fixed-step picture timeline." });
  } else if (presenterVideo) {
    checks.push({ id: "audio", status: "ready", label: "Presenter video muted", detail: "The presenter remains visible without an audio timing dependency." });
  }

  checks.push(settings.motion.seamless
    ? { id: "loop", status: "ready", label: "Seamless lock on", detail: `${Math.max(1, Math.round(settings.motion.seamlessLoops))} complete loop${settings.motion.seamlessLoops === 1 ? "" : "s"} will close on the exact final frame.` }
    : { id: "loop", status: "warning", label: "Open-ended cut", detail: "The master is deterministic, but its final frame is not forced to meet its first." });

  const blocked = checks.find((check) => check.status === "blocked");
  const checking = checks.find((check) => check.status === "checking");
  const warning = checks.find((check) => check.status === "warning");
  return {
    status: blocked ? "blocked" : checking ? "checking" : warning ? "warning" : "ready",
    checks,
    estimatedBytes: estimateMp4Bytes(settings, includeAudio),
    blockingReason: blocked?.detail ?? null,
  };
}
