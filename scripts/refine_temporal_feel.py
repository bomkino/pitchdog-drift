from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    content = read(path)
    actual = content.count(old)
    if actual != count:
        raise RuntimeError(f"{path}: expected {count} occurrence(s), found {actual}: {old[:100]!r}")
    write(path, content.replace(old, new, count))


# The app should never feel twelve frames per second while somebody is touching
# it. Direct manipulation temporarily bypasses held pose sampling, then hands
# control back to the authored cadence after a short grace window.
replace(
    "src/engine/CinematicCarousel.ts",
    '  private cadenceSampleTime = 0;',
    '  private cadenceSampleTime = 0;\n  private directManipulationUntil = 0;',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '    if (frame === null || this.dragging) {',
    '    if (frame === null || this.dragging || performance.now() < this.directManipulationUntil) {',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '''    if (frame !== this.cadenceFrame) {
      const elapsed = Math.max(1 / 240, this.elapsed - this.cadenceSampleTime);
      const previous = this.cadenceDistance;
      this.cadenceFrame = frame;
      this.cadenceDistance = this.motionPosition;
      this.cadenceVelocity = (this.cadenceDistance - previous) / elapsed;
      this.cadenceSampleTime = this.elapsed;
    }
    return shapeTrackSample(this.cadenceDistance, this.cadenceVelocity, stride, this.settings.motion);''',
    '''    let poseVelocity = 0;
    if (frame !== this.cadenceFrame) {
      const elapsed = Math.max(1 / 240, this.elapsed - this.cadenceSampleTime);
      const previous = this.cadenceDistance;
      this.cadenceFrame = frame;
      this.cadenceDistance = this.motionPosition;
      this.cadenceVelocity = (this.cadenceDistance - previous) / elapsed;
      this.cadenceSampleTime = this.elapsed;
      poseVelocity = this.cadenceVelocity;
    }
    return shapeTrackSample(this.cadenceDistance, poseVelocity, stride, this.settings.motion);''',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '''    this.dragging = true;
    this.dragPointerId = event.pointerId;''',
    '''    this.dragging = true;
    this.directManipulationUntil = Number.POSITIVE_INFINITY;
    this.dragPointerId = event.pointerId;''',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '''    this.dragging = false;
    this.dragPointerId = null;''',
    '''    this.dragging = false;
    this.directManipulationUntil = performance.now() + 180;
    this.dragPointerId = null;''',
)
replace(
    "src/engine/CinematicCarousel.ts",
    '''    const impulse = THREE.MathUtils.clamp(raw * modeScale, -180, 180) * this.settings.motion.dragSensitivity;
    this.motionPosition += impulse;''',
    '''    const impulse = THREE.MathUtils.clamp(raw * modeScale, -180, 180) * this.settings.motion.dragSensitivity;
    this.directManipulationUntil = performance.now() + 180;
    this.motionPosition += impulse;''',
)

# Seamless atmosphere obeys the same held scene clock as the slide materials.
replace(
    "src/engine/CinematicCarousel.ts",
    '      phase = (time / Math.max(0.001, this.settings.output.duration)) * Math.PI * 2 * Math.max(1, Math.round(this.settings.motion.seamlessLoops));',
    '      phase = (sceneTime / Math.max(0.001, this.settings.output.duration)) * Math.PI * 2 * Math.max(1, Math.round(this.settings.motion.seamlessLoops));',
)

# React data attributes should be explicit strings across compiler versions.
replace(
    "src/components/ControlPanel.tsx",
    '        <div className="motion-signature-note" data-custom={!activeSignature}>',
    '        <div className="motion-signature-note" data-custom={activeSignature ? "false" : "true"}>',
)

# Remove the exploratory test appended to the large legacy suite. A dedicated
# journey spec is easier to review and uses unambiguous selectors.
studio = read("e2e/studio.e2e.ts")
marker = '\ntest("directs temporal feel without confusing motion cadence with master fps"'
index = studio.find(marker)
if index >= 0:
    write("e2e/studio.e2e.ts", studio[:index].rstrip() + "\n")

write(
    "e2e/temporal-direction.e2e.ts",
    r'''import { expect, test } from "@playwright/test";

async function setRange(page: import("@playwright/test").Page, id: string, value: number) {
  await page.locator(id).evaluate((element, next) => {
    const input = element as HTMLInputElement;
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test("directs temporal feel without confusing scene cadence with the delivery master", async ({ page }) => {
  await page.goto("/");

  const inspector = page.getByRole("complementary", { name: "Director controls" });
  await expect(inspector).toBeVisible();

  const signature = page.getByLabel("Motion signature");
  await signature.selectOption("twelve-frame-hand");
  await expect(signature).toHaveValue("twelve-frame-hand");
  await expect(inspector.getByText(/deliberate twelve-frame poses/i)).toBeVisible();

  const cadence12 = page.locator('input[type="radio"][name="Motion cadence"][value="12fps"]');
  await cadence12.check();
  await expect(cadence12).toBeChecked();

  const master24 = page.locator('input[type="radio"][name="Frame rate"][value="24"]');
  await master24.check();
  await expect(inspector.locator(".cadence-readout strong")).toContainText("even 2-frame holds");

  const master30 = page.locator('input[type="radio"][name="Frame rate"][value="30"]');
  await master30.check();
  await expect(inspector.locator(".cadence-readout strong")).toContainText("mixed 2–3-frame holds");

  await setRange(page, "#range-focal-linger", 64);
  await setRange(page, "#range-release", 71);
  await expect(signature).toHaveValue("custom");

  const take = page.locator("#range-performance-take");
  const before = await take.inputValue();
  await inspector.getByRole("button", { name: "Recast performance take" }).click();
  await expect(take).not.toHaveValue(before);

  await expect(page.locator(".stage-topline")).toContainText("12 fps motion");
  await expect(page.locator(".stage-hud")).toContainText("30 fps master");
});
''',
)

print("Temporal interaction refinements applied successfully.")
