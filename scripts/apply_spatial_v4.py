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


evaluate = read("src/engine/evaluate.ts")
evaluate = replace_once(
    evaluate,
    '''  const tilt = Math.max(0, settings.motion.tilt) * DEG;
  const bank = clamp(settings.motion.bank, 0, 1);
  const maximumBank = tilt * (0.42 + bank * 1.58);
  const tangentRoll = Math.atan2(tangent.cross, Math.max(0.001, tangent.primary));
  const tangentPitch = Math.atan2(-tangent.z, Math.max(0.001, tangent.primary));
  const softTwist = Math.sin(normalized * Math.PI) * tilt * 0.18;
  const bankStrength = bank;

  let rotationX = 0;
  let rotationY = 0;
  let rotationZ = clamp(tangentRoll * bankStrength + softTwist, -maximumBank, maximumBank);
  if (settings.motion.axis === "vertical") {
    rotationX = clamp(tangentPitch * bankStrength, -maximumBank, maximumBank);
  } else {
    rotationY = clamp(-tangentPitch * bankStrength, -maximumBank, maximumBank);
  }
  if (settings.motion.flow === "helix" || settings.motion.flow === "orbit") {
    rotationZ = clamp(
      rotationZ + Math.sin(normalized * Math.PI * 1.15) * maximumBank * 0.34 * bank,
      -maximumBank,
      maximumBank,
    );
  }
''',
    '''  const tilt = Math.max(0, settings.motion.tilt) * DEG;
  const bank = clamp(settings.motion.bank, 0, 1);
  const tangentLimit = (4 + Math.max(0, settings.motion.tilt) * 1.5) * DEG;
  const tangentRoll = Math.atan2(tangent.cross, Math.max(0.001, tangent.primary));
  const tangentPitch = Math.atan2(-tangent.z, Math.max(0.001, tangent.primary));
  const softTwist = Math.sin(normalized * Math.PI) * tilt * 0.18;
  const bankedRoll = clamp(tangentRoll, -tangentLimit, tangentLimit) * bank;
  const bankedPitch = clamp(tangentPitch, -tangentLimit, tangentLimit) * bank;
  const combinedLimit = tilt + tangentLimit * bank;

  let rotationX = 0;
  let rotationY = 0;
  let rotationZ = bankedRoll + softTwist;
  if (settings.motion.axis === "vertical") {
    rotationX = bankedPitch;
  } else {
    rotationY = -bankedPitch;
  }
  if (settings.motion.flow === "helix" || settings.motion.flow === "orbit") {
    rotationZ += Math.sin(normalized * Math.PI * 1.15) * tangentLimit * 0.34 * bank;
  }
  rotationX = clamp(rotationX, -combinedLimit, combinedLimit);
  rotationY = clamp(rotationY, -combinedLimit, combinedLimit);
  rotationZ = clamp(rotationZ, -combinedLimit, combinedLimit);
''',
    "decouple path banking from base tilt",
)
write("src/engine/evaluate.ts", evaluate)

engine = read("src/engine/CinematicCarousel.ts")
engine = replace_once(
    engine,
    '''    const autoplay = this.settings.motion.autoplay;
    const desiredVelocity = autoplay
      ? this.settings.motion.direction * this.settings.motion.speed * geometry.stride
      : 0;
''',
    '''    const autoplay = this.settings.motion.autoplay;
    const desiredVelocity = autoplay
      ? evaluateExportMotion(
          this.settings,
          this.elapsed,
          slotCount,
          geometry.stride,
        ).velocity
      : 0;
''',
    "preview the authored master cadence",
)
write("src/engine/CinematicCarousel.ts", engine)

controls = read("src/components/ControlPanel.tsx")
controls = replace_once(
    controls,
    '<RangeField label="Tilt" value={settings.motion.tilt} min={0} max={18} step={0.5} decimals={1} unit="°" onChange={(tilt) => patch("motion", { tilt })} />',
    '<RangeField label="Tilt" value={settings.motion.tilt} min={0} max={18} step={0.5} decimals={1} unit="°" hint="A base editorial twist; independent from tangent-follow banking." onChange={(tilt) => patch("motion", { tilt })} />',
    "tilt consequence copy",
)
controls = replace_once(
    controls,
    'hint="How strongly each slide follows the path tangent."',
    'hint="How strongly each slide follows the path tangent; still works when base Tilt is zero."',
    "banking consequence copy",
)
controls = replace_once(
    controls,
    'hint="Scene-space edge depth; zero keeps the slide perfectly flat."',
    'hint="Scene-space edge depth using Border colour as the visible stock; zero stays perfectly flat."',
    "thickness consequence copy",
)
write("src/components/ControlPanel.tsx", controls)

doc = read("docs/SPATIAL_FABRIC_GAUNTLET.md")
doc = replace_once(
    doc,
    "The selected dynamics mode governs autoplay settling, drag release, and wheel\nimpulses. It does not sit beside direct manipulation as an unrelated effect.\n",
    "The selected motion character governs autoplay cadence, drag release, and wheel\nimpulses. Preview autoplay follows the same analytic cadence authored for the\nmaster, while direct manipulation remains a bounded second-order response.\n",
    "preview and master parity documentation",
)
doc = replace_once(
    doc,
    "Banking derives from local path tangent, then clamps to a bounded angle. It is\nnot a second unrelated sine rotation.\n",
    "Banking derives from local path tangent, then clamps to a bounded angle. It is\nnot a second unrelated sine rotation, and it remains effective when base Tilt\nis zero. Tilt contributes a separate editorial twist.\n",
    "independent banking documentation",
)
doc = replace_once(
    doc,
    "All surfaces share the same bounded resident mesh pool. No imported slide can\ncreate an unbounded scene object.\n",
    "All surfaces share the same bounded resident mesh pool. Deformation amplitude\nscales from the slide's shorter dimension, so a 256 px proof and an 8192 px\nmaster keep the same material character. Artwork UVs remain registered to the\ndeformed face: the slide bends, but its typography never swims inside it. No\nimported slide can create an unbounded scene object.\n",
    "resolution and artwork registration documentation",
)
write("docs/SPATIAL_FABRIC_GAUNTLET.md", doc)

print("spatial v5 interaction parity applied")
