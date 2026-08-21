from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def brace_spans(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    stack: list[int] = []
    quote: str | None = None
    escaped = False
    line_comment = False
    block_comment = False
    i = 0
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if line_comment:
            if ch == "\n":
                line_comment = False
            i += 1
            continue
        if block_comment:
            if ch == "*" and nxt == "/":
                block_comment = False
                i += 2
            else:
                i += 1
            continue
        if quote is not None:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
            i += 1
            continue
        if ch == "/" and nxt == "/":
            line_comment = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            block_comment = True
            i += 2
            continue
        if ch in ('"', "'", "`"):
            quote = ch
            i += 1
            continue
        if ch == "{":
            stack.append(i)
        elif ch == "}":
            if not stack:
                raise RuntimeError(f"Unbalanced brace at {i}")
            spans.append((stack.pop(), i + 1))
        i += 1
    if stack:
        raise RuntimeError("Unclosed braces")
    return spans


def object_containing(text: str, needle: str) -> tuple[int, int, str]:
    pos = text.find(needle)
    if pos < 0:
        raise RuntimeError(f"Missing anchor: {needle}")
    candidates = [(a, b) for a, b in brace_spans(text) if a <= pos < b]
    if not candidates:
        raise RuntimeError(f"No object contains: {needle}")
    a, b = min(candidates, key=lambda span: span[1] - span[0])
    return a, b, text[a:b]


def set_string(block: str, prop: str, value: str, required: bool = True) -> str:
    pattern = re.compile(rf"({re.escape(prop)}\s*:\s*)(['\"])(.*?)(\2)")
    out, count = pattern.subn(lambda match: f'{match.group(1)}"{value}"', block, count=1)
    if required and count != 1:
        raise RuntimeError(f"Missing string property {prop}")
    return out


def set_number(block: str, prop: str, value: float, required: bool = True) -> str:
    pattern = re.compile(rf"({re.escape(prop)}\s*:\s*)-?\d+(?:\.\d+)?")
    out, count = pattern.subn(lambda match: f"{match.group(1)}{value:g}", block, count=1)
    if required and count != 1:
        raise RuntimeError(f"Missing numeric property {prop}")
    return out


def insert_after(text: str, end: int, blocks: list[str]) -> str:
    return text[:end] + "".join(",\n" + block for block in blocks) + text[end:]


@dataclass(frozen=True)
class Atmosphere:
    slug: str
    name: str
    description: str
    shader: str


ATMOSPHERES = [
    Atmosphere("opal-bloom", "Opal Bloom", "Iridescent lens bloom drifting through translucent colour fields.", "opal"),
    Atmosphere("projector-dust", "Projector Dust", "A restrained projector cone with suspended dust and warm gate flare.", "dust"),
    Atmosphere("contour-night", "Contour Night", "Slow topographic contours emerging from a deep nocturnal field.", "contour"),
    Atmosphere("liquid-silver", "Liquid Silver", "Monochrome liquid-metal folds with calm reflected light.", "silver"),
    Atmosphere("winter-window", "Winter Window", "Frosted glass, distant bokeh, and a soft cold-weather glow.", "winter"),
    Atmosphere("neon-rain", "Neon Rain", "Sparse rain trails and reflected city colour without the cyberpunk cliché.", "rain"),
]

WORLD_SPECS = [
    ("Chrome Dream", "opal-nocturne", "Opal Nocturne", "Iridescent dream glass with patient movement and pearlescent depth.", "prism", "opal-bloom", ("#090b13", "#3a2e55", "#d8b7ff"), 0.18, 0.035, 0.78, 0.54, 0.40),
    ("Celluloid Archive", "projection-room", "Projection Room", "Warm projector breath, suspended dust, and disciplined archival imperfection.", "emulsion", "projector-dust", ("#060503", "#26170d", "#e4b46f"), 0.12, 0.085, 0.68, 0.42, 0.26),
    ("Sunstruck Atlas", "wild-atlas", "Wild Atlas", "Topographic memory, moonlit terrain, and quiet expedition-scale depth.", "horizon", "contour-night", ("#07110f", "#16352d", "#d6bb76"), 0.14, 0.04, 0.56, 0.72, 0.44),
    ("Blue Hour", "silver-tide", "Silver Tide", "Liquid monochrome, long highlights, and restrained fashion-film cool.", "tidal", "liquid-silver", ("#07090c", "#28303a", "#d5dde4"), 0.16, 0.025, 0.72, 0.62, 0.36),
    ("Tender Light", "winter-glass", "Winter Glass", "Frosted intimacy, distant light, and soft seasonal stillness.", "aura", "winter-window", ("#101820", "#607482", "#f2d8bd"), 0.10, 0.03, 0.86, 0.38, 0.22),
    ("Night Run", "neon-monsoon", "Neon Monsoon", "Rain-slicked city colour with human-scale reflections and no neon wallpaper.", "night-drive", "neon-rain", ("#020609", "#10222d", "#e35d70"), 0.32, 0.035, 0.70, 0.52, 0.46),
]

SHADER_BODIES = {
    "opal": """
      float petalA = fbm(p * mix(1.25, 2.4, uComplexity) + orbit2 * vec2(0.18, 0.12));
      float petalB = fbm((p.yx + vec2(0.37, -0.21)) * mix(1.7, 3.1, uComplexity) - orbit2 * vec2(0.12, 0.2));
      float veil = smoothstep(0.18, 0.9, petalA * 0.62 + petalB * 0.48);
      float spectral = 0.5 + 0.5 * sin((p.x - p.y) * 3.4 + uPhase + veil * 4.0);
      vec3 pearl = mix(uColorB, uAccent, spectral * 0.72);
      float bloom = exp(-dot(p - orbit * vec2(0.08, 0.05), p - orbit * vec2(0.08, 0.05)) * mix(0.8, 2.1, 1.0 - uSoftness));
      color = mix(uColorA, pearl, veil * 0.64 * uIntensity);
      color += pearl * bloom * 0.12 * uIntensity;
""",
    "dust": """
      float coneWidth = mix(0.06, 0.76, smoothstep(-0.5, 0.48, p.y));
      float cone = 1.0 - smoothstep(coneWidth, coneWidth + mix(0.08, 0.24, uSoftness), abs(p.x + 0.22));
      cone *= smoothstep(-0.54, 0.16, p.y) * (1.0 - smoothstep(0.28, 0.56, p.y));
      float dust = 0.0;
      for (int dustIndex = 0; dustIndex < 7; dustIndex += 1) {
        float index = float(dustIndex);
        float seed = hash12(vec2(index * 3.71, index + 9.0));
        vec2 mote = vec2(mix(-0.58, 0.35, seed), mix(-0.42, 0.42, hash12(vec2(seed, index))));
        mote += vec2(sin(uPhase + index) * 0.018, cos(uPhase * (1.0 + mod(index, 2.0)) + seed * 6.28318530718) * 0.022) * uMotion;
        float radius = mix(0.003, 0.012, hash12(vec2(index + 2.0, seed)));
        dust += exp(-dot(p - mote, p - mote) / max(0.00002, radius * radius));
      }
      float gate = lineGlow(p.y + 0.34, mix(0.012, 0.05, uSoftness));
      color = mix(uColorA, uColorB, cone * 0.52 * uIntensity);
      color = mix(color, uAccent, clamp(dust * 0.36 + gate * 0.08, 0.0, 1.0) * cone * uIntensity);
""",
    "contour": """
      vec2 terrainUv = p * mix(1.45, 3.4, uComplexity) + orbit2 * vec2(0.06, 0.1) * uMotion;
      float terrain = fbm(terrainUv) * 0.72 + fbm(terrainUv * 2.07 + 4.3) * 0.28;
      float bands = abs(fract(terrain * mix(7.0, 15.0, uComplexity)) - 0.5);
      float contours = 1.0 - smoothstep(0.43, 0.5, bands);
      float elevation = smoothstep(0.16, 0.88, terrain);
      float moon = exp(-dot(p - vec2(0.28, 0.18), p - vec2(0.28, 0.18)) * mix(4.0, 9.0, 1.0 - uSoftness));
      color = mix(uColorA, uColorB, elevation * 0.54);
      color = mix(color, uAccent, contours * mix(0.08, 0.26, uIntensity));
      color += mix(uColorB, uAccent, 0.4) * moon * 0.1 * uIntensity;
""",
    "silver": """
      vec2 silverUv = p * vec2(mix(1.2, 2.8, uComplexity), mix(2.0, 5.2, uComplexity));
      float foldA = sin(silverUv.y * 2.2 + fbm(silverUv * 0.72 + orbit2 * 0.08) * 5.0 + uPhase * 0.24 * uMotion);
      float foldB = sin(silverUv.x * 1.5 - silverUv.y * 0.82 + uPhase * 0.18 * uMotion);
      float metal = smoothstep(-0.75, 0.9, foldA * 0.72 + foldB * 0.28);
      float ridge = pow(clamp(1.0 - abs(foldA), 0.0, 1.0), mix(3.0, 8.0, 1.0 - uSoftness));
      vec3 silver = mix(uColorB * 0.54, uAccent, metal);
      color = mix(uColorA, silver, 0.72 * uIntensity);
      color += uAccent * ridge * 0.11 * uIntensity;
""",
    "winter": """
      float frost = fbm(p * mix(2.2, 5.0, uComplexity) + orbit2 * 0.06 * uMotion);
      float edgeFrost = smoothstep(0.2, 0.92, abs(p.x) * 0.72 + abs(p.y) * 0.58 + frost * 0.38);
      float bokeh = 0.0;
      for (int lightIndex = 0; lightIndex < 6; lightIndex += 1) {
        float index = float(lightIndex);
        float seed = hash12(vec2(index * 5.31, index + 2.0));
        vec2 center = vec2(mix(-0.62, 0.62, seed), mix(-0.36, 0.42, hash12(vec2(seed, index + 7.0))));
        center += orbit2 * vec2(0.012 + index * 0.001, 0.008) * uMotion;
        float radius = mix(0.035, 0.12, hash12(vec2(index + 4.0, seed))) * mix(0.8, 1.35, uSoftness);
        float distanceToLight = length(p - center);
        float disc = 1.0 - smoothstep(radius * 0.45, radius, distanceToLight);
        bokeh += disc * mix(0.18, 0.72, seed);
      }
      color = mix(uColorA, uColorB, frost * 0.44);
      color = mix(color, uAccent, clamp(bokeh * 0.36, 0.0, 0.58) * uIntensity);
      color = mix(color, mix(uColorB, uAccent, 0.22), edgeFrost * 0.32 * uIntensity);
""",
    "rain": """
      float rain = 0.0;
      float reflection = 0.0;
      for (int rainIndex = 0; rainIndex < 8; rainIndex += 1) {
        float index = float(rainIndex);
        float seed = hash12(vec2(index * 4.73 + 1.0, index + 13.0));
        float x = mix(-0.72, 0.72, seed) + sin(uPhase * (1.0 + mod(index, 3.0)) + seed * 6.28318530718) * 0.025 * uMotion;
        float y = mix(-0.42, 0.46, hash12(vec2(seed, index * 2.0 + 3.0)));
        float lengthScale = mix(0.04, 0.18, hash12(vec2(index + 6.0, seed)));
        float streakX = exp(-abs(p.x - x) / mix(0.002, 0.008, uSoftness));
        float streakY = smoothstep(y - lengthScale, y, p.y) * (1.0 - smoothstep(y, y + 0.018, p.y));
        rain += streakX * streakY;
        float below = max(0.0, y - p.y);
        reflection += streakX * step(p.y, y) * exp(-below / max(0.01, lengthScale * 1.8));
      }
      float city = fbm(vec2(p.x * mix(2.0, 4.8, uComplexity), p.y * 7.0) + orbit2 * 0.1);
      float horizon = lineGlow(p.y + 0.18, mix(0.025, 0.08, uSoftness));
      color = mix(uColorA, uColorB, smoothstep(-0.48, 0.42, p.y) * 0.42 + city * 0.12);
      color = mix(color, uAccent, clamp(rain * 0.48 + reflection * 0.14 + horizon * 0.1, 0.0, 0.72) * uIntensity);
""",
}

NIGHT_DRIVE = """
      // One authored perspective scene, not a tiled field of random dashes.
      // Every moving term is periodic so seamless exports close exactly.
      float horizonY = -0.16 + orbit.y * 0.012 * uMotion;
      float depth = clamp((horizonY - p.y) / max(0.01, horizonY + 0.5), 0.0, 1.0);
      float vanishingX = orbit.x * 0.032 * uMotion * uParallax;
      float roadHalfWidth = mix(0.028, 0.82, pow(depth, 0.72));
      float roadMask = 1.0 - smoothstep(roadHalfWidth, roadHalfWidth + 0.055, abs(p.x - vanishingX));
      float skyLift = smoothstep(horizonY - 0.08, 0.52, p.y);
      vec3 sky = mix(uColorB * 0.44, uColorB, skyLift * 0.72);
      vec3 asphalt = mix(uColorA * 0.46, uColorB * 0.24, depth * 0.34);
      color = mix(sky, asphalt, roadMask);
      float horizonBloom = lineGlow(p.y - horizonY, mix(0.018, 0.052, uSoftness));
      float cloud = fbm(vec2(p.x * 1.8, p.y * 5.4) + orbit2 * vec2(0.18, 0.08));
      color = mix(color, uColorB * 1.16, (cloud - 0.38) * 0.11 * (1.0 - roadMask));
      color = mix(color, uAccent, horizonBloom * 0.16 * uIntensity);
      float wetNoise = fbm(vec2((p.x - vanishingX) * 4.4, depth * 17.0) + orbit2 * vec2(0.22, 0.46));
      float wetSheen = smoothstep(0.42, 0.82, wetNoise) * roadMask * depth;
      color += mix(uColorB, uAccent, 0.18) * wetSheen * 0.055 * uIntensity;
      float edgeWidth = mix(0.0014, 0.016, depth);
      float roadEdge = lineGlow(abs(p.x - vanishingX) - roadHalfWidth * 0.94, edgeWidth) * roadMask;
      float lane = lineGlow(abs(p.x - vanishingX) - roadHalfWidth * 0.34, edgeWidth * 0.42) * roadMask;
      float laneBreak = smoothstep(0.48, 0.82, 0.5 + 0.5 * sin(depth * 31.0 + uPhase * 2.0));
      float guidance = roadEdge * 0.16 + lane * laneBreak * 0.085;
      color = mix(color, uAccent, guidance * depth * uIntensity);
      float lamps = 0.0;
      float reflections = 0.0;
      float anamorphicBloom = 0.0;
      for (int lightIndex = 0; lightIndex < 5; lightIndex += 1) {
        float index = float(lightIndex);
        float seedA = hash12(vec2(index * 7.13 + 2.7, index + 11.0));
        float seedB = hash12(vec2(index + 19.0, index * 3.71 + 5.0));
        float frequency = 1.0 + mod(index, 3.0);
        float breathing = sin(uPhase * frequency + seedA * 6.28318530718) * 0.018 * uMotion;
        float lightDepth = clamp(mix(0.1, 0.93, seedA) + breathing, 0.06, 0.97);
        float lightY = mix(horizonY - 0.018, -0.48, pow(lightDepth, 0.78));
        float widthAtDepth = mix(0.035, 0.76, pow(lightDepth, 0.72));
        float centerX = vanishingX + (seedB - 0.5) * widthAtDepth * 1.34 + orbit2.x * 0.008 * uMotion;
        float pairSeparation = mix(0.004, 0.036, lightDepth);
        float lampRadius = mix(0.0032, 0.014, lightDepth) * mix(0.82, 1.18, uSoftness);
        vec2 leftDelta = (p - vec2(centerX - pairSeparation, lightY)) / vec2(lampRadius * 1.5, lampRadius);
        vec2 rightDelta = (p - vec2(centerX + pairSeparation, lightY)) / vec2(lampRadius * 1.5, lampRadius);
        float pair = exp(-dot(leftDelta, leftDelta) * 1.7) + exp(-dot(rightDelta, rightDelta) * 1.7);
        lamps += pair * mix(0.46, 1.0, lightDepth);
        float belowLamp = max(0.0, lightY - p.y);
        float reflectionLength = mix(0.028, 0.19, lightDepth) * mix(0.7, 1.3, uSoftness);
        float leftReflection = exp(-abs(p.x - (centerX - pairSeparation)) / max(0.002, lampRadius * 0.56));
        float rightReflection = exp(-abs(p.x - (centerX + pairSeparation)) / max(0.002, lampRadius * 0.56));
        float reflectionGate = step(p.y, lightY) * exp(-belowLamp / max(0.002, reflectionLength));
        float reflectionTexture = mix(0.35, 1.0, smoothstep(0.32, 0.82, wetNoise));
        reflections += (leftReflection + rightReflection) * reflectionGate * reflectionTexture * lightDepth;
        float horizontalFalloff = exp(-abs(p.x - centerX) / mix(0.028, 0.18, lightDepth));
        anamorphicBloom += lineGlow(p.y - lightY, lampRadius * 0.44) * horizontalFalloff * pair;
      }
      float traffic = clamp(lamps * 0.9 + reflections * 0.22 + anamorphicBloom * 0.34, 0.0, 1.0);
      vec3 trafficColor = mix(uAccent, vec3(1.0, 0.78, 0.48), 0.28);
      color = mix(color, trafficColor, traffic * uIntensity);
"""


def rewrite_night_drive() -> None:
    path = ROOT / "src/engine/shaders.ts"
    text = path.read_text()
    marker = "One authored perspective scene"
    if marker in text:
        return
    match = re.search(r"else if \(uMode < 10\.5\)\s*{", text)
    if not match:
        raise RuntimeError("Night Drive shader branch not found")
    brace = text.find("{", match.start())
    end = dict(brace_spans(text))[brace]
    replacement = "else if (uMode < 10.5) {\n" + NIGHT_DRIVE.strip("\n") + "\n    }"
    path.write_text(text[:match.start()] + replacement + text[end:])


def register_atmospheres() -> dict[str, int]:
    path = ROOT / "src/backgrounds.ts"
    text = path.read_text()
    mode_pattern = re.compile(r"(?:shaderMode|mode)\s*:\s*(\d+(?:\.\d+)?)")
    modes = [float(value) for value in mode_pattern.findall(text)]
    if not modes:
        raise RuntimeError("No background shader modes found")
    next_mode = int(max(modes)) + 1
    assigned: dict[str, int] = {}
    if all(item.slug in text for item in ATMOSPHERES):
        for item in ATMOSPHERES:
            _, _, block = object_containing(text, item.slug)
            assigned[item.slug] = int(float(mode_pattern.search(block).group(1)))
        return assigned
    start, end, template = object_containing(text, "night-drive")
    clones: list[str] = []
    for offset, item in enumerate(ATMOSPHERES):
        if item.slug in text:
            _, _, block = object_containing(text, item.slug)
            assigned[item.slug] = int(float(mode_pattern.search(block).group(1)))
            continue
        mode = next_mode + offset
        assigned[item.slug] = mode
        clone = template.replace("night-drive", item.slug).replace("Night Drive", item.name)
        clone = set_string(clone, "description", item.description, required=False)
        if "shaderMode" in clone:
            clone = set_number(clone, "shaderMode", mode)
        else:
            clone = set_number(clone, "mode", mode)
        clones.append(clone)
    path.write_text(insert_after(text, end, clones))
    return assigned


def extend_shader(assigned: dict[str, int]) -> None:
    path = ROOT / "src/engine/shaders.ts"
    text = path.read_text()
    if all(f"uMode < {assigned[item.slug] + 0.5:g}" in text for item in ATMOSPHERES):
        return
    thresholds = [(float(match.group(1)), match.start()) for match in re.finditer(r"uMode\s*<\s*(\d+(?:\.\d+)?)", text)]
    new_values = {assigned[item.slug] + 0.5 for item in ATMOSPHERES}
    _, pos = max((value, pos) for value, pos in thresholds if value not in new_values)
    brace = text.find("{", pos)
    end = dict(brace_spans(text))[brace]
    addition = ""
    for item in ATMOSPHERES:
        body = SHADER_BODIES[item.shader].strip("\n")
        addition += f" else if (uMode < {assigned[item.slug] + 0.5:g}) {{\n{body}\n    }}"
    path.write_text(text[:end] + addition + text[end:])


def extend_worlds() -> None:
    path = ROOT / "src/themes.ts"
    text = path.read_text()
    for source_name, world_id, name, description, old_style, new_style, colors, motion, grain, softness, complexity, parallax in WORLD_SPECS:
        if world_id in text:
            continue
        start, end, source = object_containing(text, source_name)
        clone = set_string(source, "id", world_id)
        clone = set_string(clone, "name", name)
        clone = set_string(clone, "description", description, required=False)
        if f'"{old_style}"' in clone:
            clone = clone.replace(f'"{old_style}"', f'"{new_style}"', 1)
        elif f"'{old_style}'" in clone:
            clone = clone.replace(f"'{old_style}'", f'"{new_style}"', 1)
        else:
            raise RuntimeError(f"Background style {old_style} missing in {source_name}")
        background_match = re.search(r"background\s*:\s*{", clone)
        if not background_match:
            raise RuntimeError(f"Background object missing in {source_name}")
        brace = clone.find("{", background_match.start())
        background_end = dict(brace_spans(clone))[brace]
        background = clone[brace:background_end]
        for prop, color in zip(("colorA", "colorB", "accent"), colors):
            background = set_string(background, prop, color)
        for prop, value in (("motion", motion), ("grain", grain), ("softness", softness), ("complexity", complexity), ("parallax", parallax)):
            background = set_number(background, prop, value, required=False)
        clone = clone[:brace] + background + clone[background_end:]
        text = insert_after(text, end, [clone])
    path.write_text(text)


def add_runtime_quality() -> None:
    (ROOT / "src/runtimeQuality.ts").write_text('''/** Preview quality is based on framebuffer pressure, not device labels. */
export interface PreviewQualityBudget {
  pixelRatioCap: number;
  tier: "cinematic" | "balanced" | "efficient";
}
const MEGAPIXEL = 1_000_000;
export function resolvePreviewQualityBudget(devicePixelRatio: number, cssWidth: number, cssHeight: number): PreviewQualityBudget {
  const safeDpr = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
  const width = Number.isFinite(cssWidth) ? Math.max(1, cssWidth) : 1;
  const height = Number.isFinite(cssHeight) ? Math.max(1, cssHeight) : 1;
  const cssMegapixels = (width * height) / MEGAPIXEL;
  if (cssMegapixels <= 1.5) return { pixelRatioCap: Math.min(safeDpr, 2), tier: "cinematic" };
  if (cssMegapixels <= 3.2) return { pixelRatioCap: Math.min(safeDpr, 1.5), tier: "balanced" };
  return { pixelRatioCap: Math.min(safeDpr, 1.25), tier: "efficient" };
}
export function resolvePreviewPixelRatio(devicePixelRatio: number, cssWidth: number, cssHeight: number): number {
  return resolvePreviewQualityBudget(devicePixelRatio, cssWidth, cssHeight).pixelRatioCap;
}
''')
    path = ROOT / "src/engine/CinematicCarousel.ts"
    text = path.read_text()
    if "resolvePreviewPixelRatio" not in text:
        imports = list(re.finditer(r"^import .*?;\s*$", text, re.M))
        if not imports:
            raise RuntimeError("No engine imports found")
        pos = imports[-1].end()
        text = text[:pos] + '\nimport { resolvePreviewPixelRatio } from "../runtimeQuality";' + text[pos:]
    if "setPixelRatio(resolvePreviewPixelRatio" not in text:
        pattern = re.compile(r"(?P<target>(?:this\.)?[A-Za-z_$][\w$]*)\.setPixelRatio\(\s*Math\.min\(\s*(?:window\.)?devicePixelRatio\s*,\s*2\s*\)\s*\)\s*;")
        match = pattern.search(text)
        if not match:
            pattern = re.compile(r"(?P<target>(?:this\.)?[A-Za-z_$][\w$]*)\.setPixelRatio\(\s*(?:window\.)?devicePixelRatio\s*\)\s*;")
            match = pattern.search(text)
        if not match:
            raise RuntimeError("Preview pixel ratio assignment not found")
        replacement = f'{match.group("target")}.setPixelRatio(resolvePreviewPixelRatio(window.devicePixelRatio, window.innerWidth, window.innerHeight));'
        text = text[:match.start()] + replacement + text[match.end():]
    path.write_text(text)


def tune_authored_grain() -> None:
    path = ROOT / "src/themes.ts"
    text = path.read_text()
    limits = {
        "Editorial Drift": 0.045,
        "Road Memory": 0.05,
        "Dread": 0.11,
        "Sunstruck Atlas": 0.045,
        "Blue Hour": 0.04,
        "Night Run": 0.055,
        "Eclipse Ritual": 0.08,
    }
    for name, limit in limits.items():
        try:
            start, end, block = object_containing(text, name)
        except RuntimeError:
            continue
        grain_matches = list(re.finditer(r"(grain\s*:\s*)\d+(?:\.\d+)?", block))
        if not grain_matches:
            continue
        # The final grain property in an authored world is the scene-level optical grain.
        match = grain_matches[-1]
        block = block[:match.start()] + f"{match.group(1)}{limit:g}" + block[match.end():]
        text = text[:start] + block + text[end:]
    path.write_text(text)


def write_tests_and_docs(assigned: dict[str, int]) -> None:
    ids = [item.slug for item in ATMOSPHERES]
    thresholds = [[slug, assigned[slug] + 0.5] for slug in ids]
    names = [spec[2] for spec in WORLD_SPECS]
    (ROOT / "tests/atmosphereAtlasGauntlet.test.ts").write_text(f'''import {{ readFileSync }} from "node:fs";
import {{ describe, expect, test }} from "vitest";
const backgroundsSource = readFileSync(new URL("../src/backgrounds.ts", import.meta.url), "utf8");
const shaderSource = readFileSync(new URL("../src/engine/shaders.ts", import.meta.url), "utf8");
const themesSource = readFileSync(new URL("../src/themes.ts", import.meta.url), "utf8");
describe("expanded atmosphere atlas", () => {{
  test.each({ids!r})("registers and renders %s", (id) => expect(backgroundsSource).toContain(id));
  test.each({thresholds!r})("routes %s through shader mode %f", (_id, threshold) => expect(shaderSource).toContain(`uMode < ${{threshold}}`));
  test.each({names!r})("ships authored world %s", (name) => expect(themesSource).toContain(name));
  test("uses an authored perspective scene for Night Run", () => {{
    const start = shaderSource.indexOf("One authored perspective scene");
    const end = shaderSource.indexOf("else if (uMode <", start + 20);
    const block = shaderSource.slice(start, end === -1 ? undefined : end);
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("vanishingX");
    expect(block).not.toContain("streakUv");
  }});
}});
''')
    (ROOT / "tests/runtimeQuality.test.ts").write_text('''import { describe, expect, test } from "vitest";
import { resolvePreviewPixelRatio, resolvePreviewQualityBudget } from "../src/runtimeQuality";
describe("preview framebuffer budget", () => {
  test("preserves dense previews on modest canvases", () => expect(resolvePreviewQualityBudget(3, 1024, 768)).toEqual({ pixelRatioCap: 2, tier: "cinematic" }));
  test("steps down predictably for large editor surfaces", () => {
    expect(resolvePreviewQualityBudget(2, 1920, 1080)).toEqual({ pixelRatioCap: 1.5, tier: "balanced" });
    expect(resolvePreviewQualityBudget(2, 3840, 2160)).toEqual({ pixelRatioCap: 1.25, tier: "efficient" });
  });
  test("never invents an invalid ratio", () => {
    expect(resolvePreviewPixelRatio(Number.NaN, 0, -1)).toBe(1);
    expect(resolvePreviewPixelRatio(0.5, 800, 600)).toBe(1);
  });
  test("does not upscale low-DPR screens", () => expect(resolvePreviewPixelRatio(1, 3840, 2160)).toBe(1));
});
''')
    (ROOT / "e2e/creatorJourney.e2e.ts").write_text('''import { expect, test } from "@playwright/test";
const worlds = ["Editorial Drift", "Road Memory", "Dread", "Noir Contact", "Tender Light", "Chrome Dream", "Sunstruck Atlas", "Blue Hour", "Velvet Fever", "Celluloid Archive", "Night Run", "Eclipse Ritual", "Opal Nocturne", "Projection Room", "Wild Atlas", "Silver Tide", "Winter Glass", "Neon Monsoon"];
test.describe("creator journey gauntlet", () => {
  test("all authored worlds are reachable and leave one healthy renderer", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    const stage = page.locator('[data-testid="webgl-stage"]');
    await expect(stage).toBeVisible();
    for (const world of worlds) {
      const control = page.getByRole("button", { name: new RegExp(world, "i") });
      await expect(control, `Missing authored world: ${world}`).toHaveCount(1);
      await control.click();
      await page.waitForTimeout(120);
      await expect(stage).toBeVisible();
      await expect(page.locator("canvas")).toHaveCount(1);
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });
  test("interactive controls expose an accessible name", async ({ page }) => {
    await page.goto("/");
    const unnamed = await page.locator("button, input, select, textarea").evaluateAll(elements => elements.flatMap((element, index) => {
      const control = element as HTMLInputElement;
      const named = Boolean(control.getAttribute("aria-label")?.trim() || control.getAttribute("aria-labelledby")?.trim() || control.getAttribute("title")?.trim() || ("labels" in control && control.labels?.length) || control.textContent?.trim());
      const hidden = control.getAttribute("aria-hidden") === "true" || control.tabIndex < 0;
      return !hidden && !named ? [`${control.tagName.toLowerCase()}[${index}]`] : [];
    }));
    expect(unnamed, `Unnamed controls:\n${unnamed.join("\n")}`).toEqual([]);
  });
  test("the editor remains contained at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const overflow = await page.evaluate(() => ({ viewport: innerWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(overflow.root).toBeLessThanOrEqual(overflow.viewport + 1);
    expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
  });
  test("reduced motion preserves a usable renderer", async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator('[data-testid="webgl-stage"]')).toBeVisible();
    await page.getByRole("button", { name: /Blue Hour/i }).click();
    await expect(page.locator('[data-testid="webgl-stage"]')).toBeVisible();
    await page.close();
  });
});
''')
    (ROOT / "docs/CREATOR_JOURNEY_GAUNTLET.md").write_text('''# Creator journey gauntlet

Drift succeeds only when a creator can move from raw pitch-deck slides to a dependable cinematic export without learning a 3D package.

## Arrival
- A useful authored world appears immediately; the canvas never looks broken or empty.
- The first decisions are slides, motion, and film world. Advanced optics do not become homework.

## Direction, not decoration
- Film worlds coordinate background, lens, pacing, depth, and material; they are not colour presets.
- Every procedural atmosphere has recognisable spatial logic and avoids repeated wallpaper.
- Chromatic aberration, grain, blur, bloom, and halation remain conservative in authored worlds.

## Presenter mode
- Presenter protection is optional and off by default.
- Protected mode keeps the presenter readable while the surrounding scene receives the lens.
- Treated mode intentionally places presenter and carousel behind one lens.

## Preview and export
- Preview and export share one renderer and optical path.
- Reduced-motion users receive a stable scene, not a visually unrelated fallback.
- Transparent mode is checkerboarded only in the editor and exports actual alpha.
- Progress belongs to the current export session; stale timers cannot erase a later job.
- Cancel leaves the app ready for another export. Completion is explicitly verified.

## Release hold
Reject a build for repeated procedural marks, global synthetic noise, hierarchy-destroying glow, static text fringing, protected-presenter contamination, corner clipping, loop discontinuity, or preview/export mismatch. Type checking, unit tests, production build, browser gauntlet, visual evidence, and export lifecycle checks must pass against the exact PR head.
''')


def main() -> None:
    rewrite_night_drive()
    assigned = register_atmospheres()
    extend_shader(assigned)
    extend_worlds()
    tune_authored_grain()
    add_runtime_quality()
    write_tests_and_docs(assigned)


if __name__ == "__main__":
    main()
