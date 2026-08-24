import { expect, test, type Locator } from "@playwright/test";
import { switchWorkspace, waitForStudio } from "./studio.helpers";

async function ensureOpen(group: Locator): Promise<void> {
  if (await group.getAttribute("open") === null) await group.locator(":scope > summary").click();
}

test("preflight separates harmless endpoint rounding from uneven pose holds", async ({ page }) => {
  await waitForStudio(page);
  await switchWorkspace(page, "MOTION");
  await page.getByText("Advanced", { exact: true }).click();
  const editorialRhythm = page.locator("details.inspector-group").filter({
    has: page.locator(":scope > summary > span", { hasText: /^Editorial rhythm$/ }),
  });
  await ensureOpen(editorialRhythm);
  await editorialRhythm.getByRole("group", { name: "Pose cadence" }).getByText("12", { exact: true }).click();
  const timelineIntent = page.locator("details.inspector-group").filter({
    has: page.locator(":scope > summary > span", { hasText: /^Timeline intent$/ }),
  });
  await ensureOpen(timelineIntent);
  await timelineIntent.getByRole("group", { name: "Timing authority" }).getByText("Exact length", { exact: true }).click();

  await switchWorkspace(page, "EXPORT");
  await page.getByLabel("Exact duration", { exact: true }).fill("10.03");
  const frameRate = page.getByRole("group", { name: "Frame rate" });
  await frameRate.getByText("25", { exact: true }).click();

  const receipt = page.getByRole("status", { name: "Delivery receipt" });
  const preflight = page.getByRole("status", { name: "Master preflight" });
  await expect(receipt).toContainText("12 fps poses · uneven 2/3-frame holds");
  await expect(receipt).not.toContainText("endpoint warning");
  await expect(preflight).toContainText("MP4 READY · 1 WARN");
  await expect(preflight).toContainText("251 frames · 10.040 s · +0.010 s");
  await expect(preflight.locator("p").filter({ hasText: "251 frames · 10.040 s · +0.010 s" })).toBeVisible();
  await expect(preflight.locator("li").filter({ hasText: "251 frames · 10.040 s" })).toHaveCount(0);
  await expect(preflight).toContainText("Some poses stay on screen longer than others");
  await expect(preflight).toContainText("Choose 24 or 60 fps for even holds, or choose Continuous motion.");
  await expect(preflight).not.toContainText("Frame quantization does not land on the authored cadence endpoint");

  await frameRate.getByText("24", { exact: true }).click();
  await expect(receipt).toContainText("12 fps poses · even 2-frame holds");
  await expect(preflight).toContainText("MP4 READY");
  await expect(preflight).not.toContainText("WARN");
  await expect(preflight).not.toContainText("uneven");
  await expect(preflight).toContainText("241 frames · 10.042 s · +0.012 s");
});
