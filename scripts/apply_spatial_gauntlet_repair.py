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

    # Accept both the repository's inferred `as const` declaration and an
    # explicitly annotated tuple. Migration code must follow the project, not
    # demand that the project follow one formatter shape.
    source = replace_once(
        source,
        "r'const FLOWS:[^=]*=\\s*\\[[\\s\\S]*?\\];'",
        "r'const FLOWS(?:\\s*:[^=]+)?\\s*=\\s*\\[[\\s\\S]*?\\](?:\\s+as\\s+const)?;'",
        "FLOWS declaration matcher",
    )

    # The current trust boundary uses `oneOf` and `number`; an older patcher
    # expected `readEnum` and `readNumber`. Support both without weakening
    # validation of explicitly supplied values.
    source = replace_once(
        source,
        "r'^(read(?:Enum|Number)\\()([^,\\n]+),'",
        "r'^((?:read(?:Enum|Number)|oneOf|number)\\()([^,\\n]+),'",
        "legacy extension validator matcher",
    )

    # A cloned percentage formatter may otherwise remove JSX closing braces.
    source = "\n".join(
        line
        for line in source.splitlines()
        if not ("bank = re.sub(" in line and "100" in line)
    ) + "\n"

    # Insert the spatial import after the complete final import statement,
    # including multiline imports.
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

    # Prefer the authored front-plane mesh over the shadow mesh when both are
    # constructed in the pool factory.
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
