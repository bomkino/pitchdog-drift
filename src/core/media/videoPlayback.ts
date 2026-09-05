export interface SlideVideoPlayback {
  loop: boolean;
  trimStart: number;
  trimEnd: number | null;
  rate: number;
}
export const DEFAULT_SLIDE_VIDEO: Readonly<SlideVideoPlayback> = Object.freeze({ loop: true, trimStart: 0, trimEnd: null, rate: 1 });
export const MAX_VIDEO_SLIDES = 8;
export const MAX_VIDEO_SLIDE_PIXELS = 33_177_600; // Four UHD frames across the moving deck.

/** A clip owns one clock starting at master zero, shared by every repeated card. */
export function slideVideoTime(time: number, duration: number, playback: SlideVideoPlayback = DEFAULT_SLIDE_VIDEO): number {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) throw new TypeError("Invalid video clock.");
  const end = playback.trimEnd ?? duration;
  if (!Number.isFinite(playback.trimStart) || playback.trimStart < 0 || !Number.isFinite(end)
    || end > duration || end <= playback.trimStart || typeof playback.loop !== "boolean"
    || !Number.isFinite(playback.rate) || playback.rate < 0.1 || playback.rate > 4) {
    throw new TypeError("Invalid video trim or playback rate.");
  }
  const span = end - playback.trimStart;
  const elapsed = Math.max(0, time) * playback.rate;
  const local = playback.loop ? elapsed % span : Math.min(elapsed, Math.max(0, span - 1e-7));
  return playback.trimStart + local;
}

export function videoSlideBudget(assets: readonly { kind: string; width: number; height: number }[]): string | null {
  const videos = assets.filter((asset) => asset.kind === "video");
  if (videos.length > MAX_VIDEO_SLIDES) return `This build supports up to ${MAX_VIDEO_SLIDES} video slides, plus a presenter.`;
  if (videos.reduce((sum, asset) => sum + asset.width * asset.height, 0) > MAX_VIDEO_SLIDE_PIXELS) {
    return "Video slides exceed this build's decoded-pixel budget. Use smaller video sources; originals will not be recompressed automatically.";
  }
  return null;
}
