import { expect, test } from "@playwright/test";

interface ExposureMetrics {
  mean: number;
  deviation: number;
  nearBlack: number;
  nearWhite: number;
  opaque: number;
}

test("authored worlds retain image information instead of collapsing into blank or clipped frames", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const worldSelect = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "Editorial Drift" }) })
    .first();
  await expect(worldSelect).toBeVisible();

  const pause = page.getByRole("button", { name: /pause preview/i });
  if (await pause.isVisible().catch(() => false)) await pause.click();

  const options = await worldSelect.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => ({
      value: (node as HTMLOptionElement).value,
      label: (node.textContent ?? "").trim(),
    })).filter((option) => option.value && option.label),
  );
  const canvas = page.locator("canvas").first();

  for (const option of options) {
    await worldSelect.selectOption(option.value);
    await page.waitForTimeout(180);
    const image = await canvas.screenshot({ animations: "disabled" });
    const dataUrl = `data:image/png;base64,${image.toString("base64")}`;

    const metrics = await page.evaluate(async (url): Promise<ExposureMetrics> => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const sample = document.createElement("canvas");
      sample.width = 96;
      sample.height = 96;
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("2D visual-audit canvas is unavailable.");
      context.drawImage(image, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      const luminance: number[] = [];
      let nearBlack = 0;
      let nearWhite = 0;
      let opaque = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3]! / 255;
        if (alpha > 0.98) opaque += 1;
        const value = pixels[index]! * 0.2126 + pixels[index + 1]! * 0.7152 + pixels[index + 2]! * 0.0722;
        luminance.push(value);
        if (value < 3) nearBlack += 1;
        if (value > 252) nearWhite += 1;
      }
      const mean = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
      const variance = luminance.reduce((sum, value) => sum + (value - mean) ** 2, 0) / luminance.length;
      return {
        mean,
        deviation: Math.sqrt(variance),
        nearBlack: nearBlack / luminance.length,
        nearWhite: nearWhite / luminance.length,
        opaque: opaque / luminance.length,
      };
    }, dataUrl);

    expect(metrics.opaque, `${option.label} should remain an opaque authored world`).toBeGreaterThan(0.98);
    expect(metrics.deviation, `${option.label} should retain tonal structure`).toBeGreaterThan(5);
    expect(metrics.nearBlack, `${option.label} should not collapse into black clipping`).toBeLessThan(0.985);
    expect(metrics.nearWhite, `${option.label} should not collapse into white clipping`).toBeLessThan(0.985);
    expect(metrics.mean, `${option.label} should contain visible information`).toBeGreaterThan(2);
    expect(metrics.mean, `${option.label} should contain visible information`).toBeLessThan(253);
  }
});
