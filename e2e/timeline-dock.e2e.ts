import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { switchWorkspace, waitForStudio } from "./studio.helpers";

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

async function box(locator: Locator, name: string): Promise<Box> {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error(`${name} has no layout box.`);
  return bounds;
}

function expectInvariant(actual: Box, expected: Box, label: string): void {
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(actual[key] - expected[key]), `${label} ${key} moved`).toBeLessThanOrEqual(1);
  }
}

async function scrubOutside(page: Page, track: Locator, target: "start" | "end"): Promise<void> {
  const bounds = await box(track, "Timeline track");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    target === "start" ? bounds.x - 40 : bounds.x + bounds.width + 40,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.up();
}

async function exportStillSha256(page: Page): Promise<string> {
  await switchWorkspace(page, "EXPORT");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save transparent-safe PNG" }).click();
  const path = await (await download).path();
  if (!path) throw new Error("Still export did not produce a readable download path.");
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

test("canonical timeline stays legible and causal across Casino, Smooth, scrubbing, and keyboard", async ({ page }) => {
  await waitForStudio(page);
  const stage = page.locator(".stage-frame");
  const shell = page.locator(".studio-shell");
  const inspector = page.locator(".inspector");
  const dock = page.locator(".timeline-dock");
  const track = page.getByRole("slider", { name: "Master timeline playhead" });
  const stageBefore = await box(stage, "Stage");
  const shellBefore = await box(shell, "Studio shell");
  const inspectorBefore = await box(inspector, "Inspector");
  const dockBefore = await box(dock, "Timeline dock");
  expect(Math.abs(dockBefore.height - 132)).toBeLessThanOrEqual(1);
  await expect(dock).toHaveAttribute("data-authority", "legacy-tempo");
  await expect(dock.locator('.timeline-segment[data-kind="legacy-body"]')).toHaveCount(1);

  for (const button of [
    page.getByRole("button", { name: "Previous output frame" }),
    page.getByRole("button", { name: "Pause preview" }),
    page.getByRole("button", { name: "Next output frame" }),
  ]) {
    const target = await box(button, "Timeline target");
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }

  await switchWorkspace(page, "MOTION");
  await page.locator('.outcome-card[data-outcome="casino-reveal"]').click();
  const groups = dock.locator('.timeline-segment[data-kind="sequence-group"]');
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(0)).toContainText("FAST ×2");
  await expect(groups.nth(1)).toContainText("READ ×1");
  await expect(groups.nth(2)).toContainText("FAST ×1");
  await expect(groups.nth(0)).toContainText("Fast");
  await expect(groups.nth(1)).toContainText("Readable");
  await expect(dock.locator(".timeline-playhead")).toHaveCount(1);
  await expect(dock.locator(".timeline-pass-tick")).toHaveCount(4);

  const widths = await groups.evaluateAll((elements) => elements.map((element) => (
    element.getBoundingClientRect().width
  )));
  const totalWidth = widths.reduce((total, width) => total + width, 0);
  const expectedRatios = [0.44 / 1.66, 1 / 1.66, 0.22 / 1.66];
  widths.forEach((width, index) => {
    expect(Math.abs(width / totalWidth - expectedRatios[index]!)).toBeLessThan(0.003);
  });
  const tickTimes = await dock.locator(".timeline-pass-tick").evaluateAll((ticks) => (
    ticks.map((tick) => Number((tick as HTMLElement).dataset.time))
  ));
  const exactCasinoTicks = [
    8 * 0.22 / 1.66,
    8 * 0.44 / 1.66,
    8 * 1.44 / 1.66,
    8,
  ];
  expect(tickTimes).toHaveLength(exactCasinoTicks.length);
  tickTimes.forEach((time, index) => {
    expect(Math.abs(time - exactCasinoTicks[index]!)).toBeLessThanOrEqual(1e-9);
  });

  await page.getByRole("button", { name: "Pause preview" }).click();
  await track.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  expect(Number(await track.getAttribute("aria-valuenow"))).toBeCloseTo(exactCasinoTicks[0]!, 3);
  await page.keyboard.press("Shift+ArrowRight");
  expect(Number(await track.getAttribute("aria-valuenow"))).toBeCloseTo(exactCasinoTicks[1]!, 3);
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause preview" })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();

  const axis = page.getByRole("group", { name: "Flow axis" });
  await axis.getByText("Horizontal", { exact: true }).click();
  await expect(axis.getByRole("radio", { name: "Horizontal" })).toBeChecked();
  await expect(groups).toHaveCount(3);
  expect(await groups.evaluateAll((elements) => elements.map((element) => element.textContent)))
    .toEqual(expect.arrayContaining([expect.stringContaining("FAST ×2"), expect.stringContaining("READ ×1")]));

  expectInvariant(await box(stage, "Stage"), stageBefore, "Stage");
  expectInvariant(await box(shell, "Studio shell"), shellBefore, "Studio shell");
  expectInvariant(await box(inspector, "Inspector"), inspectorBefore, "Inspector");
  expectInvariant(await box(dock, "Timeline dock"), dockBefore, "Timeline dock");

  await page.locator('.outcome-card[data-outcome="smooth-carousel"]').click();
  await expect(groups).toHaveCount(1);
  await expect(groups.first()).toContainText("READ ×1");
  await expect(groups.first()).toContainText("Readable");
  expectInvariant(await box(stage, "Stage"), stageBefore, "Stage");

  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();
  await scrubOutside(page, track, "start");
  await expect(track).toHaveAttribute("aria-valuenow", "0");
  expectInvariant(await box(stage, "Stage"), stageBefore, "Stage");

  const trackBounds = await box(track, "Timeline track");
  await page.mouse.click(trackBounds.x + trackBounds.width / 2, trackBounds.y + trackBounds.height / 2);
  const midpoint = Number(await track.getAttribute("aria-valuenow"));
  expect(midpoint).toBeCloseTo(3.6, 3);
  await scrubOutside(page, track, "end");
  await expect(track).toHaveAttribute("aria-valuenow", "7.2");
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();

  await page.getByRole("button", { name: "Play preview" }).click();
  await expect(page.getByRole("button", { name: "Pause preview" })).toBeVisible();
  await page.mouse.move(trackBounds.x + trackBounds.width * 0.35, trackBounds.y + trackBounds.height / 2);
  await page.mouse.down();
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Pause preview" })).toBeVisible();

  await page.getByRole("button", { name: "Pause preview" }).click();
  await track.focus();
  await page.keyboard.press("Home");
  await expect(track).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("ArrowRight");
  expect(Number(await track.getAttribute("aria-valuenow"))).toBeCloseTo(1 / 30, 3);
  await page.keyboard.press("Shift+ArrowRight");
  await expect(track).toHaveAttribute("aria-valuenow", "7.2");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(track).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("End");
  await expect(track).toHaveAttribute("aria-valuenow", "7.2");
  await page.keyboard.press("ArrowLeft");
  expect(Number(await track.getAttribute("aria-valuenow"))).toBeCloseTo(7.2 - 1 / 30, 3);
  expectInvariant(await box(stage, "Stage"), stageBefore, "Stage");
  expectInvariant(await box(shell, "Studio shell"), shellBefore, "Studio shell");
  expectInvariant(await box(inspector, "Inspector"), inspectorBefore, "Inspector");
});

test("fixed-time PNG pixels stay byte-identical before and after timeline scrubbing", async ({ page }) => {
  await waitForStudio(page);
  const before = await exportStillSha256(page);
  const track = page.getByRole("slider", { name: "Master timeline playhead" });
  const bounds = await box(track, "Timeline track");
  await page.mouse.click(bounds.x + bounds.width * 0.72, bounds.y + bounds.height / 2);
  const after = await exportStillSha256(page);
  expect(after).toBe(before);
});
