#!/usr/bin/env python3
"""Close the final user-journey and 12-gobo dispatch gaps after the main pass."""
from pathlib import Path


def replace_once(path: str, old: str, new: str, marker: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if marker in text:
        print(f"already applied: {path} :: {marker}")
        return
    if old not in text:
        raise RuntimeError(f"Could not find expected source in {path}: {old[:100]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"updated: {path} :: {marker}")


# Test the visible user journey: the shadow controls live in a disclosure.
replace_once(
    "e2e/studio.e2e.ts",
    '''  await expect(page.getByRole("combobox", { name: "Light movement" })).toHaveValue("static");
  await expect(page.getByRole("combobox", { name: "Light shape" })).toHaveValue("slit");''',
    '''  await expect(page.getByRole("combobox", { name: "Light movement" })).toHaveValue("static");
  await page.getByText("Shadow & spill", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Light shape" })).toHaveValue("slit");''',
    'await page.getByText("Shadow & spill", { exact: true }).click();',
)

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
