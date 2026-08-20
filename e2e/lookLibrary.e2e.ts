import { expect, test } from "@playwright/test";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("a saved local look restores direction without overwriting the destination master", async ({ page }) => {
  await waitForStudio(page);
  await page.getByRole("button", { name: /DIRECT/ }).click();

  await page.getByRole("button", { name: /Quiet Reveal/ }).click();
  await expect(page.getByRole("status")).toContainText("Quiet Reveal applied", { timeout: 15_000 });

  await page.getByText("My looks", { exact: true }).click();
  await page.getByRole("textbox", { name: "Look name" }).fill("pitch.dog quiet glass");
  await page.getByRole("button", { name: "Save current look" }).click();
  await expect(page.getByRole("status")).toContainText("pitch.dog quiet glass saved locally");
  await expect(page.getByRole("button", { name: /pitch\.dog quiet glass/ })).toBeVisible();

  await page.getByText("Master shape", { exact: true }).click();
  await page.getByRole("button", { name: /Feed.*4:5/ }).click();
  await expect(page.getByRole("status")).toContainText("Feed master applied", { timeout: 15_000 });
  await expect(page.locator(".stage-hud")).toContainText("1080 × 1350");
  const masterBefore = {
    width: await page.getByLabel("Stage width").inputValue(),
    height: await page.getByLabel("Stage height").inputValue(),
    duration: await page.getByRole("slider", { name: "Duration", exact: true }).inputValue(),
    seamless: await page.getByRole("switch", { name: "Seamless export lock" }).isChecked(),
  };

  await page.getByRole("button", { name: /Slow Dread/ }).click();
  await expect(page.getByRole("status")).toContainText("Slow Dread applied", { timeout: 15_000 });
  await expect(page.getByRole("slider", { name: "Lens energy", exact: true })).toHaveValue("50");

  await page.getByRole("button", { name: /pitch\.dog quiet glass/ }).click();
  await expect(page.getByRole("status")).toContainText("Look · pitch.dog quiet glass applied", { timeout: 20_000 });
  await expect(page.locator('button.theme-card[data-active="true"] strong')).toHaveText("Editorial Drift");
  await expect(page.getByRole("slider", { name: "Speed", exact: true })).toHaveValue("0.22");
  await expect(page.getByRole("slider", { name: "Lens energy", exact: true })).toHaveValue("18");

  expect(await page.getByLabel("Stage width").inputValue()).toBe(masterBefore.width);
  expect(await page.getByLabel("Stage height").inputValue()).toBe(masterBefore.height);
  expect(await page.getByRole("slider", { name: "Duration", exact: true }).inputValue()).toBe(masterBefore.duration);
  expect(await page.getByRole("switch", { name: "Seamless export lock" }).isChecked()).toBe(masterBefore.seamless);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete pitch.dog quiet glass" }).click();
  await expect(page.getByRole("status")).toContainText("pitch.dog quiet glass deleted");
  await expect(page.getByRole("button", { name: /pitch\.dog quiet glass/ })).toHaveCount(0);
});
