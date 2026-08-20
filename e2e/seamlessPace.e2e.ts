import { expect, test } from "@playwright/test";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("seamless master pace is visible, readable, and reconcilable with preview", async ({ page }) => {
  await waitForStudio(page);
  await expect(page.locator(".asset-list li")).toHaveCount(8);

  await page.getByRole("button", { name: /DIRECT/ }).click();
  await page.getByText("Master shape", { exact: true }).click();
  await page.getByRole("button", { name: /Feed.*4:5/ }).click();
  await expect(page.getByRole("status")).toContainText("Feed master applied", { timeout: 15_000 });

  const audit = page.locator(".director-audit-list");
  const duration = page.getByRole("slider", { name: "Duration", exact: true });
  const speed = page.getByRole("slider", { name: "Speed", exact: true });
  const loops = page.getByRole("slider", { name: "Loops per master" });

  await expect(duration).toHaveValue("8");
  await expect(loops).toHaveValue("1");
  await expect(audit.getByText("Master runs at 1.00 slides/s")).toBeVisible({ timeout: 10_000 });
  await expect(audit.getByText("Preview and master use different pace values")).toBeVisible();

  const masterPace = audit.locator("article").filter({ hasText: "Master runs at 1.00 slides/s" });
  await masterPace.getByRole("button", { name: "Fix" }).click();
  await expect(page.getByRole("status")).toContainText("Readable loop duration applied");
  await expect(duration).toHaveValue("12");
  await expect(audit.getByText("Master pace · 0.67 slides/s")).toBeVisible({ timeout: 10_000 });

  const paceContract = audit.locator("article").filter({ hasText: "Preview and master use different pace values" });
  await paceContract.getByRole("button", { name: "Fix" }).click();
  await expect(page.getByRole("status")).toContainText("Matched preview pace applied");
  await expect(speed).toHaveValue("0.67");
  await expect(audit.getByText("Preview and master use different pace values")).toHaveCount(0, { timeout: 10_000 });
});
