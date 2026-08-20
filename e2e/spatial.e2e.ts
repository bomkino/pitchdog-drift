import { createHash } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

async function setRange(page: Page, label: string, value: number): Promise<void> {
  await page.getByRole("slider", { name: label, exact: true }).evaluate(
    (node, nextValue) => {
      const input = node as HTMLInputElement;
      input.value = String(nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    value,
  );
}

async function digest(locator: Locator): Promise<string> {
  const bytes = await locator.screenshot({ animations: "disabled" });
  return createHash("sha256").update(bytes).digest("hex");
}

async function openGroup(page: Page, title: string): Promise<void> {
  const group = page.locator("details").filter({
    has: page.locator("summary", { hasText: title }),
  });
  if (!(await group.evaluate((node) => (node as HTMLDetailsElement).open))) {
    await group.locator("summary").click();
  }
}

test("spatial controls form one tactile, pause-stable rendered system", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);
  const canvas = page.locator("[data-testid=webgl-stage]");
  await page.getByRole("combobox", { name: "Path", exact: true }).selectOption("helix");
  await page.getByRole("combobox", { name: "Motion character", exact: true }).selectOption("spring");
  await openGroup(page, "Surface");
  await openGroup(page, "Atmosphere");
  await page.getByRole("combobox", { name: "Material", exact: true }).selectOption("silk");
  await setRange(page, "Speed", 0);
  await setRange(page, "Curve", 82);
  await setRange(page, "Depth", 72);
  await setRange(page, "Path banking", 90);
  await setRange(page, "Fabric flex", 76);
  await setRange(page, "3D thickness", 18);
  await setRange(page, "Background breath", 0);
  await setRange(page, "Grain", 0);

  await page.getByRole("button", { name: "Pause preview" }).click();
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();
  const pausedA = await digest(canvas);
  await page.waitForTimeout(350);
  const pausedB = await digest(canvas);
  expect(pausedB).toBe(pausedA);

  const materialDigests = new Set<string>();
  for (const surface of ["card", "paper", "silk", "gel"]) {
    await page.getByRole("combobox", { name: "Material", exact: true }).selectOption(surface);
    await page.waitForTimeout(80);
    materialDigests.add(await digest(canvas));
  }
  expect(materialDigests.size).toBe(4);

  await setRange(page, "3D thickness", 0);
  const flat = await digest(canvas);
  await setRange(page, "3D thickness", 24);
  const thick = await digest(canvas);
  expect(thick).not.toBe(flat);

  await page.getByRole("button", { name: "Play preview" }).click();
  const beforeDrag = await digest(canvas);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * 0.54;
  const y = box!.y + box!.height * 0.48;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute("data-dragging", "true");
  await page.mouse.move(x + box!.width * 0.18, y - box!.height * 0.12, { steps: 8 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute("data-dragging", "false");
  await page.waitForTimeout(120);
  const afterDrag = await digest(canvas);
  expect(afterDrag).not.toBe(beforeDrag);
  expect(errors).toEqual([]);
});

test("spatial help copy explains consequences instead of exposing mystery knobs", async ({ page }) => {
  await waitForStudio(page);
  await page.getByRole("combobox", { name: "Path", exact: true }).selectOption("arc");
  await expect(page.getByText("A one-sided cinematic bow; useful for calm lateral travel."))
    .toBeVisible();
  await page.getByRole("combobox", { name: "Path", exact: true }).selectOption("switchback");
  await expect(page.getByText("Harder lateral reversals with depth carried through every turn."))
    .toBeVisible();

  await page.getByRole("combobox", { name: "Motion character", exact: true }).selectOption("drift");
  await expect(page.getByText("Long hand coast; the master breathes broadly around its mean pace."))
    .toBeVisible();

  const surfaceGroup = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Surface" }),
  });
  await surfaceGroup.locator("summary").click();
  await page.getByRole("combobox", { name: "Material", exact: true }).selectOption("gel");
  await expect(page.getByText("Elastic mass: impulse lags behind the hand, with restrained gloss."))
    .toBeVisible();
});
