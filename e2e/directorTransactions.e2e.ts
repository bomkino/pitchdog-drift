import { expect, test } from "@playwright/test";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("a missing orchestration contract blocks the entire directed move", async ({ page }) => {
  await waitForStudio(page);
  const speed = page.getByRole("slider", { name: "Speed", exact: true });
  const initialSpeed = await speed.inputValue();

  await page.getByRole("button", { name: /DIRECT/ }).click();
  await page.getByRole("slider", { name: "Lens energy", exact: true }).evaluate((control) => {
    control.closest("label")?.remove();
  });
  await page.getByRole("button", { name: /Quiet Reveal/ }).click();

  await expect(page.getByRole("status")).toContainText("blocked before changing the project");
  await expect(page.getByRole("status")).toContainText("Lens energy");
  await expect(speed).toHaveValue(initialSpeed);
  await expect(page.getByRole("button", { name: "Revert last move" })).toHaveCount(0);
});

test("the last complete directed move can be reverted to the exact inspector state", async ({ page }) => {
  await waitForStudio(page);
  const speed = page.getByRole("slider", { name: "Speed", exact: true });
  const spacing = page.getByRole("slider", { name: "Spacing", exact: true });
  const lens = page.getByRole("slider", { name: "Lens energy", exact: true });
  const initial = {
    speed: await speed.inputValue(),
    spacing: await spacing.inputValue(),
    lens: await lens.inputValue(),
    theme: await page.locator('button.theme-card[data-active="true"] strong').textContent(),
  };

  await page.getByRole("button", { name: /DIRECT/ }).click();
  await page.getByRole("button", { name: /Slow Dread/ }).click();
  await expect(page.getByRole("status")).toContainText("Slow Dread applied", { timeout: 15_000 });
  await expect(speed).toHaveValue("0.14");
  await expect(lens).toHaveValue("50");
  await expect(page.getByRole("button", { name: "Revert last move" })).toBeVisible();

  await page.getByRole("button", { name: "Revert last move" }).click();
  await expect(page.getByRole("status")).toContainText("Slow Dread reverted", { timeout: 20_000 });
  await expect(speed).toHaveValue(initial.speed);
  await expect(spacing).toHaveValue(initial.spacing);
  await expect(lens).toHaveValue(initial.lens);
  await expect(page.locator('button.theme-card[data-active="true"] strong')).toHaveText(initial.theme ?? "");
  await expect(page.getByRole("button", { name: "Revert last move" })).toHaveCount(0);
});
