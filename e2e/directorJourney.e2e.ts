import { expect, test } from "@playwright/test";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("intent recipes, master shapes, guides, and audit write real project controls", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);
  await page.getByRole("button", { name: /DIRECT/ }).click();
  await expect(page.getByRole("complementary", { name: "Intent director" })).toBeVisible();
  await expect(page.getByText("Start with the effect on the viewer.")).toBeVisible();

  await page.getByRole("button", { name: /Quiet Reveal/ }).click();
  await expect(page.getByRole("status")).toContainText("Quiet Reveal applied", { timeout: 15_000 });
  await expect(page.getByRole("slider", { name: "Speed", exact: true })).toHaveValue("0.22");
  await expect(page.getByRole("slider", { name: "Lens energy", exact: true })).toHaveValue("18");
  await expect(page.getByRole("slider", { name: "Peripheral softness", exact: true })).toHaveValue("28");
  await expect(page.getByRole("slider", { name: "Slide size", exact: true })).toHaveValue("78");
  await expect(page.getByRole("group", { name: "Flow axis" }).getByRole("radio", { name: "Vertical" })).toBeChecked();

  await page.getByRole("button", { name: /^Glide/ }).click();
  await expect(page.getByRole("status")).toContainText("Glide applied", { timeout: 15_000 });
  await expect(page.getByRole("slider", { name: "Speed", exact: true })).toHaveValue("0.42");
  await expect(page.getByRole("slider", { name: "Lens energy", exact: true })).toHaveValue("42");

  await page.getByText("Master shape", { exact: true }).click();
  await page.getByRole("button", { name: /Feed.*4:5/ }).click();
  await expect(page.getByRole("status")).toContainText("Feed master applied", { timeout: 15_000 });
  await expect(page.locator(".stage-hud")).toContainText("1080 × 1350");
  await expect(page.getByRole("group", { name: "Frame rate" }).getByRole("radio", { name: "30" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Seamless export lock" })).toBeChecked();

  await page.getByText("Composition guides", { exact: true }).click();
  await page.getByRole("checkbox", { name: /Title safe/ }).check();
  await page.getByRole("checkbox", { name: /Caption reserve/ }).check();
  await expect(page.locator(".stage-frame .director-title-safe")).toBeVisible();
  await expect(page.locator(".stage-frame .director-caption-safe")).toBeVisible();

  await expect(page.locator(".director-audit-list article[data-tone=error]")).toHaveCount(0);
  await expect(page.getByText("Loop closure locked")).toBeVisible();

  await page.setViewportSize({ width: 320, height: 568 });
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight,
  }));
  expect(overflow).toEqual({ horizontal: false, vertical: false });

  await page.getByRole("button", { name: "Close intent director" }).click();
  await expect(page.getByRole("complementary", { name: "Intent director" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
