import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Download, type Locator, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { INTERFACE_SCALE_STORAGE_KEY } from "../src/lib/interfaceScale";
import { switchWorkspace, waitForStudio } from "./studio.helpers";

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

async function afterPaint(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolvePaint) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()));
  }));
}

async function setScrollTop(locator: Locator, requestedTop: number): Promise<number> {
  return locator.evaluate((element, top) => {
    element.scrollTop = top;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
    return element.scrollTop;
  }, requestedTop);
}

async function closeScaleMenuAndSettle(scaleMenu: Locator, summary: Locator): Promise<void> {
  if (await scaleMenu.getAttribute("open") !== null) await summary.click();
  await expect(scaleMenu).not.toHaveAttribute("open", "");
  const caret = summary.locator(".interface-scale-caret");
  await expect(caret).toHaveCSS("transform", "none");
  await expect.poll(() => caret.evaluate((element) => element.getAnimations().length)).toBe(0);
}

async function resetMediaScroll(page: Page): Promise<void> {
  await setScrollTop(page.locator(".media-library"), 0);
  await setScrollTop(page.locator(".asset-list"), 0);
}

async function captureLayout(page: Page, path: string): Promise<void> {
  await afterPaint(page);
  await page.screenshot({ path, animations: "disabled", caret: "hide" });
}

async function loadEvidenceLayout(
  page: Page,
  scale: 100 | 150 | 200,
  viewport: Readonly<{ width: number; height: number }>,
  panel: "media" | "stage" | "director",
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, String(value));
  }, { key: INTERFACE_SCALE_STORAGE_KEY, value: scale });
  await page.goto("/");
  await expect(page.locator(".asset-list li")).toHaveCount(8, { timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/u);
  await page.getByRole("button", { name: "Pause preview" }).click();

  const app = page.locator(".app");
  await expect(app).toHaveAttribute("data-interface-scale", String(scale));
  await expect(app).toHaveAttribute("data-interface-layout", scale >= 150 ? "single-panel" : "three-panel");
  const navigation = page.getByRole("navigation", { name: "Studio panels" });
  if (await navigation.isVisible()) {
    await navigation.getByRole("button", { name: panel, exact: true }).click();
    await expect(app).toHaveAttribute("data-active-panel", panel);
  }

  if (panel === "media") {
    await resetMediaScroll(page);
    await expect(page.locator(".media-library")).toBeVisible();
  } else if (panel === "director") {
    await setScrollTop(page.getByTestId("workspace-scroll"), 0);
    await expect(page.locator("aside.inspector")).toHaveCSS("opacity", "1");
  } else {
    await expect(page.getByRole("region", { name: "Cinematic preview" })).toBeVisible();
  }
}

async function downloadSha256(download: Promise<Download>): Promise<string> {
  const path = await (await download).path();
  if (!path) throw new Error("Expected a readable retained download.");
  return sha256(await readFile(path));
}

async function portableProjectPayloadSha256(page: Page): Promise<string> {
  await switchWorkspace(page, "EXPORT");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save portable project" }).click();
  const path = await (await download).path();
  if (!path) throw new Error("Expected a readable retained Project V4 download.");
  const archive = unzipSync(new Uint8Array(await readFile(path)));
  const manifest = JSON.parse(strFromU8(archive["manifest.json"]!)) as {
    payload: { project: Record<string, unknown> };
  };
  const authoredProject = structuredClone(manifest.payload.project);
  // Saving is itself a persistence event and advances this timestamp. Compare
  // every authored Project V4 byte, not the evidence capture's wall clock.
  delete authoredProject.updatedAt;
  return sha256(Buffer.from(JSON.stringify(authoredProject)));
}

async function stillSha256(page: Page): Promise<string> {
  await switchWorkspace(page, "EXPORT");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG still" }).click();
  return downloadSha256(download);
}

test("Interface Scale reflows chrome without mutating Project V4, authored time, selection, or exact pixels", async ({ page }) => {
  test.setTimeout(360_000);
  await waitForStudio(page);
  const loadedFontFaces = await page.evaluate(async () => {
    await document.fonts.ready;
    return Promise.all([
      '400 16px "PD Body"',
      '500 16px "PD Head"',
      '500 16px "PD Eyebrow"',
    ].map(async (descriptor) => (await document.fonts.load(descriptor)).length));
  });
  expect(loadedFontFaces).toEqual([1, 1, 1]);
  await page.getByRole("button", { name: "Pause preview" }).click();
  const playhead = page.getByRole("slider", { name: "Master timeline playhead" });
  await playhead.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  const authoredTime = await playhead.getAttribute("aria-valuenow");

  await switchWorkspace(page, "SLIDES");
  const selectedSlide = page.getByRole("button", { name: "02 Drift study 02.png" });
  await selectedSlide.click();
  const workspaceScroll = page.getByTestId("workspace-scroll");
  const scrollTop = await setScrollTop(workspaceScroll, 160);

  const projectBefore = await portableProjectPayloadSha256(page);
  const preflightBefore = await page.getByRole("status", { name: "Master preflight" }).textContent();
  const pixelsBefore = await stillSha256(page);
  await switchWorkspace(page, "SLIDES");

  const app = page.locator(".app");
  const scaleMenu = page.locator("details.interface-scale-menu");
  const summary = scaleMenu.locator(":scope > summary");
  await summary.click();
  await summary.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Smaller Interface Scale" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Larger Interface Scale" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(scaleMenu.getByRole("button", { name: "75%", exact: true })).toBeFocused();

  for (const scale of [75, 100, 125, 150, 200] as const) {
    await scaleMenu.getByRole("button", { name: `${scale}%`, exact: true }).click();
    await expect(app).toHaveAttribute("data-interface-scale", String(scale));
    await expect(app).toHaveAttribute("data-interface-layout", scale >= 150 ? "single-panel" : "three-panel");
    const mobileTabs = page.getByRole("navigation", { name: "Studio panels" });
    await closeScaleMenuAndSettle(scaleMenu, summary);
    if (scale >= 150) {
      await expect(mobileTabs).toBeVisible();
      await mobileTabs.getByRole("button", { name: "media", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: "02 Drift study 02.png" })).toHaveAttribute("aria-pressed", "true");
      await mobileTabs.getByRole("button", { name: "director", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("aside.inspector")).toHaveCSS("opacity", "1");
      await afterPaint(page);
      expect(await page.getByTestId("workspace-scroll").evaluate((element) => element.scrollTop)).toBe(scrollTop);
      await mobileTabs.getByRole("button", { name: "stage", exact: true }).focus();
      await page.keyboard.press("Enter");
    } else {
      await expect(mobileTabs).toBeHidden();
      await expect(selectedSlide).toHaveAttribute("aria-pressed", "true");
      expect(await workspaceScroll.evaluate((element) => element.scrollTop)).toBe(scrollTop);
    }
    await expect(playhead).toHaveAttribute("aria-valuenow", authoredTime!);

    const stage = await page.locator(".stage-frame").boundingBox();
    const viewport = page.viewportSize();
    expect(stage).toBeTruthy();
    expect(viewport).toBeTruthy();
    expect(stage!.x).toBeGreaterThanOrEqual(0);
    expect(stage!.y).toBeGreaterThanOrEqual(0);
    expect(stage!.x + stage!.width).toBeLessThanOrEqual(viewport!.width + 1);
    expect(stage!.y + stage!.height).toBeLessThanOrEqual(viewport!.height + 1);
    await summary.click();
  }

  await page.setViewportSize({ width: 960, height: 640 });
  await expect(app).toHaveAttribute("data-interface-scale", "200");
  await expect(app).toHaveAttribute("data-interface-layout", "single-panel");
  await expect(page.getByRole("navigation", { name: "Studio panels" })).toBeVisible();
  await closeScaleMenuAndSettle(scaleMenu, summary);
  await summary.click();
  await scaleMenu.getByRole("button", { name: "Reset Interface Scale" }).click();
  await expect(app).toHaveAttribute("data-interface-scale", "100");
  await expect(app).toHaveAttribute("data-interface-layout", "single-panel");
  await closeScaleMenuAndSettle(scaleMenu, summary);
  const constrainedTabs = page.getByRole("navigation", { name: "Studio panels" });
  await constrainedTabs.getByRole("button", { name: "media", exact: true }).click();
  await expect(page.getByRole("button", { name: "02 Drift study 02.png" })).toHaveAttribute("aria-pressed", "true");
  await constrainedTabs.getByRole("button", { name: "director", exact: true }).click();
  expect(await page.getByTestId("workspace-scroll").evaluate((element) => element.scrollTop)).toBe(scrollTop);
  await constrainedTabs.getByRole("button", { name: "stage", exact: true }).click();
  const hiddenDirector = page.locator("aside.inspector");
  await expect(hiddenDirector).toHaveCSS("opacity", "0");
  await expect(hiddenDirector).toHaveCSS("visibility", "hidden");
  await expect(hiddenDirector).toHaveAttribute("aria-hidden", "true");
  await expect(hiddenDirector).toHaveAttribute("inert", "");
  await expect(page.getByRole("region", { name: "Cinematic preview" })).toBeVisible();
  await expect(playhead).toHaveAttribute("aria-valuenow", authoredTime!);

  const projectAfter = await portableProjectPayloadSha256(page);
  const preflightAfter = await page.getByRole("status", { name: "Master preflight" }).textContent();
  const pixelsAfter = await stillSha256(page);
  expect(projectAfter).toBe(projectBefore);
  expect(preflightAfter).toBe(preflightBefore);
  expect(pixelsAfter).toBe(pixelsBefore);
});

for (const evidence of [
  { scale: 100, width: 1440, height: 900, panel: "stage", file: "interface-scale-100-1440x900.png" },
  { scale: 150, width: 1440, height: 900, panel: "media", file: "interface-scale-150-media-1440x900.png" },
  { scale: 150, width: 1440, height: 900, panel: "director", file: "interface-scale-150-director-1440x900.png" },
  { scale: 200, width: 960, height: 640, panel: "stage", file: "interface-scale-200-960x640.png" },
] as const) {
  test(`captures clean ${evidence.scale}% ${evidence.panel} layout evidence`, async ({ page }) => {
    test.setTimeout(300_000);
    await loadEvidenceLayout(
      page,
      evidence.scale,
      { width: evidence.width, height: evidence.height },
      evidence.panel,
    );
    const candidateSha = process.env.GITHUB_SHA
      ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const evidenceDirectory = resolve(
      "artifacts",
      "runtime-evidence",
      candidateSha,
      "browser",
      "interface-scale",
    );
    await mkdir(evidenceDirectory, { recursive: true });
    await captureLayout(page, resolve(evidenceDirectory, evidence.file));
  });
}
