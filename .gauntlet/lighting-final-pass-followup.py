#!/usr/bin/env python3
"""Open the real shadow disclosure before asserting its controls."""
from pathlib import Path

path = Path("e2e/studio.e2e.ts")
text = path.read_text(encoding="utf-8")
marker = 'await page.getByText("Shadow & spill", { exact: true }).click();'
if marker not in text:
    old = '''  await expect(page.getByRole("combobox", { name: "Light movement" })).toHaveValue("static");
  await expect(page.getByRole("combobox", { name: "Light shape" })).toHaveValue("slit");'''
    new = '''  await expect(page.getByRole("combobox", { name: "Light movement" })).toHaveValue("static");
  await page.getByText("Shadow & spill", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Light shape" })).toHaveValue("slit");'''
    if old not in text:
        raise RuntimeError("Could not find the lighting journey assertion block.")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("updated: e2e/studio.e2e.ts :: open Shadow & spill")
else:
    print("already applied: Shadow & spill journey")
