import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

function pngDimensions(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function digest(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function captureCurrentFrame(page: import("@playwright/test").Page): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save this frame" }).click(),
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!);
}

test.describe("director journey visual contract", () => {
  test("scrubs distinct deterministic frames and exports the requested master dimensions", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    const timeline = page.getByRole("slider", { name: "Master timeline" });
    const canvas = page.locator("canvas");

    await timeline.fill("0");
    const frameZero = await canvas.screenshot();
    await timeline.fill("1");
    const frameOne = await canvas.screenshot();
    expect(digest(frameOne)).not.toBe(digest(frameZero));

    const png = await captureCurrentFrame(page);
    expect(pngDimensions(png)).toEqual({ width: 1080, height: 1920 });
    await expect(page.locator(".director-status")).toContainText("Saved the exact frame");
  });

  test("editing guides never contaminate the exported pixels", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    const timeline = page.getByRole("slider", { name: "Master timeline" });
    await timeline.fill("0.75");

    await page.getByLabel("Platform guide").selectOption("none");
    const clean = await captureCurrentFrame(page);
    await page.getByLabel("Platform guide").selectOption("social");
    await expect(page.locator("[data-drift-guide='social']")).toHaveCount(1);
    const guided = await captureCurrentFrame(page);
    expect(digest(guided)).toBe(digest(clean));
  });

  test("fits a phone viewport without horizontal escape and remains collapsible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const dock = page.locator(".director-dock");
    await expect(dock).toBeVisible();
    const openBox = await dock.boundingBox();
    expect(openBox).not.toBeNull();
    expect(openBox!.x).toBeGreaterThanOrEqual(0);
    expect(openBox!.x + openBox!.width).toBeLessThanOrEqual(391);
    expect(openBox!.height).toBeLessThanOrEqual(844 * 0.8);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(390);

    await dock.locator(":scope > summary").click();
    const closedBox = await dock.boundingBox();
    expect(closedBox).not.toBeNull();
    expect(closedBox!.height).toBeLessThanOrEqual(72);
  });
});
