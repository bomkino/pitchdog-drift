import { expect, test } from "@playwright/test";

const AAC_FRAME_SECONDS = 1_024 / 48_000;

test("mixed master preserves stereo foley and releases ducking through presenter gaps", async ({ page }) => {
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

    // Keep a right-weighted authored bed beneath the complete master. The
    // presenter contains packets during 0–0.5s and 2.5–3s, with a real two-
    // second gap. Under-voice gain should attenuate the bed at 0.25s and release
    // it to full presence by 1.5s without folding it into mono.
    const right = soundtrack.getChannelData(1);
    for (let frame = 0; frame < right.length; frame += 1) {
      const time = frame / sampleRate;
      const edge = Math.min(1, time / 0.03, (duration - time) / 0.03);
      right[frame] = Math.sin(time * Math.PI * 2 * 330) * 0.18 * Math.max(0, edge);
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
      soundtrackGainWhenMixed: 0.2,
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
      voice: await fixture.inspectAudioAt(result.blob, 0.25),
      gap: await fixture.inspectAudioAt(result.blob, 1.5),
    };
  });

  expect(receipt.source).toBe("mixed");
  expect(receipt.verifiedAudio).not.toBeNull();
  for (const inspection of [receipt.voice, receipt.gap]) {
    expect(inspection.trackCount).toBe(1);
    expect(inspection.channels).toBe(2);
    expect(inspection.sampleRate).toBe(48_000);
    expect(inspection.duration).toBeGreaterThanOrEqual(3);
    expect(inspection.duration).toBeLessThanOrEqual(
      3 + AAC_FRAME_SECONDS + 0.001,
    );
    expect(inspection.coversTimestamp).toBe(true);
  }

  // Presenter audio is present and mono at 0.25s; the right-only tactile bed is
  // deliberately attenuated there instead of competing with speech.
  expect(receipt.voice.leftRms).toBeGreaterThan(0.012);
  expect(receipt.voice.rightRms).toBeLessThan(receipt.gap.rightRms * 0.65);

  // In the genuine packet gap, the tactile bed recovers to full level and
  // retains its lateral authorship rather than being erased or centred.
  expect(receipt.gap.rightRms).toBeGreaterThan(0.07);
  expect(receipt.gap.leftRms).toBeLessThan(receipt.gap.rightRms * 0.2);
  expect(receipt.gap.rightRms).toBeGreaterThan(receipt.voice.rightRms * 1.5);
});
