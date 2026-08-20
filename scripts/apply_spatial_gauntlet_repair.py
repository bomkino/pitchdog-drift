#!/usr/bin/env python3
from __future__ import annotations

import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/apply_spatial_gauntlet.py"
FIXED = ROOT / "scripts/apply_spatial_gauntlet_fixed.py"


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    # A cloned percentage formatter may otherwise remove JSX closing braces.
    source = "\n".join(
        line
        for line in source.splitlines()
        if not ("bank = re.sub(" in line and "100" in line)
    ) + "\n"

    # Insert the spatial import after the complete final import statement, including multiline imports.
    old = '''        insertion = text.find("\\n", text.rfind("import ", 0, text.find("export ")))
        expect(insertion >= 0, "Could not find carousel import insertion")'''
    new = '''        imports = list(re.finditer(r'(?ms)^import\\b.*?;\\s*$', text[: text.find("export ")]))
        expect(imports, "Could not find carousel import insertion")
        insertion = imports[-1].end()'''
    if old not in source:
        raise RuntimeError("Could not harden carousel import insertion")
    source = source.replace(old, new, 1)
    source = source.replace(
        'text = text[: insertion + 1] + spatial_import + text[insertion + 1 :]',
        'text = text[:insertion] + spatial_import + text[insertion:]',
        1,
    )

    # Prefer the authored front-plane mesh over the shadow mesh when both are constructed in the pool factory.
    old_mesh = '''        mesh_match = re.search(r'\\bconst\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+THREE\\.Mesh\\s*\\(', create_body)
        expect(mesh_match is not None, "Could not find slide mesh construction")'''
    new_mesh = '''        mesh_match = re.search(r'\\bconst\\s+(mesh)\\s*=\\s*new\\s+THREE\\.Mesh\\s*\\(', create_body)
        if mesh_match is None:
            mesh_match = re.search(r'\\bconst\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+THREE\\.Mesh\\s*\\(', create_body)
        expect(mesh_match is not None, "Could not find slide mesh construction")'''
    if old_mesh not in source:
        raise RuntimeError("Could not harden shell mesh selection")
    source = source.replace(old_mesh, new_mesh, 1)

    FIXED.write_text(source, encoding="utf-8")
    try:
        runpy.run_path(str(FIXED), run_name="__main__")
    finally:
        FIXED.unlink(missing_ok=True)
        (ROOT / "scripts/apply_spatial_gauntlet_repair.py").unlink(missing_ok=True)
        (ROOT / ".github/workflows/spatial-gauntlet-repair.yml").unlink(missing_ok=True)


if __name__ == "__main__":
    main()
