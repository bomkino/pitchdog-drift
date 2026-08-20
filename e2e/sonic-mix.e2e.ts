import { expect, test } from "@playwright/test";

test("mixed master preserves stereo foley through mono presenter gaps", async ({ page }) => {
  await page.goto("/");
  const receipt = await page.evaluate(async () => {
    const [{ exportMp4 }, fixture] = await Promise.all([
      import("/src/lib/exportStudio.ts"),
      import("/e2e/sonicMixFixture.ts"),
    ]);
    const duration = 3;
    const sampleRate = 48_000;
    const presenter = await fixture.createGappedMonoPresenter();
    const soundtrack = new AudioBuffer({
      length: duration * sampleRate,
      numberOfChannels: 2,
      sampleRate,
    });

    // The presenter contains no packets from 0.5s through 2.5s. Put a
    // right-weighted authored bed squarely inside that gap.
    const right = soundtrack.getChannelData(1);
    for (let frame = sampleRate; frame < sampleRate * 2; frame += 1) {
      const local = (frame - sampleRate) / sampleRate;
      const edge = Math.min(1, local / 0.03, (1 - local) / 0.03);
      right[frame] = Math.sin(local * Math.PI * 2 * 330) * 0.22 * Math.max(0, edge);
    }

    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create mixed-master export canvas.");

    const result = await exportMp4({
      canvas,
      presenter,
      includePresenterAudio: true,
      soundtrack,
      soundtrackGainWhenMixed: 1,
      settings: { width: 128, height: 128, fps: 24, duration },
      renderAt(time) {
        context.fillStyle = "#12100f";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#e9dfcf";
        context.fillRect(16 + Math.round(time * 8), 34, 48, 48);
      },
    });
    if (!result.blob) throw new Error("Mixed export returned no readable MP4.");

    return {
      source: result.audio?.source ?? null,
      verifiedAudio: result.verification.audio,
      inspection: await fixture.inspectAudioAt(result.blob, 1.5),
    };
  });

  expect(receipt.source).toBe("mixed");
  expect(receipt.verifiedAudio).not.toBeNull();
  expect(receipt.inspection.trackCount).toBe(1);
  expect(receipt.inspection.channels).toBe(2);
  expect(receipt.inspection.sampleRate).toBe(48_000);
  expect(receipt.inspection.duration).toBeCloseTo(3, 3);
  expect(receipt.inspection.coversTimestamp).toBe(true);
  expect(receipt.inspection.rightRms).toBeGreaterThan(0.035);
  expect(receipt.inspection.rightRms).toBeGreaterThan(
    receipt.inspection.leftRms * 2,
  );
});
