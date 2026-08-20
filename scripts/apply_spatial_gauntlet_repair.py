#!/usr/bin/env python3
from __future__ import annotations

import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/apply_spatial_gauntlet.py"
FIXED = ROOT / "scripts/apply_spatial_gauntlet_fixed.py"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise RuntimeError(f"Could not harden {label}")
    return source.replace(old, new, 1)


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    source = replace_once(
        source,
        "r'const FLOWS:[^=]*=\\s*\\[[\\s\\S]*?\\];'",
        "r'const FLOWS(?:\\s*:[^=]+)?\\s*=\\s*\\[[\\s\\S]*?\\](?:\\s+as\\s+const)?;'",
        "FLOWS declaration matcher",
    )
    source = replace_once(
        source,
        "r'^(read(?:Enum|Number)\\()([^,\\n]+),'",
        "r'^((?:read(?:Enum|Number)|oneOf|number)\\()([^,\\n]+),'",
        "legacy extension validator matcher",
    )
    source = replace_once(
        source,
        "rf'import\\s*\\{{(?P<body>.*?)\\}}\\s*from\\s*[\"\\\']{re.escape(module)}[\"\\\'];'",
        "rf'import(?P<type>\\s+type)?\\s*\\{{(?P<body>.*?)\\}}\\s*from\\s*[\"\\\']{re.escape(module)}[\"\\\'];'",
        "optional type-only model import matcher",
    )
    source = replace_once(
        source,
        'replacement = "import {\\n" + "\\n".join(lines).strip("\\n") + f\'\\n}} from "{module}";\'',
        'replacement = "import" + (match.group("type") or "") + " {\\n" + "\\n".join(lines).strip("\\n") + f\'\\n}} from "{module}";\'',
        "type-only model import reconstruction",
    )

    # Replace the legacy DOM-select patcher with one shaped around Drift's
    # typed React controls. Anchors are intentionally semantic and fail closed.
    control_start = source.find("def patch_control_panel(text: str) -> str:")
    control_end = source.find("\n\ndef method_span", control_start)
    if control_start < 0 or control_end < 0:
        raise RuntimeError("Could not replace ControlPanel migration")
    control_patch = r'''def patch_control_panel(text: str) -> str:
    old_paths = ''' + "'''" + r'''          options={[
            { value: "straight", label: "Straight" },
            { value: "arc", label: "Arc" },
            { value: "ribbon", label: "Ribbon" },
            { value: "cylinder", label: "Cylinder" },
            { value: "tunnel", label: "Tunnel" },
          ]}''' + "'''" + r'''
    new_paths = ''' + "'''" + r'''          options={[
            { value: "straight", label: "Straight" },
            { value: "arc", label: "Arc" },
            { value: "ribbon", label: "Ribbon" },
            { value: "cylinder", label: "Cylinder" },
            { value: "tunnel", label: "Tunnel" },
            { value: "helix", label: "Helix" },
            { value: "orbit", label: "Orbit" },
            { value: "cascade", label: "Cascade" },
            { value: "lemniscate", label: "Figure eight" },
            { value: "switchback", label: "Switchback" },
          ]}''' + "'''" + r'''
    if 'value: "helix"' not in text:
        expect(old_paths in text, "Path option registry not found")
        text = text.replace(old_paths, new_paths, 1)

    path_end = ''' + "'''" + r'''          onChange={(flow) => patch("motion", { flow })}
        />''' + "'''" + r'''
    if "settings.motion.dynamics" not in text:
        physics = ''' + "'''" + r'''
        <SelectField
          label="Physics"
          value={settings.motion.dynamics}
          options={[
            { value: "direct", label: "Direct" },
            { value: "weighted", label: "Weighted" },
            { value: "spring", label: "Spring" },
            { value: "drift", label: "Drift" },
          ]}
          onChange={(dynamics) => patch("motion", { dynamics })}
        />''' + "'''" + r'''
        expect(path_end in text, "Path control terminator not found")
        text = text.replace(path_end, path_end + physics, 1)

    tilt = ''' + "'''" + r'''        <RangeField label="Tilt" value={settings.motion.tilt} min={0} max={18} step={0.5} decimals={1} unit="°" onChange={(tilt) => patch("motion", { tilt })} />''' + "'''" + r'''
    if "settings.motion.bank" not in text:
        bank = ''' + "'''" + r'''
        <RangeField label="Path banking" value={settings.motion.bank * 100} min={0} max={100} step={1} unit="%" hint="How strongly each slide follows the path tangent." onChange={(value) => patch("motion", { bank: value / 100 })} />''' + "'''" + r'''
        expect(tilt in text, "Tilt control not found")
        text = text.replace(tilt, tilt + bank, 1)

    text = text.replace(
        'label="Optical bend" value={settings.motion.distortion * 100} min={0} max={100} step={1} unit="%" hint="Velocity drives shader deformation; still frames return crisp."',
        'label="Fabric flex" value={settings.motion.distortion * 100} min={0} max={100} step={1} unit="%" hint="Motion and material drive bounded deformation; zero returns the slide crisp."',
        1,
    )

    fit = ''' + "'''" + r'''        <Segmented label="Image fit" value={settings.slide.fit} options={[{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }]} onChange={(fit) => patch("slide", { fit })} />''' + "'''" + r'''
    if "settings.slide.surface" not in text:
        surface = ''' + "'''" + r'''
        <SelectField
          label="Material"
          value={settings.slide.surface}
          options={[
            { value: "card", label: "Card · rigid" },
            { value: "paper", label: "Paper · curled" },
            { value: "silk", label: "Silk · folded" },
            { value: "gel", label: "Gel · elastic" },
          ]}
          onChange={(surface) => patch("slide", { surface })}
        />''' + "'''" + r'''
        expect(fit in text, "Image fit control not found")
        text = text.replace(fit, fit + surface, 1)

    border = ''' + "'''" + r'''        <RangeField label="Border" value={settings.slide.borderWidth} min={0} max={16} step={0.5} decimals={1} unit=" px" onChange={(borderWidth) => patch("slide", { borderWidth })} />''' + "'''" + r'''
    if "settings.slide.thickness" not in text:
        thickness = ''' + "'''" + r'''
        <RangeField label="3D thickness" value={settings.slide.thickness} min={0} max={32} step={0.5} decimals={1} unit=" px" hint="Scene-space edge depth; zero keeps the slide perfectly flat." onChange={(thickness) => patch("slide", { thickness })} />''' + "'''" + r'''
        expect(border in text, "Border control not found")
        text = text.replace(border, thickness + "\n" + border, 1)

    for required in (
        "settings.motion.dynamics",
        "settings.motion.bank",
        "settings.slide.surface",
        "settings.slide.thickness",
        'value: "switchback"',
        'label="Fabric flex"',
    ):
        expect(required in text, f"Control panel patch missing {required}")
    return text
'''
    source = source[:control_start] + control_patch + source[control_end:]

    # Insert the dynamics import after complete multiline imports.
    old = '''        insertion = text.find("\\n", text.rfind("import ", 0, text.find("export ")))
        expect(insertion >= 0, "Could not find carousel import insertion")'''
    new = '''        imports = list(re.finditer(r'(?ms)^import\\b.*?;\\s*$', text[: text.find("export ")]))
        expect(imports, "Could not find carousel import insertion")
        insertion = imports[-1].end()'''
    source = replace_once(source, old, new, "carousel import insertion")
    source = replace_once(
        source,
        'text = text[: insertion + 1] + spatial_import + text[insertion + 1 :]',
        'text = text[:insertion] + spatial_import + text[insertion:]',
        "carousel import splice",
    )

    old_mesh = '''        mesh_match = re.search(r'\\bconst\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+THREE\\.Mesh\\s*\\(', create_body)
        expect(mesh_match is not None, "Could not find slide mesh construction")'''
    new_mesh = '''        mesh_match = re.search(r'\\bconst\\s+(slide)\\s*=\\s*new\\s+THREE\\.Mesh\\s*\\(', create_body)
        if mesh_match is None:
            mesh_match = re.search(r'\\bconst\\s+(mesh)\\s*=\\s*new\\s+THREE\\.Mesh\\s*\\(', create_body)
        if mesh_match is None:
            mesh_match = re.search(r'\\bconst\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+THREE\\.Mesh\\s*\\(', create_body)
        expect(mesh_match is not None, "Could not find slide mesh construction")'''
    source = replace_once(source, old_mesh, new_mesh, "shell mesh selection")

    FIXED.write_text(source, encoding="utf-8")
    try:
        runpy.run_path(str(FIXED), run_name="__main__")
    finally:
        FIXED.unlink(missing_ok=True)
        (ROOT / "scripts/apply_spatial_gauntlet_repair.py").unlink(missing_ok=True)
        (ROOT / ".github/workflows/spatial-gauntlet-repair.yml").unlink(missing_ok=True)


if __name__ == "__main__":
    main()
