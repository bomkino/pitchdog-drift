import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  audioOnlyFixturePath,
  fixturePath,
  halfAlphaGreyPng,
  LOCAL_REOPENED_NOTICE,
  PORTABLE_OPENED_NOTICE,
  PORTABLE_SAVED_NOTICE,
  presenterFixturePath,
  switchWorkspace,
  waitForStudio,
} from "./studio.helpers";

async function readSavedProject(page: import("@playwright/test").Page): Promise<Record<string, any>> {
  const currentWorkspace = (await page.locator(".workspace-switcher button[aria-current=page]").textContent())?.trim() as "SLIDES" | "WORLD" | "DIRECT" | "MASTER" | undefined;
  await switchWorkspace(page, "MASTER");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save portable project" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const archive = unzipSync(new Uint8Array(await readFile(path!)));
  if (currentWorkspace && currentWorkspace !== "MASTER") await switchWorkspace(page, currentWorkspace);
  return JSON.parse(strFromU8(archive["manifest.json"]!)).payload.project as Record<string, any>;
}

test("reopening a verified local project performs no phantom IndexedDB rewrite", async ({ page }) => {
  await waitForStudio(page);
  await page.waitForTimeout(1_800);
  await expect(page.locator(".header-status")).toContainText("saved locally");

  await page.addInitScript(() => {
    const instrumentedWindow = window as Window & { __driftHydrationWrites?: number };
    instrumentedWindow.__driftHydrationWrites = 0;
    const originalPut = IDBObjectStore.prototype.put;
    const originalClear = IDBObjectStore.prototype.clear;
    IDBObjectStore.prototype.put = function put(value: unknown, key?: IDBValidKey) {
      instrumentedWindow.__driftHydrationWrites = (instrumentedWindow.__driftHydrationWrites ?? 0) + 1;
      return key === undefined
        ? originalPut.call(this, value)
        : originalPut.call(this, value, key);
    };
    IDBObjectStore.prototype.clear = function clear() {
      instrumentedWindow.__driftHydrationWrites = (instrumentedWindow.__driftHydrationWrites ?? 0) + 1;
      return originalClear.call(this);
    };
  });

  await page.reload();
  await expect(page.getByText(LOCAL_REOPENED_NOTICE)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".asset-list li")).toHaveCount(8);
  await page.waitForTimeout(1_800);
  await expect(page.locator(".header-status")).toContainText("saved locally");
  expect(await page.evaluate(() => (
    window as Window & { __driftHydrationWrites?: number }
  ).__driftHydrationWrites)).toBe(0);
});

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

test("Project V4 keeps one image still without letting a presenter video steal it", async ({ page }) => {
  await waitForStudio(page);
  const firstSlide = page.locator(".asset-list li").first();
  await page.getByRole("button", { name: "Keep Drift study 01.png still" }).click();
  await expect(firstSlide).toHaveAttribute("data-pinned", "true");

  const firstSave = await readSavedProject(page);
  const pinnedImageId = firstSave.media.order[0] as string;
  expect(firstSave.presenter).toMatchObject({
    enabled: true,
    assetId: pinnedImageId,
    trackMode: "pinned-only",
    layoutMode: "safe-overlay",
    aspectMode: "source",
    matteOpacity: 0,
  });

  await page.reload();
  await expect(page.getByText(LOCAL_REOPENED_NOTICE)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".asset-list li").first()).toHaveAttribute("data-pinned", "true");
  await expect(page.getByRole("button", { name: "Return Drift study 01.png to the carousel" })).toBeVisible();

  await page.locator('input[type="file"][accept^="video"]').setInputFiles(presenterFixturePath);
  await expect(page.locator(".presenter-card")).toBeVisible();
  await expect(page.locator(".asset-list li").first()).toHaveAttribute("data-pinned", "true");
  const withVideo = await readSavedProject(page);
  expect(withVideo.media.presenterAssetId).not.toBe(pinnedImageId);
  expect(withVideo.presenter.assetId).toBe(pinnedImageId);

  const pinnedGroup = page.locator("details").filter({ has: page.locator("summary", { hasText: "Pinned frame" }) });
  await pinnedGroup.locator("summary").click();
  const pinnedSwitch = page.getByRole("switch", { name: "Keep one frame still" });
  await pinnedSwitch.click();
  await expect(pinnedSwitch).not.toBeChecked();
  await expect(pinnedSwitch).toBeEnabled();
  const disabled = await readSavedProject(page);
  expect(disabled.presenter).toMatchObject({ enabled: false, assetId: pinnedImageId });

  await page.reload();
  await expect(page.getByText(LOCAL_REOPENED_NOTICE)).toBeVisible({ timeout: 30_000 });
  const reopenedGroup = page.locator("details").filter({ has: page.locator("summary", { hasText: "Pinned frame" }) });
  await reopenedGroup.locator("summary").click();
  const reopenedSwitch = page.getByRole("switch", { name: "Keep one frame still" });
  await expect(reopenedSwitch).not.toBeChecked();
  await expect(reopenedSwitch).toBeEnabled();
  await reopenedSwitch.click();
  await expect(page.locator(".asset-list li").first()).toHaveAttribute("data-pinned", "true");
});

test("presenter playback follows the master clock, pause, reduced motion, and export while removal preserves an unrelated slide pin", async ({ page }) => {
  await waitForStudio(page);
  const encodedPresenter = (await readFile(presenterFixturePath)).toString("base64");
  const playback = await page.evaluate(async (encoded) => {
    const [{ CinematicCarousel }, { DEFAULT_SETTINGS, createCompatibilityPerformanceLifecycle }] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
    ]);
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: "video/mp4" });
    const objectUrl = URL.createObjectURL(blob);
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.stage = { width: 256, height: 256, transparent: true };
    settings.output = { ...settings.output, width: 256, height: 256, fps: 24, duration: 1.5 };
    settings.performance = createCompatibilityPerformanceLifecycle(1.5);
    settings.background = { ...settings.background, style: "transparent", grain: 0, vignette: 0 };
    settings.presenter = { ...settings.presenter, enabled: true, assetId: "presenter-fixture" };
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    document.body.append(canvas);
    const engine = new CinematicCarousel(canvas, { kind: "v1-compat", settings });
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
      const clock = engine as unknown as {
        elapsed: number;
        performanceTimeline: { totalDuration: number };
        presenterPendingSeekTarget: number | null;
        renderPreview(): void;
      };
      const waitForPresenterSettled = async () => {
        const deadline = performance.now() + 1_000;
        while (performance.now() < deadline) {
          if (!video.seeking && clock.presenterPendingSeekTarget === null) {
            return;
          }
          await delay(0);
        }
        throw new Error("Presenter preview did not settle its canonical seek.");
      };
      // Media preparation time is scheduler-dependent and can otherwise put
      // this first observation directly across the master-loop boundary.
      // Start the playback proof from a known canonical frame.
      engine.stop();
      engine.setPaused(true);
      clock.elapsed = 0;
      clock.renderPreview();
      await waitForPresenterSettled();
      const deliveredFrameStart = video.getVideoPlaybackQuality().totalVideoFrames;
      const playingStart = video.currentTime;
      engine.setPaused(false);
      engine.start();
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const deliveredFrames = video.getVideoPlaybackQuality().totalVideoFrames - deliveredFrameStart;
        if (deliveredFrames >= 2 && video.currentTime - playingStart > 0.1) break;
        await delay(10);
      }
      const playingDelta = video.currentTime - playingStart;
      const deliveredFrameCount = video.getVideoPlaybackQuality().totalVideoFrames - deliveredFrameStart;
      // A throttled headless rAF paints nothing while its decoder clock keeps
      // moving. Force the next actual paint, then judge the landed frame.
      clock.renderPreview();
      await waitForPresenterSettled();
      const playingEnd = video.currentTime;
      const runningTarget = clock.elapsed % clock.performanceTimeline.totalDuration;
      const runningClockError = Math.abs(playingEnd - runningTarget);
      const runningPausedFlag = video.paused;
      const loopFlag = video.loop;

      engine.stop();
      clock.elapsed = clock.performanceTimeline.totalDuration - 0.05;
      clock.renderPreview();
      await waitForPresenterSettled();
      clock.elapsed = clock.performanceTimeline.totalDuration + 0.02;
      clock.renderPreview();
      await waitForPresenterSettled();
      const wrappedClockError = Math.abs(video.currentTime - 0.02);

      clock.elapsed = 1.25;
      engine.setPaused(true);
      clock.renderPreview();
      await waitForPresenterSettled();
      const pausedClockError = Math.abs(video.currentTime - 1.25);
      const pausedStart = video.currentTime;
      await delay(250);
      const pausedDelta = video.currentTime - pausedStart;
      const pausedFlag = video.paused;

      engine.setPaused(false);
      engine.start();
      await delay(180);
      engine.setReducedMotionPreview(true);
      const reducedMotionStart = video.currentTime;
      await delay(250);
      const reducedMotionDelta = video.currentTime - reducedMotionStart;
      const reducedMotionPausedFlag = video.paused;

      engine.setReducedMotionPreview(false);
      await delay(180);
      surface = engine.beginExport(256, 256);
      await waitForPresenterSettled();
      const exportStart = video.currentTime;
      await delay(250);
      const exportDelta = video.currentTime - exportStart;
      const exportPausedFlag = video.paused;

      surface.restore();
      surface = null;
      const restoredElapsedStart = clock.elapsed;
      await delay(250);
      // The preview contract is evaluated at paint time: rAF advances the
      // authored master clock, while the browser decoder coasts between
      // paints. Sample immediately after a real paint so scheduler jitter is
      // not misreported as presenter drift.
      clock.renderPreview();
      await waitForPresenterSettled();
      const restoredElapsedDelta = clock.elapsed - restoredElapsedStart;
      const restoredTarget = clock.elapsed % clock.performanceTimeline.totalDuration;
      const restoredClockError = Math.abs(video.currentTime - restoredTarget);
      return {
        playingDelta,
        deliveredFrameCount,
        playingStart,
        playingEnd,
        runningTarget,
        runningClockError,
        runningPausedFlag,
        loopFlag,
        wrappedClockError,
        pausedClockError,
        pausedDelta,
        pausedFlag,
        reducedMotionDelta,
        reducedMotionPausedFlag,
        exportDelta,
        exportPausedFlag,
        restoredElapsedDelta,
        restoredClockError,
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
  expect(playback.deliveredFrameCount).toBeGreaterThanOrEqual(2);
  expect(playback.runningClockError, JSON.stringify(playback)).toBeLessThan(0.06);
  expect(playback.runningPausedFlag).toBe(false);
  expect(playback.loopFlag).toBe(false);
  expect(playback.wrappedClockError).toBeLessThan(0.01);
  expect(playback.pausedClockError).toBeLessThan(0.01);
  expect(Math.abs(playback.pausedDelta)).toBeLessThan(0.05);
  expect(playback.pausedFlag).toBe(true);
  expect(Math.abs(playback.reducedMotionDelta)).toBeLessThan(0.05);
  expect(playback.reducedMotionPausedFlag).toBe(true);
  expect(Math.abs(playback.exportDelta)).toBeLessThan(0.05);
  expect(playback.exportPausedFlag).toBe(true);
  expect(playback.restoredElapsedDelta).toBeGreaterThan(0.1);
  expect(playback.restoredClockError, JSON.stringify(playback)).toBeLessThan(0.06);
  expect(playback.restoredPausedFlag).toBe(false);

  await page.locator('input[type="file"][accept^="video"]').setInputFiles(presenterFixturePath);
  await expect(page.locator(".presenter-card")).toBeVisible();
  const firstSlide = page.locator(".asset-list li").first();
  await page.getByRole("button", { name: "Keep Drift study 01.png still" }).click();
  await expect(firstSlide).toHaveAttribute("data-pinned", "true");
  await page.getByRole("button", { name: "Remove presenter video" }).click();
  await expect(page.locator(".presenter-card")).toHaveCount(0);
  await expect(firstSlide).toHaveAttribute("data-pinned", "true");
  await expect(page.getByRole("button", { name: "Return Drift study 01.png to the carousel" })).toBeVisible();
});

test("portable Project V4 survives a fresh context without flattening dormant direction", async ({ page, browser }) => {
  await waitForStudio(page);
  await page.locator('input[accept^="image/png"]').setInputFiles(fixturePath);
  await expect(page.locator(".asset-list li")).toHaveCount(1);
  await expect(page.locator(".asset-list li").first()).toContainText("slide.png");
  await switchWorkspace(page, "MASTER");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save portable project" }).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  const portableArchive = unzipSync(new Uint8Array(await readFile(file!)));
  const portableManifest = JSON.parse(strFromU8(portableArchive["manifest.json"]!)) as Record<string, any>;
  expect(portableManifest.payload.project).toMatchObject({
    formatVersion: 4,
    // A brand-new shipping project now owns the current V2 renderer. Explicit
    // imported legacy projects remain covered by the compatibility journeys.
    renderContract: "drift-v2/1",
    extensions: {},
  });
  portableManifest.payload.project.motion.path.id = "figure-eight";
  portableManifest.payload.project.atmosphere.family = "emulsion";
  portableManifest.payload.project.provenance.world = {
    id: "future-world",
    version: 7,
    fingerprint: "future-world:7",
  };
  portableArchive["manifest.json"] = strToU8(JSON.stringify(portableManifest));
  const futureDirectionProject = Buffer.from(zipSync(portableArchive, { level: 6 }));

  const fresh = await browser.newContext({
    baseURL: "http://127.0.0.1:5187",
    viewport: { width: 1440, height: 900 },
  });
  const reopened = await fresh.newPage();
  try {
    await waitForStudio(reopened);
    await reopened.locator("input[accept*=pitched]").setInputFiles({
      name: "future-direction.pitched",
      mimeType: "application/vnd.pitchdog.pitched+zip",
      buffer: futureDirectionProject,
    });
    await expect(reopened.getByText(PORTABLE_OPENED_NOTICE)).toBeVisible({ timeout: 30_000 });
    await expect(reopened.locator(".asset-list li")).toHaveCount(1);
    await expect(reopened.locator(".asset-list li").first()).toContainText("slide.png");
    await reopened.reload();
    await expect(reopened.locator(".header-status")).toContainText("saved locally", { timeout: 30_000 });
    await expect(reopened.locator(".asset-list li")).toHaveCount(1);
    await expect(reopened.locator(".asset-list li").first()).toContainText("slide.png");
    await switchWorkspace(reopened, "MASTER");
    const preservedDownloadPromise = reopened.waitForEvent("download");
    await reopened.getByRole("button", { name: "Save portable project" }).click();
    const preservedDownload = await preservedDownloadPromise;
    const preservedPath = await preservedDownload.path();
    expect(preservedPath).toBeTruthy();
    const preservedArchive = unzipSync(new Uint8Array(await readFile(preservedPath!)));
    const preservedManifest = JSON.parse(strFromU8(preservedArchive["manifest.json"]!)) as Record<string, any>;
    expect(preservedManifest.payload.project).toMatchObject({
      motion: { path: { id: "figure-eight" } },
      atmosphere: { family: "emulsion" },
      provenance: { world: { id: "future-world", version: 7, fingerprint: "future-world:7" } },
    });
  } finally {
    await fresh.close();
  }
});

test("rejecting a future portable payload does not rewrite the open project", async ({ page }) => {
  await waitForStudio(page);
  await page.locator('input[accept^="image/png"]').setInputFiles(fixturePath);
  await expect(page.locator(".asset-list li")).toHaveCount(1);
  await expect(page.locator(".header-status")).toContainText("saved locally", { timeout: 10_000 });

  await switchWorkspace(page, "MASTER");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save portable project" }).click();
  const downloaded = await downloadPromise;
  const downloadedPath = await downloaded.path();
  expect(downloadedPath).toBeTruthy();

  const archive = unzipSync(new Uint8Array(await readFile(downloadedPath!)));
  const manifest = JSON.parse(strFromU8(archive["manifest.json"]!)) as Record<string, any>;
  manifest.payload.project.formatVersion = 99;
  archive["manifest.json"] = strToU8(JSON.stringify(manifest));
  const unsupported = Buffer.from(zipSync(archive, { level: 6 }));

  await page.evaluate(() => {
    const state = window as Window & { __driftRejectedImportWrites?: number };
    state.__driftRejectedImportWrites = 0;
    const originalPut = IDBObjectStore.prototype.put;
    const originalClear = IDBObjectStore.prototype.clear;
    IDBObjectStore.prototype.put = function put(value: unknown, key?: IDBValidKey) {
      state.__driftRejectedImportWrites = (state.__driftRejectedImportWrites ?? 0) + 1;
      return key === undefined
        ? originalPut.call(this, value)
        : originalPut.call(this, value, key);
    };
    IDBObjectStore.prototype.clear = function clear() {
      state.__driftRejectedImportWrites = (state.__driftRejectedImportWrites ?? 0) + 1;
      return originalClear.call(this);
    };
  });

  await page.locator("input[accept*=pitched]").setInputFiles({
    name: "future-project.pitched",
    mimeType: "application/vnd.pitchdog.pitched+zip",
    buffer: unsupported,
  });
  await expect(page.getByRole("alert")).toContainText("Project format 99 is not supported", { timeout: 30_000 });
  await page.waitForTimeout(1_500);
  expect(await page.evaluate(() => (
    window as Window & { __driftRejectedImportWrites?: number }
  ).__driftRejectedImportWrites)).toBe(0);
  await expect(page.locator(".asset-list li")).toHaveCount(1);
  await expect(page.locator(".asset-list li").first()).toContainText("slide.png");
});

test("an unsupported saved project is quarantined instead of overwritten by fallback demos", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__DRIFT_NATIVE_MAC__", {
      configurable: false,
      writable: false,
      value: Object.freeze({
        bridgeVersion: 2,
        platform: "macOS",
        systemCodecsOnly: true,
        documentAuthority: "appkit-issued-per-document",
        webKitOutboundPolicyInstalled: true,
        webKitOutboundPolicyVersion: 3,
        nativeNetworkClientSurface: "none-shipped",
        networkBoundary: "app-entitled-webkit-blocked",
        networkClientEntitlementRequiredWhenSandboxed: true,
      }),
    });
    Object.defineProperty(window, "__driftNativeInstallAppBridge", {
      configurable: false,
      writable: false,
      value: (bridge: unknown) => {
        Object.defineProperty(window, "__driftRecoveryBridge", {
          configurable: true,
          writable: true,
          value: bridge,
        });
      },
    });
    Object.defineProperty(window, "__driftNativeReportClientState", {
      configurable: false,
      writable: false,
      value: () => undefined,
    });
  });
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
  await page.evaluate(() => {
    const state = window as Window & { __driftRecoveryWrites?: number };
    state.__driftRecoveryWrites = 0;
    const originalPut = IDBObjectStore.prototype.put;
    const originalClear = IDBObjectStore.prototype.clear;
    IDBObjectStore.prototype.put = function put(value: unknown, key?: IDBValidKey) {
      state.__driftRecoveryWrites = (state.__driftRecoveryWrites ?? 0) + 1;
      return key === undefined
        ? originalPut.call(this, value)
        : originalPut.call(this, value, key);
    };
    IDBObjectStore.prototype.clear = function clear() {
      state.__driftRecoveryWrites = (state.__driftRecoveryWrites ?? 0) + 1;
      return originalClear.call(this);
    };
  });
  const blockedNativeImports = await page.evaluate(async ({ slideBase64, presenterBase64 }) => {
    const decode = (encoded: string) => Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const bridge = (window as unknown as {
      __driftRecoveryBridge: {
        importFiles: (kind: "slides" | "presenter", files: readonly File[]) => Promise<void>;
      };
    }).__driftRecoveryBridge;
    const messages: string[] = [];
    try {
      await bridge.importFiles("slides", [new File([decode(slideBase64)], "blocked.png", { type: "image/png" })]);
    } catch (error) {
      messages.push(error instanceof Error ? error.message : String(error));
    }
    try {
      await bridge.importFiles("presenter", [new File([decode(presenterBase64)], "blocked.mp4", { type: "video/mp4" })]);
    } catch (error) {
      messages.push(error instanceof Error ? error.message : String(error));
    }
    return messages;
  }, {
    slideBase64: (await readFile(fixturePath)).toString("base64"),
    presenterBase64: (await readFile(presenterFixturePath)).toString("base64"),
  });
  expect(blockedNativeImports).toEqual([
    expect.stringContaining("Recovery is locked. Open a verified project before adding slides"),
    expect.stringContaining("Recovery is locked. Open a verified project before adding a presenter"),
  ]);
  expect(await page.evaluate(() => (
    window as Window & { __driftRecoveryWrites?: number }
  ).__driftRecoveryWrites)).toBe(0);
  await expect(page.locator(".asset-list li")).toHaveCount(8);
  await expect(page.locator(".presenter-card")).toHaveCount(0);
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
  await switchWorkspace(page, "MASTER");
  await page.evaluate(() => {
    const state = window as Window & { __driftInitialReleaseDigest?: () => void };
    const subtle = crypto.subtle;
    const original = subtle.digest.bind(subtle);
    let first = true;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    state.__driftInitialReleaseDigest = release;
    Object.defineProperty(subtle, "digest", {
      configurable: true,
      value: async (...args: Parameters<SubtleCrypto["digest"]>) => {
        if (first) {
          first = false;
          await gate;
        }
        return original(...args);
      },
    });
  });
  await page.getByLabel("Stage width").fill("1200");
  await expect(page.locator(".header-status")).toContainText("saving locally…");
  expect(await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    return !window.dispatchEvent(event);
  })).toBe(true);
  await page.evaluate(() => (window as Window & { __driftInitialReleaseDigest?: () => void }).__driftInitialReleaseDigest?.());
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
    await switchWorkspace(oldPage, "MASTER");
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
    await expect(oldPage.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/, { timeout: 30_000 });
    await expect(oldPage.locator(".header-status")).toContainText("saved locally");
    await expect(oldPage.locator(".asset-list li")).toHaveCount(1);
    await expect(oldPage.locator(".asset-list li").first()).toContainText("slide.png");
    await expect(oldPage.locator(".stage-hud")).toContainText("1200 × 1920");
  } finally {
    await oldContext.close();
  }
});
