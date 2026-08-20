import { expect, test, type Locator } from "@playwright/test";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

interface FrameSample {
  luma: number[];
  energy: number;
  opaquePixels: number;
}

async function frameSample(canvas: Locator): Promise<FrameSample> {
  const screenshot = await canvas.screenshot();
  return canvas.evaluate(async (_node, pngBase64) => {
    const binary = window.atob(pngBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const sample = document.createElement("canvas");
    sample.width = 32;
    sample.height = 32;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not create a 2D frame sampler.");
    context.drawImage(bitmap, 0, 0, sample.width, sample.height);
    bitmap.close();

    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const luma: number[] = [];
    let energy = 0;
    let opaquePixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index]!;
      const green = pixels[index + 1]!;
      const blue = pixels[index + 2]!;
      const alpha = pixels[index + 3]!;
      luma.push(red * 0.2126 + green * 0.7152 + blue * 0.0722);
      energy += red + green + blue;
      if (alpha > 0) opaquePixels += 1;
    }
    return { luma, energy, opaquePixels };
  }, screenshot.toString("base64"));
}

function meanAbsoluteDelta(a: FrameSample, b: FrameSample): number {
  expect(a.luma).toHaveLength(b.luma.length);
  return a.luma.reduce((total, value, index) => total + Math.abs(value - b.luma[index]!), 0) / a.luma.length;
}

test("a director can choose a cut, repair delivery, customize it, and pause on a truly stable frame", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);
  const canvas = page.getByTestId("webgl-stage");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(250);
  const openingFrame = await frameSample(canvas);
  expect(openingFrame.energy).toBeGreaterThan(10_000);
  expect(openingFrame.opaquePixels).toBeGreaterThan(800);

  const explainerCut = page.getByRole("button", { name: /Explainer Cut/ });
  await explainerCut.click();
  await expect(explainerCut).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Path" })).toHaveValue("editorial");
  await expect(page.locator(".editorial-rhythm")).toBeVisible();
  await expect(page.locator(".editorial-rhythm-track")).toHaveAttribute("aria-label", /Each slide lasts 2\.00 seconds/);
  await expect(page.locator(".stage-topline").last()).toContainText("horizontal · editorial");
  await expect(page.locator(".delivery-receipt")).toHaveAttribute("data-status", "partial");
  await expect(page.locator(".delivery-receipt").getByText("Partial deck", { exact: true })).toBeVisible();

  const repair = page.getByRole("button", { name: /Close at cut tempo/ });
  await expect(repair).toContainText("1 loop / 16.0 s");
  await repair.click();
  await expect(page.locator(".delivery-receipt")).toHaveAttribute("data-status", "closed");
  await expect(page.getByText("Closed at cut tempo", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".output-preflight")).toHaveAttribute("data-status", "closed");
  await expect(page.getByRole("switch", { name: "Seamless export lock" })).toBeChecked();
  await expect(page.getByRole("slider", { name: "Duration" })).toHaveValue("16");

  await page.waitForTimeout(250);
  const cutFrame = await frameSample(canvas);
  expect(meanAbsoluteDelta(openingFrame, cutFrame)).toBeGreaterThan(0.25);

  const paperHinge = page.getByRole("slider", { name: "Paper hinge" });
  await paperHinge.focus();
  await page.keyboard.press("ArrowRight");
  await expect(explainerCut).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("CUSTOM CUT", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Pause preview" }).click();
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();
  await page.waitForTimeout(250);
  const pausedA = await frameSample(canvas);
  await page.waitForTimeout(350);
  const pausedB = await frameSample(canvas);
  expect(meanAbsoluteDelta(pausedA, pausedB)).toBeLessThan(0.18);
  expect(Math.abs(pausedA.energy - pausedB.energy) / Math.max(1, pausedA.energy)).toBeLessThan(0.001);
  expect(errors).toEqual([]);
});

test("OS reduced motion preserves editorial hierarchy without background or carousel drift", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await waitForStudio(page);
  await page.getByRole("button", { name: /Paper Argument/ }).click();
  const canvas = page.getByTestId("webgl-stage");
  await page.waitForTimeout(250);
  const first = await frameSample(canvas);
  await page.waitForTimeout(350);
  const second = await frameSample(canvas);
  expect(meanAbsoluteDelta(first, second)).toBeLessThan(0.18);

  await page.getByRole("button", { name: "Next slide" }).click();
  await page.waitForTimeout(120);
  const stepped = await frameSample(canvas);
  expect(meanAbsoluteDelta(second, stepped)).toBeGreaterThan(0.25);
});
