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
  checks: DeliveryCheck[];
}

export function buildDeliveryReceipt(settings: StudioSettings): DeliveryReceipt {
  const frameCount = Math.round(settings.output.duration * settings.output.fps);
  const megapixelsPerFrame = (settings.output.width * settings.output.height) / 1_000_000;
  const transparent = settings.stage.transparent || settings.background.style === "transparent";
  const audioConflict = settings.presenter.enabled
    && !settings.presenter.muted
    && settings.output.fps > 30;
  const largeSurface = megapixelsPerFrame > 12;

  const checks: DeliveryCheck[] = [
    {
      id: "timeline",
      level: "ready",
      label: `${frameCount} exact frames`,
      detail: `${settings.output.duration} s at ${settings.output.fps} fps. Frame n renders at n / fps.`,
    },
    settings.motion.seamless
      ? {
          id: "closure",
          level: "ready",
          label: `${settings.motion.seamlessLoops} closed loop${settings.motion.seamlessLoops === 1 ? "" : "s"}`,
          detail: "Track and atmosphere return to their opening state at the master boundary.",
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
  ];

  return { frameCount, megapixelsPerFrame, checks };
}
