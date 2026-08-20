import { expect, test } from "@playwright/test";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("background atlas studies, compositions, palettes, and recuts stay operable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);

  const atmosphere = page.locator("details").filter({ has: page.locator("summary", { hasText: "Atmosphere" }) });
  if (!(await atmosphere.evaluate((details) => (details as HTMLDetailsElement).open))) {
    await atmosphere.locator("summary").click();
  }

  const study = page.getByRole("combobox", { name: "Authored study" });
  const background = page.getByRole("combobox", { name: "Background", exact: true });
  const composition = page.getByRole("combobox", { name: "Composition" });
  const palette = page.getByRole("combobox", { name: "Palette" });
  const variation = page.getByRole("slider", { name: "Variation" });
  const colourInput = (label: string) => page
    .locator("label.color-field")
    .filter({ hasText: new RegExp(`^${label}`) })
    .locator('input[type="color"]');

  await expect(study.locator("option")).toHaveCount(41);
  await expect(palette.locator("option")).toHaveCount(21);

  await study.selectOption("projector-bloom");
  await expect(background).toHaveValue("aura");
  await expect(composition).toHaveValue("1");
  await expect(variation).toHaveValue("38");
  await expect(palette).toHaveValue("bone-ink");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "false");

  await composition.selectOption("4");
  await expect(study).toHaveValue("custom");
  await expect(composition).toHaveValue("4");
  await expect(variation).toHaveValue("38");

  await palette.selectOption("ocean-emulsion");
  await expect(colourInput("Ground")).toHaveValue("#04131a");
  await expect(colourInput("Field")).toHaveValue("#0d4050");
  await expect(colourInput("Light")).toHaveValue("#72d4cf");

  await page.getByRole("button", { name: "Recut atmosphere" }).click();
  await expect(variation).toHaveValue("39");
  await expect(composition).toHaveValue("4");

  await background.selectOption("transparent");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "true");
  await expect(page.getByRole("combobox", { name: "Composition" })).toHaveCount(0);

  await study.selectOption("chemical-burn");
  await expect(background).toHaveValue("void");
  await expect(page.getByRole("combobox", { name: "Composition" })).toHaveValue("6");
  await expect(page.getByRole("slider", { name: "Variation" })).toHaveValue("58");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-transparent", "false");

  expect(errors).toEqual([]);
});
