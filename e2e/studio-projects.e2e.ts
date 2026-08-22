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

test("saved starter studies remain replaceable by the first real deck", async ({ page }) => {
  await waitForStudio(page);
  await page.waitForTimeout(1_800);
  await expect(page.locator(".header-status")).toContainText("saved locally");
  await page.reload();
  await expect(page.getByText(LOCAL_REOPENED_NOTICE)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".asset-list li")).toHaveCount(8);

  await page.locator('input[accept^="image/png"]').setInputFiles(fixturePath);
  await expect(page.locator(".asset-list li")).toHaveCount(1);
  await expect(page.locator(".asset-list li").first()).toContainText("slide.png");
  await expect(page.getByText(/Drift study/)).toHaveCount(0);
  await page.waitForTimeout(1_800);
  await page.reload();
  await expect(page.getByText(LOCAL_REOPENED_NOTICE)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".asset-list li")).toHaveCount(1);
  await expect(page.locator(".asset-list li").first()).toContainText("slide.png");
});

test("presenter playback obeys pause and export while removal preserves an unrelated slide pin", async ({ page }) => {
  await waitForStudio(page);
  const encodedPresenter = (await readFile(presenterFixturePath)).toString("base64");
  const playback = await page.evaluate(async (encoded) => {
    const [{ CinematicCarousel }, { DEFAULT_SETTINGS }] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
    ]);
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: "video/mp4" });
    const objectUrl = URL.createObjectURL(blob);
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.stage = { width: 256, height: 256, transparent: true };
    settings.output = { ...settings.output, width: 256, height: 256, fps: 24, duration: 3 };
    settings.background = { ...settings.background, style: "transparent", grain: 0, vignette: 0 };
    settings.presenter = { ...settings.presenter, enabled: true, assetId: "presenter-fixture" };
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    document.body.append(canvas);
    const engine = new CinematicCarousel(canvas, settings);
    const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    let surface: ReturnType<typeof engine.beginExport> | null = null;
    try {
      await engine.setPresenterAsset({
        id: "presenter-fixture",
        name: "presenter.mp4",
        kind: "video",
        blob,
        mimeType: "video/mp4",
        width: 64,
        height: 64,
        duration: 2,
        objectUrl,
      });
      const video = (engine as unknown as { presenterVideo: HTMLVideoElement }).presenterVideo;
      const playingStart = video.currentTime;
      await delay(250);
      const playingDelta = video.currentTime - playingStart;

      engine.setPaused(true);
      const pausedStart = video.currentTime;
      await delay(250);
      const pausedDelta = video.currentTime - pausedStart;
      const pausedFlag = video.paused;

      engine.setPaused(false);
      await delay(180);
      engine.setReducedMotionPreview(true);
      const reducedMotionStart = video.currentTime;
      await delay(250);
      const reducedMotionDelta = video.currentTime - reducedMotionStart;
      const reducedMotionPausedFlag = video.paused;

      engine.setReducedMotionPreview(false);
      await delay(180);
      surface = engine.beginExport(256, 256);
      const exportStart = video.currentTime;
      await delay(250);
      const exportDelta = video.currentTime - exportStart;
      const exportPausedFlag = video.paused;

      surface.restore();
      surface = null;
      const restoredStart = video.currentTime;
      await delay(250);
      const restoredDelta = video.currentTime - restoredStart;
      return {
        playingDelta,
        pausedDelta,
        pausedFlag,
        reducedMotionDelta,
        reducedMotionPausedFlag,
        exportDelta,
        exportPausedFlag,
        restoredDelta,
        restoredPausedFlag: video.paused,
      };
    } finally {
      surface?.restore();
      engine.dispose();
      URL.revokeObjectURL(objectUrl);
      canvas.remove();
    }
  }, encodedPresenter);

  expect(playback.playingDelta).toBeGreaterThan(0.1);
  expect(Math.abs(playback.pausedDelta)).toBeLessThan(0.05);
  expect(playback.pausedFlag).toBe(true);
  expect(Math.abs(playback.reducedMotionDelta)).toBeLessThan(0.05);
  expect(playback.reducedMotionPausedFlag).toBe(true);
  expect(Math.abs(playback.exportDelta)).toBeLessThan(0.05);
  expect(playback.exportPausedFlag).toBe(true);
  expect(playback.restoredDelta).toBeGreaterThan(0.1);
  expect(playback.restoredPausedFlag).toBe(false);

  await page.locator('input[type="file"][accept^="video"]').setInputFiles(presenterFixturePath);
  await expect(page.locator(".presenter-card")).toBeVisible();
  const firstSlide = page.locator(".asset-list li").first();
  await page.getByRole("button", { name: "Pin Drift study 01.png" }).click();
  await expect(firstSlide).toHaveAttribute("data-pinned", "true");
  await page.getByRole("button", { name: "Remove presenter video" }).click();
  await expect(page.locator(".presenter-card")).toHaveCount(0);
  await expect(firstSlide).toHaveAttribute("data-pinned", "true");
  await expect(page.getByRole("button", { name: "Unpin Drift study 01.png" })).toBeVisible();
});

test("portable project survives a fresh browser context and reload", async ({ page, browser }) => {
  await waitForStudio(page);
  await page.locator('input[accept^="image/png"]').setInputFiles(fixturePath);
  await expect(page.locator(".asset-list li")).toHaveCount(1);
  await expect(page.locator(".asset-list li").first()).toContainText("slide.png");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save portable project" }).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();

  const fresh = await browser.newContext({
    baseURL: "http://127.0.0.1:5187",
    viewport: { width: 1440, height: 900 },
  });
  const reopened = await fresh.newPage();
  try {
    await waitForStudio(reopened);
    await reopened.locator("input[accept*=pitched]").setInputFiles(file!);
    await expect(reopened.getByText(PORTABLE_OPENED_NOTICE)).toBeVisible({ timeout: 30_000 });
    await expect(reopened.locator(".asset-list li")).toHaveCount(1);
    await expect(reopened.locator(".asset-list li").first()).toContainText("slide.png");
    await reopened.reload();
    await expect(reopened.getByText(LOCAL_REOPENED_NOTICE)).toBeVisible({ timeout: 30_000 });
    await expect(reopened.locator(".asset-list li")).toHaveCount(1);
    await expect(reopened.locator(".asset-list li").first()).toContainText("slide.png");
  } finally {
    await fresh.close();
  }
});

test("an unsupported saved project is quarantined instead of overwritten by fallback demos", async ({ page }) => {
  await waitForStudio(page);
  await page.locator('input[accept^="image/png"]').setInputFiles(fixturePath);
  await expect(page.locator(".asset-list li")).toHaveCount(1);
  await page.waitForTimeout(1_800);

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pitchdog-drift", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction("project", "readwrite");
      const store = transaction.objectStore("project");
      const record = await new Promise<Record<string, any>>((resolve, reject) => {
        const request = store.get("current");
        request.onsuccess = () => resolve(request.result as Record<string, any>);
        request.onerror = () => reject(request.error);
      });
      record.manifest.payload.project.formatVersion = 99;
      store.put(record);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });

  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Saved project could not reopen");
  await expect(page.getByText("recovery locked", { exact: true })).toBeVisible();
  await expect(page.locator(".asset-list li")).toHaveCount(8);
  await page.waitForTimeout(2_000);

  const preserved = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pitchdog-drift", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction(["project", "assets"], "readonly");
      const project = await new Promise<Record<string, any>>((resolve, reject) => {
        const request = transaction.objectStore("project").get("current");
        request.onsuccess = () => resolve(request.result as Record<string, any>);
        request.onerror = () => reject(request.error);
      });
      const assetCount = await new Promise<number>((resolve, reject) => {
        const request = transaction.objectStore("assets").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return {
        formatVersion: project.manifest.payload.project.formatVersion as number,
        assetName: project.manifest.assets[0]?.name as string,
        assetCount,
      };
    } finally {
      database.close();
    }
  });
  expect(preserved).toEqual({ formatVersion: 99, assetName: "slide.png", assetCount: 1 });

  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Saved project could not reopen");
  await expect(page.getByText("recovery locked", { exact: true })).toBeVisible();
});

test("a slow older autosave cannot overwrite a newer imported project", async ({ page, browser }) => {
  await waitForStudio(page);
  await expect(page.locator(".header-status")).toContainText("saved locally");
  await page.locator('input[accept^="image/png"]').setInputFiles(fixturePath);
  await expect(page.locator(".asset-list li")).toHaveCount(1);
  await page.getByLabel("Stage width").fill("1200");
  await expect(page.locator(".header-status")).toContainText("saving locally…");
  expect(await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    return !window.dispatchEvent(event);
  })).toBe(true);
  await expect(page.locator(".header-status")).toContainText("saved locally", { timeout: 10_000 });
  expect(await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    return !window.dispatchEvent(event);
  })).toBe(false);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save portable project" }).click();
  const targetDownload = await downloadPromise;
  const targetPath = await targetDownload.path();
  expect(targetPath).toBeTruthy();

  const oldContext = await browser.newContext({
    baseURL: "http://127.0.0.1:5187",
    viewport: { width: 1440, height: 900 },
  });
  const oldPage = await oldContext.newPage();
  try {
    await waitForStudio(oldPage);
    await oldPage.evaluate(() => {
      const state = window as Window & {
        __driftDigestStarted?: boolean;
        __driftReleaseDigest?: () => void;
      };
      const subtle = crypto.subtle;
      const original = subtle.digest.bind(subtle);
      let first = true;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      state.__driftReleaseDigest = release;
      Object.defineProperty(subtle, "digest", {
        configurable: true,
        value: async (...args: Parameters<SubtleCrypto["digest"]>) => {
          if (first) {
            first = false;
            state.__driftDigestStarted = true;
            await gate;
          }
          return original(...args);
        },
      });
    });
    await oldPage.getByLabel("Stage width").fill("1600");
    await oldPage.waitForFunction(() => (window as Window & { __driftDigestStarted?: boolean }).__driftDigestStarted === true, null, { timeout: 10_000 });

    await oldPage.locator("input[accept*=pitched]").setInputFiles(targetPath!);
    await oldPage.waitForTimeout(1_000);
    await expect(oldPage.getByText(PORTABLE_OPENED_NOTICE)).toHaveCount(0);

    await oldPage.evaluate(() => (window as Window & { __driftReleaseDigest?: () => void }).__driftReleaseDigest?.());
    await expect(oldPage.getByText(PORTABLE_OPENED_NOTICE)).toBeVisible({ timeout: 30_000 });
    await expect(oldPage.locator(".asset-list li")).toHaveCount(1);
    await expect(oldPage.locator(".asset-list li").first()).toContainText("slide.png");
    await expect(oldPage.locator(".stage-hud")).toContainText("1200 × 1920");
    await oldPage.waitForTimeout(1_800);
    await oldPage.reload();
    await expect(oldPage.getByText(LOCAL_REOPENED_NOTICE)).toBeVisible({ timeout: 30_000 });
    await expect(oldPage.locator(".asset-list li")).toHaveCount(1);
    await expect(oldPage.locator(".asset-list li").first()).toContainText("slide.png");
    await expect(oldPage.locator(".stage-hud")).toContainText("1200 × 1920");
  } finally {
    await oldContext.close();
  }
});
