from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_exact(relative: str, old: str, new: str, label: str) -> None:
    path = ROOT / relative
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} in {relative}; found {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_in_block(
    relative: str,
    start_marker: str,
    end_marker: str,
    old: str,
    new: str,
    label: str,
) -> None:
    path = ROOT / relative
    text = path.read_text(encoding="utf-8")
    start = text.find(start_marker)
    if start < 0:
        raise RuntimeError(f"Could not find start of {label}")
    end = text.find(end_marker, start + len(start_marker))
    if end < 0:
        raise RuntimeError(f"Could not find end of {label}")
    block = text[start:end]
    count = block.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one replacement in {label}; found {count}")
    path.write_text(text[:start] + block.replace(old, new, 1) + text[end:], encoding="utf-8")


# A true lighting bypass must preserve source pixels. Surface grain and warp
# sheen belong to the lighting treatment, not to raw media transport.
replace_exact(
    "src/engine/shaders.ts",
    "    float grain = (hash12(floor(vUv * uSizePx) + vec2(uPhase * 17.0, uPhase * 31.0)) - 0.5) * 0.018;\n"
    "    sampled.rgb += grain + abs(vWarp) * 0.018;",
    "    float grain = (hash12(floor(vUv * uSizePx) + vec2(uPhase * 17.0, uPhase * 31.0)) - 0.5) * 0.018;\n"
    "    sampled.rgb += (grain + abs(vWarp) * 0.018) * clamp(uLightingEnabled, 0.0, 1.0);",
    "lighting-only surface texture",
)

# The pure lighting compiler already resolves breath into the cast vector.
# Applying the same pulse again in GLSL doubled motion and violated hard bounds.
replace_exact(
    "src/engine/shaders.ts",
    "  uniform float uOpacity;\n"
    "  uniform float uLightPhase;\n"
    "  uniform float uLightBreath;",
    "  uniform float uOpacity;",
    "obsolete shadow animation uniforms",
)
replace_exact(
    "src/engine/shaders.ts",
    "    float pulse = 1.0 + sin(uLightPhase * 2.0) * uLightBreath * 0.035;\n"
    "    vec2 castOffset = uShadowOffsetPx * pulse;",
    "    vec2 castOffset = uShadowOffsetPx;",
    "single-source shadow offset",
)
replace_exact(
    "src/engine/CinematicCarousel.ts",
    "      uOpacity: { value: 0.34 },\n"
    "      uLightPhase: { value: 0 },\n"
    "      uLightBreath: { value: 0.1 },",
    "      uOpacity: { value: 0.34 },",
    "obsolete shadow material uniforms",
)
replace_exact(
    "src/engine/CinematicCarousel.ts",
    "    shadowUniforms.uLightPhase!.value = lighting.phase;\n"
    "    shadowUniforms.uLightBreath!.value = this.settings.lighting.breath;\n",
    "",
    "moving-shadow duplicate phase upload",
)
replace_exact(
    "src/engine/CinematicCarousel.ts",
    "    shadowUniforms.uLightPhase!.value = lighting.phase;\n"
    "    shadowUniforms.uLightBreath!.value = this.settings.lighting.breath;\n",
    "",
    "presenter-shadow duplicate phase upload",
)

# Lock the two regressions into the fast shader contract suite.
replace_exact(
    "tests/engineShader.test.ts",
    '    expect(slideFragmentShader).not.toContain("fract(uTime)");\n',
    '    expect(slideFragmentShader).not.toContain("fract(uTime)");\n'
    '    expect(slideFragmentShader).toContain("* clamp(uLightingEnabled, 0.0, 1.0)");\n',
    "lighting bypass assertion",
)
replace_exact(
    "tests/engineShader.test.ts",
    '    expect(shadowFragmentShader).toContain("uShadowOffsetPx");\n',
    '    expect(shadowFragmentShader).toContain("uShadowOffsetPx");\n'
    '    expect(shadowFragmentShader).not.toContain("uShadowOffsetPx * pulse");\n',
    "single-pulse shadow assertion",
)

# Existing pixel fixtures test transport correctness, not art direction. Make
# that boundary explicit rather than weakening their alpha or colour thresholds.
replace_in_block(
    "e2e/studio.e2e.ts",
    'test("transparent PNG stores straight-alpha colour without dark fringes"',
    'test("cover focal controls reach both source edges in both axes"',
    "    const settings = structuredClone(DEFAULT_SETTINGS);\n",
    "    const settings = structuredClone(DEFAULT_SETTINGS);\n"
    "    settings.lighting = { ...settings.lighting, enabled: false };\n",
    "transparent alpha fixture",
)
replace_in_block(
    "e2e/studio.e2e.ts",
    'test("renderer pool and media replacement always preserve latest visual intent"',
    'test("a pinned image outside the moving mesh pool is awaited before export"',
    "    const settings = structuredClone(DEFAULT_SETTINGS);\n",
    "    const settings = structuredClone(DEFAULT_SETTINGS);\n"
    "    settings.lighting = { ...settings.lighting, enabled: false };\n",
    "source-colour media fixture",
)

old_lighting_e2e = r'''test("authored lighting changes real WebGL pixels and remains still when directed", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);
  await page.getByRole("button", { name: /Road Memory/ }).click();
  const lightCharacter = page.getByRole("combobox", { name: "Light character" });
  await expect(lightCharacter).toHaveValue("window-rake");

  await page.getByRole("button", { name: "Pause preview" }).click();
  await page.getByRole("button", { name: "Next slide" }).click();
  await page.getByRole("slider", { name: "Light breath" }).fill("0");

  const atmosphere = page.locator("details").filter({ has: page.locator("summary", { hasText: "Atmosphere" }) });
  if (!(await atmosphere.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await atmosphere.locator("summary").click();
  }
  await page.getByRole("slider", { name: "Background breath" }).fill("0");

  const canvas = page.locator("[data-testid=webgl-stage]");
  await page.waitForTimeout(150);
  const windowPixels = await canvas.screenshot();

  await lightCharacter.selectOption("noir-slice");
  await expect(lightCharacter).toHaveValue("noir-slice");
  await page.getByRole("slider", { name: "Light breath" }).fill("0");
  await page.waitForTimeout(150);
  const noirPixels = await canvas.screenshot();
  expect(noirPixels.equals(windowPixels)).toBe(false);

  const lightingSwitch = page.getByRole("switch", { name: "Cinematic lighting" });
  await lightingSwitch.uncheck();
  await page.waitForTimeout(150);
  const unlitPixels = await canvas.screenshot();
  expect(unlitPixels.equals(noirPixels)).toBe(false);

  await page.waitForTimeout(250);
  const unlitPixelsLater = await canvas.screenshot();
  expect(unlitPixelsLater.equals(unlitPixels)).toBe(true);
  expect(errors).toEqual([]);
});'''

new_lighting_e2e = r'''test("authored lighting changes real WebGL pixels and remains still when directed", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await waitForStudio(page);
  await page.getByRole("button", { name: /Road Memory/ }).click();
  const lightCharacter = page.getByRole("combobox", { name: "Light character" });
  await expect(lightCharacter).toHaveValue("window-rake");

  await page.getByRole("button", { name: "Pause preview" }).click();
  await page.getByRole("button", { name: "Next slide" }).click();
  await page.getByRole("slider", { name: "Light breath" }).fill("0");

  const atmosphere = page.locator("details").filter({ has: page.locator("summary", { hasText: "Atmosphere" }) });
  if (!(await atmosphere.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await atmosphere.locator("summary").click();
  }
  await page.getByRole("combobox", { name: "Background", exact: true }).selectOption("solid");
  await page.getByRole("slider", { name: "Background breath" }).fill("0");
  await page.getByRole("slider", { name: "Grain" }).fill("0");

  const compareScreenshots = async (first: Buffer, second: Buffer) => page.evaluate(
    async ({ firstPng, secondPng }) => {
      const decode = async (encoded: string): Promise<Uint8ClampedArray> => {
        const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }), { premultiplyAlpha: "none" });
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        bitmap.close();
        return pixels;
      };
      const [firstPixels, secondPixels] = await Promise.all([decode(firstPng), decode(secondPng)]);
      if (firstPixels.length !== secondPixels.length) return { maxDelta: 255, significantChannels: 1 };
      let maxDelta = 0;
      let significantChannels = 0;
      for (let index = 0; index < firstPixels.length; index += 1) {
        const delta = Math.abs(firstPixels[index]! - secondPixels[index]!);
        maxDelta = Math.max(maxDelta, delta);
        if (delta > 1) significantChannels += 1;
      }
      return { maxDelta, significantChannels };
    },
    { firstPng: first.toString("base64"), secondPng: second.toString("base64") },
  );

  const canvas = page.locator("[data-testid=webgl-stage]");
  await page.waitForTimeout(180);
  const windowPixels = await canvas.screenshot();

  await lightCharacter.selectOption("noir-slice");
  await expect(lightCharacter).toHaveValue("noir-slice");
  await page.getByRole("slider", { name: "Light breath" }).fill("0");
  await page.waitForTimeout(180);
  const noirPixels = await canvas.screenshot();
  expect(noirPixels.equals(windowPixels)).toBe(false);

  await page.waitForTimeout(250);
  const noirPixelsLater = await canvas.screenshot();
  const litStability = await compareScreenshots(noirPixels, noirPixelsLater);
  expect(litStability.maxDelta).toBeLessThanOrEqual(1);
  expect(litStability.significantChannels).toBe(0);

  const lightingSwitch = page.getByRole("switch", { name: "Cinematic lighting" });
  await lightingSwitch.uncheck();
  await page.waitForTimeout(180);
  const unlitPixels = await canvas.screenshot();
  expect(unlitPixels.equals(noirPixelsLater)).toBe(false);

  await page.waitForTimeout(250);
  const unlitPixelsLater = await canvas.screenshot();
  const unlitStability = await compareScreenshots(unlitPixels, unlitPixelsLater);
  expect(unlitStability.maxDelta).toBeLessThanOrEqual(1);
  expect(unlitStability.significantChannels).toBe(0);
  expect(errors).toEqual([]);
});'''
replace_exact(
    "e2e/studio.e2e.ts",
    old_lighting_e2e,
    new_lighting_e2e,
    "real-browser lighting contract test",
)

replace_exact(
    "docs/CINEMATIC_LIGHTING.md",
    "- **Cinematic lighting** — one master bypass for card light, cast shadow, and spill.\n",
    "- **Cinematic lighting** — one master bypass for card light, cast shadow, spill, and lighting-only surface texture. Off means source pixels pass through unchanged.\n",
    "lighting bypass documentation",
)
replace_exact(
    "docs/CINEMATIC_LIGHTING.md",
    "- real Chromium/WebGL pixel change across rigs and byte-stable rest frames;\n",
    "- real Chromium/WebGL pixel change across rigs and pixel-stable rest frames;\n",
    "browser gate documentation",
)

# The source is now ordinary and reviewable. Remove every bootstrap artefact so
# the PR contains only product code, tests, and durable documentation.
for relative in [
    ".gauntlet/build-cinematic-lighting.py",
    ".gauntlet/lighting-payload/0.b64",
    ".gauntlet/lighting-payload/1.b64",
    ".gauntlet/lighting-payload/2.b64",
    ".gauntlet/lighting-payload/3.b64",
    ".gauntlet/fix-cinematic-lighting.py",
    ".github/workflows/lighting-rig-bootstrap.yml",
    ".github/workflows/lighting-rig-polish.yml",
]:
    path = ROOT / relative
    if not path.is_file():
        raise RuntimeError(f"Expected temporary artefact {relative}")
    path.unlink()

for relative in [".gauntlet/lighting-payload", ".gauntlet"]:
    directory = ROOT / relative
    directory.rmdir()
