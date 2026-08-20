import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixturePath = path.resolve("e2e/fixtures/slide.png");
const audioOnlyFixturePath = path.resolve("e2e/fixtures/audio-only.mp4");
const presenterFixturePath = path.resolve("e2e/fixtures/presenter.mp4");
const halfAlphaGreyPng = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAG0lEQVR4AYTIoQ0AAADCMLLLOR0/Q2WpEPkxAAAA//99eYBQAAAABklEQVQDAN2nCAkPbnNjAAAAAElFTkSuQmCC";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("boots WebGL2, exposes real controls, restores context, and fits phone viewports", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);
  await expect(page.locator(".asset-list li")).toHaveCount(8);
  await expect(page.getByText(/WebGL2 · (H.264 ready|PNG output)/)).toBeVisible();

  const flowAxis = page.getByRole("group", { name: "Flow axis" });
  await flowAxis.getByText("Horizontal", { exact: true }).click();
  await expect(page.locator(".stage-topline").last()).toContainText("horizontal");
  await flowAxis.getByText("Vertical", { exact: true }).click();
  await expect(page.locator(".stage-topline").last()).toContainText("vertical");

  await page.getByRole("button", { name: /Dread/ }).click();
  await expect(page.locator(".stage-topline").first()).toContainText("dread");
  await page.getByLabel("Stage width").fill("1200");
  await expect(page.locator(".stage-hud")).toContainText("1200 × 1920");

  const atmosphere = page.locator("details").filter({ has: page.locator("summary", { hasText: "Atmosphere" }) });
  await atmosphere.locator("summary").click();
  const background = page.getByRole("combobox", { name: "Background", exact: true });
  await background.selectOption("transparent");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "true");
  await page.getByRole("button", { name: /Road Memory/ }).click();
  await expect(background).toHaveValue("gradient");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "false");

  const contextExtension = await page.locator("[data-testid=webgl-stage]").evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    window.setTimeout(() => extension.restoreContext(), 200);
    return true;
  });
  expect(contextExtension).toBe(true);
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", "lost");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", "restored");

  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.getByRole("navigation", { name: "Studio panels" })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight,
  }));
  expect(overflow).toEqual({ horizontal: false, vertical: false });
  expect(errors).toEqual([]);
});

test("keyboard controls stay visible, file pickers stay out of Tab order, and slide order is operable", async ({ page }) => {
  await waitForStudio(page);

  const fileInputs = page.locator('input[type="file"]');
  await expect(fileInputs).toHaveCount(3);
  for (let index = 0; index < await fileInputs.count(); index += 1) {
    await expect(fileInputs.nth(index)).toHaveAttribute("tabindex", "-1");
  }
  const slideChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add slides" }).click();
  const slideChooser = await slideChooserPromise;
  expect(slideChooser.isMultiple()).toBe(true);
  await slideChooser.setFiles([]);

  const presenterChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Presenter", exact: true }).click();
  const presenterChooser = await presenterChooserPromise;
  expect(presenterChooser.isMultiple()).toBe(false);
  await presenterChooser.setFiles([]);

  const axis = page.getByRole("group", { name: "Flow axis" });
  const vertical = axis.getByRole("radio", { name: "Vertical" });
  await page.getByRole("slider", { name: "Spacing" }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(vertical).toBeFocused();
  const focusOutline = await vertical.locator("+ span").evaluate((span) => getComputedStyle(span).outlineStyle);
  expect(focusOutline).not.toBe("none");
  await page.keyboard.press("ArrowRight");
  await expect(axis.getByRole("radio", { name: "Horizontal" })).toBeChecked();

  const frameRate = page.getByRole("group", { name: "Frame rate" });
  await expect(frameRate.getByRole("radio")).toHaveCount(5);
  await expect(frameRate.getByRole("radio", { name: "25" })).toBeVisible();
  await expect(frameRate.getByRole("radio", { name: "50" })).toBeVisible();

  const stageWidth = page.getByLabel("Stage width");
  await stageWidth.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("1200");
  await stageWidth.blur();
  await expect(page.locator(".stage-hud")).toContainText("1200 × 1920");

  const firstUp = page.getByRole("button", { name: "Move Drift study 01.png up" });
  const firstDown = page.getByRole("button", { name: "Move Drift study 01.png down" });
  const lastDown = page.getByRole("button", { name: "Move Drift study 08.png down" });
  await expect(firstUp).toBeDisabled();
  await expect(firstDown).toBeEnabled();
  await expect(lastDown).toBeDisabled();
  await page.getByRole("button", { name: "Move Drift study 02.png up" }).click();
  await expect(page.locator(".asset-list li").first()).toContainText("Drift study 02.png");
  await expect(page.getByRole("button", { name: "Move Drift study 02.png up" })).toBeDisabled();

  const pinnedGroup = page.locator("details").filter({ has: page.locator("summary", { hasText: "Pinned frame" }) });
  await pinnedGroup.locator("summary").click();
  const pinnedSwitch = page.getByRole("switch", { name: "Keep one frame still" });
  await expect(pinnedSwitch).toBeDisabled();
  await page.getByRole("button", { name: "Pin Drift study 02.png" }).click();
  await expect(pinnedSwitch).toBeEnabled();
  await expect(pinnedSwitch).toBeChecked();
  await pinnedSwitch.click();
  await expect(pinnedSwitch).not.toBeChecked();
  await expect(pinnedSwitch).toBeDisabled();
});

test("320 and 390px panel shells keep a single viewport with a stable footer", async ({ page }) => {
  await waitForStudio(page);

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    for (const panel of ["media", "stage", "director"] as const) {
      await page.getByRole("button", { name: panel, exact: true }).click();
      const metrics = await page.evaluate(() => {
        const footer = document.querySelector<HTMLElement>(".app-footer")!;
        const rect = footer.getBoundingClientRect();
        return {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          clientHeight: document.documentElement.clientHeight,
          scrollHeight: document.documentElement.scrollHeight,
          footerTop: Math.round(rect.top),
          footerBottom: Math.round(rect.bottom),
        };
      });
      expect(metrics.scrollWidth).toBe(metrics.clientWidth);
      expect(metrics.scrollHeight).toBe(metrics.clientHeight);
      expect(metrics.footerBottom).toBe(viewport.height);
      expect(metrics.footerTop).toBeLessThan(metrics.footerBottom);
    }
  }

  await page.getByText("SOURCE · AGPL", { exact: true }).click();
  await expect(page.getByRole("note", { name: "Free software notice" })).toContainText("absolutely no warranty");
  await expect(page.getByRole("link", { name: "Complete source" })).toHaveAttribute("href", "https://github.com/bomkino/pitchdog-drift");
  const legalMetrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    height: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(legalMetrics.scrollWidth).toBe(legalMetrics.width);
  expect(legalMetrics.scrollHeight).toBe(legalMetrics.height);
});

test("handles empty, one, twelve, and corrupt moving-slide inputs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await waitForStudio(page);

  const remove = page.locator('button[aria-label^="Remove "]');
  while (await remove.count()) await remove.first().click({ force: true });
  await expect(page.getByText("A film needs frames.")).toBeVisible();
  await expect(page.locator(".asset-list li")).toHaveCount(0);

  const input = page.locator('input[accept^="image/png"]');
  await input.setInputFiles(fixturePath);
  await expect(page.locator(".asset-list li")).toHaveCount(1);

  const bytes = await readFile(fixturePath);
  await input.setInputFiles(Array.from({ length: 11 }, (_, index) => ({
    name: `slide-${String(index + 2).padStart(2, "0")}.png`,
    mimeType: "image/png",
    buffer: bytes,
  })));
  await expect(page.locator(".asset-list li")).toHaveCount(12);

  await input.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not a png") });
  await expect(page.getByText("None of those images could be decoded.")).toBeVisible();
  await expect(page.locator(".asset-list li")).toHaveCount(12);
  expect(errors).toEqual([]);
});

test("rejects an audio-only presenter without corrupting the saved project", async ({ page }) => {
  await waitForStudio(page);
  await page.locator('input[type="file"][accept^="video"]').setInputFiles(audioOnlyFixturePath);
  await expect(page.getByRole("alert")).toContainText("contains no readable video track or valid finite metadata");
  await expect(page.locator(".presenter-card")).toHaveCount(0);
  await expect(page.locator(".asset-list li")).toHaveCount(8);
  await expect(page.locator(".header-status")).toContainText("saved locally", { timeout: 10_000 });
  await page.reload();
  await expect(page.locator(".asset-list li")).toHaveCount(8);
  await expect(page.getByText("recovery locked", { exact: true })).toHaveCount(0);
  await expect(page.locator(".presenter-card")).toHaveCount(0);
});

test("saved starter studies remain replaceable by the first real deck", async ({ page }) => {
  await waitForStudio(page);
  await page.waitForTimeout(1_800);
  await expect(page.locator(".header-status")).toContainText("saved locally");
  await page.reload();
  await expect(page.getByText("Local project reopened with verified media.")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".asset-list li")).toHaveCount(8);

  await page.locator('input[accept^="image/png"]').setInputFiles(fixturePath);
  await expect(page.locator(".asset-list li")).toHaveCount(1);
  await expect(page.locator(".asset-list li").first()).toContainText("slide.png");
  await expect(page.getByText(/Drift study/)).toHaveCount(0);
  await page.waitForTimeout(1_800);
  await page.reload();
  await expect(page.getByText("Local project reopened with verified media.")).toBeVisible({ timeout: 30_000 });
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
      return { playingDelta, pausedDelta, pausedFlag, exportDelta, exportPausedFlag, restoredDelta, restoredPausedFlag: video.paused };
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
    await expect(reopened.getByText("Portable project verified, opened, and copied into local storage.")).toBeVisible({ timeout: 30_000 });
    await expect(reopened.locator(".asset-list li")).toHaveCount(1);
    await expect(reopened.locator(".asset-list li").first()).toContainText("slide.png");
    await reopened.reload();
    await expect(reopened.getByText("Local project reopened with verified media.")).toBeVisible({ timeout: 30_000 });
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
      record.manifest.engineVersion = "99.0.0";
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
        engineVersion: project.manifest.engineVersion as string,
        assetName: project.manifest.assets[0]?.name as string,
        assetCount,
      };
    } finally {
      database.close();
    }
  });
  expect(preserved).toEqual({ engineVersion: "99.0.0", assetName: "slide.png", assetCount: 1 });

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
    await expect(oldPage.getByText("Portable project verified, opened, and copied into local storage.")).toHaveCount(0);

    await oldPage.evaluate(() => (window as Window & { __driftReleaseDigest?: () => void }).__driftReleaseDigest?.());
    await expect(oldPage.getByText("Portable project verified, opened, and copied into local storage.")).toBeVisible({ timeout: 30_000 });
    await expect(oldPage.locator(".asset-list li")).toHaveCount(1);
    await expect(oldPage.locator(".asset-list li").first()).toContainText("slide.png");
    await expect(oldPage.locator(".stage-hud")).toContainText("1200 × 1920");
    await oldPage.waitForTimeout(1_800);
    await oldPage.reload();
    await expect(oldPage.getByText("Local project reopened with verified media.")).toBeVisible({ timeout: 30_000 });
    await expect(oldPage.locator(".asset-list li")).toHaveCount(1);
    await expect(oldPage.locator(".asset-list li").first()).toContainText("slide.png");
    await expect(oldPage.locator(".stage-hud")).toContainText("1200 × 1920");
  } finally {
    await oldContext.close();
  }
});

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
  await expect(page.getByRole("button", { name: "Save portable project" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add slides" })).toBeVisible();
  await page.getByRole("button", { name: "Export MP4 master" }).click();
  await expect(page.getByRole("alert")).toContainText("Cinematic renderer is unavailable; export is blocked.");
  expect(await page.evaluate(() => (window as Window & { __driftSavePickerCalls?: number }).__driftSavePickerCalls)).toBe(0);
});

test("export lifecycle preserves playback truth and releases a failed GPU preflight", async ({ page }) => {
  await waitForStudio(page);
  await page.getByLabel("Stage width").fill("256");
  await page.getByLabel("Stage height").fill("256");
  await page.getByRole("slider", { name: "Duration" }).fill("3");
  await page.getByRole("group", { name: "Frame rate" }).getByText("24", { exact: true }).click();
  await expect(page.locator(".stage-hud")).toContainText("256 × 256");
  await expect(page.getByRole("button", { name: "Pause preview" })).toBeVisible();

  const stillDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save transparent-safe PNG" }).click();
  expect(await (await stillDownload).path()).toBeTruthy();
  const pause = page.getByRole("button", { name: "Pause preview" });
  await expect(pause).toBeEnabled();
  await pause.click();
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();
  await page.getByRole("button", { name: "Play preview" }).click();
  await expect(page.getByRole("button", { name: "Pause preview" })).toBeVisible();

  await page.getByRole("button", { name: "Pause preview" }).click();
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();
  await page.getByRole("button", { name: "Export PNG sequence" }).click();
  await expect(page.locator(".export-overlay")).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel export" }).click();
  await expect(page.locator(".export-overlay")).toBeHidden();
  await expect(page.getByRole("button", { name: "Play preview" })).toBeEnabled();
  await page.getByRole("button", { name: "Play preview" }).click();
  await expect(page.getByRole("button", { name: "Pause preview" })).toBeVisible();
  await expect(page.locator(".header-status")).toContainText("saved locally", { timeout: 10_000 });

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

  await page.getByRole("button", { name: "Save transparent-safe PNG" }).click();
  await expect(page.getByRole("alert")).toContainText("exceeds this GPU's safe WebGL limit of 128 × 128");
  const projectDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save portable project" }).click();
  expect(await (await projectDownload).path()).toBeTruthy();
  await expect(page.locator(".notice")).toContainText("Portable project saved");
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
    settings.lighting = { ...settings.lighting, enabled: false };
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

    const engine = new CinematicCarousel(canvas, settings);
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
        return { pixel, overWhite };
      } finally {
        surface.restore();
      }
    } finally {
      engine.dispose();
      URL.revokeObjectURL(objectUrl);
      canvas.remove();
    }
  }, halfAlphaGreyPng);

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
    const engine = new CinematicCarousel(canvas, settings);
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
        engine.setSettings(structuredClone(settings));
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
    settings.lighting = { ...settings.lighting, enabled: false };
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

test("authored lighting changes real WebGL pixels and remains still when directed", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);
  await page.getByRole("button", { name: /Road Memory/ }).click();
  const lightCharacter = page.getByRole("combobox", { name: "Light character" });
  await expect(lightCharacter).toHaveValue("window-rake");

  await page.getByRole("button", { name: "Pause preview" }).click();
  await page.getByRole("button", { name: "Next slide" }).click();
  await page.getByRole("slider", { name: "Light breath" }).fill("0");

  const atmosphere = page.locator("details").filter({ has: page.locator("summary", { hasText: "Atmosphere" }) });
  if (!(await atmosphere.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await atmosphere.locator("summary").click();
  }
  await page.getByRole("combobox", { name: "Background", exact: true }).selectOption("solid");
  await page.getByRole("slider", { name: "Background breath" }).fill("0");
  await page.getByRole("slider", { name: "Grain" }).fill("0");

  const compareScreenshots = async (first: Buffer, second: Buffer) => page.evaluate(
    async ({ firstPng, secondPng }) => {
      const decode = async (encoded: string): Promise<Uint8ClampedArray> => {
        const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }), { premultiplyAlpha: "none" });
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        bitmap.close();
        return pixels;
      };
      const [firstPixels, secondPixels] = await Promise.all([decode(firstPng), decode(secondPng)]);
      if (firstPixels.length !== secondPixels.length) return { maxDelta: 255, significantChannels: 1 };
      let maxDelta = 0;
      let significantChannels = 0;
      for (let index = 0; index < firstPixels.length; index += 1) {
        const delta = Math.abs(firstPixels[index]! - secondPixels[index]!);
        maxDelta = Math.max(maxDelta, delta);
        if (delta > 1) significantChannels += 1;
      }
      return { maxDelta, significantChannels };
    },
    { firstPng: first.toString("base64"), secondPng: second.toString("base64") },
  );

  const canvas = page.locator("[data-testid=webgl-stage]");
  await page.waitForTimeout(180);
  const windowPixels = await canvas.screenshot();

  await lightCharacter.selectOption("noir-slice");
  await expect(lightCharacter).toHaveValue("noir-slice");
  await page.getByRole("slider", { name: "Light breath" }).fill("0");
  await page.waitForTimeout(180);
  const noirPixels = await canvas.screenshot();
  expect(noirPixels.equals(windowPixels)).toBe(false);

  await page.waitForTimeout(250);
  const noirPixelsLater = await canvas.screenshot();
  const litStability = await compareScreenshots(noirPixels, noirPixelsLater);
  expect(litStability.maxDelta).toBeLessThanOrEqual(1);
  expect(litStability.significantChannels).toBe(0);

  const lightingSwitch = page.getByRole("switch", { name: "Cinematic lighting" });
  await lightingSwitch.uncheck();
  await page.waitForTimeout(180);
  const unlitPixels = await canvas.screenshot();
  expect(unlitPixels.equals(noirPixelsLater)).toBe(false);

  await page.waitForTimeout(250);
  const unlitPixelsLater = await canvas.screenshot();
  const unlitStability = await compareScreenshots(unlitPixels, unlitPixelsLater);
  expect(unlitStability.maxDelta).toBeLessThanOrEqual(1);
  expect(unlitStability.significantChannels).toBe(0);
  expect(errors).toEqual([]);
});
