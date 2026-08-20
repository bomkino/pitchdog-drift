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
        raise RuntimeError(f"Could not find expected source in {path}: {old[:100]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"updated: {path} :: {marker}")


# Test the visible user journey: Light shape lives in the Shadow & spill
# disclosure. Insert the real user action directly before its first assertion,
# regardless of how the surrounding block has grown.
e2e_path = Path("e2e/studio.e2e.ts")
e2e = e2e_path.read_text(encoding="utf-8")
journey_marker = 'await page.getByText("Shadow & spill", { exact: true }).click();'
if journey_marker not in e2e:
    pattern = re.compile(
        r'(?m)^(?P<indent>\s*)await expect\(page\.getByRole\("combobox", \{ name: "Light shape" \}\)\)\.toHaveValue\("slit"\);'
    )
    match = pattern.search(e2e)
    if not match:
        raise RuntimeError("Could not find the Light shape assertion in e2e/studio.e2e.ts")
    indent = match.group("indent")
    replacement = (
        f'{indent}{journey_marker}\n'
        f'{indent}await expect(page.getByRole("combobox", {{ name: "Light shape" }})).toHaveValue("slit");'
    )
    e2e_path.write_text(e2e[:match.start()] + replacement + e2e[match.end():], encoding="utf-8")
    print("updated: e2e/studio.e2e.ts :: open Shadow & spill")
else:
    print("already applied: e2e/studio.e2e.ts :: open Shadow & spill")

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
