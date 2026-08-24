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

test("the real V2 background browser starts curated, previews without applying, and keeps the atlas one action away", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
  await page.getByRole("button", { name: "LOOK", exact: true }).click();

  const atmosphere = page.locator(".inspector-group").filter({
    has: page.locator(":scope > .inspector-group-trigger > span", { hasText: /^Background$/ }),
  });
  await expect(atmosphere).toBeVisible();
  const browser = atmosphere.locator(".visual-background-browser");
  await expect(browser.getByRole("heading", { name: "Choose a background" })).toBeVisible();
  await expect(browser).toHaveAttribute("data-browser-mode", "curated");
  await expect(browser.locator(".background-study-card")).toHaveCount(12);
  expect(await browser.locator(".background-study-card").evaluateAll((cards) => cards.map((card) => card.getAttribute("data-background-id")))).toEqual([
    "transparent",
    "black-leader",
    "cotton-rag",
    "road-memory-field",
    "projector-bloom",
    "contact-sheet",
    "breathing-slit-study",
    "contour-notes-study",
    "quiet-thirds-study",
    "tidal-horizon-study",
    "verdigris-fresco-study",
    "rose-madder-bloom-study",
  ]);
  expect(new Set(await browser.locator(".background-study-card .background-preview[data-family]").evaluateAll((previews) => (
    previews.map((preview) => preview.getAttribute("data-family"))
  ))).size).toBe(9);

  const verdigris = browser.getByRole("button", { name: /^Verdigris Fresco\./ });
  await expect(verdigris).toHaveAttribute("aria-pressed", "false");
  await verdigris.hover();
  await expect(browser.getByText("PREVIEW · NOT APPLIED", { exact: true })).toBeVisible();
  await expect(browser.getByText("Verdigris Fresco", { exact: true }).first()).toBeVisible();
  await expect(atmosphere.getByLabel("Background", { exact: true })).not.toHaveValue("atelier");
  await verdigris.click();
  await expect(atmosphere.getByLabel("Background", { exact: true })).toHaveValue("atelier");
  await expect(verdigris).toHaveAttribute("aria-pressed", "true");
  await expect(browser.getByText("ON CANVAS", { exact: true })).toBeVisible();

  await browser.getByRole("button", { name: /Browse all backgrounds/i }).click();
  await expect(browser).toHaveAttribute("data-browser-mode", "all");
  await expect(browser.getByRole("heading", { name: "All backgrounds" })).toBeVisible();
  await expect(browser.locator(".background-study-card")).toHaveCount(73);
  await browser.getByRole("combobox", { name: "Visual family", exact: true }).selectOption("atelier");
  await expect(browser.locator(".background-study-card")).toHaveCount(8);
  const saffron = browser.getByRole("button", { name: /^Saffron Anatomy\./ });
  await expect(saffron.locator(".background-preview")).toBeVisible();
  await saffron.click();

  await expect(atmosphere.getByLabel("Background", { exact: true })).toHaveValue("atelier");
  await page.locator(".workspace-advanced-trigger").click();
  const tuning = page.locator(".inspector-group").filter({
    has: page.locator(":scope > .inspector-group-trigger > span", { hasText: /^Background tuning$/ }),
  });
  await tuning.locator(":scope > .inspector-group-trigger").click();
  await expect(tuning.getByLabel("Composition", { exact: true })).toHaveValue("0");
  await expect(tuning.getByLabel("Palette", { exact: true })).toHaveValue("saffron-manuscript");
  await expect(saffron).toHaveAttribute("aria-pressed", "true");
  await expect(browser.getByText("Saffron Anatomy", { exact: true }).first()).toBeVisible();

  await browser.getByRole("searchbox", { name: "Find a look" }).fill("botanical");
  await expect(browser.locator(".background-study-card")).toHaveCount(1);
  await expect(browser.getByRole("button", { name: /^Indigo Botanical\./ })).toBeVisible();
  await browser.getByRole("button", { name: "Clear filters" }).click();
  await expect(browser.locator(".background-study-card")).toHaveCount(73);

  const scrollAuthority = await browser.locator(".background-study-grid").evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    workspaceScrollOwner: element.closest(".workspace-scroll")?.classList.contains("workspace-scroll") ?? false,
  }));
  expect(scrollAuthority).toEqual({ overflowY: "visible", workspaceScrollOwner: true });

  await browser.getByRole("button", { name: /Curated shelf/i }).click();
  await expect(browser.locator(".background-study-card")).toHaveCount(12);
  await expect(browser.getByRole("searchbox", { name: "Find a look" })).toHaveCount(0);

  const portraitPreview = await browser.locator(".background-card-stage .background-preview").first().boundingBox();
  expect(portraitPreview).not.toBeNull();
  expect(portraitPreview!.width / portraitPreview!.height).toBeCloseTo(9 / 16, 1);

  await page.getByRole("button", { name: "EXPORT", exact: true }).click();
  await page.getByRole("group", { name: "Stage ratio", exact: true }).getByText("16:9", { exact: true }).click();
  await page.getByRole("button", { name: "LOOK", exact: true }).click();
  const landscapePreview = await page.locator(".visual-background-browser .background-card-stage .background-preview").first().boundingBox();
  expect(landscapePreview).not.toBeNull();
  expect(landscapePreview!.width / landscapePreview!.height).toBeCloseTo(16 / 9, 1);

  await page.setViewportSize({ width: 390, height: 844 });
  const cards = page.locator(".visual-background-browser .background-study-card");
  const [first, second] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(first!.width).toBeGreaterThan(145);
  expect(first!.height).toBeGreaterThan(120);
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
  expect(second!.x).toBeGreaterThan(first!.x);
});
