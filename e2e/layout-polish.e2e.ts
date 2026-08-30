import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { INTERFACE_SCALE_STORAGE_KEY } from "../src/lib/interfaceScale";
import { fixturePath, switchWorkspace, waitForStudio } from "./studio.helpers";

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

async function afterPaint(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function seedInterfaceScale(page: Page, value: number, recordLayouts = false): Promise<void> {
  await page.addInitScript(({ key, scale, record }) => {
    localStorage.setItem(key, String(scale));
    if (!record) return;
    const state = window as Window & { __driftLayoutHistory?: string[] };
    state.__driftLayoutHistory = [];
    const capture = () => {
      const layout = document.querySelector(".app")?.getAttribute("data-interface-layout");
      if (layout && state.__driftLayoutHistory!.at(-1) !== layout) {
        state.__driftLayoutHistory!.push(layout);
      }
    };
    new MutationObserver(capture).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-interface-layout"],
      childList: true,
      subtree: true,
    });
    capture();
  }, {
    key: INTERFACE_SCALE_STORAGE_KEY,
    scale: value,
    record: recordLayouts,
  });
}

async function layoutBox(locator: Locator, label: string): Promise<Box> {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error(`${label} has no layout box.`);
  return bounds;
}

function expectContained(inner: Box, outer: Box, label: string, tolerance = 1): void {
  expect(inner.x, `${label} left`).toBeGreaterThanOrEqual(outer.x - tolerance);
  expect(inner.y, `${label} top`).toBeGreaterThanOrEqual(outer.y - tolerance);
  expect(inner.x + inner.width, `${label} right`).toBeLessThanOrEqual(outer.x + outer.width + tolerance);
  expect(inner.y + inner.height, `${label} bottom`).toBeLessThanOrEqual(outer.y + outer.height + tolerance);
}

async function expectNoDocumentOrHorizontalControlOverflow(page: Page, label: string): Promise<void> {
  const documentMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(documentMetrics.scrollWidth, `${label} document width`).toBe(documentMetrics.clientWidth);
  expect(documentMetrics.scrollHeight, `${label} document height`).toBe(documentMetrics.clientHeight);

  const failures = await page.locator([
    "button",
    "summary",
    "input",
    "select",
    "[role='button']",
    "[role='slider']",
    "[tabindex]:not([tabindex='-1'])",
  ].join(", ")).evaluateAll((elements) => elements.flatMap((element) => {
    if (!(element instanceof HTMLElement)) return [];
    if (element.closest("[inert], [aria-hidden='true']")) return [];
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return [];
    const rect = element.getBoundingClientRect();
    if (rect.width < 0.5 || rect.height < 0.5) return [];
    if (rect.bottom <= 0 || rect.top >= innerHeight) return [];

    let clipLeft = 0;
    let clipRight = innerWidth;
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== document.documentElement) {
      const ancestorStyle = getComputedStyle(ancestor);
      if (["auto", "clip", "hidden", "scroll"].includes(ancestorStyle.overflowX)) {
        const ancestorRect = ancestor.getBoundingClientRect();
        clipLeft = Math.max(clipLeft, ancestorRect.left);
        clipRight = Math.min(clipRight, ancestorRect.right);
      }
      ancestor = ancestor.parentElement;
    }

    if (rect.left >= clipLeft - 1 && rect.right <= clipRight + 1) return [];
    return [{
      element: element.tagName.toLowerCase(),
      label: element.getAttribute("aria-label")
        ?? element.textContent?.trim().replace(/\s+/gu, " ").slice(0, 90)
        ?? "unlabelled",
      left: rect.left,
      right: rect.right,
      clipLeft,
      clipRight,
    }];
  }));
  expect(failures, `${label} horizontally clipped controls`).toEqual([]);
}

async function exerciseVisiblePanels(page: Page, label: string): Promise<void> {
  const navigation = page.getByRole("navigation", { name: "Studio panels" });
  if (!await navigation.isVisible()) {
    await expectNoDocumentOrHorizontalControlOverflow(page, label);
    return;
  }
  for (const panel of ["media", "stage", "director"] as const) {
    await navigation.getByRole("button", { name: panel, exact: true }).click();
    await afterPaint(page);
    await expectNoDocumentOrHorizontalControlOverflow(page, `${label} / ${panel}`);
  }
}

async function expectCompactStageControlsContained(page: Page): Promise<void> {
  const navigation = page.getByRole("navigation", { name: "Studio panels" });
  if (await navigation.isVisible()) {
    await navigation.getByRole("button", { name: "stage", exact: true }).click();
  }
  await afterPaint(page);

  const dock = page.locator(".timeline-dock");
  const dockBox = await layoutBox(dock, "Compact timeline dock");
  const stageColumnBox = await layoutBox(page.locator(".stage-column"), "Compact stage column");
  expectContained(dockBox, stageColumnBox, "Timeline dock");
  for (const control of await dock.locator("button, .timeline-track").all()) {
    if (!await control.isVisible()) continue;
    expectContained(await layoutBox(control, "Compact timeline control"), dockBox, "Timeline control");
  }

  const wellBox = await layoutBox(page.locator(".stage-well"), "Compact stage well");
  const frame = page.locator(".stage-frame");
  const frameBox = await layoutBox(frame, "Compact stage frame");
  expectContained(frameBox, wellBox, "Stage frame");

  const hud = frame.locator(".stage-hud");
  const hudBox = await layoutBox(hud, "Compact stage HUD");
  expectContained(hudBox, frameBox, "Stage HUD");
  const visibleHudItems: Box[] = [];
  for (const item of await hud.locator(":scope > span").all()) {
    if (await item.isVisible()) visibleHudItems.push(await layoutBox(item, "Stage HUD item"));
  }
  for (const item of visibleHudItems) expectContained(item, hudBox, "Stage HUD item");
  for (let index = 1; index < visibleHudItems.length; index += 1) {
    const previous = visibleHudItems[index - 1]!;
    const current = visibleHudItems[index]!;
    expect(previous.x + previous.width, "Stage HUD items overlap").toBeLessThanOrEqual(current.x + 1);
  }
}

test("75% uses the shared 1120px responsive floor without a first-paint layout flip", async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 720 });
  await seedInterfaceScale(page, 75, true);
  await waitForStudio(page);

  const app = page.locator(".app");
  await expect(app).toHaveAttribute("data-interface-scale", "75");
  await expect(app).toHaveAttribute("data-interface-layout", "single-panel");
  await expect(page.getByRole("navigation", { name: "Studio panels" })).toBeVisible();
  expect(await page.evaluate(() => (
    window as Window & { __driftLayoutHistory?: string[] }
  ).__driftLayoutHistory)).toEqual(["single-panel"]);
  await exerciseVisiblePanels(page, "75% at 1120px");

  await page.setViewportSize({ width: 1121, height: 720 });
  await expect(app).toHaveAttribute("data-interface-layout", "three-panel");
  await expect(page.getByRole("navigation", { name: "Studio panels" })).toBeHidden();
  await expectNoDocumentOrHorizontalControlOverflow(page, "75% at 1121px");
});

for (const scenario of [
  { name: "125% wide", scale: 125, width: 1440, height: 900, layout: "three-panel" },
  { name: "200% compact", scale: 200, width: 320, height: 568, layout: "single-panel" },
] as const) {
  test(`${scenario.name} keeps document and visible controls contained`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await seedInterfaceScale(page, scenario.scale);
    await waitForStudio(page);
    await expect(page.locator(".app")).toHaveAttribute("data-interface-layout", scenario.layout);
    await exerciseVisiblePanels(page, scenario.name);
    if (scenario.scale === 200) await expectCompactStageControlsContained(page);
  });
}

test("long selected-slide filenames stay ellipsized before the inspector caret", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await seedInterfaceScale(page, 200);
  await waitForStudio(page);

  const longName = `drift-${"long-editorial-shot-name-".repeat(8)}final.png`;
  const slideInput = page.locator('input[accept^="image/png"]');
  const slideCount = await page.locator(".asset-list li").count();
  await slideInput.setInputFiles({
    name: longName,
    mimeType: "image/png",
    buffer: await readFile(fixturePath),
  });
  await expect(page.locator(".asset-list li")).toHaveCount(slideCount + 1);

  const navigation = page.getByRole("navigation", { name: "Studio panels" });
  await navigation.getByRole("button", { name: "media", exact: true }).click();
  const row = page.locator(".asset-list li").filter({ hasText: longName });
  await row.locator(".asset-select").click();
  await navigation.getByRole("button", { name: "director", exact: true }).click();

  const group = page.locator(".inspector-group").filter({
    has: page.locator(":scope > .inspector-group-trigger > span", { hasText: /^Selected slide$/u }),
  });
  const trigger = group.locator(":scope > .inspector-group-trigger");
  await trigger.scrollIntoViewIfNeeded();
  await afterPaint(page);
  const eyebrow = trigger.locator(":scope > small");
  const caret = trigger.locator(":scope > .disclosure-caret");
  await expect(eyebrow).toHaveText(longName);

  const triggerBox = await layoutBox(trigger, "Selected-slide trigger");
  const eyebrowBox = await layoutBox(eyebrow, "Selected-slide filename");
  const caretBox = await layoutBox(caret, "Selected-slide caret");
  expectContained(caretBox, triggerBox, "Selected-slide caret");
  expectContained(eyebrowBox, triggerBox, "Selected-slide filename");
  expect(caretBox.x - (eyebrowBox.x + eyebrowBox.width), "Filename-to-caret gap").toBeGreaterThanOrEqual(8);

  const filenameMetrics = await eyebrow.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    textOverflow: getComputedStyle(element).textOverflow,
    whiteSpace: getComputedStyle(element).whiteSpace,
  }));
  expect(filenameMetrics.scrollWidth).toBeGreaterThan(filenameMetrics.clientWidth);
  expect(filenameMetrics.textOverflow).toBe("ellipsis");
  expect(filenameMetrics.whiteSpace).toBe("nowrap");
  await expectNoDocumentOrHorizontalControlOverflow(page, "Long selected-slide filename");
});

test("background hover preview keeps the current-background hero height fixed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForStudio(page);
  await switchWorkspace(page, "LOOK");

  const browser = page.locator(".visual-background-browser");
  const hero = browser.locator(".current-background");
  const before = await layoutBox(hero, "Background hero before preview");
  const verdigris = browser.getByRole("button", { name: /^Verdigris Fresco\./u });
  await verdigris.hover();
  await expect(hero).toHaveAttribute("data-previewing", "true");
  const during = await layoutBox(hero, "Background hero during preview");
  expect(Math.abs(during.height - before.height), "Hero height changed on hover").toBeLessThanOrEqual(1);

  await page.locator(".app-header").hover();
  await expect(hero).toHaveAttribute("data-previewing", "false");
  const after = await layoutBox(hero, "Background hero after preview");
  expect(Math.abs(after.height - before.height), "Hero height changed after hover").toBeLessThanOrEqual(1);
});
