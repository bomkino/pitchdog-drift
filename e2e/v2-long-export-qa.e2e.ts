import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MATRIX = [
  { duration: 30, slides: 8, ratio: "9:16", width: 1080, height: 1920 },
  { duration: 30, slides: 8, ratio: "16:9", width: 1920, height: 1080 },
  { duration: 30, slides: 40, ratio: "9:16", width: 1080, height: 1920 },
  { duration: 30, slides: 40, ratio: "16:9", width: 1920, height: 1080 },
  { duration: 60, slides: 40, ratio: "9:16", width: 1080, height: 1920 },
  { duration: 60, slides: 40, ratio: "16:9", width: 1920, height: 1080 },
  { duration: 180, slides: 40, ratio: "9:16", width: 1080, height: 1920 },
  { duration: 180, slides: 200, ratio: "9:16", width: 1080, height: 1920 },
] as const;

const ACTUAL_CASES = [
  { id: "30s-8-portrait", duration: 30, slides: 8, ratio: "9:16", width: 90, height: 160 },
  { id: "60s-40-landscape", duration: 60, slides: 40, ratio: "16:9", width: 160, height: 90 },
  { id: "180s-200-portrait", duration: 180, slides: 200, ratio: "9:16", width: 72, height: 128 },
] as const;

const PHYSICAL_SCOPE = process.env.DRIFT_LONG_EXPORT_SCOPE === "full" ? "full" : "smoke";
const SELECTED_ACTUAL_CASES = PHYSICAL_SCOPE === "full" ? ACTUAL_CASES : ACTUAL_CASES.slice(0, 1);

const FPS = 24;
const MAX_TEXTURE_CACHE = 24;
const MAX_CONCURRENT_DECODES = 4;
const HEAP_RETURN_ALLOWANCE_BYTES = 32 * 1024 * 1024;

async function sourceFingerprint(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const relative of [
    "src/engine/CinematicCarousel.ts",
    "src/lib/exportStudio.ts",
    "src/core/project/schema.ts",
    "src/core/project/validation.ts",
    "src/core/timeline/performanceLifecycle.ts",
  ]) {
    hash.update(relative);
    hash.update(await readFile(path.join(root, relative)));
  }
  return hash.digest("hex");
}

async function collectHeap(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  await cdp.detach();
  return metrics.find(({ name }) => name === "JSHeapUsedSize")?.value ?? null;
}

test("Project V4 long-export matrix produces exact plans and bounded physical receipts", async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await page.goto("/");
  await page.evaluate(async () => {
    await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/lib/exportStudio.ts"),
      import("/src/core/project/defaults.ts"),
      import("/src/core/project/validation.ts"),
      import("/src/core/timeline/performanceLifecycle.ts"),
    ]);
  });
  const heapBefore = await collectHeap(page);

  const browserReceipt = await page.evaluate(async ({ matrix, actualCases, cancellationCase, fps }) => {
    const [
      { CinematicCarousel },
      { buildExportFramePlan, exportMp4, getExportFrameCount },
      { createDefaultDriftProjectV4 },
      { DRIFT_V2_RENDER_CONTRACT },
      { validateDriftProjectV4 },
      { createPerformanceLifecycle },
    ] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/lib/exportStudio.ts"),
      import("/src/core/project/defaults.ts"),
      import("/src/core/project/schema.ts"),
      import("/src/core/project/validation.ts"),
      import("/src/core/timeline/performanceLifecycle.ts"),
    ]);

    const fixtureCanvas = document.createElement("canvas");
    fixtureCanvas.width = 32;
    fixtureCanvas.height = 32;
    const fixtureContext = fixtureCanvas.getContext("2d")!;
    fixtureContext.fillStyle = "#b44d38";
    fixtureContext.fillRect(0, 0, 32, 32);
    fixtureContext.fillStyle = "#f1e7d5";
    fixtureContext.fillRect(5, 5, 22, 22);
    const fixtureBlob = await new Promise<Blob>((resolve, reject) => fixtureCanvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Could not encode the long-export slide fixture.")),
      "image/png",
    ));
    const fixtureUrl = URL.createObjectURL(fixtureBlob);

    const projectFixture = (duration: number, slideCount: number, width: number, height: number) => {
      const project = createDefaultDriftProjectV4(
        `long-export-${duration}-${slideCount}-${width}x${height}`,
        "2026-08-23T00:00:00.000Z",
        73,
        DRIFT_V2_RENDER_CONTRACT,
      );
      project.composition = { ...project.composition, width, height, alphaMode: "opaque" };
      project.master = { ...project.master, duration, fps };
      project.motion = {
        ...project.motion,
        seamless: { enabled: true, loops: 1 },
      };
      project.performance = createPerformanceLifecycle({
        entry: { enabled: false },
        body: { durationSeconds: duration, tempo: { kind: "preset", preset: "even" } },
        exit: { enabled: false },
        repeat: { mode: "off" },
        reducedMotion: false,
      }).authoring;
      project.media.order = [];
      project.media.assets = {};
      project.slides = {};
      for (let index = 0; index < slideCount; index += 1) {
        const id = `slide-${index.toString().padStart(3, "0")}`;
        project.media.order.push(id);
        project.media.assets[id] = {
          id,
          name: `${id}.png`,
          kind: "image",
          mimeType: "image/png",
          hash: (index + 1).toString(16).padStart(64, "0"),
          byteLength: fixtureBlob.size,
          width: 32,
          height: 32,
        };
        project.slides[id] = {
          assetId: id,
          fit: "cover",
          focalX: 0.5,
          focalY: 0.5,
          scaleOffset: 0,
        };
      }
      return validateDriftProjectV4(project);
    };

    const assetsFor = (project: ReturnType<typeof projectFixture>) => project.media.order.map((id) => ({
      id,
      name: `${id}.png`,
      kind: "image" as const,
      blob: fixtureBlob,
      mimeType: "image/png",
      width: 32,
      height: 32,
      hash: project.media.assets[id]!.hash,
      objectUrl: fixtureUrl,
    }));

    const pureMatrix = matrix.map((entry) => {
      const project = projectFixture(entry.duration, entry.slides, entry.width, entry.height);
      const settings = { width: entry.width, height: entry.height, fps, duration: entry.duration };
      const expectedFrameCount = entry.duration * fps;
      const frameCount = getExportFrameCount(settings);
      const plan = buildExportFramePlan(settings);
      return {
        ...entry,
        projectFormatVersion: project.formatVersion,
        renderContract: project.renderContract,
        expectedFrameCount,
        frameCount,
        planLength: plan.length,
        firstFrame: plan[0]?.time ?? null,
        lastFrame: plan.at(-1)?.time ?? null,
        encodedDuration: frameCount / fps,
        pass: frameCount === expectedFrameCount
          && plan.length === expectedFrameCount
          && plan[0]?.time === 0
          && plan.at(-1)?.time === (expectedFrameCount - 1) / fps,
      };
    });

    const sha256 = async (blob: Blob) => Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");

    const runPhysicalCase = async (entry: (typeof actualCases)[number]) => {
      const project = projectFixture(entry.duration, entry.slides, entry.width, entry.height);
      const assets = assetsFor(project);
      const canvas = document.createElement("canvas");
      document.body.append(canvas);
      const contextStates: string[] = [];
      const engine = new CinematicCarousel(canvas, { kind: "project-v4", project }, {
        onContextState: (state) => contextStates.push(state),
      });
      engine.stop();
      const internal = engine as unknown as {
        textureCache: Map<string, unknown>;
        texturePromises: Map<string, Promise<unknown>>;
        textureDecodeQueue: unknown[];
        activeTextureDecodes: number;
        renderer: { info: { memory: { geometries: number; textures: number } } };
      };
      const originalCreateImageBitmap = window.createImageBitmap.bind(window);
      let activeDecodes = 0;
      let peakActiveDecodes = 0;
      let peakTextureCache = 0;
      let peakPendingTextures = 0;
      const startedAt = performance.now();

      try {
        window.createImageBitmap = (async (image: ImageBitmapSource, options?: ImageBitmapOptions) => {
          activeDecodes += 1;
          peakActiveDecodes = Math.max(peakActiveDecodes, activeDecodes);
          try {
            return await originalCreateImageBitmap(image, options);
          } finally {
            activeDecodes -= 1;
          }
        }) as typeof window.createImageBitmap;
        await engine.setV2ProjectState(project, assets);
        const glBefore = canvas.getContext("webgl2");
        const baselineGpu = { ...internal.renderer.info.memory };
        const surface = engine.beginExport(entry.width, entry.height);
        let result: Awaited<ReturnType<typeof exportMp4>>;
        try {
          try {
            result = await exportMp4({
              canvas,
              renderAt: async (time, _presenter, context) => {
                await engine.renderAtAsync(time, context?.frameIndex ?? null);
                peakTextureCache = Math.max(peakTextureCache, internal.textureCache.size);
                peakPendingTextures = Math.max(peakPendingTextures, internal.texturePromises.size);
              },
              settings: { width: entry.width, height: entry.height, fps, duration: entry.duration },
              includePresenterAudio: false,
            });
          } catch (error) {
            const failure = error as { code?: string; message?: string; details?: unknown };
            throw new Error(`Long-export encoder failed: ${JSON.stringify({
              code: failure.code,
              message: failure.message,
              details: failure.details,
            })}`);
          }
        } finally {
          surface.restore();
        }
        const glAfter = canvas.getContext("webgl2");
        const cacheAtCompletion = internal.textureCache.size;
        const gpuAtCompletion = { ...internal.renderer.info.memory };
        const empty = projectFixture(entry.duration, 0, entry.width, entry.height);
        await engine.setV2ProjectState(empty, []);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        const cacheAfterUnload = internal.textureCache.size;
        const gpuAfterUnload = { ...internal.renderer.info.memory };
        const blob = result.blob;
        if (!blob) throw new Error("Long-export QA requires in-memory bytes for verification.");
        return {
          ...entry,
          expectedFrameCount: entry.duration * fps,
          resultFrameCount: result.frameCount,
          verificationFrameCount: result.verification.frameCount,
          resultDuration: result.duration,
          verificationDuration: result.verification.duration,
          colorSpace: result.verification.colorSpace,
          opaque: result.verification.opaque,
          mp4Bytes: blob.size,
          mp4Sha256: await sha256(blob),
          decodedProbeFrames: result.verification.decodedProbeFrames,
          peakActiveDecodes,
          peakTextureCache,
          peakPendingTextures,
          cacheAtCompletion,
          cacheAfterUnload,
          finalPendingTextures: internal.texturePromises.size,
          finalQueuedDecodes: internal.textureDecodeQueue.length,
          finalActiveDecodes: internal.activeTextureDecodes,
          baselineGpu,
          gpuAtCompletion,
          gpuAfterUnload,
          sameWebGlContext: glBefore !== null && glBefore === glAfter,
          contextStates,
          elapsedMilliseconds: Math.round(performance.now() - startedAt),
        };
      } finally {
        window.createImageBitmap = originalCreateImageBitmap;
        engine.dispose();
        canvas.remove();
      }
    };

    const physical: Awaited<ReturnType<typeof runPhysicalCase>>[] = [];
    for (const entry of actualCases) physical.push(await runPhysicalCase(entry));

    const cancellationEntry = cancellationCase;
    const cancellationProject = projectFixture(
      cancellationEntry.duration,
      cancellationEntry.slides,
      cancellationEntry.width,
      cancellationEntry.height,
    );
    const cancellationAssets = assetsFor(cancellationProject);
    const cancellationCanvas = document.createElement("canvas");
    document.body.append(cancellationCanvas);
    const cancellationStates: string[] = [];
    const cancellationEngine = new CinematicCarousel(
      cancellationCanvas,
      { kind: "project-v4", project: cancellationProject },
      { onContextState: (state) => cancellationStates.push(state) },
    );
    cancellationEngine.stop();
    const cancellationInternal = cancellationEngine as unknown as {
      textureCache: Map<string, unknown>;
      texturePromises: Map<string, Promise<unknown>>;
      textureDecodeQueue: unknown[];
      activeTextureDecodes: number;
    };
    const controller = new AbortController();
    let completedFramesBeforeCancel = 0;
    let cancellationCode = "";
    let cancellationMessage = "";
    let cancellationReturnedArtifact = false;
    try {
      await cancellationEngine.setV2ProjectState(cancellationProject, cancellationAssets);
      const glBefore = cancellationCanvas.getContext("webgl2");
      const surface = cancellationEngine.beginExport(cancellationEntry.width, cancellationEntry.height);
      try {
        const result = await exportMp4({
          canvas: cancellationCanvas,
          renderAt: async (time, _presenter, context) => {
            await cancellationEngine.renderAtAsync(time, context?.frameIndex ?? null);
          },
          settings: {
            width: cancellationEntry.width,
            height: cancellationEntry.height,
            fps,
            duration: cancellationEntry.duration,
          },
          includePresenterAudio: false,
          signal: controller.signal,
          onProgress: (progress) => {
            if (progress.phase !== "video") return;
            completedFramesBeforeCancel = Math.max(completedFramesBeforeCancel, progress.completed);
            if (progress.completed >= 12 && !controller.signal.aborted) controller.abort("long-export-qa");
          },
        });
        cancellationReturnedArtifact = result.blob !== null;
      } catch (error) {
        const candidate = error as { code?: string; message?: string };
        cancellationCode = candidate.code ?? (error instanceof Error ? error.name : "unknown");
        cancellationMessage = candidate.message ?? String(error);
      } finally {
        surface.restore();
      }
      const glAfter = cancellationCanvas.getContext("webgl2");
      const empty = projectFixture(cancellationEntry.duration, 0, cancellationEntry.width, cancellationEntry.height);
      await cancellationEngine.setV2ProjectState(empty, []);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const cancellation = {
        requestedAtCompletedFrame: completedFramesBeforeCancel,
        code: cancellationCode,
        message: cancellationMessage,
        returnedArtifact: cancellationReturnedArtifact,
        sameWebGlContext: glBefore !== null && glBefore === glAfter,
        contextStates: cancellationStates,
        cacheAfterUnload: cancellationInternal.textureCache.size,
        finalPendingTextures: cancellationInternal.texturePromises.size,
        finalQueuedDecodes: cancellationInternal.textureDecodeQueue.length,
        finalActiveDecodes: cancellationInternal.activeTextureDecodes,
      };

      return {
        runtime: {
          userAgent: navigator.userAgent,
          hardwareConcurrency: navigator.hardwareConcurrency,
        },
        thresholds: {
          fps,
          maximumTextureCacheEntries: 24,
          maximumConcurrentDecodes: 4,
        },
        fixture: {
          sourceImageWidth: 32,
          sourceImageHeight: 32,
          sharedSourceBlobBytes: fixtureBlob.size,
          note: "Distinct Project V4 asset identities share one deterministic source image.",
        },
        pureMatrix,
        physical,
        cancellation,
      };
    } finally {
      cancellationEngine.dispose();
      cancellationCanvas.remove();
      URL.revokeObjectURL(fixtureUrl);
    }
  }, {
    matrix: MATRIX,
    actualCases: SELECTED_ACTUAL_CASES,
    cancellationCase: ACTUAL_CASES.at(-1)!,
    fps: FPS,
  });

  const heapAfter = await collectHeap(page);
  const heapDelta = heapBefore === null || heapAfter === null ? null : heapAfter - heapBefore;

  expect(browserReceipt.pureMatrix).toHaveLength(MATRIX.length);
  expect(browserReceipt.pureMatrix.every(({ pass }) => pass)).toBe(true);
  for (const result of browserReceipt.physical) {
    expect(result.resultFrameCount).toBe(result.expectedFrameCount);
    expect(result.verificationFrameCount).toBe(result.expectedFrameCount);
    expect(result.resultDuration).toBe(result.duration);
    expect(result.verificationDuration).toBe(result.duration);
    expect(result.colorSpace).toMatchObject({
      primaries: "bt709",
      transfer: "bt709",
      matrix: "bt709",
      fullRange: false,
    });
    expect(result.opaque).toBe(true);
    expect(result.mp4Bytes).toBeGreaterThan(0);
    expect(result.mp4Sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.decodedProbeFrames).toBeGreaterThan(0);
    expect(result.peakActiveDecodes).toBeLessThanOrEqual(MAX_CONCURRENT_DECODES);
    expect(result.peakTextureCache).toBeLessThanOrEqual(MAX_TEXTURE_CACHE);
    expect(result.cacheAtCompletion).toBeLessThanOrEqual(MAX_TEXTURE_CACHE);
    expect(result.cacheAfterUnload).toBe(0);
    expect(result.finalPendingTextures).toBe(0);
    expect(result.finalQueuedDecodes).toBe(0);
    expect(result.finalActiveDecodes).toBe(0);
    expect(result.gpuAfterUnload.geometries).toBeLessThanOrEqual(result.baselineGpu.geometries);
    expect(result.gpuAfterUnload.textures).toBeLessThanOrEqual(result.baselineGpu.textures);
    expect(result.sameWebGlContext).toBe(true);
    expect(result.contextStates).not.toContain("lost");
    expect(result.contextStates).not.toContain("restored");
  }
  expect(browserReceipt.cancellation.requestedAtCompletedFrame).toBeGreaterThanOrEqual(12);
  expect(browserReceipt.cancellation.code).toBe("CANCELLED");
  expect(browserReceipt.cancellation.returnedArtifact).toBe(false);
  expect(browserReceipt.cancellation.sameWebGlContext).toBe(true);
  expect(browserReceipt.cancellation.contextStates).not.toContain("lost");
  expect(browserReceipt.cancellation.contextStates).not.toContain("restored");
  expect(browserReceipt.cancellation.cacheAfterUnload).toBe(0);
  expect(browserReceipt.cancellation.finalPendingTextures).toBe(0);
  expect(browserReceipt.cancellation.finalQueuedDecodes).toBe(0);
  expect(browserReceipt.cancellation.finalActiveDecodes).toBe(0);
  if (heapDelta !== null) expect(heapDelta).toBeLessThanOrEqual(HEAP_RETURN_ALLOWANCE_BYTES);

  const root = process.cwd();
  const now = new Date();
  const runId = now.toISOString().replaceAll(":", "-").replace(".000Z", "Z");
  const receiptDirectory = path.join(root, "output", "qa", "v2-long-export", runId);
  const receiptPath = path.join(receiptDirectory, "receipt.json");
  const receipt = {
    schemaVersion: 1,
    runId,
    recordedAt: now.toISOString(),
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    sourceFingerprintSha256: await sourceFingerprint(root),
    evidenceScope: {
      pureFramePlan: "Eight nominal-resolution Project V4 matrix cases; no pixels encoded.",
      physicalExport: `${PHYSICAL_SCOPE === "full" ? "Three" : "One smoke"} complete H.264 case(s) and one 180s/200-slide cancellation case at deliberately small resolution.`,
      notProved: [
        "1080p or 4K long-export throughput and RSS",
        "physical Intel behavior",
        "encoder behavior outside this installed headed-Chrome lane",
        "diverse source-image decode cost; asset identities share one 32x32 fixture",
      ],
    },
    memory: {
      jsHeapBeforeBytes: heapBefore,
      jsHeapAfterBytes: heapAfter,
      jsHeapDeltaBytes: heapDelta,
      allowedDeltaBytes: HEAP_RETURN_ALLOWANCE_BYTES,
      heapReturnPassed: heapDelta === null ? null : heapDelta <= HEAP_RETURN_ALLOWANCE_BYTES,
      structuralReturn: "Every engine returned to zero project texture cache, zero pending/queued/active decodes, and no more renderer textures/geometries than its pre-export baseline after unload.",
    },
    ...browserReceipt,
    overallPassed: true,
  };
  await mkdir(receiptDirectory, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(`LONG_EXPORT_QA_RECEIPT=${receiptPath}`);
});
