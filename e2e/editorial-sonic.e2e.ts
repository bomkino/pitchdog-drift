import { expect, test, type Page } from "@playwright/test";

const AAC_FRAME_SECONDS = 1_024 / 48_000;

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".stage-frame")).toHaveAttribute(
    "data-context",
    /ready|restored/,
  );
  await expect(page.locator(".header-status")).toContainText("saved locally", {
    timeout: 30_000,
  });
}

async function waitForDurableSave(page: Page): Promise<void> {
  const status = page.locator(".header-status");
  // An old saved label may still be visible in the frame that commits the
  // radio change. Require the dirty transition before accepting persistence.
  await expect(status).toContainText("saving locally…", { timeout: 5_000 });
  await expect(status).toContainText("saved locally", { timeout: 15_000 });
}

test("Editorial is a balanced, persistent, local material direction", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:")
      && url.hostname !== "127.0.0.1"
      && url.hostname !== "localhost"
    ) externalRequests.push(request.url());
  });

  await waitForStudio(page);
  await page.getByLabel("Open sound direction controls").click();
  const direction = page.getByRole("group", { name: "Sound direction" });
  const palettes = direction.locator(".sonic-palettes");
  await expect(palettes.getByRole("radio")).toHaveCount(4);
  await expect(
    palettes.getByRole("radio", { name: "Editorial", exact: true }),
  ).toBeVisible();

  const layout = await palettes.evaluate((fieldset) => {
    const grid = fieldset.querySelector<HTMLElement>(":scope > div");
    const popover = fieldset.closest<HTMLElement>(".sonic-popover");
    if (!grid || !popover) throw new Error("Sound direction grid is missing.");
    const labels = [...grid.querySelectorAll<HTMLElement>("label")];
    const rectangles = labels.map((label) => label.getBoundingClientRect());
    const popoverRect = popover.getBoundingClientRect();
    return {
      columns: new Set(rectangles.map((rect) => Math.round(rect.left))).size,
      rows: new Set(rectangles.map((rect) => Math.round(rect.top))).size,
      horizontalOverflow: grid.scrollWidth > grid.clientWidth + 1,
      allInside: rectangles.every((rect) => (
        rect.left >= popoverRect.left - 1
        && rect.right <= popoverRect.right + 1
      )),
    };
  });
  expect(layout).toEqual({
    columns: 2,
    rows: 2,
    horizontalOverflow: false,
    allInside: true,
  });

  await palettes.getByRole("radio", {
    name: "Editorial",
    exact: true,
  }).check();
  await expect(palettes.getByRole("radio", {
    name: "Editorial",
    exact: true,
  })).toBeChecked();
  await waitForDurableSave(page);

  await page.reload();
  await expect(page.getByText("Local project reopened with verified media.")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel("Open sound direction controls").click();
  await expect(page.getByRole("radio", {
    name: "Editorial",
    exact: true,
  })).toBeChecked();
  expect(externalRequests).toEqual([]);
});

test("Editorial recipes remain deterministic, unclipped, stereo, and audible after MP4/AAC readback", async ({ page }) => {
  await page.goto("/");
  const receipt = await page.evaluate(async () => {
    const [
      model,
      renderer,
      planner,
      recipes,
      exporter,
      fixture,
    ] = await Promise.all([
      import("/src/model.ts"),
      import("/src/sonic/renderSoundtrack.ts"),
      import("/src/sonic/plan.ts"),
      import("/src/sonic/recipe.ts"),
      import("/src/lib/exportStudio.ts"),
      import("/e2e/editorialSonicFixture.ts"),
    ]);

    const duration = 3;
    const settings = model.cloneSettings(model.DEFAULT_SETTINGS);
    settings.stage = {
      width: 128,
      height: 128,
      transparent: false,
    };
    settings.output = {
      ...settings.output,
      width: 128,
      height: 128,
      fps: 24,
      duration,
    };
    settings.motion = {
      ...settings.motion,
      axis: "horizontal",
      direction: 1,
      autoplay: true,
      speed: 1.5,
      gap: 0.18,
      seamless: false,
      reducedMotionOutput: false,
    };
    settings.background = {
      ...settings.background,
      seed: 37,
      grain: 0,
      vignette: 0,
    };
    settings.sound = {
      ...settings.sound,
      previewEnabled: false,
      exportEnabled: true,
      palette: "editorial",
      masterGain: 0.42,
      motionGain: 0.55,
      density: 1,
      variation: 0.67,
    };

    const first = await renderer.renderSonicSoundtrack(
      settings,
      8,
      duration,
    );
    const second = await renderer.renderSonicSoundtrack(
      settings,
      8,
      duration,
    );
    if (!first || !second) {
      throw new Error("Editorial rendering returned no audible buffer.");
    }

    const measure = (buffer: AudioBuffer) => {
      let hash = 2_166_136_261;
      let peak = 0;
      let squareSum = 0;
      let sideSquare = 0;
      let activeFrames = 0;
      let finite = true;
      for (let frame = 0; frame < buffer.length; frame += 1) {
        const left = buffer.getChannelData(0)[frame] ?? 0;
        const right = buffer.getChannelData(1)[frame] ?? left;
        if (!Number.isFinite(left) || !Number.isFinite(right)) {
          finite = false;
          continue;
        }
        const framePeak = Math.max(Math.abs(left), Math.abs(right));
        peak = Math.max(peak, framePeak);
        if (framePeak > 0.0001) activeFrames += 1;
        squareSum += (left * left + right * right) * 0.5;
        const side = (left - right) * 0.5;
        sideSquare += side * side;
        const leftInt = Math.round(Math.max(-1, Math.min(1, left)) * 32_767);
        const rightInt = Math.round(Math.max(-1, Math.min(1, right)) * 32_767);
        hash ^= leftInt & 0xffff;
        hash = Math.imul(hash, 16_777_619);
        hash ^= rightInt & 0xffff;
        hash = Math.imul(hash, 16_777_619);
      }
      return {
        channels: buffer.numberOfChannels,
        sampleRate: buffer.sampleRate,
        length: buffer.length,
        finite,
        fingerprint: hash >>> 0,
        peak,
        rms: Math.sqrt(squareSum / buffer.length),
        sideRms: Math.sqrt(sideSquare / buffer.length),
        activeRatio: activeFrames / buffer.length,
      };
    };

    let maximumDelta = 0;
    for (let channel = 0; channel < first.numberOfChannels; channel += 1) {
      const left = first.getChannelData(channel);
      const right = second.getChannelData(channel);
      for (let frame = 0; frame < first.length; frame += 1) {
        maximumDelta = Math.max(
          maximumDelta,
          Math.abs((left[frame] ?? 0) - (right[frame] ?? 0)),
        );
      }
    }

    const events = planner.buildSonicTimeline(settings, 8, duration)
      .filter((event) => event.cue === "passage");
    const contactEvent = events.find((event) => recipes.buildSonicRecipe({
      palette: settings.sound.palette,
      cue: event.cue,
      seed: settings.background.seed,
      sequence: event.sequence,
      variant: event.variant,
      gain: event.gain,
      playbackRate: event.playbackRate,
      pan: event.pan,
    }).some((layer) => layer.role === "contact"));
    if (!contactEvent) {
      throw new Error("Editorial timeline did not contain its sparse contact beat.");
    }
    const contactRecipe = recipes.buildSonicRecipe({
      palette: settings.sound.palette,
      cue: contactEvent.cue,
      seed: settings.background.seed,
      sequence: contactEvent.sequence,
      variant: contactEvent.variant,
      gain: contactEvent.gain,
      playbackRate: contactEvent.playbackRate,
      pan: contactEvent.pan,
    });

    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create Editorial export canvas.");
    const result = await exporter.exportMp4({
      canvas,
      soundtrack: first,
      settings: { width: 128, height: 128, fps: 24, duration },
      renderAt(time) {
        context.fillStyle = "#171310";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#eee4d4";
        context.fillRect(18 + Math.round(time * 11), 35, 48, 48);
      },
    });
    if (!result.blob) throw new Error("Editorial export returned no MP4 bytes.");

    return {
      first: measure(first),
      second: measure(second),
      maximumDelta,
      passageCount: events.length,
      contact: {
        sequence: contactEvent.sequence,
        time: contactEvent.time,
        roles: contactRecipe.map((layer) => layer.role),
        delays: contactRecipe.map((layer) => layer.delay),
      },
      exportSource: result.audio?.source ?? null,
      verifiedAudio: result.verification.audio,
      inspection: await fixture.inspectAudioWindow(
        result.blob,
        Math.max(0, contactEvent.time - 0.015),
        0.24,
      ),
    };
  });

  // Web Audio can differ by sub-nanoscopic float accumulation while producing
  // the same quantized PCM. Fingerprint and per-sample delta are the actual
  // determinism contract; RMS comparisons therefore use numeric tolerance.
  expect(receipt.first.fingerprint).toBe(receipt.second.fingerprint);
  expect(receipt.first.channels).toBe(receipt.second.channels);
  expect(receipt.first.sampleRate).toBe(receipt.second.sampleRate);
  expect(receipt.first.length).toBe(receipt.second.length);
  expect(receipt.first.finite).toBe(receipt.second.finite);
  expect(receipt.first.activeRatio).toBe(receipt.second.activeRatio);
  expect(receipt.first.peak).toBeCloseTo(receipt.second.peak, 10);
  expect(receipt.first.rms).toBeCloseTo(receipt.second.rms, 10);
  expect(receipt.first.sideRms).toBeCloseTo(receipt.second.sideRms, 10);
  expect(receipt.maximumDelta).toBeLessThan(1e-8);
  expect(receipt.first.channels).toBe(2);
  expect(receipt.first.sampleRate).toBe(48_000);
  expect(receipt.first.length).toBe(144_000);
  expect(receipt.first.finite).toBe(true);
  expect(receipt.first.peak).toBeGreaterThan(0.005);
  expect(receipt.first.peak).toBeLessThan(0.98);
  expect(receipt.first.rms).toBeGreaterThan(0.0005);
  expect(receipt.first.sideRms).toBeGreaterThan(0.00005);
  expect(receipt.first.activeRatio).toBeGreaterThan(0.01);
  expect(receipt.first.activeRatio).toBeLessThan(0.65);
  expect(receipt.passageCount).toBeGreaterThanOrEqual(4);
  expect(receipt.contact.roles).toEqual(["body", "fibre", "contact"]);
  expect(receipt.contact.delays[0]).toBe(0);
  expect(receipt.contact.delays[1]).toBeGreaterThan(0);
  expect(receipt.contact.delays[2]).toBeGreaterThan(
    receipt.contact.delays[1]!,
  );

  expect(receipt.exportSource).toBe("sound-design");
  expect(receipt.verifiedAudio).not.toBeNull();
  expect(receipt.inspection.trackCount).toBe(1);
  expect(receipt.inspection.channels).toBe(2);
  expect(receipt.inspection.sampleRate).toBe(48_000);
  expect(receipt.inspection.trackDuration).toBeGreaterThanOrEqual(3);
  expect(receipt.inspection.trackDuration).toBeLessThanOrEqual(
    3 + AAC_FRAME_SECONDS + 0.001,
  );
  expect(receipt.inspection.frameCount).toBeGreaterThan(0);
  expect(receipt.inspection.finite).toBe(true);
  expect(receipt.inspection.peak).toBeGreaterThan(0.002);
  expect(receipt.inspection.peak).toBeLessThan(1.05);
  expect(receipt.inspection.combinedRms).toBeGreaterThan(0.0002);
  expect(receipt.inspection.sideRms).toBeGreaterThan(0.00001);
});
