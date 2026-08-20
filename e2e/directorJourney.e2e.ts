import { expect, test } from "@playwright/test";

test.describe("director journey", () => {
  test("offers a truthful master path before deep controls", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto("/");
    const dock = page.locator(".director-dock");
    await expect(dock).toBeVisible();
    await expect(page.getByText("DIRECTOR’S DESK")).toBeVisible();
    await expect(page.getByRole("slider", { name: "Master timeline" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Editorial/ })).toBeVisible();

    await page.getByRole("button", { name: /Editorial/ }).click();
    const timeline = page.getByRole("slider", { name: "Master timeline" });
    const maximum = Number(await timeline.getAttribute("max"));
    await timeline.fill(String(Math.min(maximum, 1.25)));
    await expect(page.getByText("Timeline scrubbed")).toBeVisible();

    await page.getByLabel("Platform guide").selectOption("centre");
    await expect(page.locator("[data-drift-guide='centre']")).toHaveCount(1);

    await page.getByRole("button", { name: "Set A" }).click();
    const hold = page.getByRole("button", { name: "Hold for A" });
    await hold.dispatchEvent("pointerdown", { pointerId: 1 });
    await expect(hold).toHaveAttribute("data-active", "true");
    await hold.dispatchEvent("pointerup", { pointerId: 1 });

    expect(consoleErrors).toEqual([]);
  });

  test("exposes reversible direction and a copyable receipt", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await page.getByRole("button", { name: /Kinetic/ }).click();
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();
    await page.getByRole("button", { name: "Copy master brief" }).click();
    await expect(page.getByRole("status")).toContainText("Master brief copied");
  });
});
