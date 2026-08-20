import { expect, test } from "@playwright/test";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("eighteen worlds stay searchable, filterable, restorable, and delivery-safe", async ({ page }) => {
  await waitForStudio(page);
  const search = page.getByRole("searchbox", { name: "Search film worlds" });
  await page.keyboard.press("/");
  await expect(search).toBeFocused();
  await search.fill("cyanotype evidence");
  await expect(page.locator(".theme-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Archival Blue\./ })).toBeVisible();
  await search.press("Escape");
  await expect(search).toHaveValue("");

  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator(".theme-card")).toHaveCount(5);
  await page.getByRole("button", { name: /^Dread\./ }).click();
  await expect(page.locator(".theme-current")).toContainText("Dread");

  const lens = page.getByRole("slider", { name: "Lens energy" });
  const authoredLens = await lens.inputValue();
  await lens.fill("11");
  await expect(page.locator(".theme-current")).toHaveAttribute("data-modified", "true");
  await page.getByRole("button", { name: "Restore look" }).click();
  await expect(lens).toHaveValue(authoredLens);
  await expect(page.locator(".theme-current")).toHaveAttribute("data-modified", "false");

  await page.getByRole("button", { name: "All", exact: true }).click();
  const slideMotion = page.getByRole("switch", { name: "Slide motion" });
  await slideMotion.click();
  const closure = page.getByRole("switch", { name: "Seamless export lock" });
  if (!(await closure.isChecked())) await closure.click();
  await page.getByRole("button", { name: /^Road Memory\./ }).click();
  await expect(slideMotion).not.toBeChecked();
  await expect(closure).toBeChecked();

  await page.getByRole("button", { name: /Deck Reel/ }).click();
  await expect(slideMotion).toBeChecked();
  await expect(page.getByLabel("Delivery preflight")).toContainText("source slide");
});

test("media mutations clear stale director undo without erasing A B look memory", async ({ page }) => {
  await waitForStudio(page);
  await page.getByRole("button", { name: /Deck Reel/ }).click();
  const undo = page.getByRole("button", { name: "Undo director change" });
  await expect(undo).toBeEnabled();

  const lookMemory = page.getByLabel("A B look memory");
  await lookMemory.getByText("Store", { exact: true }).first().click();
  await page.getByRole("button", { name: "Move Drift study 02.png up" }).click();
  await expect(undo).toBeDisabled();
  await expect(lookMemory.getByText("Recall", { exact: true }).first()).toBeEnabled();
});
