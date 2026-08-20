from pathlib import Path


def replace_once(path_string: str, before: str, after: str) -> None:
    path = Path(path_string)
    source = path.read_text(encoding="utf-8")
    count = source.count(before)
    if count != 1:
        raise RuntimeError(
            f"{path_string}: expected one accessibility target, found {count}."
        )
    path.write_text(source.replace(before, after), encoding="utf-8")


replace_once(
    "src/styles.css",
    """.sonic-palettes input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}""",
    """.sonic-palettes input {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}""",
)

# “Master” also appears in several unrelated export controls. Give the sound
# slider a unique accessible name instead of making assistive technology guess.
replace_once(
    "src/components/SonicDock.tsx",
    '              label="Master"\n',
    '              label="Sound level"\n',
)
replace_once(
    "e2e/studio.e2e.ts",
    'await page.getByLabel("Master").fill("0.41");',
    'await page.getByRole("slider", { name: "Sound level", exact: true }).fill("0.41");',
)
replace_once(
    "e2e/studio.e2e.ts",
    'await expect(page.getByLabel("Master")).toHaveValue("0.41");',
    'await expect(page.getByRole("slider", { name: "Sound level", exact: true })).toHaveValue("0.41");',
)
