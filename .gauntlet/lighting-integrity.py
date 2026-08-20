from __future__ import annotations

from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    target = ROOT / path
    if not target.is_file():
        raise AssertionError(f"Missing required file: {path}")
    return target.read_text(encoding="utf-8")


def require(haystack: str, needle: str, label: str) -> None:
    if needle not in haystack:
        raise AssertionError(f"Missing {label}: {needle}")


def reject(haystack: str, needle: str, label: str) -> None:
    if needle in haystack:
        raise AssertionError(f"Forbidden {label}: {needle}")


TEMPORARY_PATHS = (
    ".gauntlet/lighting-next.py",
    ".gauntlet/lighting-seam-fix.py",
    ".gauntlet/lighting-final-pass.py",
    ".gauntlet/lighting-final-pass-followup.py",
    "docs/.final-cleanup-marker",
    "docs/.lighting-cleanup-sentinel",
    "docs/.lighting-cleanup-will-delete.md",
    "docs/.lighting-final-cleanup-plan.md",
    "docs/.lighting-gauntlet-draft-placeholder",
)
for path in TEMPORARY_PATHS:
    if (ROOT / path).exists():
        raise AssertionError(f"Temporary lighting scaffold remains: {path}")
for path in (ROOT / ".gauntlet").glob("lighting-final-pass.payload.*"):
    raise AssertionError(f"Temporary lighting payload remains: {path.relative_to(ROOT)}")

workflow = read(".github/workflows/lighting-deep-gauntlet.yml")
for forbidden in (
    "contents: write",
    "git push",
    "git commit",
    "ref: feat/cinematic-lighting-rig",
    "lighting-next.py",
    "lighting-seam-fix.py",
    "lighting-final-pass",
):
    reject(workflow, forbidden, "self-modifying workflow behaviour")
require(workflow, "contents: read", "read-only workflow permission")
require(workflow, "python .gauntlet/lighting-integrity.py", "integrity verifier step")
require(workflow, "npm run check", "repository check gate")
require(workflow, "npm run test:e2e", "real-browser gate")

model = read("src/model.ts")
lighting = read("src/lighting.ts")
validation = read("src/lib/settingsValidation.ts")
controls = read("src/components/ControlPanel.tsx")
engine = read("src/engine/CinematicCarousel.ts")
shaders = read("src/engine/shaders.ts")
themes = read("src/themes.ts")
shader_tests = read("tests/engineShader.test.ts")
lighting_tests = read("tests/lighting.test.ts")
validation_tests = read("tests/lightingValidation.test.ts")
settings_validation_tests = read("tests/settingsValidation.test.ts")
e2e = read("e2e/studio.e2e.ts")
documentation = read("docs/CINEMATIC_LIGHTING.md")
review_checklist = read("docs/LIGHTING_REVIEW_CHECKLIST.md")

require(model, 'export const PRE_LIGHTING_SHADER_VERSION = "1.0.0";', "pre-lighting shader migration constant")
require(model, 'export const SHADER_VERSION = "1.1.0";', "current lighting shader contract")
require(validation, "SUPPORTED_SHADER_VERSIONS", "bounded shader migration list")
require(validation, "PRE_LIGHTING_SHADER_VERSION", "pre-lighting shader acceptance")
require(settings_validation_tests, "migratable visual contract", "shader migration falsification")

preset_ids = (
    "studio-soft",
    "window-rake",
    "projector-haze",
    "noir-slice",
    "golden-hour",
    "electric-rim",
    "overcast-window",
    "moon-pool",
    "sodium-vapor",
    "lantern-flicker",
    "fluorescent-flat",
    "headlight-sweep",
)
gobos = (
    "softbox",
    "window",
    "projector",
    "slit",
    "sunset",
    "edge",
    "overcast",
    "moon",
    "sodium",
    "lantern",
    "ceiling",
    "headlights",
)
motions = ("static", "breathe", "sweep", "flicker", "orbit")

found_presets = re.findall(r'definePreset\(\s*"([^"]+)"', lighting)
if tuple(found_presets) != preset_ids:
    raise AssertionError(f"Expected twelve authored lighting rigs in order; found {found_presets}")
for preset_id in preset_ids:
    require(model, f'| "{preset_id}"', f"lighting preset union member {preset_id}")
for gobo in gobos:
    require(model, f'| "{gobo}"', f"gobo union member {gobo}")
for motion in motions:
    require(model, f'"{motion}"', f"lighting motion {motion}")

lighting_fields = (
    "enabled",
    "space",
    "motionMode",
    "motionSpeed",
    "keyColor",
    "fillColor",
    "shadowColor",
    "azimuth",
    "elevation",
    "keyIntensity",
    "fillIntensity",
    "rimIntensity",
    "sheen",
    "roughness",
    "artworkProtection",
    "heroProtection",
    "shadowOpacity",
    "shadowSoftness",
    "shadowDistance",
    "contactStrength",
    "backgroundSpill",
    "spillFocus",
    "goboStrength",
    "breath",
    "gobo",
)
for field in lighting_fields:
    require(model, f"{field}:", f"LightingSettings.{field}")
    require(validation, field, f"validation for {field}")
    require(lighting, field, f"authored rig value for {field}")

for marker in (
    "resolveLightingFrame",
    "lightingNeedsContinuousFrames",
    "fieldCenter",
    "shadowOffset",
    "intensity",
    "motionMode",
    "motionSpeed",
):
    require(lighting, marker, f"lighting resolver marker {marker}")
reject(lighting, "Math.random", "unseeded lighting randomness")
reject(lighting, "Date.now", "wall-clock lighting time")
reject(lighting, "performance.now", "preview-clock lighting time")

for label in (
    "Light character",
    "Light attachment",
    "Light movement",
    "Motion pace",
    "Protect artwork",
    "Protect hero",
    "Light shape",
    "Light shape presence",
    "Background spill",
    "Spill focus",
):
    require(controls, f'label="{label}"', f"director control {label}")
require(controls, "selectedLightingPreset", "lighting character guidance")
require(controls, "bestFor", "lighting best-use guidance")

for marker in (
    "focalLightingWeight",
    "resolveShadowOffsetForSpace",
    "previewNeedsContinuousFrames",
    "uArtworkProtection",
    "uHeroProtection",
    "uHeroWeight",
    "uLightCenter",
    "uLightIntensity",
    "uGoboStrength",
    "shadow.renderOrder = index + 1",
    "slide.renderOrder = MAX_POOL_SIZE + index + 1",
    "item.shadow.visible = shadowOpacity > 0.001",
    "this.presenterShadow.visible = presenterShadowOpacity > 0.001",
):
    require(engine, marker, f"renderer integration {marker}")

for marker in (
    "dFdx(vViewPosition)",
    "dFdy(vViewPosition)",
    "uArtworkProtection",
    "uHeroProtection",
    "uHeroWeight",
    "uGoboStrength",
    "uLightCenter",
    "uLightIntensity",
    "float overcast",
    "float moon",
    "float sodium",
    "float lantern",
    "float ceiling",
    "float headlightLeft",
    "return mix(softbox, selected",
):
    require(shaders, marker, f"shader contract {marker}")

require(themes, "lighting:", "theme lighting integration")
require(shader_tests, 'describe("lighting composition helpers"', "lighting helper tests")
require(lighting_tests, "LIGHTING_PRESETS", "authored rig tests")
require(validation_tests, "lighting", "lighting trust-boundary tests")
require(e2e, ".stage-hud, .stage-guide", "render-only screenshot isolation")
require(e2e, 'name: "Protect artwork"', "artwork-protection browser control")
require(e2e, 'name: "Protect hero"', "hero-protection browser control")
require(documentation, "## Authored rigs", "complete lighting documentation")
require(documentation, "Headlight Sweep", "twelfth documented lighting rig")
require(review_checklist, "Rejection rule", "human acceptance gate")

status = subprocess.run(
    ["git", "status", "--porcelain", "--untracked-files=all"],
    cwd=ROOT,
    check=True,
    capture_output=True,
    text=True,
).stdout.strip()
if status:
    raise AssertionError(f"Lighting integrity verification dirtied the checkout:\n{status}")

print(
    "Lighting integrity verified: 12 rigs, 12 fields, 5 deterministic motions, "
    "complete UI-to-shader wiring, read-only CI, and no temporary scaffold."
)
