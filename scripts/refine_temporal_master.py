from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    content = read(path)
    actual = content.count(old)
    if actual != count:
        raise RuntimeError(f"{path}: expected {count} occurrence(s), found {actual}: {old[:100]!r}")
    write(path, content.replace(old, new, count))


def insert_before(path: str, marker: str, block: str) -> None:
    replace(path, marker, block.rstrip() + "\n\n" + marker)


# A master runway is explicit. Legacy schema-v1 projects receive zero, while
# authored signatures opt into clean opening/closing handles and ramps.
replace("src/model.ts", '  release: number;\n  overlap: number;', '  release: number;\n  runway: number;\n  overlap: number;')
replace("src/model.ts", '  release: 0.5,\n  overlap: 0,', '  release: 0.5,\n  runway: 0,\n  overlap: 0,')
replace("src/model.ts", '    release: 0.72,\n    overlap: 0.22,', '    release: 0.72,\n    runway: 1,\n    overlap: 0.22,')

replace(
    "src/engine/temporalDirection.ts",
    '  | "release"\n  | "overlap"',
    '  | "release"\n  | "runway"\n  | "overlap"',
)
for old, new in [
    ('release: 0.72, overlap:', 'release: 0.72, runway: 1, overlap:'),
    ('release: 0.36, overlap:', 'release: 0.36, runway: 0.72, overlap:'),
    ('release: 0.58, overlap:', 'release: 0.58, runway: 0.86, overlap:'),
    ('release: 0.82, overlap:', 'release: 0.82, runway: 1, overlap:'),
    ('release: 0.44, overlap:', 'release: 0.44, runway: 0.9, overlap:'),
    ('release: 0.28, overlap:', 'release: 0.28, runway: 0.56, overlap:'),
]:
    replace("src/engine/temporalDirection.ts", old, new)

MASTER_FUNCTIONS = r'''export interface MasterTimelineSample {
  progress: number;
  velocityPerSecond: number;
  handleSeconds: number;
}

function smoothstepIntegral(value: number): number {
  return value ** 3 - 0.5 * value ** 4;
}

function inverseSmoothstepIntegral(value: number): number {
  return value - value ** 3 + 0.5 * value ** 4;
}

/**
 * Integrates a constant-speed middle section between smooth velocity ramps.
 * The result remains monotonic, reaches exactly one, and preserves total travel.
 */
export function masterProgress(
  progress: number,
  motion: Pick<MotionSettings, "weight" | "release" | "runway">,
): number {
  const p = Math.min(1, Math.max(0, progress));
  const runway = Math.min(1, Math.max(0, motion.runway));
  if (runway <= 0) return p;

  let entry = runway * (0.035 + Math.min(1, Math.max(0, motion.weight)) * 0.18);
  let exit = runway * (0.035 + Math.min(1, Math.max(0, motion.release)) * 0.22);
  const occupied = entry + exit;
  if (occupied > 0.82) {
    const scale = 0.82 / occupied;
    entry *= scale;
    exit *= scale;
  }
  const area = 1 - 0.5 * (entry + exit);

  if (entry > 0 && p < entry) {
    const u = p / entry;
    return entry * smoothstepIntegral(u) / area;
  }
  if (exit > 0 && p > 1 - exit) {
    const u = (p - (1 - exit)) / exit;
    const before = 0.5 * entry + (1 - entry - exit);
    return (before + exit * inverseSmoothstepIntegral(u)) / area;
  }
  return (0.5 * entry + (p - entry)) / area;
}

export function masterProgressDerivative(
  progress: number,
  motion: Pick<MotionSettings, "weight" | "release" | "runway">,
): number {
  const p = Math.min(1, Math.max(0, progress));
  const runway = Math.min(1, Math.max(0, motion.runway));
  if (runway <= 0) return 1;

  let entry = runway * (0.035 + Math.min(1, Math.max(0, motion.weight)) * 0.18);
  let exit = runway * (0.035 + Math.min(1, Math.max(0, motion.release)) * 0.22);
  const occupied = entry + exit;
  if (occupied > 0.82) {
    const scale = 0.82 / occupied;
    entry *= scale;
    exit *= scale;
  }
  const area = 1 - 0.5 * (entry + exit);

  if (entry > 0 && p < entry) {
    const u = p / entry;
    return (3 * u * u - 2 * u * u * u) / area;
  }
  if (exit > 0 && p > 1 - exit) {
    const u = (p - (1 - exit)) / exit;
    return (1 - (3 * u * u - 2 * u * u * u)) / area;
  }
  return 1 / area;
}

/**
 * Non-looping exports receive two delivery-frame handles at either end, then
 * an integrated runway. Seamless masters intentionally ignore this function.
 */
export function masterTimelineSample(
  time: number,
  duration: number,
  outputFps: number,
  motion: Pick<MotionSettings, "weight" | "release" | "runway">,
): MasterTimelineSample {
  const safeDuration = Math.max(0.001, duration);
  const runway = Math.min(1, Math.max(0, motion.runway));
  const clampedTime = Math.min(safeDuration, Math.max(0, time));
  if (runway <= 0) {
    return {
      progress: clampedTime / safeDuration,
      velocityPerSecond: 1 / safeDuration,
      handleSeconds: 0,
    };
  }

  const handleSeconds = runway * Math.min(safeDuration * 0.04, 2 / Math.max(1, outputFps));
  const activeDuration = Math.max(0.001, safeDuration - handleSeconds * 2);
  if (clampedTime <= handleSeconds) return { progress: 0, velocityPerSecond: 0, handleSeconds };
  if (clampedTime >= safeDuration - handleSeconds) return { progress: 1, velocityPerSecond: 0, handleSeconds };

  const activeProgress = (clampedTime - handleSeconds) / activeDuration;
  return {
    progress: masterProgress(activeProgress, motion),
    velocityPerSecond: masterProgressDerivative(activeProgress, motion) / activeDuration,
    handleSeconds,
  };
}'''
insert_before("src/engine/temporalDirection.ts", 'export function motionResponseRates(', MASTER_FUNCTIONS)

# Export evaluation keeps its existing endless preview speed, but non-looping
# masters integrate the runway and preserve exact total travel.
replace(
    "src/engine/evaluate.ts",
    '  deterministicPerformance,\n  sampleMotionTime,',
    '  deterministicPerformance,\n  masterTimelineSample,\n  sampleMotionTime,',
)
replace(
    "src/engine/evaluate.ts",
    '''  if (exportMode && settings.motion.seamless && slotCount > 0) {
    const phase = time / Math.max(0.001, settings.output.duration);
    return direction * slotCount * stride * Math.max(1, Math.round(settings.motion.seamlessLoops)) * phase;
  }
  return direction * settings.motion.speed * stride * Math.max(0, time);''',
    '''  if (exportMode && settings.motion.seamless && slotCount > 0) {
    const phase = time / Math.max(0.001, settings.output.duration);
    return direction * slotCount * stride * Math.max(1, Math.round(settings.motion.seamlessLoops)) * phase;
  }
  if (exportMode) {
    const timeline = masterTimelineSample(time, settings.output.duration, settings.output.fps, settings.motion);
    return direction * settings.motion.speed * stride * settings.output.duration * timeline.progress;
  }
  return direction * settings.motion.speed * stride * Math.max(0, time);''',
)
replace(
    "src/engine/evaluate.ts",
    '''function rawVelocity(
  settings: StudioSettings,
  slotCount: number,
  stride: number,
  exportMode: boolean,
): number {
  if (exportMode && settings.motion.seamless && slotCount > 0) {
    return settings.motion.direction
      * slotCount
      * stride
      * Math.max(1, Math.round(settings.motion.seamlessLoops))
      / Math.max(0.001, settings.output.duration);
  }
  return settings.motion.direction * settings.motion.speed * stride;
}''',
    '''function rawVelocity(
  settings: StudioSettings,
  slotCount: number,
  stride: number,
  exportMode: boolean,
  time?: number,
): number {
  if (exportMode && settings.motion.seamless && slotCount > 0) {
    return settings.motion.direction
      * slotCount
      * stride
      * Math.max(1, Math.round(settings.motion.seamlessLoops))
      / Math.max(0.001, settings.output.duration);
  }
  const average = settings.motion.direction * settings.motion.speed * stride;
  if (exportMode && time !== undefined) {
    const timeline = masterTimelineSample(time, settings.output.duration, settings.output.fps, settings.motion);
    return average * settings.output.duration * timeline.velocityPerSecond;
  }
  return average;
}''',
)
replace(
    "src/engine/evaluate.ts",
    '  const baseVelocity = rawVelocity(settings, slotCount, stride, exportMode);',
    '  const baseVelocity = rawVelocity(settings, slotCount, stride, exportMode, time);',
)

# Validation and legacy migration.
replace(
    "src/lib/settingsValidation.ts",
    '      release: optionalNumber(motion.release, "settings.motion.release", { min: 0, max: 1 }, LEGACY_MOTION_FEEL.release),\n      overlap:',
    '      release: optionalNumber(motion.release, "settings.motion.release", { min: 0, max: 1 }, LEGACY_MOTION_FEEL.release),\n      runway: optionalNumber(motion.runway, "settings.motion.runway", { min: 0, max: 1 }, LEGACY_MOTION_FEEL.runway),\n      overlap:',
)

# Theme presets and authored signatures opt in explicitly.
for old, new in [
    ('release: 0.72, overlap: 0.22', 'release: 0.72, runway: 1, overlap: 0.22'),
    ('release: 0.82, overlap: 0.48', 'release: 0.82, runway: 1, overlap: 0.48'),
    ('release: 0.44, overlap: 0.2', 'release: 0.44, runway: 0.9, overlap: 0.2'),
    ('release: 0.36, overlap: 0.12', 'release: 0.36, runway: 0.72, overlap: 0.12'),
    ('release: 0.86, overlap: 0.52', 'release: 0.86, runway: 1, overlap: 0.52'),
    ('release: 0.28, overlap: 0.34', 'release: 0.28, runway: 0.56, overlap: 0.34'),
]:
    replace("src/themes.ts", old, new)

# User-facing control. It is separate from weight and release so constant-speed
# masters remain possible, and the copy says exactly when it applies.
replace(
    "src/components/ControlPanel.tsx",
    '        <RangeField label="Release" value={settings.motion.release * 100} min={0} max={100} step={1} unit="%" hint="Controls how momentum carries into the landing and how slowly it settles." onChange={(value) => patchMotion({ release: value / 100 })} />\n        <RangeField label="Overlap"',
    '        <RangeField label="Release" value={settings.motion.release * 100} min={0} max={100} step={1} unit="%" hint="Controls how momentum carries into the landing and how slowly it settles." onChange={(value) => patchMotion({ release: value / 100 })} />\n        <RangeField label="Master runway" value={settings.motion.runway * 100} min={0} max={100} step={1} unit="%" hint="Adds opening and closing handles plus eased ramps to non-looping exports. Seamless masters ignore it." onChange={(value) => patchMotion({ runway: value / 100 })} />\n        <RangeField label="Overlap"',
)

# Tests: migration remains neutral, runways are exact, monotonic, and truly
# stopped inside the first/last two delivery frames.
replace(
    "tests/temporalDirection.test.ts",
    '  motionResponseRates,\n  sampleMotionTime,',
    '  masterProgress,\n  masterProgressDerivative,\n  masterTimelineSample,\n  motionResponseRates,\n  sampleMotionTime,',
)
replace(
    "tests/temporalDirection.test.ts",
    '["cadence", "signature", "weight", "linger", "release", "overlap", "imperfection", "take"]',
    '["cadence", "signature", "weight", "linger", "release", "runway", "overlap", "imperfection", "take"]',
)
replace(
    "tests/temporalDirection.test.ts",
    '      release: 0.5,\n      overlap: 0,',
    '      release: 0.5,\n      runway: 0,\n      overlap: 0,',
)
insert_before(
    "tests/temporalDirection.test.ts",
    '  it("pulses optical velocity only when held poses advance",',
    r'''  it("builds exact, monotonic master runways with delivery-frame handles", () => {
    const motion = { weight: 0.72, release: 0.68, runway: 1 };
    let previous = -1;
    for (let step = 0; step <= 1_000; step += 1) {
      const progress = step / 1_000;
      const directed = masterProgress(progress, motion);
      expect(directed).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(masterProgressDerivative(progress, motion)).toBeGreaterThanOrEqual(0);
      previous = directed;
    }
    expect(masterProgress(0, motion)).toBe(0);
    expect(masterProgress(1, motion)).toBe(1);

    const start = masterTimelineSample(0, 8, 30, motion);
    const firstFrame = masterTimelineSample(1 / 30, 8, 30, motion);
    const moving = masterTimelineSample(3 / 30, 8, 30, motion);
    const end = masterTimelineSample(8, 8, 30, motion);
    expect(start.progress).toBe(0);
    expect(firstFrame.progress).toBe(0);
    expect(start.velocityPerSecond).toBe(0);
    expect(moving.velocityPerSecond).toBeGreaterThan(0);
    expect(end.progress).toBe(1);
    expect(end.velocityPerSecond).toBe(0);
  });

  it("keeps zero-runway legacy masters exactly linear", () => {
    const motion = { weight: 1, release: 1, runway: 0 };
    expect(masterTimelineSample(2, 8, 30, motion)).toMatchObject({
      progress: 0.25,
      velocityPerSecond: 0.125,
      handleSeconds: 0,
    });
  });

''',
)

# Documentation amendment.
doc = read("docs/TEMPORAL_DIRECTION.md")
doc = doc.replace(
    '- **Release** controls arrival/deceleration character and the asymmetry of each beat.\n- **Overlap**',
    '- **Release** controls arrival/deceleration character and the asymmetry of each beat.\n- **Master runway** controls whether non-looping exports receive opening/closing handles and integrated speed ramps.\n- **Overlap**',
)
doc += r'''

## Master runways

A non-looping master should not begin at full velocity or die on an arbitrary cut. When **Master runway** is above zero, Drift reserves two delivery frames at the head and tail, then integrates smooth velocity ramps around a constant-speed middle. Weight shapes the launch; release shapes the landing. Total travel remains exact. Seamless exports bypass the runway completely because any easing at the seam would create a visible pulse.
'''
write("docs/TEMPORAL_DIRECTION.md", doc)

print("Temporal master runway refinement applied successfully.")
