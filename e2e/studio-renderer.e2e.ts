import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  audioOnlyFixturePath,
  fixturePath,
  halfAlphaGreyPng,
  LOCAL_REOPENED_NOTICE,
  PORTABLE_OPENED_NOTICE,
  PORTABLE_SAVED_NOTICE,
  presenterFixturePath,
  waitForStudio,
} from "./studio.helpers";

test("large valid project seeds retain deterministic grain entropy", async ({ page }) => {
  await page.goto("/");
  const receipt = await page.evaluate(async () => {
    const [{ CinematicCarousel }, { DEFAULT_SETTINGS }] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
    ]);
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.stage = { width: 256, height: 256, transparent: false };
    settings.output = { ...settings.output, width: 256, height: 256, fps: 24, duration: 3 };
    settings.background = {
      ...settings.background,
      style: "solid",
      colorA: "#202020",
      colorB: "#202020",
      accent: "#202020",
      intensity: 0,
      motion: 0,
      grain: 0.6,
      vignette: 0,
      seed: 4_294_967_295,
    };
    settings.motion = { ...settings.motion, autoplay: false, reducedMotionOutput: true };

    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const engine = new CinematicCarousel(canvas, settings);
    const hashBlob = async (blob: Blob): Promise<string> => Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    const redStats = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none" });
      const decoded = document.createElement("canvas");
      decoded.width = bitmap.width;
      decoded.height = bitmap.height;
      const context = decoded.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const rgba = context.getImageData(0, 0, decoded.width, decoded.height).data;
      const values: number[] = [];
      for (let index = 0; index < rgba.length; index += 4) values.push(rgba[index]!);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      return { standardDeviation: Math.sqrt(variance), uniqueValues: new Set(values).size };
    };

    try {
      const first = await engine.captureStill(256, 256, 0);
      const repeated = await engine.captureStill(256, 256, 0);
      settings.background.seed = 10_000_000;
      engine.setSettings(structuredClone(settings));
      const otherSeed = await engine.captureStill(256, 256, 0);
      return {
        firstHash: await hashBlob(first),
        repeatedHash: await hashBlob(repeated),
        otherHash: await hashBlob(otherSeed),
        stats: await redStats(first),
      };
    } finally {
      engine.dispose();
      canvas.remove();
    }
  });

  expect(receipt.repeatedHash).toBe(receipt.firstHash);
  expect(receipt.otherHash).not.toBe(receipt.firstHash);
  expect(receipt.stats.standardDeviation).toBeGreaterThan(1);
  expect(receipt.stats.uniqueValues).toBeGreaterThan(8);
});

test("renderer pool and media replacement always preserve latest visual intent", async ({ page }) => {
  await page.goto("/");
  const receipt = await page.evaluate(async () => {
    const [{ CinematicCarousel }, { DEFAULT_SETTINGS }] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
    ]);

    const makeSolidAsset = async (color: string, id: string, hash: string) => {
      const source = document.createElement("canvas");
      source.width = 64;
      source.height = 64;
      const context = source.getContext("2d")!;
      context.fillStyle = color;
      context.fillRect(0, 0, 64, 64);
      const blob = await new Promise<Blob>((resolve, reject) => source.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Could not create solid media fixture.")),
        "image/png",
      ));
      return {
        id,
        name: `${id}.png`,
        kind: "image" as const,
        blob,
        mimeType: "image/png",
        width: 64,
        height: 64,
        hash,
        objectUrl: URL.createObjectURL(blob),
      };
    };

    const sample = async (blob: Blob, x: number, y: number): Promise<number[]> => {
      const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none" });
      const decoded = document.createElement("canvas");
      decoded.width = bitmap.width;
      decoded.height = bitmap.height;
      const context = decoded.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      const pixel = Array.from(context.getImageData(x, y, 1, 1).data);
      bitmap.close();
      return pixel;
    };

    const hashBlob = async (blob: Blob): Promise<string> => Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");

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
    settings.presenter = {
      ...settings.presenter,
      enabled: true,
      assetId: "presenter-b",
      x: 0.5,
      y: 0.5,
      width: 0.72,
      aspectWidth: 1,
      aspectHeight: 1,
      radius: 0,
      smoothing: 0,
      borderWidth: 0,
      borderOpacity: 0,
      shadowOpacity: 0,
    };

    const red = await makeSolidAsset("#ff0000", "same-id", "a".repeat(64));
    const blue = await makeSolidAsset("#0000ff", "same-id", "b".repeat(64));
    const presenterA = await makeSolidAsset("#ff0000", "presenter-a", "c".repeat(64));
    const presenterB = await makeSolidAsset("#0000ff", "presenter-b", "d".repeat(64));
    const raceSlide = await makeSolidAsset("#00ff00", "race-slide", "e".repeat(64));
    const racePresenter = await makeSolidAsset("#ff0000", "race-presenter", "f".repeat(64));
    const urls = [red.objectUrl, blue.objectUrl, presenterA.objectUrl, presenterB.objectUrl, raceSlide.objectUrl, racePresenter.objectUrl];
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    document.body.append(canvas);
    const engine = new CinematicCarousel(canvas, settings);
    engine.stop();

    try {
      await engine.setAssets([red]);
      const before = await sample(await engine.captureStill(256, 256, 0), 128, 128);
      await engine.setAssets([blue]);
      const after = await sample(await engine.captureStill(256, 256, 0), 128, 128);

      const pressureSettings = structuredClone(settings);
      pressureSettings.stage = { width: 256, height: 456, transparent: true };
      pressureSettings.output = { ...pressureSettings.output, width: 256, height: 456 };
      pressureSettings.motion.axis = "vertical";
      pressureSettings.slide.aspectWidth = 4;
      pressureSettings.slide.aspectHeight = 1;
      pressureSettings.slide.scale = 0.24;
      pressureSettings.presenter.enabled = false;
      pressureSettings.presenter.assetId = null;
      engine.setSettings(pressureSettings);
      const pressure = await sample(await engine.captureStill(256, 456, 0), 128, 228);

      engine.setSettings(settings);
      await engine.setAssets([]);
      const originalCreateImageBitmap = window.createImageBitmap.bind(window);
      let releaseA!: () => void;
      let markAStarted!: () => void;
      const gateA = new Promise<void>((resolve) => { releaseA = resolve; });
      const aStarted = new Promise<void>((resolve) => { markAStarted = resolve; });
      window.createImageBitmap = (async (source: ImageBitmapSource, options?: ImageBitmapOptions) => {
        if (source === presenterA.blob) {
          markAStarted();
          await gateA;
        }
        return originalCreateImageBitmap(source, options);
      }) as typeof window.createImageBitmap;
      try {
        const oldRequest = engine.setPresenterAsset(presenterA);
        await aStarted;
        await engine.setPresenterAsset(presenterB);
        releaseA();
        await oldRequest;
      } finally {
        window.createImageBitmap = originalCreateImageBitmap;
      }
      const presenter = await sample(await engine.captureStill(256, 256, 0), 128, 128);
      const deterministicBefore = await hashBlob(await engine.captureStill(256, 256, 0));
      engine.start();
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      engine.stop();
      const deterministicAfter = await hashBlob(await engine.captureStill(256, 256, 0));

      const raceSettings = structuredClone(settings);
      raceSettings.presenter.assetId = racePresenter.id;
      engine.setSettings(raceSettings);
      let releaseSlide!: () => void;
      let markSlideStarted!: () => void;
      let releasePresenter!: () => void;
      let markPresenterStarted!: () => void;
      const slideGate = new Promise<void>((resolve) => { releaseSlide = resolve; });
      const slideStarted = new Promise<void>((resolve) => { markSlideStarted = resolve; });
      const presenterGate = new Promise<void>((resolve) => { releasePresenter = resolve; });
      const presenterStarted = new Promise<void>((resolve) => { markPresenterStarted = resolve; });
      window.createImageBitmap = (async (source: ImageBitmapSource, options?: ImageBitmapOptions) => {
        if (source === raceSlide.blob) {
          markSlideStarted();
          await slideGate;
        }
        if (source === racePresenter.blob) {
          markPresenterStarted();
          await presenterGate;
        }
        return originalCreateImageBitmap(source, options);
      }) as typeof window.createImageBitmap;
      const exportFrame = document.createElement("canvas");
      exportFrame.width = 256;
      exportFrame.height = 256;
      const exportContext = exportFrame.getContext("2d")!;
      exportContext.fillStyle = "#0000ff";
      exportContext.fillRect(0, 0, 256, 256);
      let racePixel: number[] = [];
      let surface: ReturnType<typeof engine.beginExport> | null = null;
      try {
        const movingRequest = engine.setAssets([raceSlide]);
        await slideStarted;
        const previewRequest = engine.setPresenterAsset(racePresenter);
        await presenterStarted;
        surface = engine.beginExport(256, 256);
        engine.setPresenterExportFrame(exportFrame);
        const renderRequest = engine.renderAtAsync(0);
        releasePresenter();
        await previewRequest;
        releaseSlide();
        await movingRequest;
        await renderRequest;
        const raceBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
          (value) => value ? resolve(value) : reject(new Error("Could not capture export race fixture.")),
          "image/png",
        ));
        racePixel = await sample(raceBlob, 128, 128);
      } finally {
        releasePresenter();
        releaseSlide();
        surface?.restore();
        window.createImageBitmap = originalCreateImageBitmap;
      }

      return { before, after, pressure, presenter, deterministicBefore, deterministicAfter, racePixel };
    } finally {
      engine.dispose();
      for (const url of urls) URL.revokeObjectURL(url);
      canvas.remove();
    }
  });

  expect(receipt.before[0]).toBeGreaterThan(245);
  expect(receipt.before[2]).toBeLessThan(10);
  expect(receipt.after[0]).toBeLessThan(10);
  expect(receipt.after[2]).toBeGreaterThan(245);
  expect(receipt.pressure[3]).toBeGreaterThan(245);
  expect(receipt.presenter[0]).toBeLessThan(10);
  expect(receipt.presenter[2]).toBeGreaterThan(245);
  expect(receipt.deterministicAfter).toBe(receipt.deterministicBefore);
  expect(receipt.racePixel[0]).toBeLessThan(10);
  expect(receipt.racePixel[2]).toBeGreaterThan(245);
});

test("a pinned image outside the moving mesh pool is awaited before export", async ({ page }) => {
  await page.goto("/");
  const receipt = await page.evaluate(async () => {
    const [{ CinematicCarousel }, { DEFAULT_SETTINGS }] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
    ]);

    const makeSolid = async (colour: string, id: string, hash: string) => {
      const source = document.createElement("canvas");
      source.width = 64;
      source.height = 64;
      const context = source.getContext("2d")!;
      context.fillStyle = colour;
      context.fillRect(0, 0, 64, 64);
      const blob = await new Promise<Blob>((resolve, reject) => source.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Could not create pool fixture.")),
        "image/png",
      ));
      return {
        id,
        name: `${id}.png`,
        kind: "image" as const,
        blob,
        mimeType: "image/png",
        width: 64,
        height: 64,
        hash,
        objectUrl: URL.createObjectURL(blob),
      };
    };

    const base = await makeSolid("#202020", "base", "1".repeat(64));
    const pinned = await makeSolid("#ff1616", "pinned-thirty", "2".repeat(64));
    const assets = Array.from({ length: 50 }, (_, index) => index === 30 ? pinned : ({
      ...base,
      id: `slide-${index}`,
      name: `slide-${index}.png`,
      hash: index.toString(16).padStart(64, "0"),
    }));
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.stage = { width: 256, height: 256, transparent: true };
    settings.output = { ...settings.output, width: 256, height: 256, fps: 24, duration: 3 };
    settings.background = { ...settings.background, style: "transparent", grain: 0, vignette: 0 };
    settings.motion = { ...settings.motion, speed: 0, flow: "straight", distortion: 0, depth: 0, tilt: 0 };
    settings.slide = {
      ...settings.slide,
      aspectWidth: 1,
      aspectHeight: 1,
      radius: 0,
      smoothing: 0,
      borderWidth: 0,
      borderOpacity: 0,
      shadowOpacity: 0,
    };
    settings.presenter = {
      ...settings.presenter,
      enabled: false,
      assetId: null,
      x: 0.5,
      y: 0.5,
      width: 0.72,
      aspectWidth: 1,
      aspectHeight: 1,
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
    const engine = new CinematicCarousel(canvas, settings);
    engine.stop();
    const originalCreateImageBitmap = window.createImageBitmap.bind(window);
    let releasePinned!: () => void;
    let markPinnedStarted!: () => void;
    const pinnedGate = new Promise<void>((resolve) => { releasePinned = resolve; });
    const pinnedStarted = new Promise<void>((resolve) => { markPinnedStarted = resolve; });
    let surface: ReturnType<typeof engine.beginExport> | null = null;

    try {
      await engine.setAssets(assets);
      const preload = engine.beginExport(256, 256);
      try {
        await engine.renderAtAsync(0);
      } finally {
        preload.restore();
      }

      const pinnedSettings = structuredClone(settings);
      pinnedSettings.presenter.enabled = true;
      pinnedSettings.presenter.assetId = pinned.id;
      engine.setSettings(pinnedSettings);
      window.createImageBitmap = (async (source: ImageBitmapSource, options?: ImageBitmapOptions) => {
        if (source === pinned.blob) {
          markPinnedStarted();
          await pinnedGate;
        }
        return originalCreateImageBitmap(source, options);
      }) as typeof window.createImageBitmap;

      const presenterRequest = engine.setPresenterAsset(pinned);
      await pinnedStarted;
      surface = engine.beginExport(256, 256);
      engine.setPresenterExportFrame(null);
      let settled = false;
      const renderRequest = engine.renderAtAsync(0).then(() => { settled = true; });
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      const blockedBeforeRelease = !settled;
      releasePinned();
      await Promise.all([presenterRequest, renderRequest]);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Could not capture pinned pool fixture.")),
        "image/png",
      ));
      const bitmap = await createImageBitmap(blob);
      const decoded = document.createElement("canvas");
      decoded.width = bitmap.width;
      decoded.height = bitmap.height;
      const context = decoded.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      const pixel = Array.from(context.getImageData(128, 128, 1, 1).data);
      bitmap.close();
      return { blockedBeforeRelease, pixel };
    } finally {
      releasePinned();
      surface?.restore();
      window.createImageBitmap = originalCreateImageBitmap;
      engine.dispose();
      URL.revokeObjectURL(base.objectUrl);
      URL.revokeObjectURL(pinned.objectUrl);
      canvas.remove();
    }
  });

  expect(receipt.blockedBeforeRelease).toBe(true);
  expect(receipt.pixel[0]).toBeGreaterThan(245);
  expect(receipt.pixel[1]).toBeLessThan(50);
  expect(receipt.pixel[2]).toBeLessThan(50);
});
