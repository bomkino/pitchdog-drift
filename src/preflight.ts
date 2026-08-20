import type { StudioSettings } from "./model";

export type DeliveryCheckLevel = "ready" | "note" | "warning";

export interface DeliveryCheck {
  id: string;
  level: DeliveryCheckLevel;
  label: string;
  detail: string;
}

export interface DeliveryReceipt {
  frameCount: number;
  megapixelsPerFrame: number;
  sourceSlideCount: number;
  effectiveSlidesPerSecond: number;
  estimatedMp4Bytes: number;
  checks: DeliveryCheck[];
}

export function effectiveSlidesPerSecond(
  settings: StudioSettings,
  sourceSlideCount: number,
): number {
  if (!settings.motion.autoplay) return 0;
  if (settings.motion.seamless && sourceSlideCount > 0) {
    return sourceSlideCount
      * Math.max(1, Math.round(settings.motion.seamlessLoops))
      / Math.max(0.001, settings.output.duration);
  }
  return settings.motion.speed;
}

export function estimateMp4Bytes(settings: StudioSettings): number {
  const audio = settings.presenter.enabled && !settings.presenter.muted
    ? settings.output.audioBitrate
    : 0;
  return Math.ceil(settings.output.duration * (settings.output.videoBitrate + audio) / 8);
}

export function buildDeliveryReceipt(
  settings: StudioSettings,
  sourceSlideCount = 0,
): DeliveryReceipt {
  const frameCount = Math.round(settings.output.duration * settings.output.fps);
  const megapixelsPerFrame = (settings.output.width * settings.output.height) / 1_000_000;
  const transparent = settings.stage.transparent || settings.background.style === "transparent";
  const audioConflict = settings.presenter.enabled
    && !settings.presenter.muted
    && settings.output.fps > 30;
  const largeSurface = megapixelsPerFrame > 12;
  const pace = effectiveSlidesPerSecond(settings, sourceSlideCount);
  const estimatedMp4Bytes = estimateMp4Bytes(settings);

  const checks: DeliveryCheck[] = [
    {
      id: "timeline",
      level: "ready",
      label: `${frameCount} exact frames`,
      detail: `${settings.output.duration} s at ${settings.output.fps} fps. Frame n renders at n / fps.`,
    },
    !settings.motion.autoplay
      ? {
          id: "pace",
          level: "note",
          label: "Moving slides held",
          detail: "The deck stays on its opening composition. Background atmosphere and pinned presenter media may still move.",
        }
      : {
          id: "pace",
          level: "ready",
          label: `${pace.toFixed(2)} slides/s`,
          detail: settings.motion.seamless
            ? `${sourceSlideCount} authored slide${sourceSlideCount === 1 ? "" : "s"} × ${settings.motion.seamlessLoops} complete cycle${settings.motion.seamlessLoops === 1 ? "" : "s"} across ${settings.output.duration} s.`
            : "Free-run pace comes directly from the Speed control.",
        },
    settings.motion.seamless
      ? {
          id: "closure",
          level: sourceSlideCount > 0 ? "ready" : "note",
          label: `${settings.motion.seamlessLoops} closed loop${settings.motion.seamlessLoops === 1 ? "" : "s"}`,
          detail: sourceSlideCount > 0
            ? "Only authored source slides count. Invisible renderer-padding copies are ignored."
            : "Closure is armed, but there are no authored moving slides yet.",
        }
      : {
          id: "closure",
          level: "note",
          label: "Free-running cut",
          detail: "The master may end between slides. Turn on complete-loop mode when the ending must close cleanly.",
        },
    transparent
      ? {
          id: "alpha",
          level: "note",
          label: "Alpha needs PNG",
          detail: "The preview is transparent. MP4 remains opaque; use the PNG still or sequence for compositing.",
        }
      : {
          id: "alpha",
          level: "ready",
          label: "Opaque master",
          detail: "Every exported pixel receives a background before H.264 encoding.",
        },
    audioConflict
      ? {
          id: "audio",
          level: "warning",
          label: "Presenter audio conflicts with frame rate",
          detail: "Mute the presenter or choose 24, 25, or 30 fps. Export will refuse to silently desynchronise audio.",
        }
      : {
          id: "audio",
          level: "ready",
          label: settings.presenter.enabled ? "Presenter path is coherent" : "No presenter dependency",
          detail: settings.presenter.enabled
            ? "Pinned media remains outside moving-track optics and is checked again at export."
            : "The moving deck can export without a video or audio decode path.",
        },
    largeSurface
      ? {
          id: "surface",
          level: "warning",
          label: `${megapixelsPerFrame.toFixed(1)} MP per frame`,
          detail: "This is a heavy surface. GPU and encoder limits are still checked before any file is written.",
        }
      : {
          id: "surface",
          level: "ready",
          label: `${megapixelsPerFrame.toFixed(1)} MP per frame`,
          detail: `${settings.output.width} × ${settings.output.height} stays within the normal social-master range.`,
        },
    {
      id: "size",
      level: "note",
      label: `About ${(estimatedMp4Bytes / 1_000_000).toFixed(1)} MB`,
      detail: "Estimate from selected duration and fixed video/audio bitrates. Container overhead and encoder behaviour can move the final size slightly.",
    },
  ];

  return {
    frameCount,
    megapixelsPerFrame,
    sourceSlideCount,
    effectiveSlidesPerSecond: pace,
    estimatedMp4Bytes,
    checks,
  };
}
