#!/usr/bin/env python3
"""Close the final user-journey and 12-gobo dispatch gaps after the main pass."""
from pathlib import Path
import re


def replace_once(path: str, old: str, new: str, marker: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if marker in text:
        print(f"already applied: {path} :: {marker}")
        return
    if old not in text:
        raise RuntimeError(f"Could not find expected source in {path}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"updated: {path} :: {marker}")


# Test the real visible journey. The main pass previously used a generic marker
# that collided with another count assertion in this large suite, so use the
# unique Noir Slice preset transition as the fallback anchor.
e2e_path = Path("e2e/studio.e2e.ts")
e2e = e2e_path.read_text(encoding="utf-8")
journey_marker = 'await page.getByText("Shadow & spill", { exact: true }).click();'
if journey_marker not in e2e:
    assertion_pattern = re.compile(
        r'(?m)^(?P<indent>[ \t]*)await expect\(page\.getByRole\("combobox", \{ name: "Light shape" \}\)\)\.toHaveValue\("slit"\);'
    )
    match = assertion_pattern.search(e2e)
    if match:
        indent = match.group("indent")
        replacement = (
            f'{indent}{journey_marker}\n'
            f'{indent}await expect(page.getByRole("combobox", {{ name: "Light shape" }})).toHaveValue("slit");'
        )
        e2e = e2e[:match.start()] + replacement + e2e[match.end():]
    else:
        old = '''  await lightCharacter.selectOption("noir-slice");
  await expect(lightCharacter).toHaveValue("noir-slice");
  await page.getByRole("slider", { name: "Light breath" }).fill("0");'''
        new = '''  await lightCharacter.selectOption("noir-slice");
  await expect(lightCharacter).toHaveValue("noir-slice");
  await expect(page.getByRole("combobox", { name: "Light movement" })).toHaveValue("static");
  await page.getByText("Shadow & spill", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Light shape" })).toHaveValue("slit");
  await expect(page.getByRole("combobox", { name: "Light shape" }).locator("option")).toHaveCount(12);
  await expect(page.getByRole("slider", { name: "Protect artwork" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Protect hero" })).toBeVisible();
  await page.getByRole("slider", { name: "Light breath" }).fill("0");'''
        if old not in e2e:
            raise RuntimeError("Could not find the unique Noir Slice transition in e2e/studio.e2e.ts")
        e2e = e2e.replace(old, new, 1)
    e2e_path.write_text(e2e, encoding="utf-8")
    print("updated: e2e/studio.e2e.ts :: complete visible lighting journey")
else:
    print("already applied: e2e/studio.e2e.ts :: complete visible lighting journey")

# The first generated 12-field dispatcher let mode 0 fall through to the
# projector branch. Make every numeric band explicit so Softbox really is 0.
replace_once(
    "src/engine/shaders.ts",
    '''    float selected = softbox;
    if (uLightGobo >= 0.5 && uLightGobo < 1.5) selected = window;
    else if (uLightGobo < 2.5) selected = clamp(projector, 0.0, 1.0);''',
    '''    float selected = softbox;
    if (uLightGobo < 0.5) selected = softbox;
    else if (uLightGobo < 1.5) selected = window;
    else if (uLightGobo < 2.5) selected = clamp(projector, 0.0, 1.0);''',
    'if (uLightGobo < 0.5) selected = softbox;',
)

# Keep the fall-through bug dead permanently.
replace_once(
    "tests/engineShader.test.ts",
    '''    expect(backgroundFragmentShader).toContain("uGoboStrength");
    expect(backgroundFragmentShader).toContain("uLightCenter");''',
    '''    expect(backgroundFragmentShader).toContain("uGoboStrength");
    expect(backgroundFragmentShader).toContain("if (uLightGobo < 0.5) selected = softbox;");
    expect(backgroundFragmentShader).toContain("else if (uLightGobo < 1.5) selected = window;");
    expect(backgroundFragmentShader).not.toContain("uLightGobo >= 0.5 && uLightGobo < 1.5");
    expect(backgroundFragmentShader).toContain("uLightCenter");''',
    'not.toContain("uLightGobo >= 0.5 && uLightGobo < 1.5")',
)
