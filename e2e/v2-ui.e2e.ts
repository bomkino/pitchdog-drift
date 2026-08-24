import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { waitForStudio } from "./studio.helpers";

async function ensureInspectorOpen(group: Locator): Promise<void> {
  if (await group.getAttribute("open") === null) await group.locator("summary").click();
}

async function samplePngPixels(page: Page, base64: string): Promise<number[]> {
  return page.evaluate(async (encoded) => {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }), {
      resizeWidth: 16,
      resizeHeight: 16,
      resizeQuality: "high",
    });
    const surface = document.createElement("canvas");
    surface.width = 16;
    surface.height = 16;
    const context = surface.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Stage sampling canvas is unavailable.");
    context.drawImage(bitmap, 0, 0, surface.width, surface.height);
    bitmap.close();
    return Array.from(context.getImageData(1, 1, 15, 15).data);
  }, base64);
}

async function sampleStagePixels(page: Page, canvas: Locator): Promise<number[]> {
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("WebGL stage bounds are unavailable.");
  const session = await page.context().newCDPSession(page);
  const scale = Math.min(1, 64 / Math.max(bounds.width, bounds.height));
  let data = "";
  try {
    ({ data } = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
      optimizeForSpeed: true,
      clip: { ...bounds, scale },
    }));
  } finally {
    if (!page.isClosed()) await session.detach();
  }
  return samplePngPixels(page, data);
}

function pixelDistance(left: number[], right: number[]): number {
  return left.reduce((total, value, index) => total + Math.abs(value - right[index]!), 0);
}

test("shipping and development identities restore the authored V2 room and repair a legacy-style pinned frame", async ({ page }, testInfo) => {
  await waitForStudio(page);

  const production = testInfo.project.name === "production";
  await expect(page.locator("html")).toHaveAttribute(
    "data-drift-build-channel",
    production ? "release" : "v2-dev",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-drift-storage-namespace",
    production ? "pitchdog-drift" : "pitchdog-drift-v2-dev",
  );
  await page.getByRole("button", { name: "WORLD", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose the weather." })).toBeVisible();

  const atmosphere = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Background" }),
  });
  await ensureInspectorOpen(atmosphere);
  const background = page.getByRole("combobox", { name: "Background", exact: true });
  await background.selectOption("transparent");
  await expect(background).toHaveValue("transparent");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "true");

  const filmWorlds = page.locator("details.world-browser");
  await ensureInspectorOpen(filmWorlds);
  await filmWorlds.getByRole("button", { name: /^Film World: Editorial Drift\./ }).click();
  // The authored 9:16 Reading Spine scene uses Orbiting Bloom (Aura), not the
  // older single-World slice's paper-room fallback.
  await expect(background).toHaveValue("aura");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "false");

  await page.getByRole("button", { name: "SLIDES", exact: true }).click();
  await page.getByRole("button", { name: "Keep Drift study 01.png still" }).click();
  await expect(page.locator(".stage-topline").first()).toContainText("editorial drift");
  const pinnedGroup = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Pinned frame" }),
  });
  await expect(pinnedGroup).toHaveAttribute("open", "");
  await expect(pinnedGroup.locator("summary")).toBeFocused();

  const pinnedSwitch = page.getByRole("switch", { name: "Keep one frame still" });
  const carouselPresence = page.getByRole("group", { name: "Carousel presence", exact: true });
  const pinnedLayer = page.getByRole("group", { name: "Layer", exact: true });
  const pinnedRatio = page.getByRole("group", { name: "Ratio", exact: true });
  await expect(pinnedSwitch).toBeChecked();
  await expect(carouselPresence.getByRole("radio", { name: "Still only" })).toBeChecked();
  await expect(pinnedLayer.getByRole("radio", { name: "Protected" })).toBeChecked();
  await expect(pinnedRatio.getByRole("radio", { name: "Use source" })).toBeChecked();

  // The radio inputs are intentionally visually hidden. Click their visible,
  // associated labels so this remains a real pointer journey.
  await carouselPresence.getByText("Still + moving", { exact: true }).click();
  await pinnedLayer.getByText("In scene", { exact: true }).click();
  await pinnedRatio.getByText("Custom", { exact: true }).click();
  await expect(carouselPresence.getByRole("radio", { name: "Still + moving" })).toBeChecked();
  await expect(pinnedLayer.getByRole("radio", { name: "In scene" })).toBeChecked();
  await expect(pinnedRatio.getByRole("radio", { name: "Custom" })).toBeChecked();

  const resetNotice = page.locator(".notice[role=status]").filter({
    hasText: "Pinned frame reset to its source ratio, protected layer, and still-only track.",
  });
  await Promise.all([
    resetNotice.waitFor({ state: "visible" }),
    page.getByRole("button", { name: "Reset pinned frame" }).click(),
  ]);
  await expect(carouselPresence.getByRole("radio", { name: "Still only" })).toBeChecked();
  await expect(pinnedLayer.getByRole("radio", { name: "Protected" })).toBeChecked();
  await expect(pinnedRatio.getByRole("radio", { name: "Use source" })).toBeChecked();
  await expect(pinnedSwitch).toBeChecked();
});

test("V2 workspaces keep one live stage and preserve the selected slide", async ({ page }) => {
  await waitForStudio(page);
  const canvas = page.locator(".stage-frame canvas");
  const originalCanvas = await canvas.elementHandle();
  expect(originalCanvas).toBeTruthy();

  await page.getByRole("button", { name: "02 Drift study 02.png" }).click();
  await expect(page.getByRole("button", { name: "02 Drift study 02.png" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Build the deck." })).toBeVisible();

  for (const workspace of ["WORLD", "DIRECT", "MASTER", "SLIDES"] as const) {
    await page.getByRole("button", { name: workspace, exact: true }).click();
    const currentCanvas = await canvas.elementHandle();
    expect(await page.evaluate(([before, after]) => before === after, [originalCanvas, currentCanvas])).toBe(true);
  }

  await expect(page.getByRole("button", { name: "02 Drift study 02.png" })).toHaveAttribute("aria-pressed", "true");
});

test("Reading Pace, platform guides, preflight, and Command-K use the settled V2 workflow", async ({ page }) => {
  await waitForStudio(page);
  await page.getByRole("button", { name: "DIRECT", exact: true }).click();
  const timelineIntent = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Timeline intent" }),
  });
  await ensureInspectorOpen(timelineIntent);
  await timelineIntent.getByText("Reading pace", { exact: true }).click();
  await expect(timelineIntent.getByRole("radio", { name: "Reading pace" })).toBeChecked();
  await expect(timelineIntent.getByText(/moving/i).first()).toBeVisible();

  await page.getByRole("button", { name: "MASTER", exact: true }).click();
  const platformGuides = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Platform guides" }),
  });
  await ensureInspectorOpen(platformGuides);
  await platformGuides.getByRole("combobox", { name: "Preview overlay" }).selectOption("instagram-combined");
  await expect(page.locator(".platform-guide-overlay[data-profile='instagram-combined']")).toBeVisible();
  await expect(page.getByRole("status", { name: "Master preflight" })).toContainText(/MP4 READY|BLOCKED/);

  await page.keyboard.press("Meta+k");
  const commandSearch = page.getByRole("searchbox", { name: "Search commands" });
  await expect(commandSearch).toBeFocused();
  await commandSearch.fill("switch to world");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Choose the weather." })).toBeVisible();
});

test("comparison pixels return after a still export instead of keeping live direction", async ({ page }) => {
  await waitForStudio(page);
  await page.getByRole("button", { name: "WORLD", exact: true }).click();
  const filmWorlds = page.locator("details.world-browser");
  await ensureInspectorOpen(filmWorlds);
  await filmWorlds.getByRole("button", { name: /^Film World: Dread\./ }).click();
  const compare = page.getByRole("button", { name: "A/B", exact: true });
  await expect(compare).toBeEnabled();
  await compare.click();
  await expect(page.getByRole("button", { name: "Before", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".stage-topline").first()).toContainText("editorial drift");
  await page.getByRole("button", { name: "Pause preview" }).click();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const canvas = page.locator("[data-testid=webgl-stage]");
  const before = await sampleStagePixels(page, canvas);
  await page.getByRole("button", { name: "Before", exact: true }).click();
  await expect(page.locator(".stage-topline").first()).toContainText("dread");
  await page.getByRole("button", { name: "A/B", exact: true }).click();
  await expect(page.locator(".stage-topline").first()).toContainText("editorial drift");

  await page.getByRole("button", { name: "MASTER", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save transparent-safe PNG" }).click();
  const exportPath = await (await download).path();
  expect(exportPath).toBeTruthy();
  // A still export must render the live Dread direction even while the stage
  // is showing Before. Use the exported pixels as the live-state receipt,
  // avoiding a redundant, very expensive SwiftShader stage capture.
  const exportedLive = await samplePngPixels(page, (await readFile(exportPath!)).toString("base64"));

  await page.getByRole("button", { name: "WORLD", exact: true }).click();
  await expect(page.getByRole("button", { name: "Before", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".stage-topline").first()).toContainText("editorial drift");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const after = await sampleStagePixels(page, canvas);
  expect(pixelDistance(after, before)).toBeLessThan(pixelDistance(after, exportedLive));
});

test("Command-K traps keyboard focus, exposes active results, and restores its trigger", async ({ page }) => {
  await waitForStudio(page);
  const trigger = page.getByRole("button", { name: "Open command palette" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Drift commands" });
  const search = page.getByRole("searchbox", { name: "Search commands" });
  await expect(dialog).toBeVisible();
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute("aria-activedescendant", /studio-command-/);

  await search.fill("choose film world");
  await expect(dialog.getByText("No command.")).toBeVisible();
  await search.fill("film world");
  await expect(dialog.getByRole("option", { name: /Switch to World/ })).toBeVisible();
  await search.fill("");

  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
