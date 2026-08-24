import { expect, test, type Locator, type Page } from "@playwright/test";
import { switchWorkspace, waitForStudio } from "./studio.helpers";

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

async function afterPaint(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function stageBox(page: Page): Promise<Box> {
  const box = await page.locator(".stage-frame").boundingBox();
  if (!box) throw new Error("Stage frame has no layout box.");
  return box;
}

async function layoutBox(locator: Locator, label: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} has no layout box.`);
  return box;
}

function expectInvariant(actual: Box, expected: Box): void {
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(actual[key] - expected[key]), `${key} changed across workspaces`).toBeLessThanOrEqual(1);
  }
}

async function setWorkspaceScroll(page: Page, requested: number): Promise<number> {
  return page.getByTestId("workspace-scroll").evaluate((element, top) => {
    const maximum = element.scrollHeight - element.clientHeight;
    element.scrollTop = Math.min(top, maximum);
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
    return element.scrollTop;
  }, requested);
}

async function readWorkspaceScroll(page: Page): Promise<number> {
  return page.getByTestId("workspace-scroll").evaluate((element) => element.scrollTop);
}

test("workspace switches mount one explicit inspector and keep stage geometry within one pixel", async ({ page }) => {
  await waitForStudio(page);
  const baseline = await stageBox(page);
  const inspectorBaseline = await layoutBox(page.locator(".inspector"), "Inspector");
  const expectations = [
    ["SLIDES", "slides", "Slide frame"],
    ["LOOK", "look", "Background"],
    ["MOTION", "motion", "Travel"],
    ["EXPORT", "export", "Master frame"],
  ] as const;

  for (const [label, id, primaryGroup] of expectations) {
    await switchWorkspace(page, label);
    await afterPaint(page);
    await expect(page.locator("[data-workspace-content]")).toHaveCount(1);
    await expect(page.locator(`[data-workspace-content="${id}"]`)).toBeVisible();
    await expect(page.locator("details.inspector-group").filter({ hasText: primaryGroup }).first()).toBeVisible();
    if (id === "look") {
      await expect(page.getByRole("button", { name: /Browse all backgrounds/i })).toBeVisible();
      await expect(page.getByRole("searchbox", { name: "Find a look" })).toHaveCount(0);
    }
    if (id === "motion") {
      await expect(page.getByRole("heading", { name: "How should the deck move?" })).toBeVisible();
      await expect(page.locator('.outcome-card[data-outcome="smooth-carousel"]')).toBeVisible();
    }
    expectInvariant(await stageBox(page), baseline);
    expectInvariant(await layoutBox(page.locator(".inspector"), "Inspector"), inspectorBaseline);
  }

  await expect(page.getByRole("combobox", { name: "Background", exact: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Flow axis" })).toHaveCount(0);
  await expect(page.getByLabel("Slide ratio", { exact: true })).toHaveCount(0);
});

test("each workspace restores its own scroll position after its content paints", async ({ page }) => {
  await waitForStudio(page);

  await switchWorkspace(page, "LOOK");
  await page.locator("details.workspace-advanced > summary").click();
  const headingBefore = await layoutBox(page.locator(".inspector > .panel-heading"), "Inspector heading");
  const tabsBefore = await layoutBox(page.locator(".workspace-switcher"), "Workspace tabs");
  const lookScroll = await setWorkspaceScroll(page, 640);
  expect(lookScroll).toBeGreaterThan(100);
  expectInvariant(await layoutBox(page.locator(".inspector > .panel-heading"), "Inspector heading"), headingBefore);
  expectInvariant(await layoutBox(page.locator(".workspace-switcher"), "Workspace tabs"), tabsBefore);

  await switchWorkspace(page, "MOTION");
  await afterPaint(page);
  expect(await readWorkspaceScroll(page)).toBeLessThanOrEqual(1);
  const motionScrollBox = await layoutBox(page.getByTestId("workspace-scroll"), "Motion scroll owner");
  const motionFirstContentBox = await layoutBox(
    page.locator(".outcome-picker"),
    "Motion outcome picker",
  );
  expect(Math.abs(motionFirstContentBox.y - motionScrollBox.y)).toBeLessThanOrEqual(1);
  await expect(page.locator('.outcome-card[data-outcome="smooth-carousel"]')).toBeVisible();
  await page.locator("details.workspace-advanced > summary").click();
  const motionScroll = await setWorkspaceScroll(page, 360);
  expect(motionScroll).toBeGreaterThan(100);

  await switchWorkspace(page, "LOOK");
  await afterPaint(page);
  expect(Math.abs(await readWorkspaceScroll(page) - lookScroll)).toBeLessThanOrEqual(1);

  await switchWorkspace(page, "MOTION");
  await afterPaint(page);
  expect(Math.abs(await readWorkspaceScroll(page) - motionScroll)).toBeLessThanOrEqual(1);
});

test("selection, reorder, and pinning preserve workspace, stage, disclosure, focus, and scroll", async ({ page }) => {
  await waitForStudio(page);
  await switchWorkspace(page, "LOOK");
  await page.locator("details.workspace-advanced > summary").click();
  const scrollBefore = await setWorkspaceScroll(page, 520);
  expect(scrollBefore).toBeGreaterThan(100);
  const stageBefore = await stageBox(page);
  const openBefore = await page.locator(".workspace-scroll details[open] > summary").allTextContents();

  const selected = page.getByRole("button", { name: "02 Drift study 02.png" });
  await selected.click();
  await expect(selected).toBeFocused();
  await expect(page.getByRole("button", { name: "LOOK", exact: true })).toHaveAttribute("aria-current", "page");
  expect(Math.abs(await readWorkspaceScroll(page) - scrollBefore)).toBeLessThanOrEqual(1);
  expectInvariant(await stageBox(page), stageBefore);

  const moveDown = page.getByRole("button", { name: "Move Drift study 02.png down" });
  await moveDown.click();
  await expect(moveDown).toBeFocused();
  await expect(page.getByRole("button", { name: "LOOK", exact: true })).toHaveAttribute("aria-current", "page");
  expect(Math.abs(await readWorkspaceScroll(page) - scrollBefore)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Keep Drift study 02.png still" }).click();
  const returnPinned = page.getByRole("button", { name: "Return Drift study 02.png to the carousel" });
  await expect(returnPinned).toBeFocused();
  await expect(page.getByRole("button", { name: "LOOK", exact: true })).toHaveAttribute("aria-current", "page");
  expect(Math.abs(await readWorkspaceScroll(page) - scrollBefore)).toBeLessThanOrEqual(1);
  expectInvariant(await stageBox(page), stageBefore);
  expect(await page.locator(".workspace-scroll details[open] > summary").allTextContents()).toEqual(openBefore);
});

test("keyboard reaches every workspace's first primary action in four tabs or fewer", async ({ page }) => {
  await waitForStudio(page);
  const cases = [
    ["SLIDES", "Slide frame"],
    ["LOOK", "Background"],
    ["MOTION", "Travel"],
    ["EXPORT", "Master frame"],
  ] as const;

  for (const [workspace, group] of cases) {
    await switchWorkspace(page, workspace);
    const tab = page.getByRole("button", { name: workspace, exact: true });
    const summary = workspace === "MOTION"
      ? page.locator(".outcome-card:not(:disabled)").first()
      : page.locator("details.inspector-group > summary").filter({ hasText: group }).first();
    await tab.focus();
    let steps = 0;
    while (steps <= 4 && !(await summary.evaluate((element) => document.activeElement === element))) {
      await page.keyboard.press("Tab");
      steps += 1;
    }
    expect(steps, `${workspace} primary action took too many tabs`).toBeLessThanOrEqual(4);
    await expect(summary).toBeFocused();
  }
});

test("outcome cards apply and undo complete motion recipes without changing Look or stage geometry", async ({ page }) => {
  await waitForStudio(page);
  await switchWorkspace(page, "LOOK");
  const backgroundBefore = await page.getByRole("combobox", { name: "Background", exact: true }).inputValue();
  const stageBefore = await stageBox(page);

  await switchWorkspace(page, "MOTION");
  const smooth = page.locator('.outcome-card[data-outcome="smooth-carousel"]');
  const casino = page.locator('.outcome-card[data-outcome="casino-reveal"]');
  await expect(smooth).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".outcome-current strong")).toHaveText("Smooth Carousel");
  await smooth.click();
  await expect(smooth).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".outcome-current strong")).toHaveText("Smooth Carousel");

  await casino.click();
  await expect(casino).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".outcome-current strong")).toHaveText("Casino Reveal");
  await expect(casino).toContainText("FAST ×2 → READ ×1 → FAST ×1");
  expectInvariant(await stageBox(page), stageBefore);

  await page.keyboard.press("Meta+z");
  await expect(page.locator(".outcome-current strong")).toHaveText("Smooth Carousel");
  await expect(smooth).toHaveAttribute("aria-pressed", "true");

  await switchWorkspace(page, "LOOK");
  await expect(page.getByRole("combobox", { name: "Background", exact: true })).toHaveValue(backgroundBefore);
  expectInvariant(await stageBox(page), stageBefore);
});

test("content-paced Smooth reflows after pin changes while fixed-master Casino stays exact", async ({ page }) => {
  await waitForStudio(page);
  await switchWorkspace(page, "MOTION");
  const smooth = page.locator('.outcome-card[data-outcome="smooth-carousel"]');
  const casino = page.locator('.outcome-card[data-outcome="casino-reveal"]');
  const timing = page.locator(".timing-summary");

  await expect(smooth).toHaveAttribute("aria-pressed", "true");
  await expect(timing).toContainText("8 MOVING");
  await expect(timing.locator("strong")).toHaveText("7.20 s master");

  await page.getByRole("button", { name: "Keep Drift study 01.png still" }).click();
  await expect(timing).toContainText("7 MOVING");
  await expect(timing.locator("strong")).toHaveText("6.30 s master");
  await expect(smooth).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Return Drift study 01.png to the carousel" }).click();
  await expect(timing).toContainText("8 MOVING");
  await expect(timing.locator("strong")).toHaveText("7.20 s master");

  await casino.click();
  const fixedDuration = await timing.locator("strong").textContent();
  expect(fixedDuration).not.toBeNull();
  await page.getByRole("button", { name: "Keep Drift study 01.png still" }).click();
  await expect(timing).toContainText("7 MOVING");
  await expect(timing.locator("strong")).toHaveText(fixedDuration!);
  await expect(casino).toHaveAttribute("aria-pressed", "true");
});

test("supplementary workspace help opens for keyboard, escapes cleanly, and stays inside the viewport", async ({ page }) => {
  await waitForStudio(page);
  const exportTab = page.getByRole("button", { name: "EXPORT", exact: true });
  await exportTab.focus();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible({ timeout: 250 });
  await expect(tooltip).toHaveText("Choose the frame and duration, read preflight, then export.");
  const describedBy = await exportTab.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(tooltip).toHaveAttribute("id", describedBy!);
  const tooltipBox = await layoutBox(tooltip, "Export workspace tooltip");
  const viewport = page.viewportSize()!;
  expect(tooltipBox.x).toBeGreaterThanOrEqual(12);
  expect(tooltipBox.y).toBeGreaterThanOrEqual(12);
  expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(viewport.width - 12);
  expect(tooltipBox.y + tooltipBox.height).toBeLessThanOrEqual(viewport.height - 12);

  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await expect(exportTab).toBeFocused();
  await expect(exportTab).not.toHaveAttribute("aria-describedby", /drift-tooltip/u);

  await page.locator(".stage-well").click({ position: { x: 20, y: 20 } });
  await page.waitForTimeout(850);
  const lookTab = page.getByRole("button", { name: "LOOK", exact: true });
  await lookTab.hover();
  await page.waitForTimeout(250);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.getByRole("tooltip")).toBeVisible({ timeout: 500 });
  await expect(page.getByRole("tooltip")).toHaveText("Choose a background first. Scene-wide starters and fine treatment stay in Advanced.");

  await page.getByRole("button", { name: "MOTION", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Choose a direction, axis, path, pace, and complete-deck timing.",
    { timeout: 250 },
  );
});
