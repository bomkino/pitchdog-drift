import { createHash } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

async function setRange(page: Page, label: string, value: number): Promise<void> {
  await page.getByRole("slider", { name: label, exact: true }).evaluate(
    (node, nextValue) => {
      const input = node as HTMLInputElement;
      input.value = String(nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    value,
  );
}

async function digest(locator: Locator): Promise<string> {
  const bytes = await locator.screenshot({ animations: "disabled" });
  return createHash("sha256").update(bytes).digest("hex");
}

async function openGroup(page: Page, title: string): Promise<void> {
  const group = page.locator("details").filter({
    has: page.locator("summary", { hasText: title }),
  });
  if (!(await group.evaluate((node) => (node as HTMLDetailsElement).open))) {
    await group.locator("summary").click();
  }
}

test("spatial controls form one tactile, pause-stable rendered system", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);
  const canvas = page.locator("[data-testid=webgl-stage]");
  await page.getByRole("combobox", { name: "Path", exact: true }).selectOption("helix");
  await page.getByRole("combobox", { name: "Motion character", exact: true }).selectOption("spring");
  await openGroup(page, "Surface");
  await openGroup(page, "Atmosphere");
  await page.getByRole("combobox", { name: "Material", exact: true }).selectOption("silk");
  await setRange(page, "Speed", 0);
  await setRange(page, "Curve", 82);
  await setRange(page, "Depth", 72);
  await setRange(page, "Path banking", 90);
  await setRange(page, "Fabric flex", 76);
  await setRange(page, "3D thickness", 18);
  await setRange(page, "Background breath", 0);
  await setRange(page, "Grain", 0);

  await page.getByRole("button", { name: "Pause preview" }).click();
  await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible();
  const pausedA = await digest(canvas);
  await page.waitForTimeout(350);
  const pausedB = await digest(canvas);
  expect(pausedB).toBe(pausedA);

  const materialDigests = new Set<string>();
  for (const surface of ["card", "paper", "silk", "gel"]) {
    await page.getByRole("combobox", { name: "Material", exact: true }).selectOption(surface);
    await page.waitForTimeout(80);
    materialDigests.add(await digest(canvas));
  }
  expect(materialDigests.size).toBe(4);

  await setRange(page, "3D thickness", 0);
  const flat = await digest(canvas);
  await setRange(page, "3D thickness", 24);
  const thick = await digest(canvas);
  expect(thick).not.toBe(flat);

  await page.getByRole("button", { name: "Play preview" }).click();
  const beforeDrag = await digest(canvas);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * 0.54;
  const y = box!.y + box!.height * 0.48;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute("data-dragging", "true");
  await page.mouse.move(x + box!.width * 0.18, y - box!.height * 0.12, { steps: 8 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute("data-dragging", "false");
  await page.waitForTimeout(120);
  const afterDrag = await digest(canvas);
  expect(afterDrag).not.toBe(beforeDrag);
  expect(errors).toEqual([]);
});

test("spatial help copy explains consequences instead of exposing mystery knobs", async ({ page }) => {
  await waitForStudio(page);
  await page.getByRole("combobox", { name: "Path", exact: true }).selectOption("arc");
  await expect(page.getByText("A one-sided cinematic bow; useful for calm lateral travel."))
    .toBeVisible();
  await page.getByRole("combobox", { name: "Path", exact: true }).selectOption("switchback");
  await expect(page.getByText("Harder lateral reversals with depth carried through every turn."))
    .toBeVisible();

  await page.getByRole("combobox", { name: "Motion character", exact: true }).selectOption("drift");
  await expect(page.getByText("Long hand coast; the master breathes broadly around its mean pace."))
    .toBeVisible();

  const surfaceGroup = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Surface" }),
  });
  await surfaceGroup.locator("summary").click();
  await page.getByRole("combobox", { name: "Material", exact: true }).selectOption("gel");
  await expect(page.getByText("Elastic mass: impulse lags behind the hand, with restrained gloss."))
    .toBeVisible();
});

test("exported motion character changes actual pixels and closes seamlessly", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");

  const receipt = await page.evaluate(async () => {
    const importModule = new Function("path", "return import(path)") as (
      path: string,
    ) => Promise<Record<string, any>>;
    const [{ CinematicCarousel }, { DEFAULT_SETTINGS }] = await Promise.all([
      importModule("/src/engine/CinematicCarousel.ts"),
      importModule("/src/model.ts"),
    ]);

    const stage = document.createElement("canvas");
    stage.width = 256;
    stage.height = 256;
    stage.style.width = "256px";
    stage.style.height = "256px";
    stage.style.position = "fixed";
    stage.style.left = "-10000px";
    document.body.append(stage);

    const urls: string[] = [];
    let engine: any = null;
    const hashBlob = async (blob: Blob): Promise<string> => {
      const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    };
    const makeAsset = async (
      index: number,
      ground: string,
      accent: string,
    ): Promise<Record<string, any>> => {
      const source = document.createElement("canvas");
      source.width = 256;
      source.height = 144;
      const context = source.getContext("2d");
      if (!context) throw new Error("Could not create deterministic test artwork.");
      context.fillStyle = ground;
      context.fillRect(0, 0, source.width, source.height);
      context.fillStyle = accent;
      context.fillRect(18 + index * 11, 18, 54, 108);
      context.fillRect(96, 20 + index * 9, 136, 28);
      context.beginPath();
      context.arc(168, 92, 20 + index * 4, 0, Math.PI * 2);
      context.fill();
      const blob = await new Promise<Blob>((resolve, reject) => {
        source.toBlob(
          (value) => value ? resolve(value) : reject(new Error("Could not encode test artwork.")),
          "image/png",
        );
      });
      const objectUrl = URL.createObjectURL(blob);
      urls.push(objectUrl);
      return {
        id: `spatial-export-${index}`,
        name: `spatial-export-${index}.png`,
        kind: "image",
        blob,
        mimeType: "image/png",
        width: source.width,
        height: source.height,
        hash: `spatial-export-${index}`,
        objectUrl,
      };
    };

    try {
      const assets = await Promise.all([
        makeAsset(0, "#160d1d", "#ff6b6b"),
        makeAsset(1, "#081c2b", "#4dd9ff"),
        makeAsset(2, "#1b210d", "#d5ff63"),
        makeAsset(3, "#22140a", "#ffb14d"),
      ]);
      const settings = structuredClone(DEFAULT_SETTINGS);
      settings.stage = { width: 256, height: 256, transparent: false };
      settings.output = {
        ...settings.output,
        width: 256,
        height: 256,
        duration: 4,
        fps: 24,
      };
      settings.motion = {
        ...settings.motion,
        axis: "horizontal",
        direction: 1,
        autoplay: false,
        speed: 0.56,
        flow: "helix",
        dynamics: "direct",
        gap: 0.18,
        curvature: 0.92,
        depth: 0.72,
        tilt: 4,
        bank: 0.9,
        distortion: 0.78,
        focusScale: 0.08,
        edgeFade: 0.14,
        seamless: true,
        seamlessLoops: 1,
        reducedMotionOutput: false,
      };
      settings.slide = {
        ...settings.slide,
        scale: 0.64,
        surface: "silk",
        thickness: 14,
        radius: 16,
        smoothing: 0.72,
        shadowOpacity: 0.22,
        shadowSoftness: 24,
      };
      settings.background = {
        ...settings.background,
        style: "solid",
        colorA: "#050505",
        colorB: "#050505",
        accent: "#050505",
        intensity: 0,
        motion: 0,
        grain: 0,
        vignette: 0,
      };

      engine = new CinematicCarousel(stage, structuredClone(settings));
      engine.setPaused(true);
      await engine.setAssets(assets);

      const capture = async (mode: string, time: number): Promise<string> => {
        const next = structuredClone(settings);
        next.motion.dynamics = mode;
        engine.setSettings(next);
        return hashBlob(await engine.captureStill(256, 256, time));
      };

      const directMid = await capture("direct", settings.output.duration * 0.1875);
      const springMid = await capture("spring", settings.output.duration * 0.1875);
      const springStart = await capture("spring", 0);
      const springEnd = await capture("spring", settings.output.duration);
      return { directMid, springMid, springStart, springEnd };
    } finally {
      engine?.dispose();
      for (const url of urls) URL.revokeObjectURL(url);
      stage.remove();
    }
  });

  expect(receipt.directMid).not.toBe(receipt.springMid);
  expect(receipt.springStart).toBe(receipt.springEnd);
});
