import { expect, test } from "@playwright/test";

const squarePng = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAG0lEQVR4AYTIoQ0AAADCMLLLOR0/Q2WpEPkxAAAA//99eYBQAAAABklEQVQDAN2nCAkPbnNjAAAAAElFTkSuQmCC";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("the visible creator path turns a deck into a reversible directed master", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await waitForStudio(page);

  const desk = page.locator(".director-desk");
  await expect(desk).toContainText("Slides → World → Direct → Master");
  await expect(desk.locator(".journey-rail li")).toHaveCount(4);
  await expect(page.getByTestId("deck-health")).toContainText("DECK HEALTH");
  await expect(page.getByRole("region", { name: "MP4 master preflight" })).toBeVisible();

  const worldSelect = page.getByRole("combobox", { name: "Film world" });
  await worldSelect.selectOption("dread");
  await expect(worldSelect).toHaveValue("dread");
  await expect(page.locator(".stage-topline").first()).toContainText("dread");

  await page.getByRole("radio", { name: /Fever/i }).check();
  await expect(page.getByRole("radio", { name: /Fever/i })).toBeChecked();

  const atmosphere = page.locator("details").filter({ has: page.locator("summary", { hasText: "Atmosphere" }) });
  await atmosphere.locator("summary").click();
  const seed = page.getByRole("spinbutton", { name: "Atmosphere seed" });
  const baselineSeed = await seed.inputValue();

  await desk.getByRole("button", { name: /New take/i }).click();
  await expect(seed).not.toHaveValue(baselineSeed);
  const recutSeed = await seed.inputValue();
  await expect(worldSelect).toHaveValue("dread");

  await page.keyboard.press("Control+z");
  await expect(seed).toHaveValue(baselineSeed);
  await page.keyboard.press("Control+Shift+z");
  await expect(seed).toHaveValue(recutSeed);

  await desk.getByRole("button", { name: /New take/i }).click();
  await expect(seed).not.toHaveValue(recutSeed);
  const secondTakeSeed = await seed.inputValue();
  await page.keyboard.press("Control+z");
  await expect(seed).toHaveValue(recutSeed);
  await page.keyboard.press("Control+Shift+z");
  await expect(seed).toHaveValue(secondTakeSeed);

  const frame = page.locator(".stage-frame");
  await expect(frame).toHaveAttribute("data-guide", "off");
  await desk.getByRole("button", { name: /Cycle composition guides/i }).click();
  await expect(frame).toHaveAttribute("data-guide", "thirds");
  await expect(frame.locator(".composition-guide[data-mode='thirds']")).toBeVisible();
  await page.keyboard.press("g");
  await expect(frame).toHaveAttribute("data-guide", "title-safe");

  const output = page.getByRole("combobox", { name: "Publishing master" });
  await output.selectOption("cinema");
  await expect(page.locator(".stage-hud")).toContainText("1920 × 804");
  await expect(page.getByRole("radio", { name: "24" })).toBeChecked();

  expect(errors).toEqual([]);
});

test("deck health offers an explicit repair when source and moving frame disagree", async ({ page }) => {
  await waitForStudio(page);

  await page.locator('input[accept^="image/png"]').setInputFiles({
    name: "square-source.png",
    mimeType: "image/png",
    buffer: Buffer.from(squarePng, "base64"),
  });

  await expect(page.locator(".asset-list li")).toHaveCount(1);
  const health = page.getByTestId("deck-health");
  await expect(health).toContainText("1:1");
  await expect(health).toContainText("May soften");

  const repair = health.getByRole("button", { name: /Match slide frame · 1:1/i });
  await expect(repair).toBeVisible();
  await repair.click();
  await expect(page.getByRole("combobox", { name: "Slide ratio" })).toHaveValue("1:1");
  await expect(repair).toHaveCount(0);
});
