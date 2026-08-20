from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    (ROOT / relative).write_text(content, encoding="utf-8")


def replace_exact(relative: str, old: str, new: str, label: str) -> None:
    text = read(relative)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} in {relative}; found {count}")
    write(relative, text.replace(old, new, 1))


def insert_before(relative: str, marker: str, insertion: str, label: str) -> None:
    text = read(relative)
    count = text.count(marker)
    if count != 1:
        raise RuntimeError(f"Expected one {label} marker in {relative}; found {count}")
    write(relative, text.replace(marker, insertion + marker, 1))


# ---------------------------------------------------------------------------
# Honest visual versioning and a canonical legacy portability mirror.
# ---------------------------------------------------------------------------
replace_exact(
    "src/model.ts",
    'export const SHADER_VERSION = "1.0.0";',
    'export const PRE_LIGHTING_SHADER_VERSION = "1.0.0";\nexport const SHADER_VERSION = "1.1.0";',
    "shader version",
)
replace_exact(
    "src/model.ts",
    "  shadowOpacity: number;\n  shadowSoftness: number;\n}",
    "  /** Legacy schema-v1 portability mirror. Rendering uses lighting.shadowOpacity. */\n"
    "  shadowOpacity: number;\n"
    "  /** Legacy schema-v1 portability mirror. Rendering uses lighting.shadowSoftness. */\n"
    "  shadowSoftness: number;\n}",
    "legacy slide-shadow fields",
)
insert_before(
    "src/model.ts",
    "export interface StudioAsset {\n",
    "export const LEGACY_SLIDE_SHADOW_LIMITS = Object.freeze({\n"
    "  opacity: Object.freeze({ min: 0, max: 0.8 }),\n"
    "  softness: Object.freeze({ min: 4, max: 96 }),\n"
    "} as const);\n\n"
    "export function legacyShadowFromLighting(\n"
    "  lighting: Pick<LightingSettings, \"shadowOpacity\" | \"shadowSoftness\">,\n"
    "): Pick<SlideSettings, \"shadowOpacity\" | \"shadowSoftness\"> {\n"
    "  return {\n"
    "    shadowOpacity: Math.min(\n"
    "      LEGACY_SLIDE_SHADOW_LIMITS.opacity.max,\n"
    "      Math.max(LEGACY_SLIDE_SHADOW_LIMITS.opacity.min, lighting.shadowOpacity),\n"
    "    ),\n"
    "    shadowSoftness: Math.min(\n"
    "      LEGACY_SLIDE_SHADOW_LIMITS.softness.max,\n"
    "      Math.max(LEGACY_SLIDE_SHADOW_LIMITS.softness.min, lighting.shadowSoftness),\n"
    "    ),\n"
    "  };\n"
    "}\n\n"
    "/**\n"
    " * Keeps additive lighting projects as faithful as schema v1 can represent\n"
    " * when opened by a pre-lighting build. Current rendering never reads the\n"
    " * legacy slide fields.\n"
    " */\n"
    "export function syncLegacyShadowSettings(settings: StudioSettings): StudioSettings {\n"
    "  const legacy = legacyShadowFromLighting(settings.lighting);\n"
    "  if (\n"
    "    settings.slide.shadowOpacity === legacy.shadowOpacity\n"
    "    && settings.slide.shadowSoftness === legacy.shadowSoftness\n"
    "  ) return settings;\n"
    "  return {\n"
    "    ...settings,\n"
    "    slide: { ...settings.slide, ...legacy },\n"
    "  };\n"
    "}\n\n",
    "StudioAsset interface",
)
replace_exact(
    "src/model.ts",
    "    shadowSoftness: 34,",
    "    shadowSoftness: 52,",
    "default legacy shadow softness mirror",
)

# Validate old shader projects explicitly, migrate them to v1.1, and make the
# first-class lighting object authoritative over the bounded v1 mirror.
replace_exact(
    "src/lib/settingsValidation.ts",
    "  DEFAULT_SETTINGS,\n"
    "  ENGINE_VERSION,\n"
    "  SCHEMA_VERSION,\n"
    "  SHADER_VERSION,\n"
    "  type StudioSettings,",
    "  DEFAULT_SETTINGS,\n"
    "  ENGINE_VERSION,\n"
    "  PRE_LIGHTING_SHADER_VERSION,\n"
    "  SCHEMA_VERSION,\n"
    "  SHADER_VERSION,\n"
    "  legacyShadowFromLighting,\n"
    "  type StudioSettings,",
    "settings validation imports",
)
replace_exact(
    "src/lib/settingsValidation.ts",
    "const OUTPUT_FPS = [24, 25, 30, 50, 60] as const;",
    "const OUTPUT_FPS = [24, 25, 30, 50, 60] as const;\n"
    "const SUPPORTED_SHADER_VERSIONS = [PRE_LIGHTING_SHADER_VERSION, SHADER_VERSION] as const;",
    "supported shader versions",
)
replace_exact(
    "src/lib/settingsValidation.ts",
    "  literal(source.shaderVersion, \"settings.shaderVersion\", SHADER_VERSION);",
    "  oneOf(source.shaderVersion, \"settings.shaderVersion\", SUPPORTED_SHADER_VERSIONS);",
    "shader-version validation",
)
replace_exact(
    "src/lib/settingsValidation.ts",
    " * exception is the additive v1 lighting section: projects written before\n"
    " * it existed inherit the old slide shadow values and the current neutral rig.",
    " * exceptions are the additive v1 lighting section and pre-lighting shader\n"
    " * version: old projects inherit their visible shadows as an honest custom\n"
    " * rig, then canonicalize to the current shader contract.",
    "validation compatibility comment",
)
replace_exact(
    "src/lib/settingsValidation.ts",
    "        ...DEFAULT_SETTINGS.lighting,\n"
    "        shadowOpacity: slideShadowOpacity,",
    "        ...DEFAULT_SETTINGS.lighting,\n"
    "        preset: \"custom\",\n"
    "        shadowOpacity: slideShadowOpacity,",
    "legacy lighting migration preset",
)

validation_path = "src/lib/settingsValidation.ts"
validation = read(validation_path)
return_index = validation.index("  return {\n")
lighting_start = validation.index("    lighting: {\n", return_index)
presenter_start = validation.index("    presenter: {\n", lighting_start)
lighting_block = validation[lighting_start:presenter_start]
if not lighting_block.endswith("    },\n"):
    raise RuntimeError("Could not isolate inline lighting validation block")
lighting_body = lighting_block[len("    lighting: {\n"):-len("    },\n")]
dedented_body = "\n".join(line[2:] if line.startswith("  ") else line for line in lighting_body.splitlines())
validated_lighting = (
    "  const validatedLighting: StudioSettings[\"lighting\"] = {\n"
    + dedented_body
    + "\n  };\n"
    + "  const legacyShadow = legacyShadowFromLighting(validatedLighting);\n\n"
)
validation = (
    validation[:lighting_start]
    + "    lighting: validatedLighting,\n"
    + validation[presenter_start:]
)
return_index = validation.index("  return {\n")
validation = validation[:return_index] + validated_lighting + validation[return_index:]
if validation.count("      shadowOpacity: slideShadowOpacity,\n      shadowSoftness: slideShadowSoftness,") != 1:
    raise RuntimeError("Expected one legacy slide shadow return pair")
validation = validation.replace(
    "      shadowOpacity: slideShadowOpacity,\n      shadowSoftness: slideShadowSoftness,",
    "      shadowOpacity: legacyShadow.shadowOpacity,\n      shadowSoftness: legacyShadow.shadowSoftness,",
    1,
)
write(validation_path, validation)

# UI edits and recipe application always update the portability mirror too.
replace_exact(
    "src/components/ControlPanel.tsx",
    'import type { LightGobo, LightingPresetId, StudioSettings, ThemeId } from "../model";',
    'import { syncLegacyShadowSettings, type LightGobo, type LightingPresetId, type StudioSettings, type ThemeId } from "../model";',
    "ControlPanel model import",
)
replace_exact(
    "src/components/ControlPanel.tsx",
    "  const patchLighting = (values: Partial<StudioSettings[\"lighting\"]>) => {\n"
    "    onSettings({\n"
    "      ...settings,\n"
    "      lighting: { ...settings.lighting, ...values, preset: \"custom\" },\n"
    "    });\n"
    "  };",
    "  const patchLighting = (values: Partial<StudioSettings[\"lighting\"]>) => {\n"
    "    onSettings(syncLegacyShadowSettings({\n"
    "      ...settings,\n"
    "      lighting: { ...settings.lighting, ...values, preset: \"custom\" },\n"
    "    }));\n"
    "  };",
    "lighting patch canonicalization",
)
replace_exact(
    "src/components/ControlPanel.tsx",
    "            else onSettings({ ...settings, lighting: applyLightingPreset(settings.lighting, preset) });",
    "            else onSettings(syncLegacyShadowSettings({ ...settings, lighting: applyLightingPreset(settings.lighting, preset) }));",
    "lighting recipe canonicalization",
)

# Themes own coherent first-class lighting. Delete the obsolete per-theme shadow
# patches and derive the v1 fallback from the authored rig instead.
replace_exact(
    "src/themes.ts",
    'import { DEFAULT_SETTINGS, type StudioSettings, type ThemeId } from "./model";',
    'import { DEFAULT_SETTINGS, syncLegacyShadowSettings, type StudioSettings, type ThemeId } from "./model";',
    "theme model import",
)
themes = read("src/themes.ts")
function_end = themes.index("export const THEMES")
make_theme = themes[:function_end]
rest = themes[function_end:]
if make_theme.count("    settings: {\n") != 1:
    raise RuntimeError("Expected one makeTheme settings object")
make_theme = make_theme.replace("    settings: {\n", "    settings: syncLegacyShadowSettings({\n", 1)
closing = "      lighting: { ...lightingBase, ...patch.lighting },\n    },\n  };"
if make_theme.count(closing) != 1:
    raise RuntimeError("Expected one makeTheme settings close")
make_theme = make_theme.replace(
    closing,
    "      lighting: { ...lightingBase, ...patch.lighting },\n    }),\n  };",
    1,
)
themes = make_theme + rest
for old, new in [
    (", shadowOpacity: 0.24", ""),
    (", shadowOpacity: 0.62, shadowSoftness: 48", ""),
    (", shadowOpacity: 0.18", ""),
    (", shadowOpacity: 0.28, shadowSoftness: 52", ""),
    (", shadowOpacity: 0.5", ""),
]:
    if themes.count(old) != 1:
        raise RuntimeError(f"Expected one obsolete theme shadow patch: {old}")
    themes = themes.replace(old, new, 1)
write("src/themes.ts", themes)

# Portable saves get a final defensive canonicalization even if future callers
# bypass the current controls.
replace_exact(
    "src/App.tsx",
    "  clearPinnedAssetIfRemoved,\n"
    "  cloneSettings,",
    "  clearPinnedAssetIfRemoved,\n"
    "  cloneSettings,\n"
    "  syncLegacyShadowSettings,",
    "App model imports",
)
replace_exact(
    "src/App.tsx",
    "    settings: cloneSettings(settings),",
    "    settings: cloneSettings(syncLegacyShadowSettings(settings)),",
    "portable settings canonicalization",
)

# ---------------------------------------------------------------------------
# Keep a stage-fixed cast under card roll, prevent fake cast shadows from
# tinting other slide faces, and cull transparent shadow planes entirely.
# ---------------------------------------------------------------------------
insert_before(
    "src/lighting.ts",
    "export interface LightingTimeline {\n",
    "/**\n"
    " * Shadow vectors are authored in stage space, while each analytical SDF\n"
    " * lives in its card's rolled local plane. Inverse-roll the vector so the\n"
    " * apparent source direction does not rotate with the card.\n"
    " */\n"
    "export function localiseShadowOffset(\n"
    "  offset: readonly [number, number],\n"
    "  rotationZ: number,\n"
    "): [number, number] {\n"
    "  const cosine = Math.cos(rotationZ);\n"
    "  const sine = Math.sin(rotationZ);\n"
    "  return [\n"
    "    offset[0] * cosine + offset[1] * sine,\n"
    "    -offset[0] * sine + offset[1] * cosine,\n"
    "  ];\n"
    "}\n\n",
    "lighting timeline interface",
)
replace_exact(
    "src/engine/CinematicCarousel.ts",
    'import { resolveLightingFrame, type ResolvedLightingFrame } from "../lighting";',
    'import { localiseShadowOffset, resolveLightingFrame, type ResolvedLightingFrame } from "../lighting";',
    "renderer lighting import",
)
replace_exact(
    "src/engine/CinematicCarousel.ts",
    "    slide.renderOrder = index * 2 + 2;\n"
    "    shadow.renderOrder = index * 2 + 1;",
    "    // Analytical shadows are a back layer. Drawing every moving shadow\n"
    "    // before every moving card prevents a fake drop shadow from tinting\n"
    "    // another slide face in the transparent stack.\n"
    "    shadow.renderOrder = index + 1;\n"
    "    slide.renderOrder = MAX_POOL_SIZE + index + 1;",
    "moving shadow render layers",
)
replace_exact(
    "src/engine/CinematicCarousel.ts",
    "    item.group.scale.setScalar(evaluated.scale);\n"
    "    item.slide.scale.set(width, height, 1);\n"
    "    const shadowMargin = Math.min(\n"
    "      460,\n"
    "      Math.ceil(Math.hypot(...lighting.shadowOffset) + this.settings.lighting.shadowSoftness * 1.35 + 4),\n"
    "    );",
    "    item.group.scale.setScalar(evaluated.scale);\n"
    "    item.slide.scale.set(width, height, 1);\n"
    "    const localShadowOffset = localiseShadowOffset(lighting.shadowOffset, evaluated.rotationZ);\n"
    "    const shadowMargin = Math.min(\n"
    "      460,\n"
    "      Math.ceil(Math.hypot(...localShadowOffset) + this.settings.lighting.shadowSoftness * 1.35 + 4),\n"
    "    );",
    "local moving shadow offset",
)
replace_exact(
    "src/engine/CinematicCarousel.ts",
    "    shadowUniforms.uShadowOffsetPx!.value.set(...lighting.shadowOffset);",
    "    shadowUniforms.uShadowOffsetPx!.value.set(...localShadowOffset);",
    "moving shadow uniform offset",
)
replace_exact(
    "src/engine/CinematicCarousel.ts",
    "    shadowUniforms.uContactStrength!.value = this.settings.lighting.contactStrength;\n"
    "    shadowUniforms.uOpacity!.value = this.settings.lighting.enabled\n"
    "      ? this.settings.lighting.shadowOpacity * evaluated.opacity\n"
    "      : 0;",
    "    shadowUniforms.uContactStrength!.value = this.settings.lighting.contactStrength;\n"
    "    const shadowOpacity = this.settings.lighting.enabled\n"
    "      ? this.settings.lighting.shadowOpacity * evaluated.opacity\n"
    "      : 0;\n"
    "    item.shadow.visible = shadowOpacity > 0.001;\n"
    "    shadowUniforms.uOpacity!.value = shadowOpacity;",
    "moving shadow visibility",
)
replace_exact(
    "src/engine/CinematicCarousel.ts",
    "    shadowUniforms.uContactStrength!.value = this.settings.lighting.contactStrength * 0.9;\n"
    "    shadowUniforms.uOpacity!.value = this.settings.lighting.enabled ? settings.shadowOpacity : 0;",
    "    shadowUniforms.uContactStrength!.value = this.settings.lighting.contactStrength * 0.9;\n"
    "    const presenterShadowOpacity = this.settings.lighting.enabled ? settings.shadowOpacity : 0;\n"
    "    this.presenterShadow.visible = presenterShadowOpacity > 0.001;\n"
    "    shadowUniforms.uOpacity!.value = presenterShadowOpacity;",
    "presenter shadow visibility",
)

# ---------------------------------------------------------------------------
# Falsification: version migration, canonical mirrors, stage-space direction,
# hard bounds, and authored theme coherence.
# ---------------------------------------------------------------------------
replace_exact(
    "tests/lightingValidation.test.ts",
    'import { DEFAULT_SETTINGS, cloneSettings } from "../src/model";',
    'import { DEFAULT_SETTINGS, PRE_LIGHTING_SHADER_VERSION, SHADER_VERSION, cloneSettings } from "../src/model";',
    "lighting validation model imports",
)
old_legacy_test = '''  it("hydrates pre-lighting schema-v1 projects from their visible legacy shadow values", () => {
    const source = candidate();
    source.slide.shadowOpacity = 0.61;
    source.slide.shadowSoftness = 73;
    delete source.lighting;

    const result = validateStudioSettings(source);
    expect(result.lighting).toEqual({
      ...DEFAULT_SETTINGS.lighting,
      shadowOpacity: 0.61,
      shadowSoftness: 73,
    });
    expect(result).not.toHaveProperty("lighting.futureValue");
  });'''
new_legacy_test = '''  it("upgrades pre-lighting schema-v1 projects as honest custom rigs", () => {
    const source = candidate();
    source.shaderVersion = PRE_LIGHTING_SHADER_VERSION;
    source.slide.shadowOpacity = 0.61;
    source.slide.shadowSoftness = 73;
    delete source.lighting;

    const result = validateStudioSettings(source);
    expect(result.shaderVersion).toBe(SHADER_VERSION);
    expect(result.lighting).toEqual({
      ...DEFAULT_SETTINGS.lighting,
      preset: "custom",
      shadowOpacity: 0.61,
      shadowSoftness: 73,
    });
    expect(result.slide).toMatchObject({ shadowOpacity: 0.61, shadowSoftness: 73 });
    expect(result).not.toHaveProperty("lighting.futureValue");
  });'''
replace_exact(
    "tests/lightingValidation.test.ts",
    old_legacy_test,
    new_legacy_test,
    "legacy lighting migration test",
)
replace_exact(
    "tests/lightingValidation.test.ts",
    "      gobo: \"softbox\",\n"
    "    });\n"
    "    expect(validateStudioSettings(lower)).toEqual(lower);",
    "      gobo: \"softbox\",\n"
    "    });\n"
    "    Object.assign(lower.slide, { shadowOpacity: 0, shadowSoftness: 4 });\n"
    "    expect(validateStudioSettings(lower)).toEqual(lower);",
    "lower lighting mirror boundary",
)
replace_exact(
    "tests/lightingValidation.test.ts",
    "      gobo: \"edge\",\n"
    "    });\n"
    "    expect(validateStudioSettings(upper)).toEqual(upper);",
    "      gobo: \"edge\",\n"
    "    });\n"
    "    Object.assign(upper.slide, { shadowOpacity: 0.8, shadowSoftness: 96 });\n"
    "    expect(validateStudioSettings(upper)).toEqual(upper);",
    "upper lighting mirror boundary",
)
insert_before(
    "tests/lightingValidation.test.ts",
    "  it(\"rejects enum, colour, non-finite, and range escapes\", () => {\n",
    "  it(\"keeps current lighting authoritative while bounding the schema-v1 mirror\", () => {\n"
    "    const source = candidate();\n"
    "    Object.assign(source.lighting, { shadowOpacity: 0.9, shadowSoftness: 180 });\n"
    "    Object.assign(source.slide, { shadowOpacity: 0.1, shadowSoftness: 8 });\n\n"
    "    const result = validateStudioSettings(source);\n"
    "    expect(result.lighting).toMatchObject({ shadowOpacity: 0.9, shadowSoftness: 180 });\n"
    "    expect(result.slide).toMatchObject({ shadowOpacity: 0.8, shadowSoftness: 96 });\n"
    "  });\n\n",
    "lighting range rejection test",
)

replace_exact(
    "tests/settingsValidation.test.ts",
    "  ENGINE_VERSION,\n"
    "  SCHEMA_VERSION,\n"
    "  SHADER_VERSION,",
    "  ENGINE_VERSION,\n"
    "  PRE_LIGHTING_SHADER_VERSION,\n"
    "  SCHEMA_VERSION,\n"
    "  SHADER_VERSION,",
    "settings tests version imports",
)
replace_exact(
    "tests/settingsValidation.test.ts",
    "      shadowOpacity: 0,\n"
    "      shadowSoftness: 4,\n"
    "    });\n"
    "    Object.assign(source.background, {",
    "      shadowOpacity: 0,\n"
    "      shadowSoftness: 4,\n"
    "    });\n"
    "    Object.assign(source.lighting, { shadowOpacity: 0, shadowSoftness: 4 });\n"
    "    Object.assign(source.background, {",
    "lower settings lighting mirror",
)
replace_exact(
    "tests/settingsValidation.test.ts",
    "      shadowOpacity: 0.8,\n"
    "      shadowSoftness: 96,\n"
    "    });\n"
    "    Object.assign(source.background, {",
    "      shadowOpacity: 0.8,\n"
    "      shadowSoftness: 96,\n"
    "    });\n"
    "    Object.assign(source.lighting, { shadowOpacity: 0.8, shadowSoftness: 96 });\n"
    "    Object.assign(source.background, {",
    "upper settings lighting mirror",
)
insert_before(
    "tests/settingsValidation.test.ts",
    "  it(\"rejects unsupported schema, engine, and shader versions\", () => {\n",
    "  it(\"accepts only the pre-lighting shader as a migratable visual contract\", () => {\n"
    "    const source = settings();\n"
    "    source.shaderVersion = PRE_LIGHTING_SHADER_VERSION;\n"
    "    source.slide.shadowOpacity = 0.47;\n"
    "    source.slide.shadowSoftness = 81;\n"
    "    delete source.lighting;\n\n"
    "    const result = validateStudioSettings(source);\n"
    "    expect(result.shaderVersion).toBe(SHADER_VERSION);\n"
    "    expect(result.lighting).toMatchObject({\n"
    "      preset: \"custom\",\n"
    "      shadowOpacity: 0.47,\n"
    "      shadowSoftness: 81,\n"
    "    });\n"
    "  });\n\n",
    "unsupported version test",
)
replace_exact(
    "tests/settingsValidation.test.ts",
    "  it(\"rejects unsupported schema, engine, and shader versions\", () => {",
    "  it(\"rejects unsupported schema, engine, and unknown shader versions\", () => {",
    "unsupported version test title",
)

replace_exact(
    "tests/lighting.test.ts",
    "  applyLightingPreset,\n"
    "  resolveLightingFrame,",
    "  applyLightingPreset,\n"
    "  localiseShadowOffset,\n"
    "  resolveLightingFrame,",
    "lighting test imports",
)
replace_exact(
    "tests/lighting.test.ts",
    "    expect(new Set(THEMES.map((theme) => theme.settings.lighting.preset)).size).toBe(THEMES.length);\n"
    "  });",
    "    expect(new Set(THEMES.map((theme) => theme.settings.lighting.preset)).size).toBe(THEMES.length);\n"
    "    for (const theme of THEMES) {\n"
    "      expect(theme.settings.slide.shadowOpacity).toBe(Math.min(0.8, theme.settings.lighting.shadowOpacity));\n"
    "      expect(theme.settings.slide.shadowSoftness).toBe(Math.min(96, Math.max(4, theme.settings.lighting.shadowSoftness)));\n"
    "    }\n"
    "  });",
    "theme shadow mirror assertions",
)
replace_exact(
    "tests/lighting.test.ts",
    "          expect(Math.hypot(...frame.shadowOffset)).toBeLessThanOrEqual(181);",
    "          expect(Math.hypot(...frame.shadowOffset)).toBeLessThanOrEqual(180);",
    "exact shadow reach bound",
)
insert_before(
    "tests/lighting.test.ts",
    "  it(\"shortens the cast as the source rises\", () => {\n",
    "  it(\"keeps the apparent cast direction fixed when a card rolls\", () => {\n"
    "    const stageOffset: [number, number] = [96, -24];\n"
    "    const rotation = Math.PI / 3;\n"
    "    const local = localiseShadowOffset(stageOffset, rotation);\n"
    "    const cosine = Math.cos(rotation);\n"
    "    const sine = Math.sin(rotation);\n"
    "    const projected = [\n"
    "      local[0] * cosine - local[1] * sine,\n"
    "      local[0] * sine + local[1] * cosine,\n"
    "    ];\n\n"
    "    expectTupleClose(projected, stageOffset);\n"
    "    expect(Math.hypot(...local)).toBeCloseTo(Math.hypot(...stageOffset), 12);\n"
    "    expect(localiseShadowOffset(stageOffset, 0)).toEqual(stageOffset);\n"
    "  });\n\n",
    "higher-light shadow test",
)

# ---------------------------------------------------------------------------
# Durable technical record.
# ---------------------------------------------------------------------------
replace_exact(
    "docs/CINEMATIC_LIGHTING.md",
    "- Existing bounded pool remains 24 moving slide groups plus the optional presenter.\n"
    "- Lighting uniforms update inside the existing render loop.",
    "- Existing bounded pool remains 24 moving slide groups plus the optional presenter.\n"
    "- Moving analytical shadows render as a back layer, so a fake cast cannot tint another slide face.\n"
    "- Stage-space cast vectors are inverse-rolled into each card, keeping the source direction fixed as cards bank.\n"
    "- Disabled or effectively transparent shadows are culled before rasterization.\n"
    "- Lighting uniforms update inside the existing render loop.",
    "rendering contract hardening",
)
old_compatibility = '''The portable settings schema remains version 1 because the extension is additive. A project written before lighting existed has no `lighting` object. The validator hydrates the neutral Studio Soft rig and copies the project’s legacy slide shadow opacity and softness into it.

This bridge applies only when the complete lighting object is absent. If a project supplies a malformed or partial lighting object, validation fails visibly instead of inventing values.

Legacy `slide.shadowOpacity` and `slide.shadowSoftness` remain in the schema for round-trip compatibility. New rendering and controls use the first-class lighting section.'''
new_compatibility = '''The portable settings schema remains version 1 because the settings extension is additive, but the visual contract is now honestly `SHADER_VERSION 1.1.0`. A current build accepts the single pre-lighting shader version, `1.0.0`, migrates it to `1.1.0`, and rejects unknown shader versions. A pre-lighting build therefore refuses a new lighting project instead of pretending it can reproduce it.

A project written before lighting existed has no `lighting` object. The validator copies its visible legacy slide shadow opacity and softness into the new rig and labels the result `Custom rig`; inherited values are never misrepresented as an untouched Studio Soft recipe. This bridge applies only when the complete lighting object is absent. A malformed or partial supplied lighting object fails visibly instead of receiving invented values.

Legacy `slide.shadowOpacity` and `slide.shadowSoftness` remain as a bounded schema-v1 portability mirror. New rendering and controls use the first-class lighting section. Recipes, manual shadow edits, themes, validation, and portable saves keep the mirror synchronized, clamping only values the old schema could not represent (`0.8` opacity and `96 px` softness).'''
replace_exact(
    "docs/CINEMATIC_LIGHTING.md",
    old_compatibility,
    new_compatibility,
    "portable compatibility section",
)
replace_exact(
    "docs/CINEMATIC_LIGHTING.md",
    "- schema-v1 legacy hydration without silent repair of malformed new data;\n"
    "- derivative-based normals from the deformed surface;",
    "- schema-v1 legacy hydration without silent repair of malformed new data;\n"
    "- explicit shader-v1.0 → v1.1 migration and rejection of unknown visual contracts;\n"
    "- synchronized, bounded legacy shadow mirrors for recipes, themes, controls, and saves;\n"
    "- stage-fixed cast direction under rolled card paths;\n"
    "- derivative-based normals from the deformed surface;",
    "gauntlet compatibility bullets",
)
replace_exact(
    "docs/ARCHITECTURE.md",
    "The cards recover their normals from derivatives of the vertex-deformed view position. Shadows remain SDF meshes inside the existing resident pool: one broad cast lobe plus one tight contact lobe, no shadow map or blur target. The pinned presenter bypasses surface lighting but receives the rig’s directional environmental shadow. See [`CINEMATIC_LIGHTING.md`](CINEMATIC_LIGHTING.md) for the trade-offs and acceptance gates.",
    "The cards recover their normals from derivatives of the vertex-deformed view position. Shadows remain SDF meshes inside the existing resident pool: one broad cast lobe plus one tight contact lobe, no shadow map or blur target. Moving shadows form a back layer beneath every moving card, transparent shadow meshes are culled, and each stage-space cast vector is inverse-rolled into its card so banking does not rotate the apparent source. The pinned presenter bypasses surface lighting but receives the rig’s directional environmental shadow.\n\nThe lighting addition keeps settings schema v1 but advances the visual contract to shader v1.1. Validation accepts and upgrades only the pre-lighting v1.0 shader contract. Current lighting remains authoritative; the deprecated slide-shadow fields are maintained solely as the closest bounded representation an older schema-v1 build can understand. See [`CINEMATIC_LIGHTING.md`](CINEMATIC_LIGHTING.md) for the trade-offs and acceptance gates.",
    "architecture lighting integrity paragraph",
)

# Self-delete. The resulting branch contains only durable source, tests, and docs.
for relative in [
    ".gauntlet/lighting-integrity.py",
    ".github/workflows/lighting-integrity-gauntlet.yml",
]:
    path = ROOT / relative
    if not path.is_file():
        raise RuntimeError(f"Expected temporary artefact {relative}")
    path.unlink()
(ROOT / ".gauntlet").rmdir()
