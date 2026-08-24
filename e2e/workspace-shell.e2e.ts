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
    ["MOTION", "motion", "Motion direction"],
    ["EXPORT", "export", "Master frame"],
  ] as const;

  for (const [label, id, primaryGroup] of expectations) {
    await switchWorkspace(page, label);
    await afterPaint(page);
    await expect(page.locator("[data-workspace-content]")).toHaveCount(1);
    await expect(page.locator(`[data-workspace-content="${id}"]`)).toBeVisible();
    await expect(page.locator("details.inspector-group").filter({ hasText: primaryGroup }).first()).toBeVisible();
    if (id === "look") await expect(page.getByRole("searchbox", { name: "Find a look" })).toBeVisible();
    if (id === "motion") await expect(page.getByRole("combobox", { name: "Direction recipe" })).toBeVisible();
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
  const motionSummaryBox = await layoutBox(
    page.locator("details.inspector-group > summary").filter({ hasText: "Motion direction" }).first(),
    "Motion direction summary",
  );
  expect(Math.abs(motionSummaryBox.y - motionScrollBox.y)).toBeLessThanOrEqual(1);
  await expect(page.getByRole("combobox", { name: "Direction recipe" })).toBeVisible();
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
    ["MOTION", "Motion direction"],
    ["EXPORT", "Master frame"],
  ] as const;

  for (const [workspace, group] of cases) {
    await switchWorkspace(page, workspace);
    const tab = page.getByRole("button", { name: workspace, exact: true });
    const summary = page.locator("details.inspector-group > summary").filter({ hasText: group }).first();
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
