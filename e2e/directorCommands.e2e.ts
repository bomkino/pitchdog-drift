import { expect, test } from "@playwright/test";

test("director command palette exposes the complete creator path", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: "Director commands" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("1 · Slides");
  await expect(dialog).toContainText("4 · Master");

  const search = page.getByRole("searchbox", { name: "Search director commands" });
  await search.fill("before after");
  await expect(page.getByRole("option", { name: /Compare against clean glass/i })).toBeVisible();
  await search.fill("social safe");
  await expect(page.getByRole("option", { name: /Cycle composition guides/i })).toBeVisible();
  await search.fill("output");
  await expect(page.getByRole("option", { name: /Review output readiness/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
