import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  audioOnlyFixturePath,
  fixturePath,
  halfAlphaGreyPng,
  LOCAL_REOPENED_NOTICE,
  PORTABLE_OPENED_NOTICE,
  PORTABLE_SAVED_NOTICE,
  presenterAvFixturePath,
  presenterFixturePath,
  prepareGuidedExport,
  startGuidedExport,
  switchWorkspace,
  waitForStudio,
} from "./studio.helpers";

test("WebGL2 denial yields an explicit, usable DOM fallback", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as Window & { __driftSavePickerCalls?: number; showSaveFilePicker?: () => Promise<never> };
    state.__driftSavePickerCalls = 0;
    state.showSaveFilePicker = () => {
      state.__driftSavePickerCalls = (state.__driftSavePickerCalls ?? 0) + 1;
      return new Promise<never>(() => undefined);
    };
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type: string, ...args: unknown[]) {
      if (type === "webgl2") return null;
      return original.call(this, type as never, ...(args as []));
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/");
  await expect(page.getByText("Cinematic renderer unavailable.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Cinematic export is blocked/)).toBeVisible();
  await switchWorkspace(page, "EXPORT");
  await expect(page.getByRole("button", { name: "Save portable project" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add slides" })).toBeVisible();
  const wizard = page.getByRole("region", { name: "Guided Export" });
  await wizard.getByRole("button", { name: "Choose format" }).click();
  await expect(wizard.getByRole("radio", { name: /H\.264 MP4/ })).toBeDisabled();
  await expect(wizard).toContainText("The cinematic render surface is unavailable");
  expect(await page.evaluate(() => (window as Window & { __driftSavePickerCalls?: number }).__driftSavePickerCalls)).toBe(0);
});

test("export lifecycle preserves playback truth and releases a failed GPU preflight", async ({ page }) => {
  await waitForStudio(page);
  await switchWorkspace(page, "EXPORT");
  await page.getByLabel("Stage width").fill("256");
  await page.getByLabel("Stage height").fill("256");
  await page.getByRole("group", { name: "Master duration" }).getByText("Exact length", { exact: true }).click();
  await page.getByLabel("Exact duration", { exact: true }).fill("3");
  await page.getByRole("group", { name: "Frame rate" }).getByText("24", { exact: true }).click();
  await expect(page.locator(".stage-hud")).toContainText("256 × 256");
  await expect(page.getByRole("button", { name: "Pause preview" })).toBeVisible();

  const stillDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save one PNG still" }).click();
  expect(await (await stillDownload).path()).toBeTruthy();
  const pause = page.getByRole("button", { name: "Pause preview" });
  await expect(pause).toBeEnabled();
  await pause.click();
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();
  await page.getByRole("button", { name: "Play preview" }).click();
  await expect(page.getByRole("button", { name: "Pause preview" })).toBeVisible();

  await page.getByRole("button", { name: "Pause preview" }).click();
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();
  // Cancellation needs a controlled in-flight encoder. At this tiny fixture
  // size an unconstrained sequence can legitimately finish before the pointer
  // reaches the button, which tests machine speed rather than cancellation.
  // Force the deterministic ZIP lane; current Chromium exposes the directory
  // picker and dismissing its native sheet is not an encoder cancellation.
  await page.evaluate(() => {
    Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: undefined });
  });
  await page.locator("[data-testid=webgl-stage]").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const originalToBlob = canvas.toBlob.bind(canvas);
    canvas.toBlob = function delayedToBlob(callback, type, quality) {
      return originalToBlob.call(this, (blob) => {
        window.setTimeout(() => callback(blob), 1_000);
      }, type, quality);
    };
  });
  await prepareGuidedExport(page, "PNG Frames", "Bounded ZIP");
  await Promise.all([
    page.locator(".export-overlay").waitFor({ state: "visible" }),
    startGuidedExport(page),
  ]);
  const progressOverlay = page.locator(".export-overlay");
  await expect(progressOverlay).toContainText(/Elapsed \d+:\d{2}/);
  await expect(progressOverlay).toContainText(/Estimating…|ETA \d+:\d{2}/);
  await expect(progressOverlay).not.toContainText(/\d+%/);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel export" }).click({ force: true });
  await expect(page.locator(".export-overlay")).toBeHidden();
  await expect(page.getByRole("button", { name: "Play preview" })).toBeEnabled();
  await page.getByRole("button", { name: "Play preview" }).click();
  await expect(page.getByRole("button", { name: "Pause preview" })).toBeVisible();
  await expect(page.locator(".header-status")).toContainText("saved locally", { timeout: 10_000 });

  const guidedExport = page.getByRole("region", { name: "Guided Export" });
  for (const step of ["film-audio", "format", "purpose-background"] as const) {
    await guidedExport.getByRole("button", { name: "Back" }).click();
    await expect(guidedExport).toHaveAttribute("data-step", step);
  }

  await page.locator("[data-testid=webgl-stage]").evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2")!;
    const original = gl.getParameter.bind(gl);
    Object.defineProperty(gl, "getParameter", {
      configurable: true,
      value: (parameter: number) => {
        if (parameter === gl.MAX_RENDERBUFFER_SIZE) return 128;
        if (parameter === gl.MAX_VIEWPORT_DIMS) return new Int32Array([128, 128]);
        return original(parameter);
      },
    });
  });

  await page.getByRole("button", { name: "Save one PNG still" }).click();
  await expect(page.getByRole("alert")).toContainText("exceeds this GPU's safe WebGL limit of 128 × 128");
  const projectDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save portable project" }).click();
  expect(await (await projectDownload).path()).toBeTruthy();
  await expect(page.locator(".notice")).toContainText(PORTABLE_SAVED_NOTICE);
});

test("presenter export preflight decodes a real frame before rendering", async ({ page }) => {
  await page.goto("/");
  const presenterBase64 = (await readFile(presenterFixturePath)).toString("base64");
  const result = await page.evaluate(async (encoded) => {
    const { exportPngStill } = await import("/src/lib/exportStudio.ts");
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const presenter = new Blob([bytes], { type: "video/mp4" });
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const progress: Array<{ phase: string; completed: number; total: number; message: string | null }> = [];
    let decodedSourceTime: number | null = null;
    try {
      const still = await exportPngStill({
        canvas,
        presenter,
        time: 0.25,
        settings: { width: 128, height: 128, fps: 24, duration: 1 },
        renderAt: (_time, frame) => {
          if (!frame) throw new Error("Presenter frame was missing after decode preflight.");
          decodedSourceTime = frame.sourceTime;
          const context = canvas.getContext("2d")!;
          context.fillStyle = "#000";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(frame.image, 0, 0, canvas.width, canvas.height);
        },
        onProgress: (entry) => progress.push({
          phase: entry.phase,
          completed: entry.completed,
          total: entry.total,
          message: entry.message ?? null,
        }),
      });
      return { decodedSourceTime, bytes: still.blob.size, progress };
    } finally {
      canvas.remove();
    }
  }, presenterBase64);

  expect(result.decodedSourceTime).not.toBeNull();
  expect(result.bytes).toBeGreaterThan(0);
  expect(result.progress[0]).toEqual({
    phase: "preparing",
    completed: 0,
    total: 1,
    message: "Reading presenter video",
  });
});

test("@physical-encoder full presenter journey closes and verifies the fixed-step MP4 instead of hanging after its last frame", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined });
  });
  await waitForStudio(page);
  await page.locator('input[type="file"][accept^="video"]').setInputFiles(presenterAvFixturePath);
  await expect(page.locator(".presenter-card")).toBeVisible();

  await switchWorkspace(page, "MOTION");
  await page.getByRole("group", { name: "Timing authority" }).getByText("Exact length", { exact: true }).click();
  await page.getByLabel("Body duration").fill("1.5");

  await switchWorkspace(page, "EXPORT");
  await page.getByLabel("Stage width").fill("256");
  await page.getByLabel("Stage height").fill("256");
  await page.getByRole("group", { name: "Frame rate" }).getByText("24", { exact: true }).click();
  await expect(page.getByRole("status", { name: "Delivery receipt" })).toContainText("36 frames");
  await expect(page.getByRole("status", { name: "Delivery receipt" }))
    .toContainText("Presenter on · source checked at export");

  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await prepareGuidedExport(page, "H.264 MP4");
  await startGuidedExport(page);
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  expect((await readFile(path!)).byteLength).toBeGreaterThan(1_000);
  await expect(page.locator(".export-overlay")).toBeHidden();
  await expect(page.locator(".notice")).toContainText(
    "256 × 256 H.264 master verified: 36 frames at 24 fps · presenter AAC.",
  );
});

test("@physical-encoder installed Chrome verifies and downloads a delivery-size vertical presenter master", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined });
  });
  await waitForStudio(page);
  await page.locator('input[type="file"][accept^="video"]').setInputFiles(presenterAvFixturePath);
  await expect(page.locator(".presenter-card")).toBeVisible();

  await switchWorkspace(page, "MOTION");
  await page.getByRole("group", { name: "Timing authority" }).getByText("Exact length", { exact: true }).click();
  await page.getByLabel("Body duration").fill("1.5");

  await switchWorkspace(page, "EXPORT");
  await page.getByLabel("Stage width").fill("1080");
  await page.getByLabel("Stage height").fill("1920");
  await page.getByRole("group", { name: "Frame rate" }).getByText("24", { exact: true }).click();
  await expect(page.getByRole("status", { name: "Delivery receipt" })).toContainText("36 frames");
  await expect(page.getByRole("status", { name: "Delivery receipt" }))
    .toContainText("Presenter on · source checked at export");

  const completion = Promise.any([
    page.waitForEvent("download", { timeout: 90_000 })
      .then((download) => ({ kind: "download" as const, download })),
    page.getByRole("alert").waitFor({ state: "visible", timeout: 90_000 })
      .then(async () => ({
        kind: "rejected" as const,
        message: await page.getByRole("alert").textContent(),
      })),
  ]);
  await prepareGuidedExport(page, "H.264 MP4");
  await startGuidedExport(page);
  const result = await completion;
  expect(result.kind, result.kind === "rejected" ? result.message ?? undefined : undefined).toBe("download");
  if (result.kind !== "download") return;
  const path = await result.download.path();
  expect(path).toBeTruthy();
  expect((await readFile(path!)).byteLength).toBeGreaterThan(100_000);
  await expect(page.locator(".export-overlay")).toBeHidden();
  await expect(page.locator(".notice")).toContainText(
    "1080 × 1920 H.264 master verified: 36 frames at 24 fps · presenter AAC.",
  );
});

test("transparent PNG stores straight-alpha colour without dark fringes", async ({ page }) => {
  await page.goto("/");
  const receipt = await page.evaluate(async (encodedPng) => {
    const [{ CinematicCarousel }, { DEFAULT_SETTINGS }, { exportPngStill }] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
      import("/src/lib/exportStudio.ts"),
    ]);
    const bytes = Uint8Array.from(atob(encodedPng), (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: "image/png" });
    const objectUrl = URL.createObjectURL(blob);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    document.body.append(canvas);

    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.stage = { width: 256, height: 256, transparent: true };
    settings.output = { ...settings.output, width: 256, height: 256, fps: 24, duration: 3 };
    settings.background = { ...settings.background, style: "transparent", grain: 0, vignette: 0 };
    settings.motion = {
      ...settings.motion,
      axis: "horizontal",
      speed: 0,
      flow: "straight",
      gap: 0,
      curvature: 0,
      depth: 0,
      tilt: 0,
      distortion: 0,
      focusScale: 0,
      edgeFade: 0,
    };
    settings.slide = {
      ...settings.slide,
      aspectWidth: 1,
      aspectHeight: 1,
      scale: 1,
      fit: "cover",
      radius: 0,
      smoothing: 0,
      borderWidth: 0,
      borderOpacity: 0,
      shadowOpacity: 0,
    };

    const engine = new CinematicCarousel(canvas, { kind: "v1-compat", settings });
    try {
      await engine.setAssets([{
        id: "half-alpha-grey",
        name: "half-alpha-grey.png",
        kind: "image",
        blob,
        mimeType: "image/png",
        width: 4,
        height: 4,
        objectUrl,
      }]);
      const surface = engine.beginExport(256, 256);
      try {
        const result = await exportPngStill({
          canvas,
          renderAt: async (time) => engine.renderAtAsync(time),
          settings: { width: 256, height: 256, fps: 24, duration: 3 },
          requireAlpha: true,
          requireTransparentPixels: true,
        });
        const bitmap = await createImageBitmap(result.blob, { premultiplyAlpha: "none" });
        const decoded = document.createElement("canvas");
        decoded.width = bitmap.width;
        decoded.height = bitmap.height;
        const context = decoded.getContext("2d", { willReadFrequently: true })!;
        context.drawImage(bitmap, 0, 0);
        const pixel = Array.from(context.getImageData(128, 128, 1, 1).data);
        bitmap.close();
        const alpha = pixel[3]! / 255;
        const overWhite = pixel.slice(0, 3).map((channel) => Math.round(channel! * alpha + 255 * (1 - alpha)));
        return { pixel, overWhite, time: result.time };
      } finally {
        surface.restore();
      }
    } finally {
      engine.dispose();
      URL.revokeObjectURL(objectUrl);
      canvas.remove();
    }
  }, halfAlphaGreyPng);

  expect(receipt.time).toBe(1.5);
  expect(receipt.pixel[3]).toBeGreaterThanOrEqual(126);
  expect(receipt.pixel[3]).toBeLessThanOrEqual(129);
  for (const channel of receipt.pixel.slice(0, 3)) {
    expect(channel).toBeGreaterThanOrEqual(125);
    expect(channel).toBeLessThanOrEqual(131);
  }
  for (const channel of receipt.overWhite) {
    expect(channel).toBeGreaterThanOrEqual(189);
    expect(channel).toBeLessThanOrEqual(193);
  }
});

test("cover focal controls reach both source edges in both axes", async ({ page }) => {
  await page.goto("/");
  const samples = await page.evaluate(async () => {
    const [{ CinematicCarousel }, { DEFAULT_SETTINGS }, { exportPngStill }] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
      import("/src/lib/exportStudio.ts"),
    ]);

    const makeBands = async (width: number, height: number, vertical: boolean): Promise<Blob> => {
      const source = document.createElement("canvas");
      source.width = width;
      source.height = height;
      const context = source.getContext("2d")!;
      const colours = ["#ef1c1c", "#d228db", "#22d04c"];
      for (let index = 0; index < colours.length; index += 1) {
        context.fillStyle = colours[index]!;
        if (vertical) {
          const start = Math.floor((height * index) / 3);
          const end = Math.ceil((height * (index + 1)) / 3);
          context.fillRect(0, start, width, end - start);
        } else {
          const start = Math.floor((width * index) / 3);
          const end = Math.ceil((width * (index + 1)) / 3);
          context.fillRect(start, 0, end - start, height);
        }
      }
      return new Promise<Blob>((resolve, reject) => source.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Could not create focal fixture.")),
        "image/png",
      ));
    };

    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.stage = { width: 256, height: 256, transparent: true };
    settings.output = { ...settings.output, width: 256, height: 256, fps: 24, duration: 3 };
    settings.background = { ...settings.background, style: "transparent", grain: 0, vignette: 0 };
    settings.motion = {
      ...settings.motion,
      axis: "horizontal",
      speed: 0,
      flow: "straight",
      gap: 0,
      curvature: 0,
      depth: 0,
      tilt: 0,
      distortion: 0,
      focusScale: 0,
      edgeFade: 0,
    };
    settings.slide = {
      ...settings.slide,
      aspectWidth: 1,
      aspectHeight: 1,
      scale: 1,
      fit: "cover",
      radius: 0,
      smoothing: 0,
      borderWidth: 0,
      borderOpacity: 0,
      shadowOpacity: 0,
    };

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    document.body.append(canvas);
    const engine = new CinematicCarousel(canvas, { kind: "v1-compat", settings });
    const urls: string[] = [];

    const sampleAxis = async (vertical: boolean): Promise<number[][]> => {
      const blob = await makeBands(vertical ? 100 : 800, vertical ? 800 : 100, vertical);
      const objectUrl = URL.createObjectURL(blob);
      urls.push(objectUrl);
      await engine.setAssets([{
        id: vertical ? "vertical-bands" : "horizontal-bands",
        name: vertical ? "vertical-bands.png" : "horizontal-bands.png",
        kind: "image",
        blob,
        mimeType: "image/png",
        width: vertical ? 100 : 800,
        height: vertical ? 800 : 100,
        objectUrl,
      }]);

      const pixels: number[][] = [];
      for (const focal of [0, 0.5, 1]) {
        settings.slide.focalX = vertical ? 0.5 : focal;
        settings.slide.focalY = vertical ? focal : 0.5;
        engine.setV1Settings(structuredClone(settings));
        const surface = engine.beginExport(256, 256);
        try {
          const result = await exportPngStill({
            canvas,
            renderAt: async (time) => engine.renderAtAsync(time),
            settings: { width: 256, height: 256, fps: 24, duration: 3 },
            requireAlpha: true,
          });
          const bitmap = await createImageBitmap(result.blob);
          const decoded = document.createElement("canvas");
          decoded.width = bitmap.width;
          decoded.height = bitmap.height;
          const context = decoded.getContext("2d", { willReadFrequently: true })!;
          context.drawImage(bitmap, 0, 0);
          pixels.push(Array.from(context.getImageData(128, 128, 1, 1).data));
          bitmap.close();
        } finally {
          surface.restore();
        }
      }
      return pixels;
    };

    try {
      return {
        horizontal: await sampleAxis(false),
        vertical: await sampleAxis(true),
      };
    } finally {
      engine.dispose();
      for (const url of urls) URL.revokeObjectURL(url);
      canvas.remove();
    }
  });

  for (const axis of [samples.horizontal, samples.vertical]) {
    const [start, middle, end] = axis;
    expect(start![0]).toBeGreaterThan(180);
    expect(start![1]).toBeLessThan(100);
    expect(start![2]).toBeLessThan(100);
    expect(middle![0]).toBeGreaterThan(150);
    expect(middle![1]).toBeLessThan(100);
    expect(middle![2]).toBeGreaterThan(150);
    expect(end![0]).toBeLessThan(100);
    expect(end![1]).toBeGreaterThan(150);
    expect(end![2]).toBeLessThan(120);
  }
});
