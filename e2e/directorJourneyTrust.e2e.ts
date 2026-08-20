import { expect, test } from "@playwright/test";

test("master review becomes stale whenever the direction changes", async ({ page }) => {
  await page.goto("/");
  const timeline = page.getByRole("slider", { name: "Master timeline" });
  await timeline.fill("1");
  await expect(page.getByText("Timeline scrubbed")).toBeVisible();

  await page.getByRole("button", { name: "Pace: Kinetic" }).click();
  await expect(page.getByText("Scrub the master")).toBeVisible();
  await expect(page.getByText("Timeline scrubbed")).toHaveCount(0);
});
