import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixturePath = path.resolve("e2e/fixtures/slide.png");

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("all authored worlds and motion paths stay operable and console-clean", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);

  const worldCards = page.locator(".theme-card");
  await expect(worldCards).toHaveCount(18);
  for (const name of ["Projector Bloom", "Lunar Signal", "Body Static", "Daylight Intimacy"]) {
    const world = page.getByRole("button", { name: new RegExp(`^${name}\\.`) });
    await world.click();
    await expect(world).toHaveAttribute("aria-pressed", "true");
  }

  const pathSelect = page.getByRole("combobox", { name: "Path" });
  await expect(pathSelect.locator("option")).toHaveCount(8);
  for (const flow of ["straight", "arc", "ribbon", "cylinder", "tunnel", "helix", "cascade", "orbit"]) {
    await pathSelect.selectOption(flow);
    await expect(pathSelect).toHaveValue(flow);
  }

  await expect(page.getByRole("switch", { name: "Autoplay" })).toHaveCount(0);
  const atmosphere = page.locator("details").filter({ has: page.locator("summary", { hasText: "Atmosphere" }) });
  await atmosphere.locator("summary").click();
  const variation = page.getByLabel("World variation");
  await variation.fill("9876");
  await variation.blur();
  await expect(variation).toHaveValue("9876");

  const lensResponse = page.getByRole("slider", { name: "Lens response" });
  await lensResponse.evaluate((input) => {
    const range = input as HTMLInputElement;
    range.value = "78";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(lensResponse).toHaveValue("78");
  expect(errors).toEqual([]);
});

test("reduced-motion frames are exact and seamless cinematic frames close at the cut", async ({ page }) => {
  await page.goto("/");
  const encodedSlide = (await readFile(fixturePath)).toString("base64");

  const receipt = await page.evaluate(async (encoded) => {
    const [{ CinematicCarousel }, { DEFAULT_SETTINGS }] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
    ]);

    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);
    const objectUrl = URL.createObjectURL(blob);
    const asset = {
      id: "cinematic-loop-fixture",
      name: "slide.png",
      kind: "image" as const,
      blob,
      mimeType: "image/png",
      width: bitmap.width,
      height: bitmap.height,
      objectUrl,
    };
    bitmap.close();

    async function compare(reducedMotionOutput: boolean) {
      const settings = structuredClone(DEFAULT_SETTINGS);
      settings.stage = { width: 256, height: 256, transparent: false };
      settings.output = { ...settings.output, width: 256, height: 256, fps: 24, duration: 4 };
      settings.motion = {
        ...settings.motion,
        axis: "horizontal",
        flow: "helix",
        speed: 0.72,
        curvature: 0.74,
        depth: 0.62,
        tilt: 12,
        distortion: 0.78,
        seamless: true,
        seamlessLoops: 2,
        reducedMotionOutput,
      };
      settings.slide = { ...settings.slide, scale: 0.64, radius: 28, smoothing: 0.6 };
      settings.background = {
        ...settings.background,
        style: "aura",
        colorA: "#05091a",
        colorB: "#101f55",
        accent: "#49c7e8",
        intensity: 0.9,
        motion: 0.64,
        grain: 0.18,
        vignette: 0.54,
        seed: 302,
      };

      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      document.body.append(canvas);
      const engine = new CinematicCarousel(canvas, settings);
      let surface: ReturnType<typeof engine.beginExport> | null = null;
      try {
        await engine.setAssets([asset]);
        surface = engine.beginExport(256, 256);
        const gl = canvas.getContext("webgl2", { alpha: true });
        if (!gl) throw new Error("WebGL2 readback unavailable.");

        const capture = async (time: number) => {
          await engine.renderAtAsync(time);
          gl.finish();
          const pixels = new Uint8Array(256 * 256 * 4);
          gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          return pixels;
        };

        const start = await capture(0);
        const end = await capture(settings.output.duration);
        let changedChannels = 0;
        let totalDelta = 0;
        let maximumDelta = 0;
        for (let index = 0; index < start.length; index += 1) {
          const delta = Math.abs(start[index]! - end[index]!);
          if (delta > 0) changedChannels += 1;
          totalDelta += delta;
          maximumDelta = Math.max(maximumDelta, delta);
        }
        return {
          changedChannels,
          meanDelta: totalDelta / start.length,
          maximumDelta,
          channelCount: start.length,
          startRgbEnergy: start.reduce((sum, value, index) => sum + (index % 4 === 3 ? 0 : value), 0),
        };
      } finally {
        surface?.restore();
        engine.dispose();
        canvas.remove();
      }
    }

    try {
      return {
        reduced: await compare(true),
        seamless: await compare(false),
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }, encodedSlide);

  expect(receipt.reduced.startRgbEnergy).toBeGreaterThan(1_000);
  expect(receipt.seamless.startRgbEnergy).toBeGreaterThan(1_000);
  expect(receipt.reduced).toMatchObject({ changedChannels: 0, meanDelta: 0, maximumDelta: 0 });
  expect(receipt.seamless.meanDelta).toBeLessThan(0.25);
  expect(receipt.seamless.maximumDelta).toBeLessThanOrEqual(16);
  expect(receipt.seamless.changedChannels / receipt.seamless.channelCount).toBeLessThan(0.05);
});
