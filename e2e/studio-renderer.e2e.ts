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

test("compatibility Project V4 state remains live renderer authority", async ({ page }) => {
  await page.goto("/");
  const receipt = await page.evaluate(async () => {
    const [
      { CinematicCarousel },
      { createDefaultDriftProjectV4 },
      { defaultPerformanceStillTime },
      { createPerformanceLifecycle },
      { studioSettingsFromDriftProject },
    ] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/core/project/defaults.ts"),
      import("/src/core/timeline/renderTravel.ts"),
      import("/src/core/timeline/performanceLifecycle.ts"),
      import("/src/core/project/studioProjection.ts"),
    ]);
    const makeProject = (colour: string) => {
      const project = createDefaultDriftProjectV4(`compat-${colour.slice(1)}`);
      project.composition = { ...project.composition, width: 256, height: 256, alphaMode: "opaque" };
      project.atmosphere = {
        ...project.atmosphere,
        enabled: true,
        family: "solid",
        intensity: 0,
        motion: 0,
        grain: 0,
        vignette: 0,
        colourA: colour,
        colourB: colour,
        accent: colour,
      };
      return project;
    };
    const red = makeProject("#8a1717");
    const blue = makeProject("#173d8a");
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const engine = new CinematicCarousel(canvas, {
      kind: "v1-compat",
      settings: studioSettingsFromDriftProject(red),
    });
    engine.stop();
    const sampleCenter = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none" });
      const decoded = document.createElement("canvas");
      decoded.width = bitmap.width;
      decoded.height = bitmap.height;
      const context = decoded.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      const pixel = Array.from(context.getImageData(128, 128, 1, 1).data);
      bitmap.close();
      return pixel;
    };

    try {
      await engine.setV1CompatibilityState(studioSettingsFromDriftProject(red), red, []);
      const redTime = defaultPerformanceStillTime(createPerformanceLifecycle(
        studioSettingsFromDriftProject(red).performance,
      ));
      const before = await sampleCenter(await engine.captureStill(256, 256, redTime));
      await engine.setV1CompatibilityState(studioSettingsFromDriftProject(blue), blue, []);
      const blueTime = defaultPerformanceStillTime(createPerformanceLifecycle(
        studioSettingsFromDriftProject(blue).performance,
      ));
      const after = await sampleCenter(await engine.captureStill(256, 256, blueTime));
      return { before, after };
    } finally {
      engine.dispose();
      canvas.remove();
    }
  });

  expect(receipt.before[0]).toBeGreaterThan(receipt.before[2]! * 2);
  expect(receipt.after[2]).toBeGreaterThan(receipt.after[0]! * 2);
});

test("V2 repeated slide interaction wraps through the canonical curved renderer", async ({ page }) => {
  await page.goto("/");
  const receipt = await page.evaluate(async () => {
    const [
      { CinematicCarousel },
      { createDefaultDriftProjectV4 },
      { applyEditorialDriftFoundation },
      { deriveSlideGeometry },
    ] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/core/project/defaults.ts"),
      import("/src/core/worlds/applyWorldFoundation.ts"),
      import("/src/core/spatial/spatial.ts"),
    ]);
    const assets = await Promise.all(Array.from({ length: 4 }, async (_, index) => {
      const source = document.createElement("canvas");
      source.width = 320;
      source.height = 180;
      const context = source.getContext("2d")!;
      context.fillStyle = ["#eadac1", "#b23c2f", "#304943", "#18223e"][index]!;
      context.fillRect(0, 0, source.width, source.height);
      context.fillStyle = "#f8f1e4";
      context.font = "700 72px sans-serif";
      context.fillText(String(index + 1), 32, 112);
      const blob = await new Promise<Blob>((resolve, reject) => source.toBlob(
        (value) => value ? resolve(value) : reject(new Error("fixture encode failed")),
        "image/png",
      ));
      const id = `interaction-${index}`;
      return {
        id,
        name: `${id}.png`,
        kind: "image" as const,
        blob,
        mimeType: "image/png",
        width: source.width,
        height: source.height,
        hash: (index + 1).toString(16).repeat(64),
        objectUrl: URL.createObjectURL(blob),
      };
    }));
    let project = createDefaultDriftProjectV4("interaction-wrap");
    project.composition = { ...project.composition, width: 360, height: 640 };
    project.media.order = assets.map((asset) => asset.id);
    project.media.assets = Object.fromEntries(assets.map((asset) => [asset.id, {
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      mimeType: asset.mimeType,
      hash: asset.hash,
      byteLength: asset.blob.size,
      width: asset.width,
      height: asset.height,
    }]));
    project.slides = Object.fromEntries(assets.map((asset) => [asset.id, {
      assetId: asset.id,
      fit: "cover" as const,
      focalX: 0.5,
      focalY: 0.5,
      scaleOffset: 0,
    }]));
    project = applyEditorialDriftFoundation(project, "9:16");

    const canvas = document.createElement("canvas");
    canvas.style.width = "360px";
    canvas.style.height = "640px";
    document.body.append(canvas);
    const engine = new CinematicCarousel(canvas, { kind: "project-v4", project });
    const internal = engine as unknown as {
      elapsed: number;
      motionPosition: number;
      renderPreview(): void;
    };
    const hashCanvas = async () => {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("render encode failed")),
        "image/png",
      ));
      return Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
    };

    try {
      engine.stop();
      engine.setPaused(true);
      await engine.setV2ProjectState(project, assets);
      engine.resize(360, 640);
      internal.elapsed = 2.35;
      internal.renderPreview();
      engine.stepSlides(3);
      const shortHash = await hashCanvas();
      const geometry = deriveSlideGeometry(project, assets.length);
      const loopLength = geometry.virtualSlotCount * geometry.stride;
      engine.stepSlides(geometry.virtualSlotCount * 127);
      const forwardHash = await hashCanvas();
      engine.stepSlides(-geometry.virtualSlotCount * 131);
      const reverseHash = await hashCanvas();
      return {
        shortHash,
        forwardHash,
        reverseHash,
        interactionPosition: internal.motionPosition,
        loopLength,
      };
    } finally {
      engine.dispose();
      assets.forEach((asset) => URL.revokeObjectURL(asset.objectUrl));
      canvas.remove();
    }
  });

  expect(receipt.forwardHash).toBe(receipt.shortHash);
  expect(receipt.reverseHash).toBe(receipt.shortHash);
  expect(Math.abs(receipt.interactionPosition)).toBeLessThanOrEqual(receipt.loopLength / 2);
});

test("large valid project seeds retain deterministic grain entropy", async ({ page }) => {
  await page.goto("/");
  const receipt = await page.evaluate(async () => {
    const [
      { CinematicCarousel },
      { DEFAULT_SETTINGS },
      { createPerformanceLifecycle },
      { defaultPerformanceStillTime },
    ] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
      import("/src/core/timeline/performanceLifecycle.ts"),
      import("/src/core/timeline/renderTravel.ts"),
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
    const engine = new CinematicCarousel(canvas, { kind: "v1-compat", settings });
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
      const visibleBodyTime = defaultPerformanceStillTime(createPerformanceLifecycle(settings.performance));
      const first = await engine.captureStill(256, 256, visibleBodyTime);
      const repeated = await engine.captureStill(256, 256, visibleBodyTime);
      settings.background.seed = 10_000_000;
      engine.setV1Settings(structuredClone(settings));
      const otherSeed = await engine.captureStill(256, 256, visibleBodyTime);
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
    const [
      { CinematicCarousel },
      { DEFAULT_SETTINGS },
      { createPerformanceLifecycle },
      { defaultPerformanceStillTime },
    ] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
      import("/src/core/timeline/performanceLifecycle.ts"),
      import("/src/core/timeline/renderTravel.ts"),
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
    const engine = new CinematicCarousel(canvas, { kind: "v1-compat", settings });
    engine.stop();
    const visibleBodyTime = defaultPerformanceStillTime(createPerformanceLifecycle(settings.performance));

    try {
      await engine.setAssets([red]);
      const before = await sample(await engine.captureStill(256, 256, visibleBodyTime), 128, 128);
      await engine.setAssets([blue]);
      const after = await sample(await engine.captureStill(256, 256, visibleBodyTime), 128, 128);

      const pressureSettings = structuredClone(settings);
      pressureSettings.stage = { width: 256, height: 456, transparent: true };
      pressureSettings.output = { ...pressureSettings.output, width: 256, height: 456 };
      pressureSettings.motion.axis = "vertical";
      pressureSettings.slide.aspectWidth = 4;
      pressureSettings.slide.aspectHeight = 1;
      pressureSettings.slide.scale = 0.24;
      pressureSettings.presenter.enabled = false;
      pressureSettings.presenter.assetId = null;
      engine.setV1Settings(pressureSettings);
      const pressure = await sample(await engine.captureStill(256, 456, visibleBodyTime), 128, 228);

      engine.setV1Settings(settings);
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
      const presenter = await sample(await engine.captureStill(256, 256, visibleBodyTime), 128, 128);
      const deterministicBefore = await hashBlob(await engine.captureStill(256, 256, visibleBodyTime));
      engine.start();
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      engine.stop();
      const deterministicAfter = await hashBlob(await engine.captureStill(256, 256, visibleBodyTime));

      const raceSettings = structuredClone(settings);
      raceSettings.presenter.assetId = racePresenter.id;
      engine.setV1Settings(raceSettings);
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
    const engine = new CinematicCarousel(canvas, { kind: "v1-compat", settings });
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
      engine.setV1Settings(pinnedSettings);
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

test("texture residency and decode work stay bounded under adversarial media churn", async ({ page }) => {
  await page.goto("/");
  const receipt = await page.evaluate(async () => {
    const [{ CinematicCarousel }, { DEFAULT_SETTINGS }] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
    ]);
    const source = document.createElement("canvas");
    source.width = 64;
    source.height = 64;
    const context = source.getContext("2d")!;
    context.fillStyle = "#c65b3c";
    context.fillRect(0, 0, 64, 64);
    const blob = await new Promise<Blob>((resolve, reject) => source.toBlob(
      (value) => value ? resolve(value) : reject(new Error("Could not create churn fixture.")),
      "image/png",
    ));
    const assets = Array.from({ length: 64 }, (_, index) => ({
      id: `churn-${index}`,
      name: `churn-${index}.png`,
      kind: "image" as const,
      blob,
      mimeType: "image/png",
      width: 64,
      height: 64,
      hash: (index + 1).toString(16).padStart(64, "0"),
      objectUrl: URL.createObjectURL(blob),
    }));
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const engine = new CinematicCarousel(canvas, {
      kind: "v1-compat",
      settings: structuredClone(DEFAULT_SETTINGS),
    });
    engine.stop();
    const internal = engine as unknown as {
      ensureTexture(asset: (typeof assets)[number]): Promise<unknown>;
      textureCache: Map<string, unknown>;
      texturePromises: Map<string, Promise<unknown>>;
      textureDecodeQueue: unknown[];
      activeTextureDecodes: number;
    };
    const originalCreateImageBitmap = window.createImageBitmap.bind(window);
    let activeDecodes = 0;
    let peakActiveDecodes = 0;

    try {
      await engine.setAssets(assets);
      window.createImageBitmap = (async (image: ImageBitmapSource, options?: ImageBitmapOptions) => {
        if (image !== blob) return originalCreateImageBitmap(image, options);
        activeDecodes += 1;
        peakActiveDecodes = Math.max(peakActiveDecodes, activeDecodes);
        try {
          await new Promise((resolve) => window.setTimeout(resolve, 15));
          return await originalCreateImageBitmap(image, options);
        } finally {
          activeDecodes -= 1;
        }
      }) as typeof window.createImageBitmap;

      const requests = assets.map((asset) => internal.ensureTexture(asset));
      const peakPendingRequests = internal.texturePromises.size;
      await Promise.allSettled(requests);

      window.createImageBitmap = originalCreateImageBitmap;
      for (const asset of assets) await internal.ensureTexture(asset);

      return {
        peakActiveDecodes,
        peakPendingRequests,
        finalCacheEntries: internal.textureCache.size,
        finalPendingRequests: internal.texturePromises.size,
        finalQueuedDecodes: internal.textureDecodeQueue?.length ?? 0,
        finalActiveDecodes: internal.activeTextureDecodes ?? 0,
      };
    } finally {
      window.createImageBitmap = originalCreateImageBitmap;
      engine.dispose();
      assets.forEach((asset) => URL.revokeObjectURL(asset.objectUrl));
      canvas.remove();
    }
  });

  expect(receipt.peakActiveDecodes).toBeLessThanOrEqual(4);
  expect(receipt.peakPendingRequests).toBeLessThanOrEqual(29);
  expect(receipt.finalCacheEntries).toBeLessThanOrEqual(24);
  expect(receipt.finalPendingRequests).toBe(0);
  expect(receipt.finalQueuedDecodes).toBe(0);
  expect(receipt.finalActiveDecodes).toBe(0);
});

test("export restore applies the latest preview resize instead of its stale starting size", async ({ page }) => {
  await page.goto("/");
  const receipt = await page.evaluate(async () => {
    const [{ CinematicCarousel }, { DEFAULT_SETTINGS }] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
    ]);
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const engine = new CinematicCarousel(canvas, {
      kind: "v1-compat",
      settings: structuredClone(DEFAULT_SETTINGS),
    });
    engine.stop();
    const size = {
      x: 0,
      y: 0,
      set(width: number, height: number) {
        this.x = width;
        this.y = height;
        return this;
      },
    };
    try {
      engine.resize(320, 180);
      const surface = engine.beginExport(256, 256);
      engine.resize(500, 300);
      engine.resize(640, 360);
      surface.restore();
      engine.renderer.getSize(size as never);
      return {
        width: size.x,
        height: size.y,
        pixelRatio: engine.renderer.getPixelRatio(),
        drawingBufferWidth: canvas.width,
        drawingBufferHeight: canvas.height,
        expectedPixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      };
    } finally {
      engine.dispose();
      canvas.remove();
    }
  });

  expect(receipt.width).toBe(640);
  expect(receipt.height).toBe(360);
  expect(receipt.pixelRatio).toBe(receipt.expectedPixelRatio);
  expect(receipt.drawingBufferWidth).toBe(Math.round(640 * receipt.expectedPixelRatio));
  expect(receipt.drawingBufferHeight).toBe(Math.round(360 * receipt.expectedPixelRatio));
});

test("context loss poisons the active export until cleanup, then restores preview safely", async ({ page }) => {
  await page.goto("/");
  const receipt = await page.evaluate(async () => {
    const [{ CinematicCarousel }, { DEFAULT_SETTINGS }] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
    ]);
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const states: string[] = [];
    const errors: string[] = [];
    const engine = new CinematicCarousel(canvas, {
      kind: "v1-compat",
      settings: structuredClone(DEFAULT_SETTINGS),
    }, {
      onContextState: (state) => states.push(state),
      onError: (message) => errors.push(message),
    });
    engine.stop();
    engine.resize(320, 180);
    const gl = canvas.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("WEBGL_lose_context is unavailable in the renderer gauntlet.");

    const waitFor = (name: "webglcontextlost" | "webglcontextrestored") => new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error(`${name} did not arrive.`)), 5_000);
      canvas.addEventListener(name, () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
    });

    let rejectedDuringLoss = "";
    let rejectedAfterRestore = "";
    try {
      const surface = engine.beginExport(256, 256);
      engine.resize(640, 360);
      const lost = waitFor("webglcontextlost");
      extension.loseContext();
      await lost;
      try {
        await engine.renderAtAsync(0.5, 15);
      } catch (error) {
        rejectedDuringLoss = error instanceof Error ? error.message : String(error);
      }
      const restored = waitFor("webglcontextrestored");
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      extension.restoreContext();
      await restored;
      try {
        await engine.renderAtAsync(0.5, 15);
      } catch (error) {
        rejectedAfterRestore = error instanceof Error ? error.message : String(error);
      }
      surface.restore();

      const recovered = engine.beginExport(256, 256);
      await engine.renderAtAsync(0.5, 15);
      recovered.restore();
      const size = {
        x: 0,
        y: 0,
        set(width: number, height: number) {
          this.x = width;
          this.y = height;
          return this;
        },
      };
      engine.renderer.getSize(size as never);
      return {
        states,
        errors,
        rejectedDuringLoss,
        rejectedAfterRestore,
        recoveredSize: [size.x, size.y],
        contextLost: engine.isContextLost,
      };
    } finally {
      engine.dispose();
      canvas.remove();
    }
  });

  expect(receipt.rejectedDuringLoss).toContain("untrusted frame was rejected");
  expect(receipt.rejectedAfterRestore).toContain("untrusted frame was rejected");
  expect(receipt.errors.filter((message) => message.includes("destination will not be committed"))).toHaveLength(1);
  expect(receipt.states).toEqual(["ready", "lost", "restored"]);
  expect(receipt.recoveredSize).toEqual([640, 360]);
  expect(receipt.contextLost).toBe(false);
});
