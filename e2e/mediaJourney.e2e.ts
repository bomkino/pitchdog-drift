import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixturePath = path.resolve("e2e/fixtures/slide.png");

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("deck replacement is explicit, atomic, and naturally ordered", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);
  const addInput = page.getByTestId("add-slides-input");
  const replaceInput = page.getByTestId("replace-slides-input");
  await expect(addInput).toHaveCount(1);
  await expect(replaceInput).toHaveCount(1);

  await addInput.setInputFiles(fixturePath);
  await expect(page.locator(".asset-list li")).toHaveCount(1);
  await expect(page.locator(".asset-list li").first()).toContainText("slide.png");

  const bytes = await readFile(fixturePath);
  let abortedConfirmation = "";
  page.once("dialog", (dialog) => {
    abortedConfirmation = dialog.message();
    void dialog.accept();
  });
  await replaceInput.setInputFiles([
    { name: "02-good.png", mimeType: "image/png", buffer: bytes },
    { name: "03-broken.png", mimeType: "image/png", buffer: Buffer.from("not a png") },
  ]);
  await expect(page.getByRole("alert")).toContainText("Replacement aborted");
  expect(abortedConfirmation).toContain("removed only after every replacement image decodes successfully");
  await expect(page.locator(".asset-list li")).toHaveCount(1);
  await expect(page.locator(".asset-list li").first()).toContainText("slide.png");

  let committedConfirmation = "";
  page.once("dialog", (dialog) => {
    committedConfirmation = dialog.message();
    void dialog.accept();
  });
  await replaceInput.setInputFiles([
    { name: "10-ten.png", mimeType: "image/png", buffer: bytes },
    { name: "2-two.png", mimeType: "image/png", buffer: bytes },
  ]);
  expect(committedConfirmation).toContain("Replace 1 moving slide with 2?");
  await expect(page.locator(".asset-list li")).toHaveCount(2);
  await expect(page.locator(".asset-list li").nth(0)).toContainText("2-two.png");
  await expect(page.locator(".asset-list li").nth(1)).toContainText("10-ten.png");
  await expect(page.getByText("2 replacement slides decoded, committed, and queued for local save.")).toBeVisible();
  expect(errors).toEqual([]);
});
