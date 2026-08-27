import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
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

async function sampleScreenshot(page: Page, bytes: Buffer): Promise<number[]> {
  return page.evaluate(async (encoded) => {
    const binary = atob(encoded);
    const source = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([source], { type: "image/png" }), {
      resizeWidth: 64,
      resizeHeight: 64,
      resizeQuality: "high",
    });
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Screenshot comparison canvas is unavailable.");
    context.drawImage(bitmap, 0, 0, 64, 64);
    bitmap.close();
    return Array.from(context.getImageData(0, 0, 64, 64).data);
  }, bytes.toString("base64"));
}

function pixelDistance(left: number[], right: number[]): number {
  return left.reduce((total, value, index) => total + Math.abs(value - right[index]!), 0);
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
  const previewDescription = page.locator("#stage-preview-description");
  await expect(previewDescription).toContainText("8 slides");
  await expect(previewDescription).toContainText("editorial drift.");
  await switchWorkspace(page, "LOOK");
  const atmosphere = page.locator(".inspector-group").filter({ has: page.locator(":scope > .inspector-group-trigger > span", { hasText: /^Background$/ }) });
  if (await atmosphere.getAttribute("data-expanded") !== "true") await atmosphere.locator(":scope > .inspector-group-trigger").click();
  // The restrained Editorial Drift foundation opens on Long Fibres paper.
  // Choosing the richer Editorial Drift Film World later is a separate,
  // explicit authored scene operation and moves to Orbiting Bloom/Aura.
  await expect(page.locator(".current-background-stage .background-preview")).toHaveAttribute("data-family", "paper");

  await switchWorkspace(page, "MOTION");
  const flowAxis = page.getByRole("group", { name: "Flow axis" });
  await flowAxis.getByText("Horizontal", { exact: true }).click();
  await expect(page.locator(".stage-topline").last()).toContainText("horizontal");
  await flowAxis.getByText("Vertical", { exact: true }).click();
  await expect(page.locator(".stage-topline").last()).toContainText("vertical");

  await switchWorkspace(page, "EXPORT");
  const stageRatio = page.getByRole("group", { name: "Stage ratio" });
  await stageRatio.getByText("16:9", { exact: true }).click();
  await expect(page.locator(".stage-hud")).toContainText("1920 × 1080");
  const widePreviewRatio = await page.locator(".stage-frame").evaluate((frame) => {
    const bounds = frame.getBoundingClientRect();
    return bounds.width / bounds.height;
  });
  expect(widePreviewRatio).toBeCloseTo(16 / 9, 3);
  await stageRatio.getByText("9:16", { exact: true }).click();
  await expect(page.locator(".stage-hud")).toContainText("1080 × 1920");
  const portraitPreviewRatio = await page.locator(".stage-frame").evaluate((frame) => {
    const bounds = frame.getBoundingClientRect();
    return bounds.width / bounds.height;
  });
  expect(portraitPreviewRatio).toBeCloseTo(9 / 16, 3);
  await page.getByLabel("Stage width").fill("2160");
  await page.getByLabel("Stage height").fill("3840");
  await expect(page.locator(".stage-hud")).toContainText("2160 × 3840");
  await expect(stageRatio.getByRole("radio", { name: "9:16" })).toBeChecked();
  await page.getByLabel("Stage height").fill("1920");

  await switchWorkspace(page, "LOOK");
  await page.getByTestId("workspace-scroll").getByText("Advanced", { exact: true }).click();
  const filmWorlds = page.locator("details.world-browser");
  if (await filmWorlds.getAttribute("open") === null) await filmWorlds.locator("summary").click();
  await filmWorlds.getByRole("button", { name: /^Film World: Dread\./ }).click();
  await expect(page.locator(".stage-topline").first()).toContainText("dread");
  await expect(previewDescription).toContainText("dread.");
  await switchWorkspace(page, "EXPORT");
  await page.getByLabel("Stage width").fill("1200");
  // A Film World is an explicit authored recut. Dread read the prior custom
  // master as landscape and established its 16:9 scene before this subsequent
  // custom-width edit.
  await expect(page.locator(".stage-hud")).toContainText("1200 × 1080");

  await switchWorkspace(page, "LOOK");
  await page.locator('.background-study-card[data-background-id="transparent"]').click();
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "true");
  await filmWorlds.getByRole("button", { name: /^Film World: Sunstruck Atlas\./ }).click();
  await expect(page.locator(".current-background-stage .background-preview")).toHaveAttribute("data-family", "gradient");
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

test("director fields expose concise names and separate supporting descriptions", async ({ page }) => {
  await waitForStudio(page);

  await switchWorkspace(page, "EXPORT");
  await expect(page.getByLabel("Stage width", { exact: true })).toHaveValue("1080");
  await expect(page.getByRole("spinbutton", { name: "Stage width", exact: true })).toHaveAccessibleDescription("px");
  await switchWorkspace(page, "SLIDES");
  await expect(page.getByLabel("Slide ratio", { exact: true })).toHaveValue("16:9");
  await switchWorkspace(page, "MOTION");
  await page.getByTestId("workspace-scroll").getByText("Advanced", { exact: true }).click();
  await page.locator(".inspector-group").filter({ has: page.locator(":scope > .inspector-group-trigger > span", { hasText: /^Motion physics$/ }) }).locator(":scope > .inspector-group-trigger").click();
  await expect(page.getByRole("slider", { name: "Free-run speed", exact: true })).toHaveCount(0);
  await expect(page.getByText(/authored sequence owns speed/i).first()).toBeVisible();

  const reducedMotion = page.getByRole("switch", { name: "Reduced-motion master", exact: true });
  await expect(reducedMotion).toHaveAccessibleDescription(/Independent from your OS preview preference/);

  await switchWorkspace(page, "LOOK");
  await page.getByTestId("workspace-scroll").getByText("Advanced", { exact: true }).click();
  const surface = page.locator(".inspector-group").filter({ has: page.locator(":scope > .inspector-group-trigger > span", { hasText: /^Card surface$/ }) });
  await surface.locator(":scope > .inspector-group-trigger").click();
  await expect(page.getByLabel("Border", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Border colour", { exact: true })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Corner smoothing", exact: true })).toHaveAccessibleDescription("60% is the familiar iOS-style continuous corner.");
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

  await switchWorkspace(page, "MOTION");
  const axis = page.getByRole("group", { name: "Flow axis" });
  const vertical = axis.getByRole("radio", { name: "Vertical" });
  await page.getByRole("button", { name: "MOTION", exact: true }).focus();
  // Traverse the real current panel instead of assuming the shorter V1 panel's
  // historical control count. Failing after a full cycle still catches a
  // missing or unreachable radio without coupling the test to panel density.
  for (let step = 0; step < 48 && !(await vertical.evaluate((element) => document.activeElement === element)); step += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(vertical).toBeFocused();
  const focusOutline = await vertical.locator("+ span").evaluate((span) => getComputedStyle(span).outlineStyle);
  expect(focusOutline).not.toBe("none");
  await page.keyboard.press("ArrowRight");
  await expect(axis.getByRole("radio", { name: "Horizontal" })).toBeChecked();

  await switchWorkspace(page, "EXPORT");
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

  await switchWorkspace(page, "SLIDES");
  const pinnedGroup = page.locator(".inspector-group").filter({ has: page.locator(":scope > .inspector-group-trigger > span", { hasText: /^Pinned frame$/ }) });
  await pinnedGroup.locator(":scope > .inspector-group-trigger").click();
  const pinnedSwitch = page.getByRole("switch", { name: "Keep one frame still" });
  await expect(pinnedSwitch).toBeDisabled();
  const pinButton = page.getByRole("button", { name: "Keep Drift study 02.png still" });
  await pinButton.click();
  await expect(pinnedGroup).toHaveAttribute("data-expanded", "true");
  await expect(page.getByRole("button", { name: "Return Drift study 02.png to the carousel" })).toBeFocused();
  await expect(pinnedSwitch).toBeEnabled();
  await expect(pinnedSwitch).toBeChecked();
  await pinnedSwitch.click();
  await expect(pinnedSwitch).not.toBeChecked();
  await expect(pinnedSwitch).toBeEnabled();
  await pinnedSwitch.click();
  await expect(pinnedSwitch).toBeChecked();
});

test("reduced motion yields a stable rendered interval without animated grain", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await waitForStudio(page);
  await expect(page.getByText("OS motion hold · scrub still works", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cinematic preview" }))
    .toHaveAccessibleDescription(/held by the Mac Reduce Motion setting/i);
  // Element screenshots include DOM layers painted over the canvas. Hide the
  // live FPS counter and timed notices so their independent updates cannot
  // impersonate WebGL motion in this exact-pixel assertion.
  await page.addStyleTag({ content: ".stage-hud, .notice { visibility: hidden !important; }" });
  const canvas = page.locator("[data-testid=webgl-stage]");
  // Texture decode is asynchronous and lifecycle opacity deliberately remains
  // active under reduced motion. Find a stable body interval; a live 12 fps
  // grain plate or spatial travel would prevent captures 150 ms apart from
  // matching, while an entry/exit fade is allowed to make an attempt differ.
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
});

test("Reduced-motion master names its spatial hold and restoring motion changes real preview pixels", async ({ page }) => {
  await waitForStudio(page);
  await page.getByRole("button", { name: "MOTION", exact: true }).click();
  await page.getByTestId("workspace-scroll").getByText("Advanced", { exact: true }).click();
  const motionPhysics = page.locator(".inspector-group").filter({
    has: page.locator(":scope > .inspector-group-trigger > span", { hasText: /^Motion physics$/ }),
  });
  await motionPhysics.locator(":scope > .inspector-group-trigger").click();
  const reducedMotionMaster = page.getByRole("switch", { name: "Reduced-motion master" });
  await expect(reducedMotionMaster).not.toBeChecked();

  await reducedMotionMaster.click();
  await expect(reducedMotionMaster).toBeChecked();
  await expect(page.getByRole("region", { name: "Cinematic preview" }))
    .toHaveAccessibleDescription(/playing a reduced-motion master; spatial travel is held/i);
  await expect(page.locator(".timeline-hint")).toHaveText("Reduced-motion master · spatial travel held");

  await page.addStyleTag({ content: ".stage-hud, .notice { visibility: hidden !important; }" });
  const canvas = page.locator("[data-testid=webgl-stage]");
  await page.waitForTimeout(250);
  const heldA = await canvas.screenshot();
  await page.waitForTimeout(350);
  const heldB = await canvas.screenshot();
  const heldDistance = pixelDistance(
    await sampleScreenshot(page, heldA),
    await sampleScreenshot(page, heldB),
  );

  await reducedMotionMaster.click();
  await expect(reducedMotionMaster).not.toBeChecked();
  await expect(page.getByRole("region", { name: "Cinematic preview" }))
    .toHaveAccessibleDescription(/Preview playing\./);
  await expect(page.locator(".timeline-hint")).toHaveText("Drag to scrub · Shift + arrows jump passes");
  await page.waitForTimeout(250);
  const movingA = await canvas.screenshot();
  await page.waitForTimeout(350);
  const movingB = await canvas.screenshot();
  const movingDistance = pixelDistance(
    await sampleScreenshot(page, movingA),
    await sampleScreenshot(page, movingB),
  );
  expect(movingDistance).toBeGreaterThan(heldDistance * 3);
});

test("Pause freezes authored time while interaction glides to a stable rest", async ({ page }) => {
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

  // Pausing owns authored time, not direct navigation. A wheel gesture must
  // remain visible and finish smoothly even when the show clock is held.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const first = await canvas.screenshot();
  await page.waitForTimeout(250);
  const second = await canvas.screenshot();
  expect(second.equals(first)).toBe(false);

  await page.waitForTimeout(1_250);
  const settled = await canvas.screenshot();
  await page.waitForTimeout(350);
  const held = await canvas.screenshot();
  expect(held.equals(settled)).toBe(true);
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

  while (await page.locator(".asset-list li").count()) {
    const count = await page.locator(".asset-list li").count();
    const row = page.locator(".asset-list li").first();
    await row.getByRole("button", { name: /^Remove / }).click({ force: true });
    await expect(page.locator(".asset-list li")).toHaveCount(count);
    await row.getByRole("button", { name: /^Confirm removal of / }).click({ force: true });
    await expect(page.locator(".asset-list li")).toHaveCount(count - 1);
  }
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
