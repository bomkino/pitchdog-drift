import { expect, test } from "@playwright/test";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("a first cut stays reversible, comparable, guided, and keyboard-sequenceable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);

  await page.getByRole("button", { name: /Deck Reel/ }).click();
  await expect(page.getByRole("switch", { name: "Seamless export lock" })).toBeChecked();
  await expect(page.locator(".stage-hud")).toContainText("1080 × 1920");

  await page.getByRole("button", { name: /Wide Trailer/ }).click();
  await expect(page.locator(".stage-hud")).toContainText("1920 × 1080");
  await expect(page.getByRole("slider", { name: "Duration" })).toHaveValue("12");
  await expect(page.getByRole("radio", { name: "24" })).toBeChecked();

  await page.getByRole("button", { name: "Undo director change" }).click();
  await expect(page.locator(".stage-hud")).toContainText("1080 × 1920");
  await page.getByRole("button", { name: "Redo director change" }).click();
  await expect(page.locator(".stage-hud")).toContainText("1920 × 1080");

  const lookMemory = page.getByLabel("A B look memory");
  await lookMemory.getByText("Store", { exact: true }).first().click();
  await page.getByRole("button", { name: /Horror Tease/ }).click();
  await expect(page.locator(".stage-topline").first()).toContainText("dread");
  await lookMemory.getByText("Recall", { exact: true }).first().click();
  await expect(page.locator(".stage-hud")).toContainText("1920 × 1080");

  const stage = page.locator(".stage-frame");
  await expect(stage).toHaveAttribute("data-guide", "off");
  await page.getByRole("button", { name: "Guides: off" }).click();
  await expect(stage).toHaveAttribute("data-guide", "edge");
  await page.getByRole("button", { name: "Guides: edge" }).click();
  await expect(stage).toHaveAttribute("data-guide", "copy");

  const firstSlide = page.locator(".asset-list li").first();
  await firstSlide.focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(page.locator(".asset-list li").first()).toContainText("Drift study 02.png");

  await expect(page.getByLabel("Delivery preflight")).toContainText("exact frames");
  expect(errors).toEqual([]);
});
