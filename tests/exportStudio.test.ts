import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_ZIP_MEMORY_LIMIT_BYTES,
  ExportStudioError,
  assessPresenterAvSync,
  assertPresenterAudioFpsSupported,
  assertPngZipMemoryBudget,
  buildExportFramePlan,
  createDeterministicZipMtime,
  createFileSystemMp4Target,
  estimatePngZipMemoryBytes,
  exportMp4,
  finalizeInterruptibly,
  getAacInputFrameLimit,
  getAudioTrimWindow,
  getExportFrameCount,
  inspectPngHeader,
  inspectRgbaAlpha,
  makePngFrameFilename,
  resolvePngStillTime,
  resolvePresenterAudioEnabled,
  validateExportSettings,
  verifyPngZipEntries,
} from "../src/lib/exportStudio";

function pngHeader(width: number, height: number, colorType: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  new DataView(bytes.buffer).setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = colorType;
  return bytes;
}

function expectExportCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error(`Expected ExportStudioError(${code}).`);
  } catch (error) {
    expect(error).toBeInstanceOf(ExportStudioError);
    expect((error as ExportStudioError).code).toBe(code);
  }
}

describe("deterministic export timeline", () => {
  it("renders exactly round(duration * fps) frames at n / fps", () => {
    const plan = buildExportFramePlan(DEFAULT_EXPORT_SETTINGS);

    expect(plan).toHaveLength(240);
    expect(plan[0]).toEqual({ index: 0, time: 0, duration: 1 / 30 });
    expect(plan[137]?.time).toBe(137 / 30);
    expect(plan[239]?.time).toBe(239 / 30);
    expect(getExportFrameCount({ duration: 8.01, fps: 30 })).toBe(240);
  });

  it("rejects settings outside frozen product bounds", () => {
    expectExportCode(
      () => validateExportSettings({ width: 1080, height: 1920, fps: 30, duration: 2.99 }),
      "INVALID_SETTINGS",
    );
    expectExportCode(
      () => validateExportSettings({ width: 1080, height: 1920, fps: 61, duration: 8 }),
      "INVALID_SETTINGS",
    );
    expectExportCode(
      () => validateExportSettings({ width: 8193, height: 1920, fps: 30, duration: 8 }),
      "INVALID_SETTINGS",
    );
  });

  it("uses stable, one-based, sortable PNG names", () => {
    expect(makePngFrameFilename(0, 240)).toBe("frame_000001.png");
    expect(makePngFrameFilename(239, 240, "horror-cut")).toBe("horror-cut_000240.png");
    expectExportCode(() => makePngFrameFilename(240, 240), "INVALID_SETTINGS");
    expectExportCode(() => makePngFrameFilename(0, 1, "../escape"), "INVALID_SETTINGS");
  });

  it("defaults stills to the master midpoint while preserving explicit frame zero", () => {
    expect(resolvePngStillTime(3)).toBe(1.5);
    expect(resolvePngStillTime(3, 0)).toBe(0);
    expectExportCode(() => resolvePngStillTime(3, 3.01), "INVALID_SETTINGS");
  });
});

describe("export safety checks", () => {
  it("rolls back an owned target when preflight rejects", async () => {
    const abort = vi.fn();
    const target = {
      target: {} as never,
      kind: "test-persistent-target",
      complete: () => null,
      abort,
    };

    await expect(exportMp4({
      canvas: { width: 1, height: 1 } as HTMLCanvasElement,
      renderAt: () => undefined,
      settings: { width: 1080, height: 1920, fps: 30, duration: 2 },
      target,
    })).rejects.toMatchObject({ code: "INVALID_SETTINGS" });
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("aborts a file writable that opens after target creation is cancelled", async () => {
    let resolveWritable: (value: FileSystemWritableFileStream) => void = () => undefined;
    const opening = new Promise<FileSystemWritableFileStream>((resolve) => {
      resolveWritable = resolve;
    });
    const abortWritable = vi.fn().mockResolvedValue(undefined);
    const fileHandle = {
      createWritable: vi.fn(() => opening),
    } as unknown as FileSystemFileHandle;
    const controller = new AbortController();
    const creating = createFileSystemMp4Target(fileHandle, controller.signal);

    controller.abort(new Error("cancel target opening"));
    await expect(creating).rejects.toMatchObject({ code: "CANCELLED" });
    resolveWritable({ abort: abortWritable } as unknown as FileSystemWritableFileStream);
    await Promise.resolve();
    await Promise.resolve();
    expect(abortWritable).toHaveBeenCalledTimes(1);
  });

  it("cancels a stuck finalizer through destination rollback", async () => {
    const controller = new AbortController();
    const reason = new Error("stop finalizing");
    let abortCount = 0;
    let abortReason: unknown;
    let markStarted: () => void = () => undefined;
    let rejectFinalization: (reason?: unknown) => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });

    const result = finalizeInterruptibly(
      () => {
        markStarted();
        return new Promise<void>((_resolve, reject) => {
          rejectFinalization = reject;
        });
      },
      (receivedReason) => {
        abortCount += 1;
        abortReason = receivedReason;
      },
      controller.signal,
    );

    await started;
    controller.abort(reason);

    await expect(result).rejects.toMatchObject({ code: "CANCELLED" });
    expect(abortCount).toBe(1);
    expect(abortReason).toBe(reason);

    // The losing finalization branch may settle later and must stay observed.
    rejectFinalization(new Error("stream closed after rollback"));
    await Promise.resolve();
  });

  it("does not touch the destination when finalization completes", async () => {
    let abortCount = 0;
    await finalizeInterruptibly(
      async () => undefined,
      () => {
        abortCount += 1;
      },
      new AbortController().signal,
    );
    expect(abortCount).toBe(0);
  });

  it("neutralizes a file when stream close commits while abort is queued", async () => {
    let markCloseStarted: () => void = () => undefined;
    let releaseClose: () => void = () => undefined;
    const closeStarted = new Promise<void>((resolve) => {
      markCloseStarted = resolve;
    });
    const closeGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    const writable = new WritableStream({
      close() {
        markCloseStarted();
        return closeGate;
      },
    });
    const truncations: number[] = [];
    let cleanupClosed = false;
    let createCount = 0;
    const fileHandle = {
      async createWritable() {
        createCount += 1;
        if (createCount === 1) return writable;
        return {
          async truncate(size: number) {
            truncations.push(size);
          },
          async close() {
            cleanupClosed = true;
          },
        };
      },
      async getFile() {
        return new File([], "cancelled.mp4");
      },
    } as unknown as FileSystemFileHandle;

    const adapter = await createFileSystemMp4Target(fileHandle);
    const target = adapter.target as unknown as {
      _start(): void;
      _finalize(): Promise<void>;
    };
    target._start();
    const finalization = target._finalize();
    await closeStarted;
    const rollback = Promise.resolve(adapter.abort(new Error("cancel during close")));

    releaseClose();
    await Promise.all([finalization, rollback]);

    expect(createCount).toBe(2);
    expect(truncations).toEqual([0]);
    expect(cleanupClosed).toBe(true);
  });

  it("refuses default-master ZIP before allocating unsafe memory", () => {
    const estimate = estimatePngZipMemoryBytes(DEFAULT_EXPORT_SETTINGS);
    expect(estimate).toBeGreaterThan(DEFAULT_ZIP_MEMORY_LIMIT_BYTES);
    expectExportCode(
      () => assertPngZipMemoryBudget(DEFAULT_EXPORT_SETTINGS, DEFAULT_ZIP_MEMORY_LIMIT_BYTES),
      "ZIP_MEMORY_LIMIT",
    );
  });

  it("keeps ZIP estimate monotonic with resolution and duration", () => {
    const small = estimatePngZipMemoryBytes({ width: 320, height: 568, fps: 24, duration: 3 });
    const longer = estimatePngZipMemoryBytes({ width: 320, height: 568, fps: 24, duration: 6 });
    const larger = estimatePngZipMemoryBytes({ width: 640, height: 1136, fps: 24, duration: 6 });

    expect(longer).toBeGreaterThan(small);
    expect(larger).toBeGreaterThan(longer);
  });

  it("reads dimensions and alpha support from PNG IHDR", () => {
    expect(inspectPngHeader(pngHeader(1080, 1920, 6))).toEqual({
      width: 1080,
      height: 1920,
      bitDepth: 8,
      colorType: 6,
      hasAlphaChannel: true,
    });
    expect(inspectPngHeader(pngHeader(1080, 1920, 2)).hasAlphaChannel).toBe(false);
    expectExportCode(() => inspectPngHeader(new Uint8Array(26)), "PNG_INVALID");
  });

  it("distinguishes visible content from usable transparent pixels", () => {
    expect(inspectRgbaAlpha(new Uint8ClampedArray([
      0, 0, 0, 0,
      255, 255, 255, 255,
    ]))).toEqual({ hasVisiblePixels: true, hasTransparentPixels: true });
    expect(inspectRgbaAlpha(new Uint8ClampedArray([0, 0, 0, 255]))).toEqual({
      hasVisiblePixels: true,
      hasTransparentPixels: false,
    });
  });

  it("round-trips the exact PNG ZIP entry set and bytes", () => {
    const expected = {
      "frame_000001.png": new Uint8Array([1, 2, 3]),
      "frame_000002.png": new Uint8Array([4, 5]),
    };
    const names = Object.keys(expected);
    expect(() => verifyPngZipEntries(expected, { ...expected }, names)).not.toThrow();
    expectExportCode(
      () => verifyPngZipEntries(expected, {
        ...expected,
        "frame_000002.png": new Uint8Array([4, 6]),
      }, names),
      "PNG_INVALID",
    );
  });

  it("uses a DOS-valid local epoch in every timezone", () => {
    const mtime = createDeterministicZipMtime();
    expect(mtime.getFullYear()).toBe(1980);
    expect(mtime.getMonth()).toBe(0);
    expect(mtime.getDate()).toBe(1);
    expect(mtime.getHours()).toBe(0);
  });
});

describe("presenter timing", () => {
  it("keeps presenter video while audio defaults on and can be explicitly muted", () => {
    expect(resolvePresenterAudioEnabled()).toBe(true);
    expect(resolvePresenterAudioEnabled(true)).toBe(true);
    expect(resolvePresenterAudioEnabled(false)).toBe(false);
  });

  it("accepts no more than one-frame A/V offset and rejects larger drift", () => {
    const withinOneFrame = assessPresenterAvSync(0, 8, 0.02, 8.02, 0, 30);
    const outsideOneFrame = assessPresenterAvSync(0, 8, 0.05, 8.05, 0, 30);

    expect(withinOneFrame.holds).toBe(true);
    expect(withinOneFrame.toleranceSeconds).toBe(1 / 30);
    expect(outsideOneFrame.holds).toBe(false);
  });

  it("uses raw finalized track duration instead of clamping away AAC tail drift", () => {
    const rawFinalizedTracks = assessPresenterAvSync(0, 3, 0, 3.072, 0, 30);
    const sourceCoverageWindow = assessPresenterAvSync(0, 3, 0, 3.072, 0, 30, 3);

    expect(rawFinalizedTracks.holds).toBe(false);
    expect(rawFinalizedTracks.endOffsetSeconds).toBeCloseTo(0.072, 9);
    expect(sourceCoverageWindow.holds).toBe(true);
  });

  it("allows presenter audio at 24/30 fps and fails honestly above 30 fps", () => {
    expect(() => assertPresenterAudioFpsSupported(24, true)).not.toThrow();
    expect(() => assertPresenterAudioFpsSupported(30, true)).not.toThrow();
    expect(() => assertPresenterAudioFpsSupported(60, false)).not.toThrow();
    expectExportCode(() => assertPresenterAudioFpsSupported(50, true), "PRESENTER_AV_SYNC");
    expectExportCode(() => assertPresenterAudioFpsSupported(60, true), "PRESENTER_AV_SYNC");
  });

  it("limits AAC input to whole packets without trimming a full packet", () => {
    for (const duration of [3, 5, 8]) {
      const requestedFrames = Math.round(duration * 48_000);
      const frameLimit = getAacInputFrameLimit(duration);

      expect(frameLimit % 1024).toBe(0);
      expect(frameLimit).toBeLessThanOrEqual(requestedFrames);
      expect(requestedFrames - frameLimit).toBeLessThan(1024);
    }

    expect(getAacInputFrameLimit(3)).toBe(143_360);
    expect(getAacInputFrameLimit(5)).toBe(239_616);
    expect(getAacInputFrameLimit(8)).toBe(384_000);
    expectExportCode(() => getAacInputFrameLimit(0), "INVALID_SETTINGS");
  });

  it("checks only the exported interval and rejects short presenter coverage", () => {
    const harmlessTailDifference = assessPresenterAvSync(0, 60, 0.01, 59, 0, 30, 8);
    const shortTogether = assessPresenterAvSync(0, 3, 0.01, 3.01, 0, 30, 8);

    expect(harmlessTailDifference.holds).toBe(true);
    expect(shortTogether.holds).toBe(false);
    expect(shortTogether.videoCoverageGapSeconds).toBe(5);
  });

  it("clips negative audio and retimes it to export zero", () => {
    expect(getAudioTrimWindow(-0.01, 1024, 48_000, 0, 0.01)).toEqual({
      startFrame: 480,
      endFrame: 960,
      outputTimestamp: 0,
    });
    expect(getAudioTrimWindow(2, 1024, 48_000, 0, 1)).toBeNull();
  });
});
