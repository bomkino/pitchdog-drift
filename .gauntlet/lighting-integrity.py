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


# Honest visual-version migration. The settings schema stays additive v1, but a
# pre-lighting renderer must not claim it can reproduce the new shader contract.
replace_exact(
    "src/model.ts",
    'export const SHADER_VERSION = "1.0.0";',
    'export const PRE_LIGHTING_SHADER_VERSION = "1.0.0";\nexport const SHADER_VERSION = "1.1.0";',
    "shader version",
)
replace_exact(
    "src/lib/settingsValidation.ts",
    "  LIGHTING_VERSION,\n  SCHEMA_VERSION,\n  SHADER_VERSION,",
    "  LIGHTING_VERSION,\n  PRE_LIGHTING_SHADER_VERSION,\n  SCHEMA_VERSION,\n  SHADER_VERSION,",
    "pre-lighting shader import",
)
replace_exact(
    "src/lib/settingsValidation.ts",
    'const OUTPUT_FPS = [24, 25, 30, 50, 60] as const;',
    'const OUTPUT_FPS = [24, 25, 30, 50, 60] as const;\nconst SUPPORTED_SHADER_VERSIONS = [PRE_LIGHTING_SHADER_VERSION, SHADER_VERSION] as const;',
    "supported shader versions",
)
replace_exact(
    "src/lib/settingsValidation.ts",
    '  literal(source.shaderVersion, "settings.shaderVersion", SHADER_VERSION);',
    '  oneOf(source.shaderVersion, "settings.shaderVersion", SUPPORTED_SHADER_VERSIONS);',
    "shader-version validation",
)
replace_exact(
    "src/lib/settingsValidation.ts",
    "        ...DEFAULT_SETTINGS.lighting,\n        shadowOpacity: slideShadowOpacity,",
    "        ...DEFAULT_SETTINGS.lighting,\n        preset: \"custom\",\n        shadowOpacity: slideShadowOpacity,",
    "honest legacy lighting migration",
)

# Transparent objects are sorted globally. Put every analytical moving shadow
# below every moving card, then avoid rasterizing effectively invisible shadow
# planes altogether.
replace_exact(
    "src/engine/CinematicCarousel.ts",
    "    slide.renderOrder = index * 2 + 2;\n    shadow.renderOrder = index * 2 + 1;",
    "    // Analytical shadows are one global back layer. A cast from one card\n"
    "    // must never tint another card face in the transparent stack.\n"
    "    shadow.renderOrder = index + 1;\n"
    "    slide.renderOrder = MAX_POOL_SIZE + index + 1;",
    "moving shadow render layers",
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
    "moving shadow culling",
)
replace_exact(
    "src/engine/CinematicCarousel.ts",
    "    shadowUniforms.uContactStrength!.value = this.settings.lighting.contactStrength * 0.9;\n"
    "    shadowUniforms.uOpacity!.value = this.settings.lighting.enabled ? settings.shadowOpacity : 0;",
    "    shadowUniforms.uContactStrength!.value = this.settings.lighting.contactStrength * 0.9;\n"
    "    const presenterShadowOpacity = this.settings.lighting.enabled ? settings.shadowOpacity : 0;\n"
    "    this.presenterShadow.visible = presenterShadowOpacity > 0.001;\n"
    "    shadowUniforms.uOpacity!.value = presenterShadowOpacity;",
    "presenter shadow culling",
)

# Falsify migration rather than merely documenting it.
replace_exact(
    "tests/lightingValidation.test.ts",
    "  LIGHTING_VERSION,\n  cloneSettings,",
    "  LIGHTING_VERSION,\n  PRE_LIGHTING_SHADER_VERSION,\n  SHADER_VERSION,\n  cloneSettings,",
    "lighting validation version imports",
)
old_legacy = '''  it("hydrates pre-lighting schema-v1 projects from their visible legacy shadow values", () => {
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
  });'''
new_legacy = '''  it("upgrades pre-lighting schema-v1 projects as honest custom rigs", () => {
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
  });'''
replace_exact(
    "tests/lightingValidation.test.ts",
    old_legacy,
    new_legacy,
    "pre-lighting migration test",
)
replace_exact(
    "tests/settingsValidation.test.ts",
    "  ENGINE_VERSION,\n  SCHEMA_VERSION,\n  SHADER_VERSION,",
    "  ENGINE_VERSION,\n  PRE_LIGHTING_SHADER_VERSION,\n  SCHEMA_VERSION,\n  SHADER_VERSION,",
    "settings validation version imports",
)
insert_before(
    "tests/settingsValidation.test.ts",
    '  it("rejects unsupported schema, engine, and shader versions", () => {\n',
    '  it("accepts only the pre-lighting shader as a migratable visual contract", () => {\n'
    '    const source = settings();\n'
    '    source.shaderVersion = PRE_LIGHTING_SHADER_VERSION;\n'
    '    source.slide.shadowOpacity = 0.47;\n'
    '    source.slide.shadowSoftness = 81;\n'
    '    delete source.lighting;\n\n'
    '    const result = validateStudioSettings(source);\n'
    '    expect(result.shaderVersion).toBe(SHADER_VERSION);\n'
    '    expect(result.lighting).toMatchObject({\n'
    '      preset: "custom",\n'
    '      shadowOpacity: 0.47,\n'
    '      shadowSoftness: 81,\n'
    '    });\n'
    '  });\n\n',
    "unsupported shader-version test",
)
replace_exact(
    "tests/settingsValidation.test.ts",
    '  it("rejects unsupported schema, engine, and shader versions", () => {',
    '  it("rejects unsupported schema, engine, and unknown shader versions", () => {',
    "unsupported shader-version test title",
)

# Durable record of the actual compatibility and compositing contracts.
replace_exact(
    "docs/CINEMATIC_LIGHTING.md",
    "- Existing bounded pool remains 24 moving slide groups plus the optional presenter.\n"
    "- Lighting uniforms update inside the existing render path.",
    "- Existing bounded pool remains 24 moving slide groups plus the optional presenter.\n"
    "- Moving analytical shadows form one back layer beneath every moving card, so a cast cannot tint another slide face.\n"
    "- Disabled or effectively transparent shadow meshes are culled before rasterization.\n"
    "- Lighting uniforms update inside the existing render path.",
    "rendering contract hardening",
)
old_compatibility = '''The portable settings schema remains version 1 because the extension is additive. A project written before lighting existed has no `lighting` object. The validator hydrates the neutral Studio Soft rig and copies the project’s legacy slide shadow opacity and softness into it.

This bridge applies only when the complete lighting object is absent. If a project supplies a malformed or partial lighting object, validation fails visibly instead of inventing values.

Legacy `slide.shadowOpacity` and `slide.shadowSoftness` remain in the schema for round-trip compatibility. New rendering and controls use the first-class lighting section.'''
new_compatibility = '''The portable settings schema remains version 1 because the settings extension is additive, but the visual contract advances honestly to `SHADER_VERSION 1.1.0`. A current build accepts the single pre-lighting shader version, `1.0.0`, upgrades it to `1.1.0`, and rejects unknown shader versions. A pre-lighting build therefore refuses a new lighting project instead of pretending it can reproduce it.

A project written before lighting existed has no `lighting` object. The validator copies its visible legacy slide shadow opacity and softness into the new rig and labels the result `Custom rig`; inherited values are not misrepresented as an untouched Studio Soft recipe. This bridge applies only when the complete lighting object is absent. A malformed supplied lighting object still fails visibly instead of receiving invented values.

Legacy `slide.shadowOpacity` and `slide.shadowSoftness` remain in schema v1 for round-trip compatibility. Current rendering and controls use the first-class lighting section.'''
replace_exact(
    "docs/CINEMATIC_LIGHTING.md",
    old_compatibility,
    new_compatibility,
    "portable compatibility section",
)
replace_exact(
    "docs/ARCHITECTURE.md",
    "The cards recover their normals from derivatives of the vertex-deformed view position. Shadows remain SDF meshes inside the existing resident pool: one broad cast lobe plus one tight contact lobe, no shadow map or blur target. The pinned presenter bypasses surface lighting but receives the rig’s directional environmental shadow. See [`CINEMATIC_LIGHTING.md`](CINEMATIC_LIGHTING.md) for the trade-offs and acceptance gates.",
    "The cards recover their normals from derivatives of the vertex-deformed view position. Shadows remain SDF meshes inside the existing resident pool: one broad cast lobe plus one tight contact lobe, no shadow map or blur target. Moving shadows form one global back layer beneath every moving card, and effectively transparent shadow meshes are culled before rasterization. Stage-fixed and card-fixed casts are resolved explicitly before the SDF is drawn. The pinned presenter bypasses surface lighting but receives the rig’s directional environmental shadow.\n\nThe additive settings remain schema v1, while the visual contract advances to shader v1.1. Validation upgrades only the known pre-lighting v1.0 contract and rejects unknown shader versions. See [`CINEMATIC_LIGHTING.md`](CINEMATIC_LIGHTING.md) for the trade-offs and acceptance gates.",
    "architecture lighting integrity paragraph",
)

# This patch runner and its write-capable workflow are scaffolding, not product.
# Delete both only after all source edits have succeeded; the workflow commits
# the verified resulting tree in one final push.
for relative in (
    ".gauntlet/lighting-integrity.py",
    ".github/workflows/lighting-integrity-gauntlet.yml",
):
    target = ROOT / relative
    if not target.is_file():
        raise RuntimeError(f"Expected temporary artefact {relative}")
    target.unlink()
if (ROOT / ".gauntlet").exists() and not any((ROOT / ".gauntlet").iterdir()):
    (ROOT / ".gauntlet").rmdir()
