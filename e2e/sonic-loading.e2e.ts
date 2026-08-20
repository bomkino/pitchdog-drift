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

function isWavePayloadRequest(url: string): boolean {
  try {
    const parsed = new URL(url);
    // In dev, Vite first requests tiny `?import&no-inline` JavaScript modules
    // that merely resolve each committed asset URL. Those do not transfer WAV
    // bytes. The later request without `import` is the actual audio payload.
    return (
      parsed.pathname.endsWith(".wav")
      && !parsed.searchParams.has("import")
    );
  } catch {
    return false;
  }
}

test("tactile payloads stay unloaded until a trusted gesture and remain same-origin", async ({ page }) => {
  const wavePayloadRequests: string[] = [];
  page.on("request", (request) => {
    if (isWavePayloadRequest(request.url())) {
      wavePayloadRequests.push(request.url());
    }
  });

  await waitForStudio(page);
  await page.waitForTimeout(200);
  expect(wavePayloadRequests).toEqual([]);

  await page.getByLabel("Open sound direction controls").click();
  await expect(page.getByText("armed", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  expect(wavePayloadRequests.length).toBeGreaterThan(0);

  const appOrigin = new URL(page.url()).origin;
  for (const requestUrl of wavePayloadRequests) {
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

test("one failed local WAV payload reports the error but a second gesture recovers", async ({ page }) => {
  let failures = 0;
  await page.route("**/*.wav*", async (route) => {
    if (!isWavePayloadRequest(route.request().url())) {
      await route.continue();
      return;
    }
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
