import * as THREE from "three";
import { Input, BlobSource, ALL_FORMATS, VideoSampleSink, type VideoSample } from "mediabunny";
import type { StudioAsset } from "../model";
import { DEFAULT_SLIDE_VIDEO, slideVideoTime, type SlideVideoPlayback } from "../core/media/videoPlayback";
import { abortMedia, waitForVideo } from "../lib/mediaWork";

/** One source per clip, shared by every repeated card. Never plays source audio. */
export class VideoSlideSource {
  readonly texture: THREE.Texture;
  readonly source: HTMLVideoElement | HTMLCanvasElement;
  private input: Input | null = null;
  private sink: VideoSampleSink | null = null;
  private start = 0;
  private end = Infinity;
  private disposed = false;
  private playPending = false;
  private shouldPlay = false;
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

  static async create(asset: StudioAsset, exportMode: boolean, edge: number, invalidate: () => void): Promise<VideoSlideSource> {
    const source = new VideoSlideSource(asset, exportMode, edge, invalidate);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([(async () => {
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
        source.sink = new VideoSampleSink(track);
      }
      })(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { source.dispose(); reject(new Error(`${asset.name}: video loading timed out.`)); }, 15000); })]);
      return source;
    } catch (error) { source.dispose(); throw error; }
    finally { clearTimeout(timer); }
  }

  syncPreview(time: number, playback: SlideVideoPlayback = DEFAULT_SLIDE_VIDEO, paused: boolean): void {
    if (this.disposed || !(this.source instanceof HTMLVideoElement)) return;
    const video = this.source;
    const target = slideVideoTime(time, this.asset.duration!, playback);
    const end = playback.trimEnd ?? this.asset.duration!;
    const ended = !playback.loop && time * playback.rate >= end - playback.trimStart;
    this.shouldPlay = !paused && !ended && !document.hidden;
    video.playbackRate = playback.rate;
    const tolerance = this.shouldPlay ? 0.10 : 0.001;
    if (!video.seeking && Math.abs(video.currentTime - target) > tolerance) video.currentTime = target;
    if (!this.shouldPlay) video.pause();
    else if (video.paused && !this.playPending) {
      this.playPending = true;
      void video.play().catch(() => undefined).finally(() => {
        this.playPending = false;
        if (!this.shouldPlay || this.disposed) video.pause();
      });
    }
  }

  async sample(time: number, playback: SlideVideoPlayback = DEFAULT_SLIDE_VIDEO, signal?: AbortSignal): Promise<void> {
    abortMedia(signal);
    if (this.disposed || !this.sink || !(this.source instanceof HTMLCanvasElement)) throw new Error("Video export source is unavailable.");
    // Use the container timeline, exactly like HTMLVideoElement.currentTime.
    // A late first sample or short video track holds its nearest visible frame.
    const timestamp = Math.max(this.start, Math.min(this.end - 1e-7, slideVideoTime(time, this.asset.duration!, playback)));
    // Decoder work can outlive cancellation. Observe and close its late sample.
    let rejected = false;
    const decoded = this.sink.getSample(timestamp);
    void decoded.then((sample) => { if (rejected) sample?.close(); }, () => undefined);
    let cancel!: () => void;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      cancel = () => { rejected = true; this.input?.dispose(); reject(signal?.reason ?? new DOMException("Video export cancelled.", "AbortError")); };
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      timer = setTimeout(() => { rejected = true; this.input?.dispose(); reject(new Error(`${this.asset.name}: video frame decoding timed out.`)); }, 15000);
    });
    let sample: VideoSample | null = null;
    try {
      sample = await Promise.race([decoded, stopped]);
      abortMedia(signal);
      if (!sample || sample.timestamp > timestamp + 1e-6 || sample.timestamp + sample.duration < timestamp - 1e-6) {
        throw new Error(`${this.asset.name}: no decoded video frame covers the requested time.`);
      }
      const context = this.source.getContext("2d");
      if (!context) throw new Error("Video staging surface is unavailable.");
      context.clearRect(0, 0, this.source.width, this.source.height);
      sample.draw(context, 0, 0, this.source.width, this.source.height);
      this.texture.needsUpdate = true;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      sample?.close();
    }
  }

  pause(): void {
    this.shouldPlay = false;
    if (this.source instanceof HTMLVideoElement) this.source.pause();
  }

  finishDecoding(): void {
    this.input?.dispose();
    this.input = null;
    this.sink = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort();
    this.pause();
    this.input?.dispose();
    this.input = null;
    this.sink = null;
    if (this.source instanceof HTMLVideoElement) {
      this.source.removeAttribute("src");
      this.source.load();
    } else { this.source.width = 1; this.source.height = 1; }
    this.texture.dispose();
  }
}
