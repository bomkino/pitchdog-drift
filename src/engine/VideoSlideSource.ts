import * as THREE from "three";
import { Input, BlobSource, ALL_FORMATS, VideoSampleSink, type VideoSample } from "mediabunny";
import type { StudioAsset } from "../model";
import { DEFAULT_SLIDE_VIDEO, slideVideoTime, type SlideVideoPlayback } from "../core/media/videoPlayback";
import { SequentialSamples } from "../core/media/sequentialSamples";
import { abortMedia, runMediaTask, waitForVideo } from "../lib/mediaWork";

/** One source clock per clip; repeated cards share it without duplicating decoders. */
export class VideoSlideSource {
  readonly texture: THREE.Texture;
  readonly source: HTMLVideoElement | HTMLCanvasElement;
  private input: Input | null = null;
  private samples: SequentialSamples<VideoSample> | null = null;
  private start = 0;
  private end = Infinity;
  private disposed = false;
  private playPending = false;
  private shouldPlay = false;
  private previousTarget: number | null = null;
  private readonly lifetime = new AbortController();

  private constructor(private asset: StudioAsset, readonly exportMode: boolean, edge: number, private invalidate: () => void) {
    if (exportMode) {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, edge / Math.max(asset.width, asset.height));
      canvas.width = Math.max(1, Math.round(asset.width * scale));
      canvas.height = Math.max(1, Math.round(asset.height * scale));
      this.source = canvas;
      this.texture = new THREE.CanvasTexture(canvas);
    } else {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.addEventListener("seeked", () => { if (!this.disposed) this.invalidate(); });
      this.source = video;
      this.texture = new THREE.VideoTexture(video);
    }
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  static async create(asset: StudioAsset, exportMode: boolean, edge: number, invalidate: () => void, signal?: AbortSignal): Promise<VideoSlideSource> {
    abortMedia(signal);
    const source = new VideoSlideSource(asset, exportMode, edge, invalidate);
    try {
      await runMediaTask(async () => {
        if (source.source instanceof HTMLVideoElement) {
          const ready = waitForVideo(source.source, "loadeddata", source.lifetime.signal);
          source.source.src = asset.objectUrl;
          await ready;
        } else {
          source.input = new Input({ formats: ALL_FORMATS, source: new BlobSource(asset.blob, { maxCacheSize: 2 * 1024 * 1024 }) });
          const track = await source.input.getPrimaryVideoTrack();
          if (!track || !await track.canDecode()) throw new Error(`${asset.name}: video codec cannot be decoded for export.`);
          source.start = Math.max(0, await track.getFirstTimestamp());
          source.end = await track.computeDuration();
          if (source.disposed) throw new DOMException("Video loading cancelled.", "AbortError");
          if (!Number.isFinite(source.end) || source.end <= source.start) throw new Error(`${asset.name}: video has no playable time range.`);
          const sink = new VideoSampleSink(track);
          source.samples = new SequentialSamples((time) => sink.samples(time));
        }
      }, { signal, label: `${asset.name}: video loading`, cancel: () => source.dispose() });
      return source;
    } catch (error) { source.dispose(); throw error; }
  }

  syncPreview(time: number, playback: SlideVideoPlayback = DEFAULT_SLIDE_VIDEO, paused: boolean, outputFps = 30): void {
    if (this.disposed || !(this.source instanceof HTMLVideoElement)) return;
    const video = this.source;
    const target = slideVideoTime(time, this.asset.duration!, playback);
    const end = playback.trimEnd ?? this.asset.duration!;
    const ended = !playback.loop && time * playback.rate >= end - playback.trimStart;
    this.shouldPlay = !paused && !ended && !document.hidden;
    video.playbackRate = playback.rate;
    const wrapped = this.previousTarget !== null && target < this.previousTarget - 1e-6;
    this.previousTarget = target;
    // A running decoder may coast within one delivery frame. Scrubs and wraps
    // seek exactly; a pending seek is allowed to finish before the next request.
    const tolerance = this.shouldPlay && !wrapped ? Math.max(0.015, playback.rate / Math.max(24, outputFps)) : 0.001;
    if (!video.seeking && Math.abs(video.currentTime - target) > tolerance) video.currentTime = target;
    if (!this.shouldPlay) video.pause();
    else if (video.paused && !video.seeking && !this.playPending) {
      this.playPending = true;
      void video.play().catch(() => undefined).finally(() => {
        this.playPending = false;
        if (!this.shouldPlay || this.disposed) video.pause();
      });
    }
  }

  async sample(time: number, playback: SlideVideoPlayback = DEFAULT_SLIDE_VIDEO, signal?: AbortSignal): Promise<void> {
    abortMedia(signal);
    const samples = this.samples;
    if (this.disposed || !samples || !(this.source instanceof HTMLCanvasElement)) throw new Error("Video export source is unavailable.");
    // Match the container timeline used by HTMLVideoElement.currentTime.
    const timestamp = Math.max(this.start, Math.min(this.end - 1e-7, slideVideoTime(time, this.asset.duration!, playback)));
    const sample = await runMediaTask(() => samples.read(timestamp), {
      signal, label: `${this.asset.name}: video frame decoding`, cancel: () => this.finishDecoding(),
    });
    abortMedia(signal);
    const context = this.source.getContext("2d");
    if (!context) throw new Error("Video staging surface is unavailable.");
    context.clearRect(0, 0, this.source.width, this.source.height);
    sample.draw(context, 0, 0, this.source.width, this.source.height);
    this.texture.needsUpdate = true;
    // The cursor owns the sample until advancement, cancellation or disposal.
  }

  pause(): void {
    this.shouldPlay = false;
    if (this.source instanceof HTMLVideoElement) this.source.pause();
  }

  finishDecoding(): void {
    this.samples?.reset();
    this.samples = null;
    this.input?.dispose();
    this.input = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort();
    this.pause();
    this.finishDecoding();
    if (this.source instanceof HTMLVideoElement) {
      this.source.removeAttribute("src");
      this.source.load();
    } else { this.source.width = 1; this.source.height = 1; }
    this.texture.dispose();
  }
}
