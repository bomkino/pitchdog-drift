from pathlib import Path

path = Path(__file__).resolve().parents[1] / "src" / "lighting.ts"
source = path.read_text(encoding="utf-8")
old = '  if (phase === 0 || mode === "static" || amount <= 0) {\n'
new = '  if (mode === "static" || amount <= 0) {\n'
if source.count(old) != 1:
    raise RuntimeError("Expected exactly one frame-zero lighting special case")
path.write_text(source.replace(old, new, 1), encoding="utf-8")
