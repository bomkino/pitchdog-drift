import { expect, test } from "@playwright/test";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("authored optics, film worlds, and atmosphere recuts stay coherent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);

  const filmWorlds = page.locator('[aria-labelledby="themes-title"] .theme-card');
  await expect(filmWorlds).toHaveCount(12);

  const lens = page.getByRole("combobox", { name: "Lens character" });
  await lens.selectOption("dream-glass");
  await expect(page.getByRole("slider", { name: "Lens energy" })).toHaveValue("56");
  await expect(page.getByRole("slider", { name: "Peripheral softness" })).toHaveValue("42");
  await expect(page.getByRole("slider", { name: "Focus lift" })).toHaveValue("13");

  const lensEnergy = page.getByRole("slider", { name: "Lens energy" });
  await lensEnergy.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(lensEnergy).toHaveValue("55");
  await expect(lens).toHaveValue("custom");

  const atmosphere = page.locator("details").filter({ has: page.locator("summary", { hasText: "Atmosphere" }) });
  await atmosphere.locator("summary").click();
  const scene = page.getByRole("combobox", { name: "Authored scene" });
  await scene.selectOption("deep-sea");
  await expect(page.getByRole("combobox", { name: "Background", exact: true })).toHaveValue("void");
  await page.getByRole("button", { name: "Recut atmosphere" }).click();
  await expect(scene).toHaveValue("deep-sea");

  await scene.selectOption("clear-stage");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "true");
  await page.getByRole("button", { name: /Dread/ }).click();
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "false");
  await expect(scene).toHaveValue("ember-fog");

  expect(errors).toEqual([]);
});
