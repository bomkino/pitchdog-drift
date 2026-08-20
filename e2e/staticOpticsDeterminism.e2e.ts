import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

const hash = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

test("paused reduced-motion worlds are pixel-stable rather than quietly shimmering", async ({ page }) => {
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
    nodes.map((node) => ({
      value: (node as HTMLOptionElement).value,
      label: (node.textContent ?? "").trim(),
    })).filter((option) => option.value && option.label),
  );
  const representatives = options.filter((_, index) => index % 3 === 0);
  expect(representatives.length).toBeGreaterThanOrEqual(4);

  const canvas = page.locator("canvas").first();
  for (const option of representatives) {
    await worldSelect.selectOption(option.value);
    await page.waitForTimeout(220);
    const first = await canvas.screenshot({ animations: "disabled" });
    await page.waitForTimeout(320);
    const second = await canvas.screenshot({ animations: "disabled" });
    expect(hash(second), `${option.label} changed while paused under reduced motion`).toBe(hash(first));
  }
});
