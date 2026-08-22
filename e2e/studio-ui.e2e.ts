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

test("boots WebGL2, exposes real controls, restores context, and fits phone viewports", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);
  await expect(page.locator(".asset-list li")).toHaveCount(8);
  await expect(page.getByText(/WebGL2 · (H.264 ready|PNG output)/)).toBeVisible();
  const previewDescription = page.locator("#stage-preview-description");
  await expect(previewDescription).toContainText("8 slides");
  await expect(previewDescription).toContainText("editorial drift theme");

  const flowAxis = page.getByRole("group", { name: "Flow axis" });
  await flowAxis.getByText("Horizontal", { exact: true }).click();
  await expect(page.locator(".stage-topline").last()).toContainText("horizontal");
  await flowAxis.getByText("Vertical", { exact: true }).click();
  await expect(page.locator(".stage-topline").last()).toContainText("vertical");

  await page.getByRole("button", { name: /Dread/ }).click();
  await expect(page.locator(".stage-topline").first()).toContainText("dread");
  await expect(previewDescription).toContainText("dread theme");
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

  const fullFrame = page.getByRole("button", { name: "Full frame" });
  await fullFrame.click();
  const exitFullFrame = page.getByRole("button", { name: "Exit full frame" });
  await expect(exitFullFrame).toBeFocused();
  await expect(page.locator("main.app")).toHaveAttribute("data-focus", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator("main.app")).toHaveAttribute("data-focus", "false");
  await expect(fullFrame).toBeFocused();

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
  await page.getByRole("button", { name: "Keep Drift study 02.png still" }).click();
  await expect(pinnedSwitch).toBeEnabled();
  await expect(pinnedSwitch).toBeChecked();
  await pinnedSwitch.click();
  await expect(pinnedSwitch).not.toBeChecked();
  await expect(pinnedSwitch).toBeEnabled();
  await pinnedSwitch.click();
  await expect(pinnedSwitch).toBeChecked();
});

test("reduced motion freezes the rendered preview instead of leaving animated grain behind", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await waitForStudio(page);
  // Element screenshots include DOM layers painted over the canvas. Hide the
  // live FPS counter and timed notices so their independent updates cannot
  // impersonate WebGL motion in this exact-pixel assertion.
  await page.addStyleTag({ content: ".stage-hud, .notice { visibility: hidden !important; }" });
  const canvas = page.locator("[data-testid=webgl-stage]");
  // Texture decode is asynchronous and can legitimately finish after the
  // studio shell becomes ready. Establish a stable baseline first; real grain
  // or motion would prevent two consecutive captures from ever matching.
  let first = await canvas.screenshot();
  let baselineStable = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(150);
    const candidate = await canvas.screenshot();
    if (candidate.equals(first)) {
      first = candidate;
      baselineStable = true;
      break;
    }
    first = candidate;
  }
  expect(baselineStable).toBe(true);
  await page.waitForTimeout(700);
  const second = await canvas.screenshot();
  expect(second.equals(first)).toBe(true);
});

test("Pause kills existing carousel inertia and leaves the WebGL preview pixel-still", async ({ page }) => {
  await waitForStudio(page);
  await page.addStyleTag({ content: ".stage-hud, .notice { visibility: hidden !important; }" });
  const canvas = page.locator("[data-testid=webgl-stage]");

  await canvas.evaluate((element) => element.dispatchEvent(new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 150,
  })));
  await page.getByRole("button", { name: "Pause preview" }).click();
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();

  // Let the pause state cross a paint boundary, then prove neither residual
  // inertia nor the grain clock can alter a later WebGL frame.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const first = await canvas.screenshot();
  await page.waitForTimeout(700);
  const second = await canvas.screenshot();
  expect(second.equals(first)).toBe(true);
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
