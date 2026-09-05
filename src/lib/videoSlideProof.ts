import { CinematicCarousel } from "../engine/CinematicCarousel";
import { createDefaultDriftProjectV4 } from "../core/project/defaults";
import { DRIFT_V2_RENDER_CONTRACT } from "../core/project/schema";
import { validateDriftProjectV4 } from "../core/project/validation";
import { createCompatibilityPerformanceLifecycle } from "../model";
import { videoFileToAsset, disposeAsset } from "./assets";
import { exportMp4, exportPngStill } from "./exportStudio";
import { Input, BlobSource, ALL_FORMATS, VideoSampleSink } from "mediabunny";

/** Synthetic media only. Runs inside the packaged, isolated native self-test. */
export async function verifyVideoSlideOutput(): Promise<Record<string, unknown>> {
  const source = document.createElement("canvas"); source.width = 160; source.height = 90;
  const ctx = source.getContext("2d");
  if (!ctx) throw new Error("Synthetic clip canvas unavailable.");
  // A changing, numbered colour plate; not a client asset and not an all-black pass.
  const clip = await exportMp4({ canvas: source, settings: { width: 160, height: 90, fps: 24, duration: 1 },
    includePresenterAudio: false, renderAt: (time) => {
      ctx.fillStyle = "#204080"; ctx.fillRect(0, 0, 160, 90);
      ctx.fillStyle = "#e8c080"; ctx.fillRect(Math.floor(time * 120), 12, 30, 60);
      ctx.fillStyle = "#ffffff"; ctx.font = "16px sans-serif"; ctx.fillText(String(Math.floor(time * 24)), 6, 84);
    } });
  if (!clip.blob) throw new Error("Synthetic source encoding returned no bytes.");
  const asset = await videoFileToAsset(new File([clip.blob], "synthetic-loop.mp4", { type: "video/mp4" }));
  const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180; document.body.appendChild(canvas);
  let engine: CinematicCarousel | null = null;
  try {
    const project = createDefaultDriftProjectV4("native-video-proof", "2026-09-05T00:00:00.000Z", 7, DRIFT_V2_RENDER_CONTRACT);
    project.composition = { width: 320, height: 180, alphaMode: "opaque", colourSpace: "srgb-rec709" };
    project.master.fps = 24; project.master.duration = 2; project.master.audio.enabled = false;
    project.performance = createCompatibilityPerformanceLifecycle(2);
    project.motion.transport.slidesPerSecond = 0;
    project.motion.path.id = "straight"; project.motion.path.depth = 0; project.motion.path.banking = 0;
    project.motion.path.curvature = 0; project.motion.path.focusScale = 0; project.motion.path.edgeFade = 0;
    project.material.flex = 0; project.lighting.enabled = false; project.lens.enabled = false; project.atmosphere.enabled = false;
    project.card.aspectWidth = 16; project.card.aspectHeight = 9; project.card.scale = 0.9; project.card.radius = 0; project.card.borderWidth = 0;
    project.presenter.enabled = false;
    project.media.order = [asset.id];
    project.media.assets = { [asset.id]: { id: asset.id, name: asset.name, kind: "video", mimeType: asset.mimeType, hash: asset.hash!, byteLength: asset.blob.size, width: asset.width, height: asset.height, duration: asset.duration } };
    project.slides = { [asset.id]: { assetId: asset.id, fit: "cover", focalX: 0.5, focalY: 0.5, scaleOffset: 0, video: { loop: true, trimStart: 0, trimEnd: 1, rate: 1 } } };
    const checked = validateDriftProjectV4(project);
    engine = new CinematicCarousel(canvas, { kind: "project-v4", project: checked });
    engine.setPaused(true);
    await engine.setAssets([asset]);
    const exportedSurface = engine.beginExport(320, 180);
    try {
      const readFrame = async (time: number) => {
        await engine!.renderAtAsync(time, Math.round(time * 24));
        const readback = document.createElement("canvas"); readback.width = 32; readback.height = 18;
        const rc = readback.getContext("2d")!; rc.drawImage(canvas, 0, 0, 32, 18);
        return new Uint8Array(rc.getImageData(0, 0, 32, 18).data);
      };
      const a = await readFrame(0.25), b = await readFrame(1.25), c = await readFrame(0.75);
      const difference = (x: Uint8Array, y: Uint8Array) => x.reduce((sum, value, index) => sum + Math.abs(value - y[index]!), 0);
      if (difference(a, b) !== 0) throw new Error("Packaged V2 source loop does not return the same pixels.");
      if (difference(a, c) <= 100) throw new Error("Packaged V2 video slide is not visibly changing.");
      const settings = { width: 320, height: 180, fps: 24, duration: 2 };
      const renderAt = async (time: number, _presenter: unknown, frame?: { frameIndex?: number; signal?: AbortSignal }) => {
        await engine!.renderAtAsync(time, frame?.frameIndex, frame?.signal);
      };
      const mp4 = await exportMp4({ canvas, renderAt, settings, includePresenterAudio: false });
      if (!mp4.blob || mp4.verification.frameCount !== 48) throw new Error("Packaged V2 output has the wrong frame count.");
      const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(mp4.blob) });
      let encodedDifference: number;
      try {
        const track = await input.getPrimaryVideoTrack();
        if (!track) throw new Error("Packaged V2 output has no video track.");
        const sink = new VideoSampleSink(track);
        const decoded = async (time: number) => {
          const sample = await sink.getSample(time); if (!sample) throw new Error("Encoded loop frame missing.");
          const out = document.createElement("canvas"); out.width = 320; out.height = 180;
          try { const oc = out.getContext("2d")!; sample.draw(oc, 0, 0, 320, 180); return new Uint8Array(oc.getImageData(0, 0, 320, 180).data); }
          finally { sample.close(); }
        };
        const first = await decoded(0.25), repeated = await decoded(1.25);
        encodedDifference = difference(first, repeated) / first.length;
        if (encodedDifference >= 8) throw new Error("Encoded V2 loop failed the pixel comparison.");
      } finally { input.dispose(); }
      const png = await exportPngStill({ canvas, renderAt, settings, time: 0.25 });
      if (png.blob.size < 100 || png.width !== 320 || png.height !== 180) throw new Error("Video-slide PNG failed.");
      return { verified: true, renderContract: checked.renderContract, frameCount: mp4.frameCount, fps: 24,
        width: 320, height: 180, videoCodec: mp4.videoCodec, bytes: mp4.blob.size, audio: mp4.audio,
        rawLoopDifference: difference(a, b), changingPixels: difference(a, c), encodedLoopMeanError: encodedDifference,
        pngBytes: png.blob.size, source: "generated-colour-plate", scope: "packaged-V2-render-and-output" };
    } finally { exportedSurface.restore(); }
  } finally { engine?.dispose(); disposeAsset(asset); canvas.remove(); source.width = source.height = 1; }
}
