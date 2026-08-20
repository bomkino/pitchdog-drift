import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

const digest = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

test("Clean lens is an honest reversible comparison, not a destructive reset", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const worldSelect = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "Editorial Drift" }) })
    .first();
  await worldSelect.selectOption({ label: /Dread|Chrome Dream|Night Run/i });

  const pause = page.getByRole("button", { name: /pause preview/i });
  if (await pause.isVisible().catch(() => false)) await pause.click();

  const canvas = page.locator("canvas").first();
  await page.waitForTimeout(220);
  const directed = await canvas.screenshot({ animations: "disabled" });
  const selectedWorld = await worldSelect.inputValue();

  const compare = page.getByRole("button", { name: /clean lens/i }).first();
  await expect(compare).toBeVisible();
  await compare.click();
  await page.waitForTimeout(180);
  const clean = await canvas.screenshot({ animations: "disabled" });

  expect(digest(clean), "Clean lens should expose a visibly different optical treatment").not.toBe(digest(directed));
  expect(await worldSelect.inputValue(), "Comparison must not replace the selected world").toBe(selectedWorld);

  const restore = page.getByRole("button", { name: /restore|return|directed lens|clean lens/i }).first();
  await restore.click();
  await page.waitForTimeout(180);
  const restored = await canvas.screenshot({ animations: "disabled" });

  expect(digest(restored), "Ending comparison should restore the exact directed frame").toBe(digest(directed));
  expect(await worldSelect.inputValue()).toBe(selectedWorld);
});
