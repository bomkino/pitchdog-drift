import { expect, test } from "@playwright/test";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("master audit catches optical excess and applies bounded fixes", async ({ page }) => {
  await waitForStudio(page);
  await page.getByRole("slider", { name: "Speed", exact: true }).fill("1.1");
  await page.getByRole("slider", { name: "Lens energy", exact: true }).fill("90");
  await page.getByRole("slider", { name: "Slide size", exact: true }).fill("40");
  const seamless = page.getByRole("switch", { name: "Seamless export lock" });
  if (await seamless.isChecked()) await seamless.click();

  await page.getByRole("button", { name: /DIRECT/ }).click();
  const audit = page.locator(".director-audit-list");
  await expect(audit.getByText("Reading time is tight")).toBeVisible({ timeout: 10_000 });
  await expect(audit.getByText("Optics may become the subject")).toBeVisible();
  await expect(audit.getByText("Slides may read as thumbnails")).toBeVisible();
  await expect(audit.getByText("Loop closure is unlocked")).toBeVisible();

  const speedItem = audit.locator("article").filter({ hasText: "Reading time is tight" });
  await speedItem.getByRole("button", { name: "Fix" }).click();
  await expect(page.getByRole("status")).toContainText("Readable pace applied");
  await expect(page.getByRole("slider", { name: "Speed", exact: true })).toHaveValue("0.44");

  const lensItem = audit.locator("article").filter({ hasText: "Optics may become the subject" });
  await lensItem.getByRole("button", { name: "Fix" }).click();
  await expect(page.getByRole("status")).toContainText("Bounded lens applied");
  await expect(page.getByRole("slider", { name: "Lens energy", exact: true })).toHaveValue("58");

  const sizeItem = audit.locator("article").filter({ hasText: "Slides may read as thumbnails" });
  await sizeItem.getByRole("button", { name: "Fix" }).click();
  await expect(page.getByRole("status")).toContainText("Readable slide scale applied");
  await expect(page.getByRole("slider", { name: "Slide size", exact: true })).toHaveValue("58");

  const seamItem = audit.locator("article").filter({ hasText: "Loop closure is unlocked" });
  await seamItem.getByRole("button", { name: "Fix" }).click();
  await expect(page.getByRole("status")).toContainText("Seamless loop applied");
  await expect(seamless).toBeChecked();
});
