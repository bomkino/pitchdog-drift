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


write(
    "src/components/TemporalFingerprint.tsx",
    r'''import type { CSSProperties } from "react";
import type { MotionSettings } from "../model";
import {
  cadenceReport,
  motionCadenceFps,
  warpUnitPhaseDerivative,
} from "../engine/temporalDirection";

interface TemporalFingerprintProps {
  motion: MotionSettings;
  outputFps: number;
}

function velocityPoints(motion: MotionSettings): string {
  const samples = Array.from({ length: 49 }, (_, index) => {
    const phase = index / 48;
    return warpUnitPhaseDerivative(phase, motion);
  });
  const maximum = Math.max(1, ...samples);
  return samples
    .map((velocity, index) => {
      const x = (index / 48) * 100;
      const y = 32 - (velocity / maximum) * 25;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function TemporalFingerprint({ motion, outputFps }: TemporalFingerprintProps) {
  const cadence = cadenceReport(motion.cadence, outputFps);
  const motionFps = motionCadenceFps(motion.cadence);
  const entry = motion.runway * (0.035 + motion.weight * 0.18) * 100;
  const exit = motion.runway * (0.035 + motion.release * 0.22) * 100;
  const style = {
    "--entry": `${entry.toFixed(2)}%`,
    "--exit": `${exit.toFixed(2)}%`,
    "--cadence-ticks": motionFps ?? outputFps,
  } as CSSProperties;

  return (
    <figure className="temporal-fingerprint" style={style} aria-label="Live timing fingerprint">
      <figcaption>
        <span>Timing fingerprint</span>
        <small>{cadence.exact ? "EVEN HOLDS" : "MIXED HOLDS"}</small>
      </figcaption>
      <div className="fingerprint-plot">
        <svg viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label="Velocity across one focal beat">
          <line className="fingerprint-baseline" x1="0" y1="32" x2="100" y2="32" />
          <line className="fingerprint-beat" x1="50" y1="3" x2="50" y2="34" />
          <polyline className="fingerprint-velocity" points={velocityPoints(motion)} />
        </svg>
        <span className="fingerprint-entry" aria-hidden="true" />
        <span className="fingerprint-exit" aria-hidden="true" />
        <span className="fingerprint-cadence" aria-hidden="true" />
      </div>
      <div className="fingerprint-labels" aria-hidden="true">
        <span>GATHER</span>
        <span>FOCAL BEAT</span>
        <span>RELEASE</span>
      </div>
      <p>{cadence.headline}. Weight shapes the rise; linger cuts velocity at the beat; release shapes the landing.</p>
    </figure>
  );
}
''',
)

replace(
    "src/components/ControlPanel.tsx",
    'import { ColorField, InspectorGroup, NumberField, RangeField, Segmented, SelectField, SwitchField } from "./controls";',
    'import { ColorField, InspectorGroup, NumberField, RangeField, Segmented, SelectField, SwitchField } from "./controls";\nimport { TemporalFingerprint } from "./TemporalFingerprint";',
)
replace(
    "src/components/ControlPanel.tsx",
    '''        <div className="cadence-readout" data-exact={cadence.exact}>
          <strong>{cadence.headline}</strong>
          <small>{cadence.detail}</small>
        </div>
        <Segmented label="Flow axis"''',
    '''        <div className="cadence-readout" data-exact={cadence.exact ? "true" : "false"}>
          <strong>{cadence.headline}</strong>
          <small>{cadence.detail}</small>
        </div>
        <TemporalFingerprint motion={settings.motion} outputFps={settings.output.fps} />
        <Segmented label="Flow axis"''',
)

css = r'''.temporal-fingerprint {
  display: grid;
  gap: 8px;
  margin: 2px 0 4px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel-raised) 72%, transparent);
  overflow: hidden;
}

.temporal-fingerprint figcaption,
.fingerprint-labels {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.temporal-fingerprint figcaption span {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.temporal-fingerprint figcaption small,
.fingerprint-labels,
.temporal-fingerprint p {
  color: var(--text-dim);
  font-size: 9px;
  letter-spacing: 0.045em;
}

.fingerprint-plot {
  position: relative;
  height: 74px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  overflow: hidden;
}

.fingerprint-plot svg {
  position: absolute;
  inset: 8px 7px 9px;
  width: calc(100% - 14px);
  height: calc(100% - 17px);
  overflow: visible;
}

.fingerprint-baseline,
.fingerprint-beat {
  stroke: color-mix(in srgb, var(--line) 70%, transparent);
  stroke-width: 0.6;
  vector-effect: non-scaling-stroke;
}

.fingerprint-beat {
  stroke-dasharray: 2 3;
}

.fingerprint-velocity {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.45;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.fingerprint-entry,
.fingerprint-exit {
  position: absolute;
  inset-block: 0;
  width: var(--entry);
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 13%, transparent), transparent);
  pointer-events: none;
}

.fingerprint-entry { inset-inline-start: 0; }
.fingerprint-exit {
  inset-inline-end: 0;
  width: var(--exit);
  transform: scaleX(-1);
}

.fingerprint-cadence {
  position: absolute;
  inset: 0;
  opacity: 0.13;
  background-image: repeating-linear-gradient(
    90deg,
    transparent 0,
    transparent calc((100% / var(--cadence-ticks)) - 1px),
    currentColor calc((100% / var(--cadence-ticks)) - 1px),
    currentColor calc(100% / var(--cadence-ticks))
  );
  pointer-events: none;
}

.temporal-fingerprint p {
  margin: 0;
  line-height: 1.45;
  letter-spacing: 0;
}
'''
styles = read("src/styles.css")
if ".temporal-fingerprint {" not in styles:
    write("src/styles.css", styles.rstrip() + "\n\n" + css.strip() + "\n")

# Use React's native value setter so the browser gauntlet drives controlled
# range inputs through the same event path as a real user.
replace(
    "e2e/temporal-direction.e2e.ts",
    '''    const input = element as HTMLInputElement;
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));''',
    '''    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Native input value setter is unavailable.");
    setter.call(input, String(next));
    input.dispatchEvent(new Event("input", { bubbles: true }));''',
)
replace(
    "e2e/temporal-direction.e2e.ts",
    '''  const inspector = page.getByRole("complementary", { name: "Director controls" });
  await expect(inspector).toBeVisible();''',
    '''  const inspector = page.getByRole("complementary", { name: "Director controls" });
  if (!await inspector.isVisible()) {
    await page.getByRole("button", { name: /director/i }).click();
  }
  await expect(inspector).toBeVisible();''',
)
replace(
    "e2e/temporal-direction.e2e.ts",
    '  await expect(page.locator(".stage-topline")).toContainText("12 fps motion");',
    '  await expect(inspector.getByRole("figure", { name: "Live timing fingerprint" })).toBeVisible();\n  await expect(page.locator(".stage-topline")).toContainText("12 fps motion");',
)

doc = read("docs/TEMPORAL_DIRECTION.md")
doc += r'''

## Timing fingerprint

Every motion choice is reflected in a live timing fingerprint. The curve shows velocity across a focal beat; shaded ends show the master runway; cadence marks show the scene sampling rhythm. This is deliberately explanatory rather than decorative. A director can see whether a change adds dwell, sharpens release, or merely makes the numbers larger.
'''
write("docs/TEMPORAL_DIRECTION.md", doc)

print("Temporal timing fingerprint applied successfully.")
