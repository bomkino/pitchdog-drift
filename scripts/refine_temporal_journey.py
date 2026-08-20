from __future__ import annotations

import re
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


# Reusable truth about which speed a master will actually use.
insert = r'''export function effectiveSlidesPerSecond(settings: StudioSettings, slotCount: number): number {
  if (settings.motion.reducedMotionOutput) return 0;
  if (settings.motion.seamless && slotCount > 0) {
    return slotCount
      * Math.max(1, Math.round(settings.motion.seamlessLoops))
      / Math.max(0.001, settings.output.duration);
  }
  return settings.motion.speed;
}

export function secondsPerSlide(settings: StudioSettings, slotCount: number): number | null {
  const speed = effectiveSlidesPerSecond(settings, slotCount);
  return speed > 1e-6 ? 1 / speed : null;
}
'''
replace(
    "src/engine/temporalDirection.ts",
    'export function motionCadenceFps(cadence: MotionCadence): number | null {',
    insert + '\nexport function motionCadenceFps(cadence: MotionCadence): number | null {',
)

# Range controls can be truthfully unavailable rather than cosmetically active.
replace(
    "src/components/controls.tsx",
    '  hint?: string;\n  onChange: (value: number) => void;\n}\n\nexport function RangeField({ label, value, min, max, step, unit = "", decimals = 0, hint, onChange }: RangeFieldProps) {',
    '  hint?: string;\n  disabled?: boolean;\n  onChange: (value: number) => void;\n}\n\nexport function RangeField({ label, value, min, max, step, unit = "", decimals = 0, hint, disabled = false, onChange }: RangeFieldProps) {',
)
replace(
    "src/components/controls.tsx",
    '<label className="control-field range-field" htmlFor={id}>',
    '<label className="control-field range-field" htmlFor={id} data-disabled={disabled ? "true" : "false"}>',
)
replace(
    "src/components/controls.tsx",
    '        value={value}\n        onChange={(event) => onChange(Number(event.currentTarget.value))}',
    '        value={value}\n        disabled={disabled}\n        onChange={(event) => onChange(Number(event.currentTarget.value))}',
)

# ControlPanel receives actual media count, computes the virtual track exactly,
# supports reversible signature auditions, and disables controls that seamless
# export necessarily supersedes.
replace(
    "src/components/ControlPanel.tsx",
    'import type { CSSProperties } from "react";',
    'import { useState, type CSSProperties } from "react";',
)
replace(
    "src/components/ControlPanel.tsx",
    'import { MOTION_SIGNATURES, applyMotionSignature, cadenceReport, getMotionSignature } from "../engine/temporalDirection";',
    'import { MOTION_SIGNATURES, applyMotionSignature, cadenceReport, effectiveSlidesPerSecond, getMotionSignature, secondsPerSlide } from "../engine/temporalDirection";\nimport { getLogicalSlotCount, getSlideGeometry } from "../engine/evaluate";',
)
replace(
    "src/components/ControlPanel.tsx",
    '  settings: StudioSettings;\n  onSettings:',
    '  settings: StudioSettings;\n  slideCount: number;\n  onSettings:',
)
replace(
    "src/components/ControlPanel.tsx",
    '  settings,\n  onSettings,',
    '  settings,\n  slideCount,\n  onSettings,',
)
replace(
    "src/components/ControlPanel.tsx",
    '}: ControlPanelProps) {\n  const patch =',
    '}: ControlPanelProps) {\n  const [motionBeforeAudition, setMotionBeforeAudition] = useState<StudioSettings["motion"] | null>(null);\n  const patch =',
)
replace(
    "src/components/ControlPanel.tsx",
    '  const cadence = cadenceReport(settings.motion.cadence, settings.output.fps);',
    '  const cadence = cadenceReport(settings.motion.cadence, settings.output.fps);\n  const geometry = getSlideGeometry(settings);\n  const logicalSlots = getLogicalSlotCount(slideCount, geometry);\n  const effectiveSpeed = effectiveSlidesPerSecond(settings, logicalSlots);\n  const beatSeconds = secondsPerSlide(settings, logicalSlots);',
)
replace(
    "src/components/ControlPanel.tsx",
    '''            onSettings(applyMotionSignature(settings, signature));
          }}
        />''',
    '''            setMotionBeforeAudition((previous) => previous ?? { ...settings.motion });
            onSettings(applyMotionSignature(settings, signature));
          }}
        />''',
)
replace(
    "src/components/ControlPanel.tsx",
    '''        <div className="motion-signature-note" data-custom={activeSignature ? "false" : "true"}>
          <strong>{activeSignature?.eyebrow ?? "Director-tuned"}</strong>
          <span>{activeSignature?.description ?? "The authored signature has been adjusted. Every control remains deterministic and export-safe."}</span>
          {activeSignature ? <small>{activeSignature.bestFor}</small> : null}
        </div>''',
    '''        <div className="motion-signature-note" data-custom={activeSignature ? "false" : "true"}>
          <strong>{activeSignature?.eyebrow ?? "Director-tuned"}</strong>
          <span>{activeSignature?.description ?? "The authored signature has been adjusted. Every control remains deterministic and export-safe."}</span>
          {activeSignature ? <small>{activeSignature.bestFor}</small> : null}
        </div>
        {motionBeforeAudition ? (
          <button
            type="button"
            className="restore-motion-action"
            onClick={() => {
              onSettings({ ...settings, motion: motionBeforeAudition });
              setMotionBeforeAudition(null);
            }}
          >
            Restore pre-audition motion
          </button>
        ) : null}''',
)
replace(
    "src/components/ControlPanel.tsx",
    '        <TemporalFingerprint motion={settings.motion} outputFps={settings.output.fps} />',
    '        <div className="beat-readout" data-seamless={settings.motion.seamless ? "true" : "false"}>\n          <strong>{beatSeconds ? `${beatSeconds.toFixed(2)} s per slide` : "Still frame"}</strong>\n          <small>{settings.motion.seamless ? `Whole-track lock sets ${effectiveSpeed.toFixed(2)} slides/s from ${logicalSlots} logical positions, ${settings.motion.seamlessLoops} loop${settings.motion.seamlessLoops === 1 ? "" : "s"}, and ${settings.output.duration} seconds.` : `${effectiveSpeed.toFixed(2)} slides/s before authored focal linger.`}</small>\n        </div>\n        <TemporalFingerprint motion={settings.motion} outputFps={settings.output.fps} slideSeconds={beatSeconds} />',
)
replace(
    "src/components/ControlPanel.tsx",
    '        <RangeField label="Speed" value={settings.motion.speed} min={0} max={1.5} step={0.01} decimals={2} unit="×" onChange={(speed) => patchMotion({ speed })} />',
    '        <RangeField label="Speed" value={settings.motion.speed} min={0} max={1.5} step={0.01} decimals={2} unit="×" disabled={settings.motion.seamless} hint={settings.motion.seamless ? "Whole-track loops and master duration set the effective speed." : "Base travel in slides per second; focal linger reshapes each beat."} onChange={(speed) => patchMotion({ speed })} />',
)
replace(
    "src/components/ControlPanel.tsx",
    '        <RangeField label="Master runway" value={settings.motion.runway * 100} min={0} max={100} step={1} unit="%" hint="Adds opening and closing handles plus eased ramps to non-looping exports. Seamless masters ignore it." onChange={(value) => patchMotion({ runway: value / 100 })} />',
    '        <RangeField label="Master runway" value={settings.motion.runway * 100} min={0} max={100} step={1} unit="%" disabled={settings.motion.seamless} hint={settings.motion.seamless ? "Unavailable: easing at a loop seam would create a visible pulse." : "Adds opening and closing handles plus eased ramps to non-looping exports."} onChange={(value) => patchMotion({ runway: value / 100 })} />',
)

app = read("src/App.tsx")
pattern = re.compile(r'(<ControlPanel\s*\n\s*settings=\{settings\})')
app, matches = pattern.subn(r'\1\n              slideCount={assets.length}', app, count=1)
if matches != 1:
    raise RuntimeError(f"src/App.tsx: could not inject slideCount; matches={matches}")
write("src/App.tsx", app)

# Timing fingerprint translates effective pace into reading time.
replace(
    "src/components/TemporalFingerprint.tsx",
    '  outputFps: number;\n}',
    '  outputFps: number;\n  slideSeconds: number | null;\n}',
)
replace(
    "src/components/TemporalFingerprint.tsx",
    'export function TemporalFingerprint({ motion, outputFps }: TemporalFingerprintProps) {',
    'export function TemporalFingerprint({ motion, outputFps, slideSeconds }: TemporalFingerprintProps) {',
)
replace(
    "src/components/TemporalFingerprint.tsx",
    '      <p>{cadence.headline}. Weight shapes the rise; linger cuts velocity at the beat; release shapes the landing.</p>',
    '      <p>{cadence.headline}. {slideSeconds ? `${slideSeconds.toFixed(2)} seconds per slide before focal shaping.` : "No track travel."} Weight shapes the rise; linger cuts velocity at the beat; release shapes the landing.</p>',
)

css = r'''.control-field[data-disabled="true"] {
  opacity: 0.5;
}

.control-field[data-disabled="true"] input {
  cursor: not-allowed;
}

.restore-motion-action,
.beat-readout {
  width: 100%;
}

.restore-motion-action {
  min-height: 34px;
  border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
  font-size: 11px;
  letter-spacing: 0.035em;
}

.beat-readout {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  border-radius: 10px;
}

.beat-readout strong {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.beat-readout small {
  color: var(--text-dim);
  font-size: 10px;
  line-height: 1.42;
}

.beat-readout[data-seamless="true"] {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--line));
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}
'''
styles = read("src/styles.css")
if ".restore-motion-action," not in styles:
    write("src/styles.css", styles.rstrip() + "\n\n" + css.strip() + "\n")

# User journey gauntlet: signatures are reversible and seamless mode tells the
# truth about controls it overrides.
replace(
    "e2e/temporal-direction.e2e.ts",
    '''  const signature = page.getByLabel("Motion signature");
  await signature.selectOption("twelve-frame-hand");''',
    '''  const signature = page.getByLabel("Motion signature");
  const originalSignature = await signature.inputValue();
  await signature.selectOption("twelve-frame-hand");''',
)
replace(
    "e2e/temporal-direction.e2e.ts",
    '''  await expect(inspector.getByRole("figure", { name: "Live timing fingerprint" })).toBeVisible();
  await expect(page.locator(".stage-topline")).toContainText("12 fps motion");''',
    '''  await expect(inspector.getByRole("figure", { name: "Live timing fingerprint" })).toBeVisible();
  await expect(inspector.locator(".beat-readout")).toContainText("s per slide");

  const seamless = inspector.getByRole("switch", { name: "Seamless export lock" });
  await seamless.check();
  await expect(page.locator("#range-speed")).toBeDisabled();
  await expect(page.locator("#range-master-runway")).toBeDisabled();
  await expect(inspector.locator(".beat-readout")).toContainText("Whole-track lock sets");
  await seamless.uncheck();

  await inspector.getByRole("button", { name: "Restore pre-audition motion" }).click();
  await expect(signature).toHaveValue(originalSignature);

  await expect(page.locator(".stage-topline")).toContainText("motion");''',
)

# Documentation.
doc = read("docs/TEMPORAL_DIRECTION.md")
doc += r'''

## Reversible audition

Choosing a motion signature begins an audition rather than destroying the current direction. Drift keeps the pre-audition motion state while the user tries multiple signatures and exposes a single **Restore pre-audition motion** action. This is intentionally local to motion; it does not pretend to be a full project-history system.

## Honest seamless controls

Seamless lock necessarily derives velocity from logical track length, loop count, and master duration. The ordinary Speed control is therefore disabled while lock is active, and Drift reports the actual effective slides per second plus seconds per slide. Master runway is also disabled because easing at a loop seam would create a pulse. The interface no longer lets a user adjust values the renderer will ignore.
'''
write("docs/TEMPORAL_DIRECTION.md", doc)

print("Temporal user-journey refinements applied successfully.")
