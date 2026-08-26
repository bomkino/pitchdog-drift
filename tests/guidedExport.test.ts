import { describe, expect, it } from "vitest";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import {
  assertGuidedExportIntentMatchesPlan,
  captureGuidedExportSnapshot,
  createExportIntent,
  createGuidedExportDraft,
  deriveExportFormatCapabilities,
  EXPORT_FORMATS,
  GUIDED_EXPORT_STEPS,
  preflightGuidedExport,
  reduceGuidedExport,
} from "../src/core/export/guidedExport";
import { captureExportAuthority } from "../src/core/export/exportAuthority";
import type { ExportCapabilityReport } from "../src/lib/exportStudio";
import { cloneSettings, DEFAULT_SETTINGS, type StudioAsset } from "../src/model";

const RUNTIME: ExportCapabilityReport = Object.freeze({
  mp4: Object.freeze({
    supported: true,
    avc: true,
    aac: true,
    presenterAudioFpsSupported: true,
    maximumPresenterAudioFps: 30,
    nativeAacMaximumDurationSeconds: null,
    reasons: Object.freeze([]),
  }),
  png: Object.freeze({ still: true, sequenceZip: true, sequenceDirectory: true }),
  presenter: Object.freeze({ videoDecoderApi: true, audioDecoderApi: true }),
  futureStreamTarget: true,
});

function imageAsset(id: string): StudioAsset {
  return {
    id,
    name: `${id}.png`,
    kind: "image",
    blob: new Blob([id], { type: "image/png" }),
    mimeType: "image/png",
    width: 1080,
    height: 1920,
    objectUrl: `blob:${id}`,
  };
}

function intent(audio = true) {
  return createExportIntent({
    background: "opaque",
    settings: { width: 1080, height: 1920, fps: 30, duration: 8.01 },
    presenterAudio: audio,
    soundDesignAudio: false,
  });
}

function availableCapabilities(pngDestination: "directory" | "zip" = "directory") {
  return deriveExportFormatCapabilities({
    runtime: RUNTIME,
    pngDestination,
    exportSurfaceSupported: true,
    intent: intent(),
  });
}

describe("guided Export intent and capability seam", () => {
  /**
   * Promise: intent records exact deterministic timing and outcome semantics without host details.
   * Failure: a caller can smuggle a path/codec command into the canonical intent or timing drifts from n/fps.
   * Public seam: createExportIntent.
   * Cheapest loop: literal domain assertion.
   */
  it("creates one immutable, platform-neutral intent on the current frame plan", () => {
    const created = intent();

    expect(created).toEqual({
      purpose: "social",
      background: "opaque",
      dimensions: { width: 1080, height: 1920 },
      fps: { numerator: 30, denominator: 1 },
      finiteTimeline: {
        durationSeconds: 8.01,
        frameCount: 240,
        fps: { numerator: 30, denominator: 1 },
      },
      audio: { enabled: true, presenter: true, soundDesign: false },
      preferredFormat: "h264-mp4",
      destinationClass: "file",
    });
    expect(Object.isFrozen(created)).toBe(true);
    expect(JSON.stringify(created)).not.toMatch(/path|ffmpeg|command|grant/iu);
  });

  /**
   * Promise: exact runtime facts become stable, user-readable availability reasons.
   * Failure: unavailable native alpha appears enabled or unknown runtime support is guessed.
   * Public seam: deriveExportFormatCapabilities.
   * Cheapest loop: capability table assertion.
   */
  it("keeps current opaque/PNG sinks available and future native alpha explicitly unavailable", () => {
    const capabilities = availableCapabilities();

    expect(capabilities.map(({ id, state, reason }) => ({ id, state, reason: reason?.id ?? null }))).toEqual([
      { id: "h264-mp4", state: "available", reason: null },
      { id: "png-frames", state: "available", reason: null },
      { id: "prores-4444", state: "unavailable", reason: "not_packaged" },
      { id: "hevc-alpha", state: "unavailable", reason: "not_packaged" },
    ]);
    expect(EXPORT_FORMATS).toHaveLength(4);

    const unknown = deriveExportFormatCapabilities({
      runtime: null,
      pngDestination: "zip",
      exportSurfaceSupported: true,
      intent: intent(),
    });
    expect(unknown.slice(0, 2).map(({ state, reason }) => [state, reason?.id])).toEqual([
      ["unavailable", "temporary_host_failure"],
      ["unavailable", "temporary_host_failure"],
    ]);

    const audioUnsafe = deriveExportFormatCapabilities({
      runtime: {
        ...RUNTIME,
        mp4: { ...RUNTIME.mp4, aac: false },
      },
      pngDestination: "zip",
      exportSurfaceSupported: true,
      intent: intent(true),
    });
    expect(audioUnsafe[0]).toMatchObject({
      id: "h264-mp4",
      state: "unavailable",
      reason: { id: "audio_combination_unsupported" },
    });
  });

  /**
   * Promise: Back/Edit preserves choices while transparent H.264 and silent PNG-audio loss fail early.
   * Failure: navigation resets the draft or rendering can begin before consequence/destination consent.
   * Public seam: reduceGuidedExport + preflightGuidedExport.
   * Cheapest loop: pure six-step journey.
   */
  it("preserves a six-step draft and blocks incompatible or unacknowledged combinations", () => {
    let draft = createGuidedExportDraft(intent());
    draft = reduceGuidedExport(draft, { type: "choose-purpose", purpose: "transparent-overlay" });
    draft = reduceGuidedExport(draft, { type: "next" });
    draft = reduceGuidedExport(draft, { type: "next" });
    draft = reduceGuidedExport(draft, { type: "back" });
    expect(draft.step).toBe("format");
    expect(draft.intent).toMatchObject({
      purpose: "transparent-overlay",
      background: "transparent",
      preferredFormat: "png-frames",
    });

    draft = reduceGuidedExport(draft, { type: "mark-destination-selected", selected: true });
    let preflight = preflightGuidedExport(draft, availableCapabilities());
    expect(preflight.canStart).toBe(false);
    expect(preflight.blockers.map(({ id }) => id)).toEqual(["audio-consequence-unacknowledged"]);

    draft = reduceGuidedExport(draft, { type: "acknowledge-audio-consequence", acknowledged: true });
    preflight = preflightGuidedExport(draft, availableCapabilities());
    expect(preflight.canStart).toBe(true);

    draft = reduceGuidedExport(draft, { type: "choose-format", format: "h264-mp4" });
    draft = reduceGuidedExport(draft, { type: "mark-destination-selected", selected: true });
    preflight = preflightGuidedExport(draft, availableCapabilities());
    expect(preflight.blockers.map(({ id }) => id)).toEqual([
      "transparent-background-requires-alpha-format",
    ]);

    draft = reduceGuidedExport(draft, { type: "begin-render" });
    draft = reduceGuidedExport(draft, { type: "complete" });
    draft = reduceGuidedExport(draft, { type: "edit" });
    expect(GUIDED_EXPORT_STEPS).toEqual([
      "purpose-background",
      "format",
      "film-audio",
      "destination-preflight",
      "render-verify",
      "complete",
    ]);
    expect(draft.step).toBe("purpose-background");
    expect(draft.intent.background).toBe("transparent");
    expect(draft.intent.preferredFormat).toBe("h264-mp4");
  });

  /**
   * Promise: a started job owns immutable creative/timing truth despite later editor mutation.
   * Failure: the snapshot shares project/settings objects with the live editor.
   * Public seam: captureGuidedExportSnapshot.
   * Cheapest loop: mutate live authority after capture and compare.
   */
  it("binds a job snapshot to document revision and cloned creative authority", () => {
    const project = createDefaultDriftProjectV4("guided-export", "2026-08-26T00:00:00.000Z");
    const settings = cloneSettings(DEFAULT_SETTINGS);
    const assets = [imageAsset("slide-a")];
    const authority = captureExportAuthority({ project, settings, assets, presenter: null });
    const snapshot = captureGuidedExportSnapshot({
      id: "export-job-01",
      createdAt: "2026-08-26T23:00:00.000Z",
      documentRevision: 7,
      intent: intent(false),
      authority,
    });

    project.master = { ...project.master, fps: 24 };
    settings.output = { ...settings.output, fps: 24 };
    assets.push(imageAsset("slide-b"));

    expect(snapshot).toMatchObject({
      id: "export-job-01",
      createdAt: "2026-08-26T23:00:00.000Z",
      documentRevision: 7,
    });
    expect(snapshot.project.master.fps).toBe(30);
    expect(snapshot.settings.output.fps).toBe(30);
    expect(snapshot.assets).toHaveLength(1);
    expect(Object.isFrozen(snapshot)).toBe(true);

    expect(() => assertGuidedExportIntentMatchesPlan(snapshot.intent, {
      width: 1080,
      height: 1920,
      fps: 30,
      duration: 8.01,
      presenterAudio: false,
      soundDesignAudio: false,
    })).not.toThrow();
    expect(() => assertGuidedExportIntentMatchesPlan(snapshot.intent, {
      width: 1080,
      height: 1920,
      fps: 24,
      duration: 8.01,
      presenterAudio: false,
      soundDesignAudio: false,
    })).toThrowError(/no longer match the locked project snapshot/iu);
  });
});
