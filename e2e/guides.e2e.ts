import { expect, test } from "@playwright/test";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("editor guides remain outside the WebGL drawing buffer", async ({ page }) => {
  await waitForStudio(page);
  await page.getByRole("button", { name: "Pause preview" }).click();
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();

  const canvas = page.locator("[data-testid=webgl-stage]");
  const before = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL("image/png"));

  await page.getByRole("button", { name: /DIRECT/ }).click();
  await page.getByText("Composition guides", { exact: true }).click();
  await page.getByRole("checkbox", { name: /Rule of thirds/ }).check();
  await page.getByRole("checkbox", { name: /Title safe/ }).check();
  await page.getByRole("checkbox", { name: /Caption reserve/ }).check();
  await page.getByRole("checkbox", { name: /Interface reserve/ }).check();
  await expect(page.locator(".stage-frame .director-guides")).toBeVisible();

  const after = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL("image/png"));
  expect(after).toBe(before);

  await page.getByRole("button", { name: "Clear guides" }).click();
  await expect(page.locator(".stage-frame .director-guides")).toHaveCount(0);
});
