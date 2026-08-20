#!/usr/bin/env python3
from __future__ import annotations

import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPAIR = ROOT / "scripts/apply_spatial_gauntlet_repair.py"
TEMP = ROOT / "scripts/apply_spatial_gauntlet_repair_v2_fixed.py"


def main() -> None:
    repair = REPAIR.read_text(encoding="utf-8")
    marker = '    FIXED.write_text(source, encoding="utf-8")'
    if marker not in repair:
        raise RuntimeError("Could not locate spatial repair write boundary")

    hardening = r"""
    # Drift names the authored front plane `slide`; earlier migration code
    # assumed a generic `mesh`. Preserve the project's semantic naming.
    source = replace_once(
        source,
        r'''        mesh_line = re.search(r'(?m)^(?P<indent>[ \t]*)mesh:\s*[^;]+;\s*$', interface_body)''',
        r'''        mesh_line = re.search(r'(?m)^(?P<indent>[ \t]*)(?:slide|mesh):\s*[^;]+;\s*$', interface_body)''',
        "SlidePoolItem front-plane field",
    )
    source = replace_once(
        source,
        r'''        mesh_property = re.search(r'(?m)^(?P<indent>[ \t]*)mesh,\s*$', return_body)''',
        r'''        mesh_property = re.search(r'(?m)^(?P<indent>[ \t]*)(?:slide|mesh),\s*$', return_body)''',
        "slide pool return property",
    )

    # Three's uniform map is accessed with TypeScript non-null assertions in
    # Drift (`uPhase!.value`). Accept that exact syntax while still requiring
    # a direct deterministic assignment.
    source = source.replace(r"\.uPhase\.value)", r"\.uPhase!?\.value)")
    source = source.replace(r"\.uTime\.value)", r"\.uTime!?\.value)")

    # `desiredVelocity` begins with the semantic prefix. The old matcher put a
    # greedy identifier before that prefix and could never see it.
    source = source.replace(
        r"r'\b(?:const|let)\s+([A-Za-z_$][\w$]*(?:target|desired)[A-Za-z_$]*Velocity[A-Za-z_$]*)\s*='",
        r"r'\b(?:const|let)\s+((?:target|desired)[A-Za-z_$]*Velocity[A-Za-z_$]*)\s*='",
    )
    source = source.replace(
        r"r'\b([A-Za-z_$][\w$]*(?:target|desired)Velocity[A-Za-z_$]*)\b'",
        r"r'\b((?:target|desired)[A-Za-z_$]*Velocity[A-Za-z_$]*)\b'",
    )

    # updatePoolItem reads the instance settings; no local `settings` binding
    # exists in Drift's renderer. Correct the generated shell/material code at
    # the migration source before TypeScript ever sees it.
    source = source.replace(
        "surfaceModeIndex(settings.slide.surface)",
        "surfaceModeIndex(this.settings.slide.surface)",
    )
    source = source.replace(
        'f"{time_match.group(\'indent\')}  settings,\\n"',
        'f"{time_match.group(\'indent\')}  this.settings,\\n"',
    )
    source = source.replace(
        "SURFACE_PROFILES[settings.slide.surface]",
        "SURFACE_PROFILES[this.settings.slide.surface]",
    )
    source = source.replace(
        "Math.max(0, settings.slide.thickness)",
        "Math.max(0, this.settings.slide.thickness)",
    )
    source = source.replace(
        "shellMaterial.color.set(settings.slide.borderColor)",
        "shellMaterial.color.set(this.settings.slide.borderColor)",
    )
"""

    repair = repair.replace(marker, hardening + "\n" + marker, 1)
    TEMP.write_text(repair, encoding="utf-8")
    try:
        runpy.run_path(str(TEMP), run_name="__main__")
    finally:
        TEMP.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
