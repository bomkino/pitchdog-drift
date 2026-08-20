#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content.rstrip() + "\n", encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


engine = read("src/engine/CinematicCarousel.ts")
engine = replace_once(engine, "  distanceAtTime,\n", "", "remove distance import")
engine = replace_once(engine, "  velocityAtTime,\n", "", "remove velocity import")
engine = replace_once(
    engine,
    '} from "./evaluate";\n',
    '} from "./evaluate";\nimport { evaluateExportMotion } from "./exportMotion";\n',
    "add export motion import",
)
engine = replace_once(
    engine,
    '''  renderAt(time: number): void {
    const geometry = getSlideGeometry(this.settings);
    const slotCount = getLogicalSlotCount(this.assets.length, geometry);
    const distance = distanceAtTime(this.settings, time, slotCount, geometry.stride, true);
    const velocity = velocityAtTime(this.settings, slotCount, geometry.stride, true);
    this.renderInternal(time, distance, velocity, true, 0);
  }
''',
    '''  renderAt(time: number): void {
    const geometry = getSlideGeometry(this.settings);
    const slotCount = getLogicalSlotCount(this.assets.length, geometry);
    const motion = evaluateExportMotion(this.settings, time, slotCount, geometry.stride);
    this.renderInternal(
      time,
      motion.distance,
      motion.velocity,
      true,
      motion.acceleration,
    );
  }
''',
    "wire export motion",
)
engine = replace_once(
    engine,
    "    const distance = distanceAtTime(this.settings, time, slotCount, geometry.stride, true);\n",
    "    const distance = evaluateExportMotion(this.settings, time, slotCount, geometry.stride).distance;\n",
    "preload modulated export frame",
)
write("src/engine/CinematicCarousel.ts", engine)

validation = read("src/lib/settingsValidation.ts")
validation = replace_once(
    validation,
    '''function legacyExtension<T>(value: unknown, fallback: T): unknown | T {
  return value === undefined ? fallback : value;
}
''',
    '''function legacyExtension<T>(value: unknown, fallback: T): unknown | T {
  return value === undefined ? fallback : value;
}

// New projects start authored. Schema-v1 projects created before this branch
// stay flat and constant-speed unless their director explicitly opts in.
const LEGACY_SPATIAL_DEFAULTS = Object.freeze({
  dynamics: "direct" as DynamicsMode,
  bank: 0,
  surface: "card" as SurfaceMode,
  thickness: 0,
});
''',
    "legacy compatibility defaults",
)
validation = replace_once(
    validation,
    "legacyExtension(motion.dynamics, DEFAULT_SETTINGS.motion.dynamics)",
    "legacyExtension(motion.dynamics, LEGACY_SPATIAL_DEFAULTS.dynamics)",
    "legacy dynamics",
)
validation = replace_once(
    validation,
    "legacyExtension(motion.bank, DEFAULT_SETTINGS.motion.bank)",
    "legacyExtension(motion.bank, LEGACY_SPATIAL_DEFAULTS.bank)",
    "legacy bank",
)
validation = replace_once(
    validation,
    "legacyExtension(slide.surface, DEFAULT_SETTINGS.slide.surface)",
    "legacyExtension(slide.surface, LEGACY_SPATIAL_DEFAULTS.surface)",
    "legacy surface",
)
validation = replace_once(
    validation,
    "legacyExtension(slide.thickness, DEFAULT_SETTINGS.slide.thickness)",
    "legacyExtension(slide.thickness, LEGACY_SPATIAL_DEFAULTS.thickness)",
    "legacy thickness",
)
validation = validation.replace("  DEFAULT_SETTINGS,\n", "")
write("src/lib/settingsValidation.ts", validation)

controls = read("src/components/ControlPanel.tsx")
controls = replace_once(
    controls,
    '''const DYNAMICS_NOTES: Readonly<Record<DynamicsMode, string>> = Object.freeze({
  direct: "Immediate and restrained; the carousel stops close to the hand.",
  weighted: "Measured inertia with a confident, editorial release.",
  spring: "Sharper acceleration and a tactile elastic settle.",
  drift: "Long coast and the least resistance after the hand lets go.",
});''',
    '''const DYNAMICS_NOTES: Readonly<Record<DynamicsMode, string>> = Object.freeze({
  direct: "Immediate hand response and an unwavering master cadence.",
  weighted: "Measured hand inertia; the master gathers pace through its middle.",
  spring: "Elastic hand response with a bounded two-beat pulse in the master.",
  drift: "Long hand coast; the master breathes broadly around its mean pace.",
});''',
    "truthful dynamics notes",
)
controls = replace_once(
    controls,
    '          label="Physics"\n',
    '          label="Motion character"\n',
    "rename physics control",
)
write("src/components/ControlPanel.tsx", controls)

e2e = read("e2e/spatial.e2e.ts")
e2e = e2e.replace('{ name: "Physics", exact: true }', '{ name: "Motion character", exact: true }')
e2e = replace_once(
    e2e,
    '  await expect(page.getByText("Long coast and the least resistance after the hand lets go."))\n',
    '  await expect(page.getByText("Long hand coast; the master breathes broadly around its mean pace."))\n',
    "updated motion help assertion",
)
write("e2e/spatial.e2e.ts", e2e)

settings_test = read("tests/spatialSettings.test.ts")
settings_test = replace_once(
    settings_test,
    '''    expect(validated.motion.dynamics).toBe(DEFAULT_SETTINGS.motion.dynamics);
    expect(validated.motion.bank).toBe(DEFAULT_SETTINGS.motion.bank);
    expect(validated.slide.surface).toBe(DEFAULT_SETTINGS.slide.surface);
    expect(validated.slide.thickness).toBe(DEFAULT_SETTINGS.slide.thickness);''',
    '''    expect(validated.motion.dynamics).toBe("direct");
    expect(validated.motion.bank).toBe(0);
    expect(validated.slide.surface).toBe("card");
    expect(validated.slide.thickness).toBe(0);''',
    "legacy settings receipt",
)
write("tests/spatialSettings.test.ts", settings_test)

rendering_test = read("tests/spatialRenderingContract.test.ts")
rendering_test = replace_once(
    rendering_test,
    '    expect(engineSource).toContain("surfacePhaseAtDistance");\n',
    '    expect(engineSource).toContain("surfacePhaseAtDistance");\n    expect(engineSource).toContain("evaluateExportMotion");\n    expect(engineSource).toContain("motion.acceleration");\n',
    "export physics source contract",
)
write("tests/spatialRenderingContract.test.ts", rendering_test)

readme = read("README.md")
readme = replace_once(
    readme,
    "- Horizontal and vertical infinite tracks with straight, arc, ribbon, cylinder, and tunnel paths.\n",
    "- Horizontal and vertical infinite tracks with ten tangent-led paths, from restrained strips to helix, orbit, figure eight, and switchback.\n",
    "README path surface",
)
readme = replace_once(
    readme,
    "- Drag, wheel, keyboard, autoplay, pause, reverse, inertia, and seamless-output lock.\n",
    "- Drag, wheel, keyboard, autoplay, pause, reverse, four motion characters, and seamless-output lock.\n",
    "README motion surface",
)
readme = replace_once(
    readme,
    "- Cover/contain fit, focal point, scale, spacing, depth, tilt, velocity bend, continuous corners, borders, and shadows.\n",
    "- Cover/contain fit, focal point, scale, spacing, path depth and banking, four material deformations, continuous-corner thickness, borders, and shadows.\n",
    "README matter surface",
)
readme = replace_once(
    readme,
    "The `gauntlet/spatial-fabric-dynamics` line adds tangent-led spatial paths, four authored material surfaces, bounded inertial preview physics, and scene-space slide thickness while preserving timestamp-deterministic export.",
    "The `gauntlet/spatial-fabric-dynamics` line adds ten tangent-led paths, four authored material surfaces, refresh-rate-invariant hand physics, analytic motion character in exported masters, and continuous-corner scene-space thickness while preserving timestamp-deterministic output.",
    "README branch summary",
)
write("README.md", readme)

doc = read("docs/SPATIAL_FABRIC_GAUNTLET.md")
doc = replace_once(
    doc,
    "2. Drag or wheel the stage and feel the selected physics character in the hand.\n",
    "2. Drag or wheel the stage and feel the selected character in the hand, then see that character remain legible in the exported master.\n",
    "user journey physics",
)
doc = replace_once(
    doc,
    '''Preview integration is semi-implicit and split into fixed substeps no larger
than `1 / 120 s`. Frame gaps are capped. Velocity, acceleration, displacement,
and release impulses are bounded relative to slide stride. Invalid values are
sanitised before they can poison the render loop.''',
    '''Preview velocity and acceleration are solved as a bounded continuous
second-order system. A closed-form 2 × 2 matrix exponential advances both the
state and its displacement integral, so Direct, Weighted, Spring, and Drift
converge to the same result at 60, 120, or 240 Hz instead of inheriting monitor
cadence. Frame gaps, velocity, acceleration, displacement, and release impulses
remain bounded relative to slide stride. Invalid values are sanitised before
they can poison the render loop.''',
    "exact preview physics",
)
old_export = '''## Deterministic export boundary

Preview state never enters export.

Export position and velocity remain analytic functions of settings and
timestamp. Export acceleration is zero because the authored master travels at
constant analytic velocity. Material airflow still responds to that velocity.
Surface phase derives from analytic distance and track length.

Therefore:

- Pointer history cannot alter an export.
- Display refresh rate cannot alter an export.
- A dropped preview frame cannot alter an export.
- Pausing preview cannot alter an export.
- Seamless start and end share the same path and surface pose.
- Reduced-motion output returns static distance, velocity, acceleration, and
  fabric phase.
'''
new_export = '''## Deterministic export boundary

Preview state never enters export.

Export distance, velocity, and acceleration are analytic functions of settings
and timestamp. The four motion characters alter cadence without altering
average pace or final distance:

- **Direct** keeps constant velocity.
- **Weighted** starts and ends slower, gathering pace through the middle.
- **Spring** adds a bounded two-beat velocity pulse.
- **Drift** starts with a broad release and coasts through the centre.

Each character is defined by a periodic displacement curve. At every whole
master, offset returns to zero and the first two derivatives match across the
cut. Seamless position, speed, fabric acceleration, and deformed-surface
lighting therefore close together. Legacy schema-v1 projects missing the new
fields hydrate to Direct, zero banking, Card, and zero thickness; they do not
silently acquire a new physical treatment.

Therefore:

- Pointer history cannot alter an export.
- Display refresh rate cannot alter an export.
- A dropped preview frame cannot alter an export.
- Pausing preview cannot alter an export.
- Motion character is visible without becoming stateful.
- Seamless start and end share path, velocity, acceleration, and surface pose.
- Reduced-motion output returns static distance, velocity, acceleration, and
  fabric phase.
'''
doc = replace_once(doc, old_export, new_export, "deterministic export section")
doc = replace_once(
    doc,
    "- 60 / 120 / 240 Hz physics comparison.\n",
    "- Exact 60 / 120 / 240 Hz physics convergence.\n- Four distinct analytic export characters with exact ordinary and seamless end distance.\n- Seamless velocity and acceleration closure; no character reverses authored travel.\n",
    "gauntlet coverage",
)
write("docs/SPATIAL_FABRIC_GAUNTLET.md", doc)

print("spatial v4 refinements applied")
