import { expect, test } from "@playwright/test";

interface RenderReceipt {
  palette: string;
  firstHash: number;
  secondHash: number;
  peak: number;
  rms: number;
  stereoDifference: number;
  layers: string[];
  filteredRoles: string[];
}

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);
}

test("organic editorial grammar renders finite deterministic stereo micro-Foley", async ({ page }) => {
  await waitForStudio(page);
  const receipts = await page.evaluate(async () => {
    const [{ DEFAULT_SETTINGS, cloneSettings }, { renderSonicSoundtrack }, grammar] = await Promise.all([
      import("/src/model.ts"),
      import("/src/sonic/renderSoundtrack.ts"),
      import("/src/sonic/grammar.ts"),
    ]);

    function hashBuffer(buffer: AudioBuffer): number {
      let hash = 0x811c9dc5;
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const data = buffer.getChannelData(channel);
        const stride = Math.max(1, Math.floor(data.length / 48_000));
        for (let index = 0; index < data.length; index += stride) {
          const quantized = Math.round(data[index]! * 1_000_000);
          hash ^= quantized;
          hash = Math.imul(hash, 0x01000193);
        }
      }
      return hash >>> 0;
    }

    const output: Array<{
      palette: string;
      firstHash: number;
      secondHash: number;
      peak: number;
      rms: number;
      stereoDifference: number;
      layers: string[];
      filteredRoles: string[];
    }> = [];
    for (const palette of ["studio", "cinematic", "paper"] as const) {
      const settings = cloneSettings(DEFAULT_SETTINGS);
      settings.sound.exportEnabled = true;
      settings.sound.palette = palette;
      settings.sound.density = 1;
      settings.sound.variation = 1;
      settings.motion.axis = "horizontal";
      settings.motion.speed = 0.43;
      settings.output.duration = 3.2;
      const [first, second] = await Promise.all([
        renderSonicSoundtrack(settings, 8, settings.output.duration),
        renderSonicSoundtrack(settings, 8, settings.output.duration),
      ]);
      if (!first || !second) throw new Error(`No ${palette} soundtrack was rendered.`);

      let peak = 0;
      let energy = 0;
      let samples = 0;
      let stereoDifference = 0;
      const left = first.getChannelData(0);
      const right = first.getChannelData(1);
      for (let index = 0; index < first.length; index += 1) {
        const l = left[index]!;
        const r = right[index]!;
        if (!Number.isFinite(l) || !Number.isFinite(r)) {
          throw new Error(`${palette} emitted non-finite PCM.`);
        }
        peak = Math.max(peak, Math.abs(l), Math.abs(r));
        energy += l * l + r * r;
        stereoDifference += Math.abs(l - r);
        samples += 2;
      }

      const forced = grammar.buildSonicGestureLayers({
        cue: "passage",
        palette,
        texture: 1,
        seed: 17,
        sequence: 5,
        intensity: 0.62,
        baseGain: 0.8,
        basePlaybackRate: 1,
        basePan: 0.5,
        baseVariant: 0,
        spatial: true,
        force: true,
      });
      output.push({
        palette,
        firstHash: hashBuffer(first),
        secondHash: hashBuffer(second),
        peak,
        rms: Math.sqrt(energy / samples),
        stereoDifference: stereoDifference / first.length,
        layers: forced.map((layer) => layer.role),
        filteredRoles: forced.filter((layer) => layer.filters.length > 0).map((layer) => layer.role),
      });
    }
    return output;
  }) as RenderReceipt[];

  expect(receipts).toHaveLength(3);
  for (const receipt of receipts) {
    expect(receipt.firstHash).toBe(receipt.secondHash);
    expect(receipt.peak).toBeGreaterThan(0.015);
    expect(receipt.peak).toBeLessThanOrEqual(1);
    expect(receipt.rms).toBeGreaterThan(0.001);
    expect(receipt.rms).toBeLessThan(0.28);
    expect(receipt.stereoDifference).toBeGreaterThan(0.00005);
    expect(receipt.layers).toEqual(["body", "air", "contact", "landing"]);
    expect(receipt.filteredRoles).toEqual(["air", "contact", "landing"]);
  }
  expect(new Set(receipts.map((receipt) => receipt.firstHash)).size).toBe(3);
});

test("sound direction exposes editorial material and texture controls without clipping", async ({ page }) => {
  await waitForStudio(page);
  await page.getByLabel("Open sound direction controls").click();
  await expect(page.getByRole("group", { name: "Sound direction" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Editorial", exact: true })).toBeChecked();
  await expect(page.getByRole("slider", { name: "Texture", exact: true })).toBeVisible();
  await expect(page.getByText("Every edit gets a physical cause.", { exact: true })).toBeVisible();

  const geometry = await page.locator(".sonic-popover").evaluate((popover) => {
    const box = popover.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: window.innerWidth,
      height: window.innerHeight,
      scrollHeight: popover.scrollHeight,
      clientHeight: popover.clientHeight,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
});
