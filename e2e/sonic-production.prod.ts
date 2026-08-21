import { expect, test } from "@playwright/test";

test("production build lazily serves a small hashed same-origin foley core", async ({ page }) => {
  const waves: Array<{ url: string; status: number }> = [];
  const externalRequests: string[] = [];
  const prematureEncoderRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    if (
      isHttp
      && url.hostname !== "127.0.0.1"
      && url.hostname !== "localhost"
    ) externalRequests.push(request.url());

    if (
      /aac-encoder|mediabunny-aac|\.wasm(?:$|\?)/i.test(request.url())
    ) prematureEncoderRequests.push(request.url());
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.endsWith(".wav")) {
      waves.push({ url: response.url(), status: response.status() });
    }
  });

  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".stage-frame")).toHaveAttribute(
    "data-context",
    /ready|restored/,
  );

  // The editor can render and restore before it pays for either foley bytes or
  // the software AAC encoder.
  await page.waitForTimeout(800);
  expect(waves).toEqual([]);
  expect(prematureEncoderRequests).toEqual([]);

  await page.getByLabel("Open sound direction controls").click();
  await expect(page.getByText("armed", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect.poll(() => waves.length).toBeGreaterThan(0);

  // First intent loads only passage/settle essentials, not the complete 23-file
  // corpus or any remote sound host.
  expect(waves.length).toBeLessThan(23);
  const origin = new URL(page.url()).origin;
  for (const wave of waves) {
    const url = new URL(wave.url);
    expect(url.origin).toBe(origin);
    expect(wave.status).toBe(200);
    expect(url.pathname).toMatch(/-[A-Za-z0-9_-]{8,}\.wav$/);
  }
  expect(externalRequests).toEqual([]);
  expect(prematureEncoderRequests).toEqual([]);
});
