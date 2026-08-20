import { expect, test, type Page } from "@playwright/test";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".stage-frame")).toHaveAttribute(
    "data-context",
    /ready|restored/,
  );
}

function isWaveRequest(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith(".wav");
  } catch {
    return false;
  }
}

test("tactile recordings stay unloaded until a trusted gesture and remain same-origin", async ({ page }) => {
  const waveRequests: string[] = [];
  page.on("request", (request) => {
    if (isWaveRequest(request.url())) waveRequests.push(request.url());
  });

  await waitForStudio(page);
  await page.waitForTimeout(200);
  expect(waveRequests).toEqual([]);

  await page.getByLabel("Open sound direction controls").click();
  await expect(page.getByText("armed", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  expect(waveRequests.length).toBeGreaterThan(0);

  const appOrigin = new URL(page.url()).origin;
  for (const requestUrl of waveRequests) {
    expect(new URL(requestUrl).origin).toBe(appOrigin);
  }
});

test("a persisted mute can be enabled and armed on the first click after reload", async ({ page }) => {
  await waitForStudio(page);
  await page.getByRole("button", {
    name: "Mute tactile preview sound",
  }).click();
  await expect(page.getByText("muted", { exact: true })).toBeVisible();
  await expect(page.locator(".header-status")).toContainText("saved locally", {
    timeout: 10_000,
  });

  await page.reload();
  await expect(page.locator(".asset-list li").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", {
    name: "Enable tactile preview sound",
  })).toBeVisible();

  await page.getByRole("button", {
    name: "Enable tactile preview sound",
  }).click();
  await expect(page.getByText("armed", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
});

test("one failed local WAV request reports the error but a second gesture recovers", async ({ page }) => {
  let failures = 0;
  await page.route("**/*.wav*", async (route) => {
    if (failures === 0) {
      failures += 1;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await waitForStudio(page);
  await page.getByLabel("Open sound direction controls").click();
  await expect.poll(() => failures).toBe(1);
  await expect(page.getByRole("alert")).toContainText(/failed/i, {
    timeout: 15_000,
  });
  await expect(page.getByText("unavailable", { exact: true })).toHaveCount(0);
  await expect(page.getByText("ready after input", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Audition gesture" }).click();
  await expect(page.getByText("armed", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  expect(failures).toBe(1);
});
