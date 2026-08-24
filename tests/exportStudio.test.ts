import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_ZIP_MEMORY_LIMIT_BYTES,
  ExportStudioError,
  assertPngTransparencyCoverage,
  assessPresenterAvSync,
  assertPresenterAudioFpsSupported,
  assertNativeMacAacDurationSupported,
  assertPngZipMemoryBudget,
  buildExportFramePlan,
  createDeterministicZipMtime,
  createFileSystemMp4Target,
  estimatePngZipMemoryBytes,
  exportMp4,
  exportPngSequence,
  finalizeInterruptibly,
  getAacInputFrameLimit,
  getAudioTrimWindow,
  getExportFrameCount,
  inspectPngHeader,
  inspectRgbaAlpha,
  makePngFrameFilename,
  mergePngAlphaCoverage,
  nextPresenterDecodeWithWatchdog,
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
      () => validateExportSettings({ width: 1080, height: 1920, fps: 30, duration: 0.499 }),
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
  it("times out a presenter decoder that never yields and abandons it exactly once", async () => {
    vi.useFakeTimers();
    const returnIterator = vi.fn().mockResolvedValue({ value: undefined, done: true });
    const iterator = {
      next: vi.fn(() => new Promise<IteratorResult<unknown>>(() => undefined)),
      return: returnIterator,
    };
    const closeIterator = (() => {
      let closed = false;
      return () => {
        if (closed) return;
        closed = true;
        void iterator.return();
      };
    })();
    const disposeInput = vi.fn();

    try {
      const decoding = nextPresenterDecodeWithWatchdog({
        iterator,
        timeoutMs: 250,
        frameIndex: 0,
        closeIterator,
        disposeInput,
      });
      const rejection = expect(decoding).rejects.toMatchObject({
        code: "PRESENTER_DECODE_TIMEOUT",
        details: { timeoutMs: 250, frameIndex: 0 },
      });
      await vi.advanceTimersByTimeAsync(250);
      await rejection;
      expect(iterator.next).toHaveBeenCalledTimes(1);
      expect(returnIterator).toHaveBeenCalledTimes(1);
      expect(disposeInput).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a never-yield presenter decoder without waiting for its deadline", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const returnIterator = vi.fn().mockResolvedValue({ value: undefined, done: true });
    const iterator = {
      next: vi.fn(() => new Promise<IteratorResult<unknown>>(() => undefined)),
      return: returnIterator,
    };
    let closed = false;
    const closeIterator = () => {
      if (closed) return;
      closed = true;
      void iterator.return();
    };
    const disposeInput = vi.fn();

    try {
      const decoding = nextPresenterDecodeWithWatchdog({
        iterator,
        signal: controller.signal,
        timeoutMs: 60_000,
        closeIterator,
        disposeInput,
      });
      const rejection = expect(decoding).rejects.toMatchObject({ code: "CANCELLED" });
      controller.abort(new Error("cancel presenter decode"));
      await rejection;
      expect(returnIterator).toHaveBeenCalledTimes(1);
      expect(disposeInput).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("observes cancellation that lands immediately before abort-listener attachment", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const nativeSignal = controller.signal;
    const raceSignal = {
      get aborted() {
        return nativeSignal.aborted;
      },
      get reason() {
        return nativeSignal.reason;
      },
      addEventListener: ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => {
        // Abort immediately before the real listener is attached. Native
        // AbortSignal does not replay that event for the late listener.
        controller.abort(new Error("cancel during listener attachment"));
        nativeSignal.addEventListener(type, listener, options);
      }) as AbortSignal["addEventListener"],
      removeEventListener: nativeSignal.removeEventListener.bind(nativeSignal),
    } as AbortSignal;
    const returnIterator = vi.fn().mockResolvedValue({ value: undefined, done: true });
    const iterator = {
      next: vi.fn(() => new Promise<IteratorResult<unknown>>(() => undefined)),
      return: returnIterator,
    };
    const disposeInput = vi.fn();

    try {
      await expect(nextPresenterDecodeWithWatchdog({
        iterator,
        signal: raceSignal,
        timeoutMs: 60_000,
        closeIterator: () => { void iterator.return(); },
        disposeInput,
      })).rejects.toMatchObject({ code: "CANCELLED" });
      expect(raceSignal.aborted).toBe(true);
      expect(returnIterator).toHaveBeenCalledTimes(1);
      expect(disposeInput).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

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
      settings: { width: 1080, height: 1920, fps: 30, duration: 0.4 },
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

  it("keeps an existing file byte-identical until a verified native stage explicitly commits", async () => {
    let destination = new Uint8Array([9, 8, 7]);
    const original = [...destination];
    const staged = new Uint8Array([1, 2, 3, 4]);
    let stageAborts = 0;
    let commits = 0;

    const makeWritable = () => Object.assign(new WritableStream(), {
      async __driftReadStagedFile() {
        return new File([staged], "master.mp4", { type: "video/mp4" });
      },
      async __driftCommit() {
        commits += 1;
        destination = staged.slice();
      },
      async __driftAbortStaged() {
        stageAborts += 1;
      },
    });
    const fileHandle = {
      createWritable: vi.fn(async () => makeWritable()),
    } as unknown as FileSystemFileHandle;

    const rejected = await createFileSystemMp4Target(fileHandle);
    const rejectedTarget = rejected.target as unknown as {
      _start(): void;
      _finalize(): Promise<void>;
    };
    rejectedTarget._start();
    await rejectedTarget._finalize();
    expect([...destination]).toEqual(original);
    await expect(rejected.verificationBlob?.()).resolves.toMatchObject({ size: staged.byteLength });
    await rejected.abort(new Error("semantic verification failed"));
    expect([...destination]).toEqual(original);
    expect(stageAborts).toBe(1);
    expect(commits).toBe(0);

    const accepted = await createFileSystemMp4Target(fileHandle);
    const acceptedTarget = accepted.target as unknown as {
      _start(): void;
      _finalize(): Promise<void>;
    };
    acceptedTarget._start();
    await acceptedTarget._finalize();
    expect([...destination]).toEqual(original);
    await accepted.commit?.();
    expect([...destination]).toEqual([...staged]);
    expect(commits).toBe(1);
    expect(fileHandle.createWritable).toHaveBeenCalledWith({
      keepExistingData: false,
      __driftDeferCommit: true,
    });
  });

  it("cancels while a native stream is sealing without publishing or neutralizing its destination", async () => {
    let destination = new Uint8Array([7, 7, 7]);
    const original = [...destination];
    let markCloseStarted: () => void = () => undefined;
    let releaseClose: () => void = () => undefined;
    const closeStarted = new Promise<void>((resolve) => { markCloseStarted = resolve; });
    const closeGate = new Promise<void>((resolve) => { releaseClose = resolve; });
    let stageAborts = 0;
    const writable = Object.assign(new WritableStream({
      close() {
        markCloseStarted();
        return closeGate;
      },
    }), {
      async __driftReadStagedFile() {
        return new File([new Uint8Array([1])], "master.mp4", { type: "video/mp4" });
      },
      async __driftCommit() {
        destination = new Uint8Array([1]);
      },
      async __driftAbortStaged() {
        stageAborts += 1;
      },
    });
    const adapter = await createFileSystemMp4Target({
      createWritable: vi.fn(async () => writable),
    } as unknown as FileSystemFileHandle);
    const target = adapter.target as unknown as {
      _start(): void;
      _finalize(): Promise<void>;
    };
    target._start();
    const finalization = target._finalize();
    await closeStarted;
    const rollback = Promise.resolve(adapter.abort(new Error("cancel while sealing")));

    releaseClose();
    await Promise.all([finalization, rollback]);

    expect([...destination]).toEqual(original);
    expect(stageAborts).toBe(1);
  });

  it("buffers ordinary File System Access output until verification accepts the replacement", async () => {
    let destination = new Uint8Array();
    let lastModified = 100;
    const original = [...destination];
    let pendingWrite: Blob | null = null;
    let probeAborts = 0;
    const fileHandle = {
      async getFile() {
        return new File([destination], "master.mp4", {
          type: "video/mp4",
          lastModified,
        });
      },
      async createWritable(options: FileSystemCreateWritableOptions & { __driftDeferCommit?: boolean }) {
        if (options.__driftDeferCommit) {
          return {
            async abort() { probeAborts += 1; },
          };
        }
        return {
          async write(value: Blob) { pendingWrite = value; },
          async close() {
            destination = new Uint8Array(await pendingWrite!.arrayBuffer());
            lastModified += 1;
          },
          async abort() { pendingWrite = null; },
        };
      },
    } as unknown as FileSystemFileHandle;
    const adapter = await createFileSystemMp4Target(fileHandle);
    const target = adapter.target as unknown as {
      _start(): void;
      _write(bytes: Uint8Array, position: number): void;
      _finalize(): Promise<void>;
    };
    target._start();
    target._write(new Uint8Array([1, 4, 9]), 0);
    await target._finalize();
    await adapter.complete("video/mp4");

    expect(probeAborts).toBe(1);
    expect([...destination]).toEqual(original);
    expect(await adapter.verificationBlob?.()).toMatchObject({ size: 3 });
    expect([...destination]).toEqual(original);

    await adapter.abort(new Error("semantic verification failed"));
    expect([...destination]).toEqual(original);
    expect(() => adapter.verificationBlob?.()).toThrow("before the file stage finalized");

    const accepted = await createFileSystemMp4Target(fileHandle);
    const acceptedTarget = accepted.target as unknown as {
      _start(): void;
      _write(bytes: Uint8Array, position: number): void;
      _finalize(): Promise<void>;
    };
    acceptedTarget._start();
    acceptedTarget._write(new Uint8Array([1, 4, 9]), 0);
    await acceptedTarget._finalize();
    await accepted.complete("video/mp4");

    await accepted.commit?.();
    expect([...destination]).toEqual([1, 4, 9]);
    expect(probeAborts).toBe(2);
  });

  it("refuses an existing browser destination because File System Access cannot replace it atomically", async () => {
    const destination = new Uint8Array([5, 5, 5]);
    let probeAborts = 0;
    const fileHandle = {
      async getFile() {
        return new File([destination], "existing.mp4", {
          type: "video/mp4",
          lastModified: 100,
        });
      },
      async createWritable() {
        return { async abort() { probeAborts += 1; } };
      },
    } as unknown as FileSystemFileHandle;

    await expect(createFileSystemMp4Target(fileHandle)).rejects.toMatchObject({
      code: "TARGET_FINALIZE_FAILED",
    });
    expect([...destination]).toEqual([5, 5, 5]);
    expect(probeAborts).toBe(1);
  });

  it("rejects a browser commit if another process replaces the selected empty destination", async () => {
    let destination = new Uint8Array();
    let lastModified = 100;
    let pendingWrite: Blob | null = null;
    const fileHandle = {
      async getFile() {
        return new File([destination], "master.mp4", {
          type: "video/mp4",
          lastModified,
        });
      },
      async createWritable(options: FileSystemCreateWritableOptions & { __driftDeferCommit?: boolean }) {
        if (options.__driftDeferCommit) return { async abort() {} };
        return {
          async write(value: Blob) { pendingWrite = value; },
          async close() { destination = new Uint8Array(await pendingWrite!.arrayBuffer()); },
          async abort() { pendingWrite = null; },
        };
      },
    } as unknown as FileSystemFileHandle;
    const adapter = await createFileSystemMp4Target(fileHandle);
    const target = adapter.target as unknown as {
      _start(): void;
      _write(bytes: Uint8Array, position: number): void;
      _finalize(): Promise<void>;
    };
    target._start();
    target._write(new Uint8Array([1, 4, 9]), 0);
    await target._finalize();
    await adapter.complete("video/mp4");

    destination = new Uint8Array([7, 8, 9]);
    lastModified += 1;

    await expect(adapter.commit?.()).rejects.toMatchObject({ code: "TARGET_FINALIZE_FAILED" });
    expect([...destination]).toEqual([7, 8, 9]);
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

  it("allows an authored fully transparent still without pretending it has visible content", () => {
    expect(() => assertPngTransparencyCoverage({
      hasVisiblePixels: false,
      hasTransparentPixels: true,
    }, "still")).not.toThrow();

    expectExportCode(
      () => assertPngTransparencyCoverage({
        hasVisiblePixels: true,
        hasTransparentPixels: false,
      }, "still"),
      "PNG_ALPHA_MISSING",
    );
  });

  it("checks transparency and visible content across a sequence, not inside every lifecycle frame", () => {
    const transparentEntry = {
      hasVisiblePixels: false,
      hasTransparentPixels: true,
    };
    const opaqueBody = {
      hasVisiblePixels: true,
      hasTransparentPixels: false,
    };
    const coverage = mergePngAlphaCoverage(transparentEntry, opaqueBody);

    expect(coverage).toEqual({
      hasVisiblePixels: true,
      hasTransparentPixels: true,
    });
    expect(() => assertPngTransparencyCoverage(coverage, "sequence")).not.toThrow();
    expectExportCode(
      () => assertPngTransparencyCoverage(transparentEntry, "sequence"),
      "PNG_ALPHA_MISSING",
    );
    expectExportCode(
      () => assertPngTransparencyCoverage(opaqueBody, "sequence"),
      "PNG_ALPHA_MISSING",
    );
  });

  it("exports a sequence whose fully transparent lifecycle frame is followed by visible content", async () => {
    const decodedFrames = [
      new Uint8ClampedArray([0, 0, 0, 0]),
      new Uint8ClampedArray([255, 255, 255, 255]),
      new Uint8ClampedArray([255, 255, 255, 128]),
    ];

    class FakeOffscreenCanvas {
      width: number;
      height: number;
      private decodedAlpha = new Uint8ClampedArray([0, 0, 0, 0]);

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }

      async convertToBlob(): Promise<Blob> {
        const header = Uint8Array.from(pngHeader(this.width, this.height, 6));
        return new Blob([header.buffer], { type: "image/png" });
      }

      getContext(): Pick<CanvasRenderingContext2D, "clearRect" | "drawImage" | "getImageData"> {
        return {
          clearRect: () => undefined,
          drawImage: (bitmap: CanvasImageSource) => {
            this.decodedAlpha = (bitmap as unknown as {
              decodedAlpha: Uint8ClampedArray<ArrayBuffer>;
            }).decodedAlpha;
          },
          getImageData: () => ({ data: this.decodedAlpha }) as ImageData,
        };
      }
    }

    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({
      width: 1,
      height: 1,
      decodedAlpha: decodedFrames.shift(),
      close: () => undefined,
    })));

    try {
      const result = await exportPngSequence({
        canvas: new FakeOffscreenCanvas(1, 1) as unknown as OffscreenCanvas,
        renderAt: () => undefined,
        settings: { width: 1, height: 1, fps: 1, duration: 3 },
        destination: "zip",
        requireTransparentPixels: true,
      });

      expect(result.frameCount).toBe(3);
      expect(result.blob?.size).toBeGreaterThan(0);
      expect(decodedFrames).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
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
  it("preflights the real native AAC duration ceiling", () => {
    expect(() => assertNativeMacAacDurationSupported(35, true, true)).not.toThrow();
    expectExportCode(
      () => assertNativeMacAacDurationSupported(35.001, true, true),
      "AAC_UNSUPPORTED",
    );
    expect(() => assertNativeMacAacDurationSupported(60, true, false)).not.toThrow();
  });

  it("admits a long native video-only presenter but blocks proven presenter audio or soundtrack", () => {
    // Before presenter inspection, a presenter is not evidence of an audio
    // track. The same helper is called again after inspection with the real
    // hasOutputAudio fact, covering both presenter audio and soundtracks.
    expect(() => assertNativeMacAacDurationSupported(60, false, true)).not.toThrow();
    expectExportCode(
      () => assertNativeMacAacDurationSupported(60, true, true),
      "AAC_UNSUPPORTED",
    );
  });

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
