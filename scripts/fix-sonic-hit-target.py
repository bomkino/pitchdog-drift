from pathlib import Path

path = Path("src/styles.css")
source = path.read_text(encoding="utf-8")
before = """.sonic-palettes input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}"""
after = """.sonic-palettes input {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}"""
count = source.count(before)
if count != 1:
    raise RuntimeError(
        f"Expected one palette radio hit-target block, found {count}."
    )
path.write_text(source.replace(before, after), encoding="utf-8")
