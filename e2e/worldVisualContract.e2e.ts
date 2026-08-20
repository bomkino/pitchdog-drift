import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

test("every authored film world produces a distinct rendered canvas", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const worldSelect = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "Editorial Drift" }) })
    .first();
  await expect(worldSelect).toBeVisible();

  const pause = page.getByRole("button", { name: /pause preview/i });
  if (await pause.isVisible().catch(() => false)) await pause.click();

  const options = await worldSelect.locator("option").evaluateAll((nodes) =>
    nodes
      .map((node) => ({
        value: (node as HTMLOptionElement).value,
        label: (node.textContent ?? "").trim(),
      }))
      .filter((option) => option.value && option.label),
  );
  expect(options.length).toBe(12);

  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();

  const hashes = new Map<string, string>();
  for (const option of options) {
    await worldSelect.selectOption(option.value);
    await page.waitForTimeout(180);
    const image = await canvas.screenshot({ animations: "disabled" });
    expect(image.byteLength, `${option.label} should render meaningful visual information`).toBeGreaterThan(4_000);
    const hash = createHash("sha256").update(image).digest("hex");
    hashes.set(option.label, hash);
  }

  expect(new Set(hashes.values()).size, JSON.stringify(Object.fromEntries(hashes), null, 2)).toBe(options.length);
  expect(consoleErrors).toEqual([]);
});
