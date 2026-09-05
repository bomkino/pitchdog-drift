import { describe, expect, it } from "vitest";
import { DEFAULT_SLIDE_VIDEO, slideVideoTime, videoSlideBudget } from "../src/core/media/videoPlayback";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { validateDriftProjectV4 } from "../src/core/project/validation";
import { evaluateProjectFrame } from "../src/core/render/projectFrameAdapter";
import type { StudioAsset } from "../src/model";

function fixture() {
  const p = createDefaultDriftProjectV4("video-test", "2026-09-05T00:00:00.000Z");
  const blob = new Blob(["original"], { type: "video/mp4" });
  const a: StudioAsset = { id: "clip", name: "clip.mp4", kind: "video", mimeType: blob.type, blob, hash: "a".repeat(64), objectUrl: "blob:clip", width: 320, height: 180, duration: 2 };
  p.media.order = [a.id];
  p.media.assets[a.id] = { id: a.id, name: a.name, kind: a.kind, mimeType: a.mimeType, hash: a.hash!, byteLength: blob.size, width: a.width, height: a.height, duration: a.duration };
  p.slides[a.id] = { assetId: a.id, fit: "cover", focalX: .5, focalY: .5, scaleOffset: 0, video: { ...DEFAULT_SLIDE_VIDEO } };
  return { p, a };
}

describe("video slides", () => {
  it("loops the source on the authored clock, including repeated cards", () => {
    expect(slideVideoTime(0, 2)).toBe(0);
    expect(slideVideoTime(2, 2)).toBe(0);
    expect(slideVideoTime(5.5, 2)).toBe(1.5);
    expect(slideVideoTime(3, 5, { loop: true, trimStart: 1, trimEnd: 3, rate: 1 })).toBe(2);
  });
  it("holds the final decodable frame when looping is off", () => {
    const t = slideVideoTime(12, 2, { ...DEFAULT_SLIDE_VIDEO, loop: false });
    expect(t).toBeLessThan(2); expect(t).toBeGreaterThan(1.99);
  });
  it("preserves video directives and original identity through V4 validation and rendering", () => {
    const { p, a } = fixture();
    const reopened = validateDriftProjectV4(JSON.parse(JSON.stringify(p)));
    expect(reopened.slides.clip!.video).toEqual(DEFAULT_SLIDE_VIDEO);
    const frame = evaluateProjectFrame({ project: reopened, assets: [a], time: 1, frameIndex: null });
    expect(frame.sourceOrder).toEqual([a.id]);
    expect(frame.renderables.every((item) => item.asset.blob === a.blob)).toBe(true);
  });
  it("rejects invalid trims instead of silently changing them", () => {
    const { p } = fixture(); p.slides.clip!.video!.trimStart = 3;
    expect(() => validateDriftProjectV4(p)).toThrow("invalid trim");
  });
  it("bounds simultaneous clip workload, not ordinary image counts", () => {
    const clip = { kind: "video", width: 1920, height: 1080 };
    expect(videoSlideBudget(Array(8).fill(clip))).toBeNull();
    expect(videoSlideBudget(Array(9).fill(clip))).toContain("8 video slides");
    expect(videoSlideBudget(Array(200).fill({ ...clip, kind: "image" }))).toBeNull();
  });
});
