import { expect, test, type Page } from "@playwright/test";

type LoggedCue = {
  cue: string;
  intensity: number | null;
  pan: number | null;
};

type SonicAuditWindow = Window & typeof globalThis & {
  __driftSonicCues?: LoggedCue[];
  __driftSonicLifecycle?: string[];
};

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".stage-frame")).toHaveAttribute(
    "data-context",
    /ready|restored/,
  );
  await expect(page.locator(".fallback-stage")).toHaveCount(0);
}

async function armPreview(page: Page): Promise<void> {
  await page.getByLabel("Open sound direction controls").click();
  await expect(page.getByText("armed", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

async function installCueAudit(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const auditWindow = window as SonicAuditWindow;
    const { SonicEngine } = await import("/src/sonic/SonicEngine.ts");
    const prototype = SonicEngine.prototype as SonicEngine["prototype"] & {
      __driftAuditOriginalPlay?: SonicEngine["play"];
    };
    if (!prototype.__driftAuditOriginalPlay) {
      prototype.__driftAuditOriginalPlay = prototype.play;
      prototype.play = function auditedPlay(cue, gesture = {}) {
        const target = window as SonicAuditWindow;
        target.__driftSonicCues ??= [];
        target.__driftSonicCues.push({
          cue,
          intensity: gesture.intensity ?? null,
          pan: gesture.pan ?? null,
        });
        return prototype.__driftAuditOriginalPlay!.call(this, cue, gesture);
      };
    }
    auditWindow.__driftSonicCues = [];
  });
}

async function installLifecycleAudit(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const auditWindow = window as SonicAuditWindow;
    const { SonicEngine } = await import("/src/sonic/SonicEngine.ts");
    const prototype = SonicEngine.prototype as SonicEngine["prototype"] & {
      __driftAuditLifecyclePlay?: SonicEngine["play"];
      __driftAuditOriginalSuppression?: SonicEngine["setSuppressed"];
    };
    if (!prototype.__driftAuditLifecyclePlay) {
      prototype.__driftAuditLifecyclePlay = prototype.play;
      prototype.play = function auditedLifecyclePlay(cue, gesture = {}) {
        const target = window as SonicAuditWindow;
        target.__driftSonicLifecycle ??= [];
        target.__driftSonicLifecycle.push(`play:${cue}`);
        return prototype.__driftAuditLifecyclePlay!.call(this, cue, gesture);
      };
    }
    if (!prototype.__driftAuditOriginalSuppression) {
      prototype.__driftAuditOriginalSuppression = prototype.setSuppressed;
      prototype.setSuppressed = function auditedSuppression(suppressed) {
        const target = window as SonicAuditWindow;
        target.__driftSonicLifecycle ??= [];
        target.__driftSonicLifecycle.push(`suppressed:${suppressed}`);
        return prototype.__driftAuditOriginalSuppression!.call(this, suppressed);
      };
    }
    auditWindow.__driftSonicLifecycle = [];
  });
}

async function clearCues(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as SonicAuditWindow).__driftSonicCues = [];
  });
}

async function cues(page: Page): Promise<LoggedCue[]> {
  return await page.evaluate(() => [
    ...((window as SonicAuditWindow).__driftSonicCues ?? []),
  ]);
}

function countCue(events: readonly LoggedCue[], cue: string): number {
  return events.filter((event) => event.cue === cue).length;
}

test("tactile sound follows one restrained editor journey from gesture to export", async ({ page }) => {
  await waitForStudio(page);
  await armPreview(page);

  const mute = page.getByRole("button", { name: "Mute tactile preview sound" });
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await mute.click();
  const enable = page.getByRole("button", { name: "Enable tactile preview sound" });
  await expect(enable).toHaveAttribute("aria-pressed", "false");
  await enable.click();
  await expect(page.getByText("armed", { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Pause preview" }).click();
  await page.waitForTimeout(900);
  await installCueAudit(page);

  const canvas = page.getByTestId("webgl-stage");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("WebGL stage has no measurable bounds.");
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.5;

  // A canvas click is not a drag and must not create a false tactile pair.
  await page.mouse.click(x, y);
  await page.waitForTimeout(120);
  let events = await cues(page);
  expect(countCue(events, "grab")).toBe(0);
  expect(countCue(events, "release")).toBe(0);
  expect(countCue(events, "settle")).toBe(0);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + Math.min(100, box.height * 0.25), { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => countCue(await cues(page), "settle"), {
    timeout: 4_000,
  }).toBe(1);
  events = await cues(page);
  expect(countCue(events, "grab")).toBe(1);
  expect(countCue(events, "release")).toBe(1);
  expect(countCue(events, "settle")).toBe(1);
  expect(events.find((event) => event.cue === "settle")?.intensity).toBeGreaterThan(0);

  // Wheel input may contain many packets, but its inertial tail resolves once.
  await clearCues(page);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, 160);
  await expect.poll(async () => countCue(await cues(page), "settle"), {
    timeout: 4_000,
  }).toBe(1);
  events = await cues(page);
  expect(countCue(events, "grab")).toBe(0);
  expect(countCue(events, "release")).toBe(0);
  expect(countCue(events, "settle")).toBe(1);

  // Completion feedback is allowed only after preview suppression is restored.
  await installLifecycleAudit(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", {
    name: "Save transparent-safe PNG",
  }).click();
  await download;
  await expect(page.locator(".notice[role=status]")).toContainText(
    /PNG captured/i,
    { timeout: 30_000 },
  );

  const lifecycle = await page.evaluate(() => [
    ...((window as SonicAuditWindow).__driftSonicLifecycle ?? []),
  ]);
  const suppressedAt = lifecycle.indexOf("suppressed:true");
  const restoredAt = lifecycle.indexOf("suppressed:false");
  const successAt = lifecycle.indexOf("play:success");
  expect(suppressedAt).toBeGreaterThanOrEqual(0);
  expect(restoredAt).toBeGreaterThan(suppressedAt);
  expect(successAt).toBeGreaterThan(restoredAt);
});
