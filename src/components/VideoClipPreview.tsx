import { useEffect, useRef, useState } from "react";
import type { StudioAsset } from "../model";
import type { SlideVideoPlayback } from "../core/media/videoPlayback";
import { abortMedia, waitForVideo } from "../lib/mediaWork";

/** An on-demand source audition; it never edits the sequence or plays source audio. */
export function VideoClipPreview({ asset, playback, onAudition }: {
  asset: StudioAsset; playback: SlideVideoPlayback; onAudition: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [frames, setFrames] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const current = useRef(playback);
  current.current = playback;
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    const urls: string[] = [];
    const decoder = document.createElement("video");
    decoder.muted = true; decoder.preload = "auto"; decoder.playsInline = true;
    setFrames([]); setError(null);
    void (async () => {
      const loaded = waitForVideo(decoder, "loadeddata", abort.signal);
      decoder.src = asset.objectUrl;
      await loaded;
      const canvas = document.createElement("canvas");
      canvas.width = 160; canvas.height = Math.max(1, Math.round(160 * asset.height / asset.width));
      // Very tall media cannot turn a thumbnail into an enormous allocation.
      if (canvas.height > 160) { canvas.width = Math.max(1, Math.round(160 * asset.width / asset.height)); canvas.height = 160; }
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Clip thumbnails are unavailable.");
      for (let index = 0; index < 5; index++) {
        abortMedia(abort.signal);
        const time = Math.min(Math.max(0, asset.duration! - 0.001), asset.duration! * index / 4);
        if (Math.abs(decoder.currentTime - time) > 0.0001) {
          const sought = waitForVideo(decoder, "seeked", abort.signal);
          decoder.currentTime = time;
          await sought;
        }
        context.drawImage(decoder, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Clip thumbnail failed.")), "image/jpeg", 0.7));
        abortMedia(abort.signal);
        urls.push(URL.createObjectURL(blob));
      }
      setFrames([...urls]);
    })().catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Clip preview failed."); })
      .finally(() => { decoder.removeAttribute("src"); decoder.load(); });
    return () => { abort.abort(); decoder.pause(); decoder.removeAttribute("src"); decoder.load(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [asset.id, asset.objectUrl, asset.duration, asset.width, asset.height, open]);
  useEffect(() => {
    const video = preview.current;
    if (!open || !video) return;
    let frameCallback: number | null = null;
    const enforceRange = () => {
      // Native controls may scrub outside the trim for inspection while paused.
      // Range enforcement belongs only to source audition playback.
      if (video.paused || video.seeking) return;
      const settings = current.current;
      const end = settings.trimEnd ?? asset.duration!;
      if (video.currentTime < settings.trimStart || video.currentTime >= end - 0.001) {
        if (settings.loop) video.currentTime = settings.trimStart;
        else {
          video.pause();
          const last = Math.max(settings.trimStart, end - 0.001);
          if (Math.abs(video.currentTime - last) > 0.001) video.currentTime = last;
        }
      }
    };
    const watchFrame = () => {
      frameCallback = null;
      enforceRange();
      if (!video.paused && typeof video.requestVideoFrameCallback === "function") frameCallback = video.requestVideoFrameCallback(watchFrame);
    };
    const play = () => {
      const settings = current.current;
      const end = settings.trimEnd ?? asset.duration!;
      if (video.currentTime < settings.trimStart || video.currentTime >= end - 0.001) video.currentTime = settings.trimStart;
      if (frameCallback === null && typeof video.requestVideoFrameCallback === "function") frameCallback = video.requestVideoFrameCallback(watchFrame);
    };
    const pause = () => { if (frameCallback !== null) video.cancelVideoFrameCallback(frameCallback); frameCallback = null; };
    const ended = () => {
      if (!current.current.loop || document.hidden) return;
      video.currentTime = current.current.trimStart;
      void video.play().catch(() => undefined);
    };
    const hide = () => { if (document.hidden) video.pause(); };
    video.addEventListener("timeupdate", enforceRange);
    video.addEventListener("play", play);
    video.addEventListener("pause", pause);
    video.addEventListener("ended", ended);
    document.addEventListener("visibilitychange", hide);
    return () => {
      pause(); video.pause();
      video.removeEventListener("timeupdate", enforceRange);
      video.removeEventListener("play", play);
      video.removeEventListener("pause", pause);
      video.removeEventListener("ended", ended);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [asset.duration, open]);
  useEffect(() => {
    const video = preview.current;
    if (!video || !open) return;
    video.playbackRate = playback.rate;
    if (video.readyState >= 1) video.currentTime = playback.trimStart;
  }, [playback.trimStart, playback.trimEnd, playback.rate, open]);
  return <details className="clip-source-preview" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Preview source clip</summary>
    {open ? <>
      <video ref={preview} src={asset.objectUrl} controls muted playsInline preload="metadata"
        aria-label={`Source preview: ${asset.name}`} onPlay={onAudition}
        onLoadedMetadata={event => { event.currentTarget.currentTime = playback.trimStart; event.currentTarget.playbackRate = playback.rate; }} />
      <div className="clip-filmstrip" aria-label="Source filmstrip">
        {frames.map((url, index) => <button type="button" key={url} aria-label={`Seek source to ${(asset.duration! * index / 4).toFixed(2)} seconds`}
          onClick={() => { if (preview.current) { preview.current.pause(); preview.current.currentTime = Math.min(asset.duration! - 0.001, asset.duration! * index / 4); } }}><img src={url} alt="" /></button>)}
        {!frames.length && !error ? <span role="status">Loading source frames…</span> : null}
      </div>
      <p className="clip-timing">{playback.trimStart.toFixed(2)}–{(playback.trimEnd ?? asset.duration!).toFixed(2)} s · {playback.rate}× · {playback.loop ? "Loop" : "Hold last frame"}</p>
      {error ? <p role="alert">{error}</p> : null}
    </> : null}
  </details>;
}
