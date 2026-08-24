import { expect, test } from "@playwright/test";

test("Atelier backgrounds render, move gently, close their loop, and survive both stage axes", async ({ page }) => {
  const renderErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") renderErrors.push(message.text());
  });

  await page.goto("/");
  const records = await page.evaluate(async () => {
    const [
      { BACKGROUND_STUDIES },
      { CinematicCarousel },
      { DEFAULT_SETTINGS, cloneSettings, createCompatibilityPerformanceLifecycle },
    ] = await Promise.all([
      import("/src/backgrounds.ts"),
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/model.ts"),
    ]);

    const atelier = BACKGROUND_STUDIES.filter((study) => study.family === "atelier");
    const ratios = [
      { id: "9:16", width: 270, height: 480 },
      { id: "16:9", width: 480, height: 270 },
    ] as const;

    const decode = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none" });
      const surface = document.createElement("canvas");
      surface.width = bitmap.width;
      surface.height = bitmap.height;
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("2D readback unavailable.");
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
      bitmap.close();
      return { pixels, width: surface.width, height: surface.height };
    };

    const hash = async (blob: Blob) => Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");

    const statistics = (pixels: Uint8ClampedArray) => {
      let luminance = 0;
      let luminanceSquared = 0;
      let alphaMin = 255;
      const pixelCount = pixels.length / 4;
      for (let index = 0; index < pixels.length; index += 4) {
        const value = pixels[index]! * 0.2126 + pixels[index + 1]! * 0.7152 + pixels[index + 2]! * 0.0722;
        luminance += value;
        luminanceSquared += value * value;
        alphaMin = Math.min(alphaMin, pixels[index + 3]!);
      }
      const mean = luminance / pixelCount;
      return {
        mean,
        spread: Math.sqrt(Math.max(0, luminanceSquared / pixelCount - mean * mean)),
        alphaMin,
      };
    };

    const difference = (left: Uint8ClampedArray, right: Uint8ClampedArray) => {
      let total = 0;
      let channels = 0;
      for (let index = 0; index < left.length; index += 4) {
        total += Math.abs(left[index]! - right[index]!);
        total += Math.abs(left[index + 1]! - right[index + 1]!);
        total += Math.abs(left[index + 2]! - right[index + 2]!);
        channels += 3;
      }
      return total / channels;
    };

    const output = [];
    for (const ratio of ratios) {
      const settingsFor = (study: (typeof atelier)[number]) => {
        const settings = cloneSettings(DEFAULT_SETTINGS);
        settings.stage = { width: ratio.width, height: ratio.height, transparent: false };
        settings.output = { ...settings.output, width: ratio.width, height: ratio.height, duration: 8 };
        settings.performance = createCompatibilityPerformanceLifecycle(8, false);
        settings.motion = {
          ...settings.motion,
          autoplay: false,
          seamless: true,
          seamlessLoops: 1,
          reducedMotionOutput: false,
        };
        settings.background = { ...study.background, grain: 0 };
        return settings;
      };

      const canvas = document.createElement("canvas");
      document.body.append(canvas);
      const engine = new CinematicCarousel(canvas, { kind: "v1-compat", settings: settingsFor(atelier[0]!) });
      engine.stop();
      try {
        for (const study of atelier) {
          engine.setV1Settings(settingsFor(study));
          const restBlob = await engine.captureStill(ratio.width, ratio.height, 0);
          const movedBlob = await engine.captureStill(ratio.width, ratio.height, 2);
          const loopBlob = await engine.captureStill(ratio.width, ratio.height, 8);
          const [rest, moved] = await Promise.all([decode(restBlob), decode(movedBlob)]);
          output.push({
            study: study.id,
            ratio: ratio.id,
            width: rest.width,
            height: rest.height,
            ...statistics(rest.pixels),
            motionDelta: difference(rest.pixels, moved.pixels),
            restHash: await hash(restBlob),
            movedHash: await hash(movedBlob),
            loopHash: await hash(loopBlob),
          });
        }
      } finally {
        engine.dispose();
        canvas.remove();
      }
    }
    return output;
  });

  expect(records).toHaveLength(16);
  expect(new Set(records.map((record) => record.restHash)).size).toBe(records.length);
  for (const record of records) {
    expect([record.width, record.height]).toEqual(record.ratio === "9:16" ? [270, 480] : [480, 270]);
    expect(record.alphaMin).toBe(255);
    expect(record.mean).toBeGreaterThan(12);
    expect(record.mean).toBeLessThan(246);
    expect(record.spread).toBeGreaterThan(2);
    expect(record.motionDelta).toBeGreaterThan(0.002);
    expect(record.motionDelta).toBeLessThan(8);
    expect(record.movedHash).not.toBe(record.restHash);
    expect(record.loopHash).toBe(record.restHash);
  }
  expect(renderErrors.filter((message) => /shader|webgl|gl_invalid|three\.webglprogram/i.test(message))).toEqual([]);
});

test("Atelier is reachable through the real V2 background browser", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
  await page.getByRole("button", { name: "WORLD", exact: true }).click();

  const atmosphere = page.locator("details.inspector-group").filter({
    has: page.locator("summary", { hasText: "Atmosphere" }),
  }).first();
  await expect(atmosphere).toBeVisible();
  const browser = atmosphere.locator("details.background-browser");
  if (!(await browser.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await browser.locator("summary").click();
  }
  await browser.getByRole("combobox", { name: "Family", exact: true }).selectOption("atelier");
  const picker = browser.getByRole("combobox", { name: "8 matching backgrounds" });
  await expect(picker.locator("option")).toHaveCount(9);
  await picker.selectOption("saffron-anatomy-study");

  await expect(atmosphere.getByLabel("Background", { exact: true })).toHaveValue("atelier");
  await expect(atmosphere.getByLabel("Composition", { exact: true })).toHaveValue("0");
  await expect(atmosphere.getByLabel("Palette", { exact: true })).toHaveValue("saffron-manuscript");
  await expect(picker).toHaveValue("saffron-anatomy-study");
});
