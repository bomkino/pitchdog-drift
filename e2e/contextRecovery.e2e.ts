import { expect, test } from "@playwright/test";

test("WebGL context loss can recover without duplicating the renderer", async ({ page }) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  const stage = page.locator('[data-testid="webgl-stage"]');
  await expect(stage).toBeVisible();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveCount(1);

  const supported = await canvas.evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext("webgl2")
      ?? (element as HTMLCanvasElement).getContext("webgl");
    return Boolean(gl?.getExtension("WEBGL_lose_context"));
  });
  test.skip(!supported, "WEBGL_lose_context is unavailable in this browser runtime");

  await canvas.evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext("webgl2")
      ?? (element as HTMLCanvasElement).getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  });
  await page.waitForTimeout(400);
  await canvas.evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext("webgl2")
      ?? (element as HTMLCanvasElement).getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.restoreContext();
  });

  await page.waitForTimeout(1_200);
  await page.getByRole("button", { name: /Blue Hour/i }).click();
  await page.waitForTimeout(400);
  await expect(stage).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  expect((await stage.screenshot()).byteLength).toBeGreaterThan(10_000);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
