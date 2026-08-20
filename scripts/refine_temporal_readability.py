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


replace(
    "src/engine/temporalDirection.ts",
    '''export function effectiveSlidesPerSecond(settings: StudioSettings, slotCount: number): number {
  if (settings.motion.reducedMotionOutput) return 0;
  if (settings.motion.seamless && slotCount > 0) {
    return slotCount
      * Math.max(1, Math.round(settings.motion.seamlessLoops))
      / Math.max(0.001, settings.output.duration);
  }
  return settings.motion.speed;
}''',
    '''export function effectiveSlidesPerSecond(settings: StudioSettings, slotCount: number): number {
  if (settings.motion.reducedMotionOutput) return 0;
  if (settings.motion.seamless) {
    if (slotCount <= 0) return 0;
    return slotCount
      * Math.max(1, Math.round(settings.motion.seamlessLoops))
      / Math.max(0.001, settings.output.duration);
  }
  return settings.motion.speed;
}''',
)

PACE_REPORT = r'''export type MotionPaceLevel = "still" | "measured" | "quick" | "glance" | "large-pose-jumps";

export interface MotionPaceReport {
  level: MotionPaceLevel;
  label: string;
  detail: string;
  secondsPerSlide: number | null;
  poseStepSlides: number | null;
  warning: boolean;
}

export function motionPaceReport(settings: StudioSettings, slotCount: number): MotionPaceReport {
  const speed = effectiveSlidesPerSecond(settings, slotCount);
  const seconds = speed > 1e-6 ? 1 / speed : null;
  const cadence = motionCadenceFps(settings.motion.cadence);
  const poseStep = cadence && speed > 0 ? speed / cadence : null;

  if (seconds === null) {
    return {
      level: "still",
      label: "Still composition",
      detail: "No track travel. The pinned frame and atmosphere may still carry the scene.",
      secondsPerSlide: null,
      poseStepSlides: poseStep,
      warning: false,
    };
  }
  if (poseStep !== null && poseStep > 0.18) {
    return {
      level: "large-pose-jumps",
      label: "Large pose jumps",
      detail: `${poseStep.toFixed(2)} slides per held pose. Reduce speed or seamless loops, lengthen the master, or raise motion cadence when slide reading matters.`,
      secondsPerSlide: seconds,
      poseStepSlides: poseStep,
      warning: true,
    };
  }
  if (seconds >= 2) {
    return {
      level: "measured",
      label: "Measured reading pace",
      detail: `${seconds.toFixed(2)} seconds per slide before focal shaping.`,
      secondsPerSlide: seconds,
      poseStepSlides: poseStep,
      warning: false,
    };
  }
  if (seconds >= 0.9) {
    return {
      level: "quick",
      label: "Quick reading pace",
      detail: `${seconds.toFixed(2)} seconds per slide before focal shaping.`,
      secondsPerSlide: seconds,
      poseStepSlides: poseStep,
      warning: false,
    };
  }
  return {
    level: "glance",
    label: "Glance pace",
    detail: `${seconds.toFixed(2)} seconds per slide. Dense copy will not remain readable without stronger focal linger or a slower track.`,
    secondsPerSlide: seconds,
    poseStepSlides: poseStep,
    warning: false,
  };
}
'''
replace(
    "src/engine/temporalDirection.ts",
    'export function secondsPerSlide(settings: StudioSettings, slotCount: number): number | null {\n  const speed = effectiveSlidesPerSecond(settings, slotCount);\n  return speed > 1e-6 ? 1 / speed : null;\n}',
    'export function secondsPerSlide(settings: StudioSettings, slotCount: number): number | null {\n  const speed = effectiveSlidesPerSecond(settings, slotCount);\n  return speed > 1e-6 ? 1 / speed : null;\n}\n\n' + PACE_REPORT,
)

replace(
    "src/components/ControlPanel.tsx",
    'import { MOTION_SIGNATURES, applyMotionSignature, cadenceReport, effectiveSlidesPerSecond, getMotionSignature, secondsPerSlide } from "../engine/temporalDirection";',
    'import { MOTION_SIGNATURES, applyMotionSignature, cadenceReport, effectiveSlidesPerSecond, getMotionSignature, motionPaceReport, secondsPerSlide } from "../engine/temporalDirection";',
)
replace(
    "src/components/ControlPanel.tsx",
    '  const beatSeconds = secondsPerSlide(settings, logicalSlots);',
    '  const beatSeconds = secondsPerSlide(settings, logicalSlots);\n  const pace = motionPaceReport(settings, logicalSlots);',
)
replace(
    "src/components/ControlPanel.tsx",
    '''        <div className="beat-readout" data-seamless={settings.motion.seamless ? "true" : "false"}>
          <strong>{beatSeconds ? `${beatSeconds.toFixed(2)} s per slide` : "Still frame"}</strong>
          <small>{settings.motion.seamless ? `Whole-track lock sets ${effectiveSpeed.toFixed(2)} slides/s from ${logicalSlots} logical positions, ${settings.motion.seamlessLoops} loop${settings.motion.seamlessLoops === 1 ? "" : "s"}, and ${settings.output.duration} seconds.` : `${effectiveSpeed.toFixed(2)} slides/s before authored focal linger.`}</small>
        </div>''',
    '''        <div className="beat-readout" data-seamless={settings.motion.seamless ? "true" : "false"} data-warning={pace.warning ? "true" : "false"}>
          <strong>{pace.label}</strong>
          <span>{beatSeconds ? `${beatSeconds.toFixed(2)} s per slide` : "Still frame"} · {effectiveSpeed.toFixed(2)} slides/s</span>
          <small>{pace.warning ? pace.detail : settings.motion.seamless ? `Whole-track lock uses ${logicalSlots} virtual positions, ${settings.motion.seamlessLoops} loop${settings.motion.seamlessLoops === 1 ? "" : "s"}, and ${settings.output.duration} seconds.` : pace.detail}</small>
          {pace.poseStepSlides !== null ? <small className="pose-step">{pace.poseStepSlides.toFixed(3)} slides per held pose</small> : null}
        </div>''',
)

# Fingerprint cadence ticks use a precomputed percentage; CSS calc division is
# not consistently supported across target Chromium/WebKit versions.
replace(
    "src/components/TemporalFingerprint.tsx",
    '    "--cadence-ticks": motionFps ?? outputFps,',
    '    "--cadence-step": `${(100 / Math.max(1, motionFps ?? outputFps)).toFixed(4)}%`,',
)
replace(
    "src/styles.css",
    '''    transparent calc((100% / var(--cadence-ticks)) - 1px),
    currentColor calc((100% / var(--cadence-ticks)) - 1px),
    currentColor calc(100% / var(--cadence-ticks))''',
    '''    transparent calc(var(--cadence-step) - 1px),
    currentColor calc(var(--cadence-step) - 1px),
    currentColor var(--cadence-step)''',
)

css = r'''.beat-readout span {
  color: var(--text);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.beat-readout .pose-step {
  font-variant-numeric: tabular-nums;
}

.beat-readout[data-warning="true"] {
  border-color: color-mix(in srgb, var(--warning, #d19a66) 65%, var(--line));
  background: color-mix(in srgb, var(--warning, #d19a66) 8%, transparent);
}

.beat-readout[data-warning="true"] strong {
  color: var(--warning, #d19a66);
}
'''
styles = read("src/styles.css")
if ".beat-readout .pose-step" not in styles:
    write("src/styles.css", styles.rstrip() + "\n\n" + css.strip() + "\n")

# Unit contract for warnings: do not block an extreme direction; identify it.
replace(
    "tests/temporalDirection.test.ts",
    '  motionResponseRates,\n  sampleMotionTime,',
    '  motionPaceReport,\n  motionResponseRates,\n  sampleMotionTime,',
)
marker = '  it("pulses optical velocity only when held poses advance",'
block = r'''  it("diagnoses unreadable held-pose jumps without clamping them", () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.motion.cadence = "12fps";
    settings.motion.seamless = true;
    settings.motion.seamlessLoops = 6;
    settings.output.duration = 3;
    const report = motionPaceReport(settings, 12);
    expect(report).toMatchObject({
      level: "large-pose-jumps",
      warning: true,
      poseStepSlides: 2,
    });

    settings.motion.seamlessLoops = 1;
    settings.output.duration = 12;
    expect(motionPaceReport(settings, 12).warning).toBe(false);
  });

'''
replace("tests/temporalDirection.test.ts", marker, block + marker)

# Browser journey checks the diagnostic is present but quiet under sane defaults.
replace(
    "e2e/temporal-direction.e2e.ts",
    '  await expect(inspector.locator(".beat-readout")).toContainText("s per slide");',
    '  await expect(inspector.locator(".beat-readout")).toContainText("s per slide");\n  await expect(inspector.locator(".beat-readout")).toHaveAttribute("data-warning", "false");',
)

doc = read("docs/TEMPORAL_DIRECTION.md")
doc += r'''

## Reading and pose-step diagnostics

Drift reports both seconds per slide and, for held cadence, slides travelled per authored pose. Large held jumps are flagged when they exceed 0.18 slides per pose. The warning does not clamp or forbid the direction; fast graphic work may need it. It prevents an accidental combination of short duration, many seamless loops, and low cadence from masquerading as a valid reading experience.
'''
write("docs/TEMPORAL_DIRECTION.md", doc)

print("Temporal readability diagnostics applied successfully.")
