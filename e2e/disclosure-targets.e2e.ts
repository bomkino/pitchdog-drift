import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import { switchWorkspace, waitForStudio } from "./studio.helpers";

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

function inspectorGroup(page: Page, title: string): Locator {
  return page.locator(".inspector-group").filter({
    has: page.locator(":scope > .inspector-group-trigger > span", {
      hasText: new RegExp(`^${title}$`, "u"),
    }),
  });
}

function expectInvariant(actual: Box, expected: Box): void {
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(actual[key] - expected[key]), `${key} moved`).toBeLessThanOrEqual(1);
  }
}

function expectMonotone(
  values: number[],
  direction: "up" | "down",
  tolerance = 1.25,
): void {
  expect(values.length).toBeGreaterThan(1);
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index]! - values[index - 1]!;
    if (direction === "up") expect(delta).toBeGreaterThanOrEqual(-tolerance);
    else expect(delta).toBeLessThanOrEqual(tolerance);
  }
}

test("measured disclosure reverses in place and removes closed content from focus", async ({ page, request }) => {
  const sourceResponse = await request.get("/src/components/MeasuredDisclosure.tsx");
  expect(sourceResponse.ok()).toBe(true);
  expect(await sourceResponse.text()).toContain("DISCLOSURE_DURATION_MS = 200");

  await waitForStudio(page);
  await page.getByRole("button", { name: "Pause preview" }).click();
  await page.waitForTimeout(250);
  await switchWorkspace(page, "SLIDES");
  const group = inspectorGroup(page, "Pinned frame");
  const trigger = group.locator(":scope > .inspector-group-trigger");
  const viewport = group.locator(":scope > .inspector-group-viewport");
  const content = group.locator(":scope > .inspector-group-viewport > .inspector-group-body");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(content).toHaveAttribute("aria-hidden", "true");
  await expect(viewport).toHaveCSS("height", "0px");
  expect(await viewport.evaluate((element) => element.getAnimations().length)).toBe(0);

  const result = await viewport.evaluate(async (element) => {
    const root = element.parentElement!;
    const disclosureTrigger = root.querySelector<HTMLButtonElement>(":scope > button")!;
    const height = () => element.getBoundingClientRect().height;
    const nextAnimation = async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const animation = element.getAnimations()[0];
      if (!animation) throw new Error("Disclosure height animation did not start.");
      animation.pause();
      return animation;
    };
    const sample = (animation: Animation, times: number[]) => times.map((time) => {
      animation.currentTime = time;
      return height();
    });

    disclosureTrigger.click();
    const openingAnimation = await nextAnimation();
    const opening = sample(openingAnimation, [0, 20, 40, 60, 80]);
    const beforeClose = height();

    disclosureTrigger.click();
    const closingAnimation = await nextAnimation();
    const closeContinuity = Math.abs(height() - beforeClose);
    const closing = sample(closingAnimation, [0, 15, 30, 45, 60]);
    const beforeReopen = height();

    disclosureTrigger.click();
    const reopeningAnimation = await nextAnimation();
    const reopenContinuity = Math.abs(height() - beforeReopen);
    const reopening = sample(reopeningAnimation, [0, 40, 80, 120, 160, 200]);
    reopeningAnimation.finish();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return {
      opening,
      closing,
      reopening,
      closeContinuity,
      reopenContinuity,
      finalHeight: height(),
    };
  });

  expectMonotone(result.opening, "up");
  expectMonotone(result.closing, "down");
  expectMonotone(result.reopening, "up");
  expect(result.opening.at(-1)! - result.opening[0]!).toBeGreaterThan(4);
  expect(result.closing[0]! - result.closing.at(-1)!).toBeGreaterThan(2);
  expect(result.reopening.at(-1)! - result.reopening[0]!).toBeGreaterThan(4);
  expect(result.closeContinuity).toBeLessThanOrEqual(1);
  expect(result.reopenContinuity).toBeLessThanOrEqual(1);
  expect(Math.abs(result.finalHeight - result.reopening.at(-1)!)).toBeLessThanOrEqual(1);
  await expect(group).toHaveAttribute("data-disclosure-state", "open");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(content).toHaveAttribute("aria-hidden", "false");

  const focusable = content.locator("input:not(:disabled)").first();
  await focusable.focus();
  await expect(focusable).toBeFocused();
  await trigger.evaluate((button) => button.click());
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(content).toHaveAttribute("aria-hidden", "true");
  await expect(content).toHaveAttribute("inert", "");
  await page.keyboard.press("Tab");
  expect(await content.evaluate((element) => element.contains(document.activeElement))).toBe(false);
  await expect(group).toHaveAttribute("data-disclosure-state", "closed");
});

test("open disclosure retargets measured height when conditional content changes", async ({ page }) => {
  await waitForStudio(page);
  await page.getByRole("button", { name: "Pause preview" }).click();
  await page.waitForTimeout(250);
  await switchWorkspace(page, "SLIDES");
  const group = inspectorGroup(page, "Selected slide");
  const viewport = group.locator(":scope > .inspector-group-viewport");
  await expect(group).toHaveAttribute("data-disclosure-state", "open");
  expect(await viewport.evaluate((element) => element.getAnimations().length)).toBe(0);
  await expect(group.getByRole("radio", { name: "Cover" })).toBeChecked();

  const before = await viewport.evaluate((element) => element.getBoundingClientRect().height);
  const result = await viewport.evaluate(async (element) => {
    const root = element.parentElement!;
    root.querySelector<HTMLInputElement>('input[type="radio"][value="contain"]')!.click();
    const deadline = performance.now() + 1_000;
    let animation = element.getAnimations()[0];
    while (!animation && performance.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      animation = element.getAnimations()[0];
    }
    if (!animation) throw new Error("ResizeObserver did not retarget the open disclosure.");
    animation.pause();
    const samples = [0, 40, 80, 120, 160, 200].map((time) => {
      animation.currentTime = time;
      return element.getBoundingClientRect().height;
    });
    animation.finish();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const content = element.firstElementChild as HTMLElement;
    return {
      samples,
      final: element.getBoundingClientRect().height,
      measured: content.scrollHeight,
    };
  });

  expect(before - result.final, JSON.stringify({ before, ...result })).toBeGreaterThan(40);
  expectMonotone(result.samples, "down", 1.5);
  expect(Math.abs(result.final - result.measured)).toBeLessThanOrEqual(1);
  await expect(group).toHaveAttribute("data-disclosure-state", "open");
  await expect(group.getByRole("radio", { name: "Contain" })).toBeChecked();
});

test("desktop action targets stay at least 44px and disclosures cannot move the stage", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await waitForStudio(page);
  const baseline = await page.locator(".stage-frame").boundingBox();
  if (!baseline) throw new Error("Stage has no layout box.");

  for (const workspace of ["SLIDES", "LOOK", "MOTION", "EXPORT"] as const) {
    await switchWorkspace(page, workspace);
    const advanced = page.locator(".workspace-advanced-trigger");
    if (await advanced.getAttribute("aria-expanded") === "false") await advanced.click();
    await page.locator(".inspector-group-trigger[aria-expanded='false']").evaluateAll((buttons) => {
      for (const button of buttons) (button as HTMLButtonElement).click();
    });
    if (workspace === "LOOK") {
      const worldBrowser = page.locator("details.world-browser");
      if (await worldBrowser.getAttribute("open") === null) await worldBrowser.locator(":scope > summary").click();
    }
    await page.waitForTimeout(240);

    const failures = await page.locator([
      ".workspace-switcher button",
      ".inspector button",
      ".inspector summary",
      ".inspector input:not([type='file'])",
      ".inspector select",
      ".transport button",
      ".media-library button",
    ].join(", ")).evaluateAll((elements) => elements.flatMap((element) => {
      if (!(element instanceof HTMLElement)) return [];
      if (element.closest("[inert], [aria-hidden='true']")) return [];
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return [];
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return [];
      if (rect.width >= 43.5 && rect.height >= 43.5) return [];
      return [{
        element: element.tagName.toLowerCase(),
        label: element.getAttribute("aria-label") ?? element.textContent?.trim().replace(/\s+/gu, " ").slice(0, 80),
        width: rect.width,
        height: rect.height,
      }];
    }));
    expect(failures, `${workspace} has undersized action targets`).toEqual([]);

    const current = await page.locator(".stage-frame").boundingBox();
    if (!current) throw new Error("Stage lost its layout box.");
    expectInvariant(current, baseline);
  }
});

test("captures the Advanced disclosure closed and open at 1920x1080", async ({ page }) => {
  test.skip(!process.env.DRIFT_PACKAGE_04B2_SCREENSHOTS, "Screenshot evidence path not requested.");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await waitForStudio(page);
  await page.getByRole("button", { name: "Pause preview" }).click();
  await switchWorkspace(page, "LOOK");
  const scrollOwner = page.getByTestId("workspace-scroll");
  const advanced = page.locator(".workspace-advanced-trigger");
  await advanced.scrollIntoViewIfNeeded();
  await scrollOwner.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(advanced).toHaveAttribute("aria-expanded", "false");
  const screenshotDirectory = process.env.DRIFT_PACKAGE_04B2_SCREENSHOTS!;
  await page.screenshot({
    path: path.join(screenshotDirectory, "package-04b2-advanced-closed-1920x1080.png"),
  });

  await advanced.click();
  await expect(page.locator(".workspace-advanced")).toHaveAttribute("data-disclosure-state", "open");
  await advanced.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await page.screenshot({
    path: path.join(screenshotDirectory, "package-04b2-advanced-open-1920x1080.png"),
  });
});
