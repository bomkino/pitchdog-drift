#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

from spatial_templates import DOC, EVALUATE, MODEL, SHADERS, SPATIAL_DYNAMICS, TESTS

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + "\n", encoding="utf-8")


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def matching_brace(text: str, opening: int) -> int:
    expect(0 <= opening < len(text) and text[opening] == "{", f"No opening brace at {opening}")
    depth = 0
    quote: str | None = None
    escaped = False
    line_comment = False
    block_comment = False
    index = opening
    while index < len(text):
        char = text[index]
        nxt = text[index + 1] if index + 1 < len(text) else ""
        if line_comment:
            if char == "\n":
                line_comment = False
            index += 1
            continue
        if block_comment:
            if char == "*" and nxt == "/":
                block_comment = False
                index += 2
                continue
            index += 1
            continue
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            index += 1
            continue
        if char == "/" and nxt == "/":
            line_comment = True
            index += 2
            continue
        if char == "/" and nxt == "*":
            block_comment = True
            index += 2
            continue
        if char in ('"', "'", "`"):
            quote = char
            index += 1
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
        index += 1
    raise RuntimeError(f"Unclosed brace at {opening}")


def add_model_import_names(text: str, names: list[str], module: str = "../model") -> str:
    pattern = re.compile(rf'import\s*\{{(?P<body>.*?)\}}\s*from\s*["\']{re.escape(module)}["\'];', re.S)
    match = pattern.search(text)
    expect(match is not None, f"Could not find import from {module}")
    body = match.group("body")
    additions = [name for name in names if re.search(rf'\b{re.escape(name.replace("type ", ""))}\b', body) is None]
    if not additions:
        return text
    lines = body.rstrip().splitlines()
    indent = "  "
    for line in lines:
        stripped = line.strip()
        if stripped:
            indent = line[: len(line) - len(line.lstrip())]
            break
    if lines and lines[-1].strip() and not lines[-1].rstrip().endswith(","):
        lines[-1] = lines[-1].rstrip() + ","
    lines.extend(f"{indent}{name}," for name in additions)
    replacement = "import {\n" + "\n".join(lines).strip("\n") + f'\n}} from "{module}";'
    return text[: match.start()] + replacement + text[match.end() :]


def property_line(text: str, name: str, start: int = 0, end: int | None = None) -> re.Match[str]:
    region = text[start:end]
    pattern = re.compile(rf'(?m)^(?P<indent>[ \t]*){re.escape(name)}:\s*(?P<expr>.+?),\s*$')
    match = pattern.search(region)
    expect(match is not None, f"Could not find one-line property {name}")
    absolute_start = start + match.start()
    absolute_end = start + match.end()
    return re.match(pattern, text[absolute_start:absolute_end])  # type: ignore[return-value]


def find_property_span(text: str, name: str, start: int = 0, end: int | None = None) -> tuple[int, int, str, str]:
    region = text[start:end]
    pattern = re.compile(rf'(?m)^(?P<indent>[ \t]*){re.escape(name)}:\s*(?P<expr>.+?),\s*$')
    match = pattern.search(region)
    expect(match is not None, f"Could not find one-line property {name}")
    return start + match.start(), start + match.end(), match.group("indent"), match.group("expr")


def clone_validator_property(
    text: str,
    source: str,
    target: str,
    replacements: list[tuple[str, str]],
    fallback: str,
    insert_after: str,
) -> str:
    if re.search(rf'(?m)^\s*{re.escape(target)}:', text):
        return text
    _, _, _, source_expr = find_property_span(text, source)
    expr = source_expr
    for old, new in replacements:
        expr = expr.replace(old, new)
    expr, count = re.subn(
        r'^(read(?:Enum|Number)\()([^,\n]+),',
        rf'\1legacyExtension(\2, {fallback}),',
        expr,
        count=1,
    )
    expect(count == 1, f"Could not wrap fallback for {target}: {expr}")
    _, anchor_end, indent, _ = find_property_span(text, insert_after)
    line = f"\n{indent}{target}: {expr},"
    return text[:anchor_end] + line + text[anchor_end:]


def patch_settings_validation(text: str) -> str:
    text = add_model_import_names(
        text,
        ["DEFAULT_SETTINGS", "type DynamicsMode", "type SurfaceMode"],
    )
    flows = (
        'const FLOWS: readonly Flow[] = [\n'
        '  "straight",\n  "arc",\n  "ribbon",\n  "cylinder",\n  "tunnel",\n'
        '  "helix",\n  "orbit",\n  "cascade",\n  "lemniscate",\n  "switchback",\n];'
    )
    text, count = re.subn(r'const FLOWS:[^=]*=\s*\[[\s\S]*?\];', flows, text, count=1)
    expect(count == 1, "Could not replace FLOWS validation set")
    if "const DYNAMICS:" not in text:
        enum_sets = (
            '\nconst DYNAMICS: readonly DynamicsMode[] = ["direct", "weighted", "spring", "drift"];\n'
            'const SURFACES: readonly SurfaceMode[] = ["card", "paper", "silk", "gel"];'
        )
        insertion = text.find(";", text.find("const FLOWS:")) + 1
        text = text[:insertion] + enum_sets + text[insertion:]
    if "function legacyExtension" not in text:
        helper = (
            "\nfunction legacyExtension<T>(value: unknown, fallback: T): unknown | T {\n"
            "  return value === undefined ? fallback : value;\n"
            "}\n\n"
        )
        export_at = text.find("export ")
        expect(export_at >= 0, "Could not locate validation exports")
        text = text[:export_at] + helper + text[export_at:]

    text = clone_validator_property(
        text,
        "flow",
        "dynamics",
        [(".flow", ".dynamics"), ("motion.flow", "motion.dynamics"), ("FLOWS", "DYNAMICS")],
        "DEFAULT_SETTINGS.motion.dynamics",
        "flow",
    )
    text = clone_validator_property(
        text,
        "distortion",
        "bank",
        [(".distortion", ".bank"), ("motion.distortion", "motion.bank")],
        "DEFAULT_SETTINGS.motion.bank",
        "tilt",
    )
    text = clone_validator_property(
        text,
        "fit",
        "surface",
        [(".fit", ".surface"), ("slide.fit", "slide.surface"), ("IMAGE_FITS", "SURFACES")],
        "DEFAULT_SETTINGS.slide.surface",
        "smoothing",
    )
    text = clone_validator_property(
        text,
        "borderWidth",
        "thickness",
        [(".borderWidth", ".thickness"), ("slide.borderWidth", "slide.thickness")],
        "DEFAULT_SETTINGS.slide.thickness",
        "surface",
    )
    for required in ("dynamics:", "bank:", "surface:", "thickness:"):
        expect(required in text, f"Validation patch missing {required}")
    return text


def find_object_block(text: str, key: str, start: int = 0, end: int | None = None) -> tuple[int, int]:
    region = text[start:end]
    match = re.search(rf'\b{re.escape(key)}\s*:\s*\{{', region)
    expect(match is not None, f"Could not find object block {key}")
    opening = start + region.find("{", match.start())
    return opening, matching_brace(text, opening)


def patch_themes(text: str) -> str:
    profiles = {
        "editorial-drift": ("weighted", "0.58", "paper", "6"),
        "road-memory": ("drift", "0.46", "paper", "4"),
        "dread": ("spring", "0.82", "gel", "11"),
        "noir-contact": ("direct", "0.28", "card", "2"),
        "tender-light": ("weighted", "0.52", "silk", "3"),
        "chrome-dream": ("spring", "0.88", "gel", "13"),
    }
    for theme_id, (dynamics, bank, surface, thickness) in profiles.items():
        marker = re.search(rf'["\']{re.escape(theme_id)}["\']', text)
        expect(marker is not None, f"Theme not found: {theme_id}")
        next_marker = re.search(r'\bid\s*:\s*["\']', text[marker.end() :])
        theme_end = marker.end() + next_marker.start() if next_marker else len(text)
        motion_open, motion_close = find_object_block(text, "motion", marker.end(), theme_end)
        motion_body = text[motion_open + 1 : motion_close]
        additions: list[str] = []
        if re.search(r'\bdynamics\s*:', motion_body) is None:
            additions.append(f'    dynamics: "{dynamics}",')
        if re.search(r'\bbank\s*:', motion_body) is None:
            additions.append(f"    bank: {bank},")
        if additions:
            text = text[: motion_open + 1] + "\n" + "\n".join(additions) + text[motion_open + 1 :]
            delta = sum(len(line) + 1 for line in additions) + 1
            theme_end += delta
        slide_open, slide_close = find_object_block(text, "slide", marker.end(), theme_end)
        slide_body = text[slide_open + 1 : slide_close]
        additions = []
        if re.search(r'\bsurface\s*:', slide_body) is None:
            additions.append(f'    surface: "{surface}",')
        if re.search(r'\bthickness\s*:', slide_body) is None:
            additions.append(f"    thickness: {thickness},")
        if additions:
            text = text[: slide_open + 1] + "\n" + "\n".join(additions) + text[slide_open + 1 :]
    return text


def jsx_unit(text: str, needle: str) -> tuple[int, int, str]:
    location = text.find(needle)
    expect(location >= 0, f"Could not find JSX control needle: {needle}")
    line_start = text.rfind("\n", 0, location) + 1
    candidates: list[tuple[int, str]] = []
    cursor = line_start
    for _ in range(35):
        cursor = text.rfind("\n", 0, max(0, cursor - 1)) + 1
        line_end = text.find("\n", cursor)
        if line_end < 0:
            line_end = len(text)
        line = text[cursor:line_end]
        match = re.match(r'\s*<([A-Z][A-Za-z0-9_.]*|label|div|fieldset)\b', line)
        if match and not line.lstrip().startswith("</"):
            candidates.append((cursor, match.group(1)))
        if cursor == 0:
            break
    for start, tag in candidates:
        opening_end = text.find(">", start)
        if opening_end < 0 or opening_end > location:
            continue
        if text[max(start, opening_end - 1) : opening_end + 1] == "/>":
            return start, opening_end + 1, text[start : opening_end + 1]
        closing = text.find(f"</{tag}>", location)
        if closing >= 0:
            end = closing + len(tag) + 3
            return start, end, text[start:end]
    # Common custom control: multiline self-closing element whose opening begins above the needle.
    start = text.rfind("<", max(0, location - 3000), location)
    while start >= 0:
        end = text.find("/>", location)
        if end >= 0:
            return start, end + 2, text[start : end + 2]
        start = text.rfind("<", max(0, start - 3000), start)
    raise RuntimeError(f"Could not bound JSX control for {needle}")


def replace_select_options(block: str, options: list[tuple[str, str]]) -> str:
    option_matches = list(re.finditer(r'<option\b[\s\S]*?</option>', block))
    expect(option_matches, "No <option> elements in cloned select")
    indent_start = block.rfind("\n", 0, option_matches[0].start()) + 1
    indent = block[indent_start : option_matches[0].start()]
    rendered = "\n".join(f'{indent}<option value="{value}">{label}</option>' for value, label in options)
    return block[: option_matches[0].start()] + rendered + block[option_matches[-1].end() :]


def relabel_block(block: str, old_labels: list[str], new_label: str) -> str:
    for old in old_labels:
        replaced, count = re.subn(rf'(?<![A-Za-z]){re.escape(old)}(?![A-Za-z])', new_label, block, count=1)
        if count:
            return replaced
    # Change the first plain text node immediately after a JSX opening tag.
    replaced, count = re.subn(r'(>\s*)([A-Za-z][A-Za-z 3D-]{1,32})(\s*<)', rf'\1{new_label}\3', block, count=1)
    expect(count == 1, f"Could not relabel JSX control to {new_label}")
    return replaced


def set_numeric_prop(block: str, name: str, value: str) -> str:
    patterns = [
        rf'\b{name}=\{{[^}}]+\}}',
        rf'\b{name}="[^"]+"',
        rf'\b{name}=\{{?[-+0-9.]+\}}?',
    ]
    for pattern in patterns:
        block, count = re.subn(pattern, f"{name}={{{value}}}", block, count=1)
        if count:
            return block
    return block


def insert_after_unit(text: str, anchor_needle: str, block: str) -> str:
    _, end, _ = jsx_unit(text, anchor_needle)
    indent_line = text.rfind("\n", 0, end) + 1
    indent = re.match(r'[ \t]*', text[indent_line:end]).group(0)  # type: ignore[union-attr]
    normalized = block.strip("\n")
    return text[:end] + "\n" + normalized + text[end:]


def patch_control_panel(text: str) -> str:
    text = add_model_import_names(text, ["type DynamicsMode", "type SurfaceMode"])
    tunnel = '<option value="tunnel">Tunnel</option>'
    expect(tunnel in text, "Tunnel path option not found")
    if 'value="helix"' not in text:
        path_options = (
            tunnel
            + '\n                <option value="helix">Helix</option>'
            + '\n                <option value="orbit">Orbit</option>'
            + '\n                <option value="cascade">Cascade</option>'
            + '\n                <option value="lemniscate">Figure eight</option>'
            + '\n                <option value="switchback">Switchback</option>'
        )
        text = text.replace(tunnel, path_options, 1)
    text = text.replace("Optical bend", "Fabric flex")

    if "settings.motion.dynamics" not in text:
        _, _, block = jsx_unit(text, "settings.motion.flow")
        dynamics = block.replace("settings.motion.flow", "settings.motion.dynamics")
        dynamics = dynamics.replace("as Flow", "as DynamicsMode")
        dynamics = re.sub(r'(["\'])flow\1', r'\1dynamics\1', dynamics)
        dynamics = relabel_block(dynamics, ["Path", "Flow"], "Physics")
        dynamics = replace_select_options(
            dynamics,
            [("direct", "Direct"), ("weighted", "Weighted"), ("spring", "Spring"), ("drift", "Drift")],
        )
        text = insert_after_unit(text, "settings.motion.flow", dynamics)

    if "settings.motion.bank" not in text:
        _, _, block = jsx_unit(text, "settings.motion.tilt")
        bank = block.replace("settings.motion.tilt", "settings.motion.bank")
        bank = re.sub(r'(["\'])tilt\1', r'\1bank\1', bank)
        bank = relabel_block(bank, ["Path tilt", "Tilt"], "Path banking")
        bank = set_numeric_prop(bank, "min", "0")
        bank = set_numeric_prop(bank, "max", "1")
        bank = set_numeric_prop(bank, "step", "0.01")
        bank = re.sub(r'\*\s*100\s*\)?\s*\}\s*%?', "", bank)
        text = insert_after_unit(text, "settings.motion.tilt", bank)

    if "settings.slide.surface" not in text:
        _, _, block = jsx_unit(text, "settings.slide.fit")
        surface = block.replace("settings.slide.fit", "settings.slide.surface")
        surface = surface.replace("as ImageFit", "as SurfaceMode")
        surface = re.sub(r'(["\'])fit\1', r'\1surface\1', surface)
        surface = relabel_block(surface, ["Image fit", "Fit"], "Surface")
        surface = replace_select_options(
            surface,
            [("card", "Card"), ("paper", "Paper"), ("silk", "Silk"), ("gel", "Gel")],
        )
        text = insert_after_unit(text, "settings.slide.fit", surface)

    if "settings.slide.thickness" not in text:
        _, _, block = jsx_unit(text, "settings.slide.borderWidth")
        thickness = block.replace("settings.slide.borderWidth", "settings.slide.thickness")
        thickness = re.sub(r'(["\'])borderWidth\1', r'\1thickness\1', thickness)
        thickness = relabel_block(thickness, ["Border width", "Border"], "3D thickness")
        thickness = set_numeric_prop(thickness, "min", "0")
        thickness = set_numeric_prop(thickness, "max", "32")
        thickness = set_numeric_prop(thickness, "step", "0.5")
        text = insert_after_unit(text, "settings.slide.borderWidth", thickness)

    for required in (
        "settings.motion.dynamics",
        "settings.motion.bank",
        "settings.slide.surface",
        "settings.slide.thickness",
        'value="switchback"',
    ):
        expect(required in text, f"Control panel patch missing {required}")
    return text


def method_span(text: str, name: str) -> tuple[int, int, int, int]:
    match = re.search(rf'\b{re.escape(name)}\s*\([^)]*\)\s*(?::\s*[^{{]+)?\s*\{{', text)
    expect(match is not None, f"Method not found: {name}")
    opening = text.find("{", match.start(), match.end())
    closing = matching_brace(text, opening)
    return match.start(), closing + 1, opening, closing


def patch_motion_integrator(text: str) -> str:
    start, end, opening, closing = method_span(text, "advanceMotion")
    body = text[opening + 1 : closing]
    if "integrateMotionState(" in body:
        return text
    target_candidates = re.findall(r'\b(?:const|let)\s+([A-Za-z_$][\w$]*(?:target|desired)[A-Za-z_$]*Velocity[A-Za-z_$]*)\s*=', body, re.I)
    if not target_candidates:
        target_candidates = re.findall(r'\b([A-Za-z_$][\w$]*(?:target|desired)Velocity[A-Za-z_$]*)\b', body, re.I)
    expect(target_candidates, "Could not identify target velocity in advanceMotion")
    target = target_candidates[-1]
    stride_match = re.search(r'\b([A-Za-z_$][\w$]*)\.stride\b', body)
    expect(stride_match is not None, "Could not identify geometry stride in advanceMotion")
    stride = f"{stride_match.group(1)}.stride"
    settings_match = re.search(r'\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.motion\.(?:speed|direction|autoplay|reducedMotionOutput)', body)
    expect(settings_match is not None, "Could not identify settings expression in advanceMotion")
    settings = settings_match.group(1)
    position_update = list(re.finditer(r'(?m)^[ \t]*this\.motionPosition\s*\+=\s*this\.motionVelocity\s*\*\s*([A-Za-z_$][\w$]*)\s*;\s*$', body))
    expect(position_update, "Could not find preview position integration")
    position_match = position_update[-1]
    delta = position_match.group(1)
    preceding = body[: position_match.start()]
    velocity_updates = list(re.finditer(r'(?m)^[ \t]*this\.motionVelocity\s*(?:\+=|=)\s*[^;]+;\s*$', preceding))
    expect(velocity_updates, "Could not find first-order velocity update")
    velocity_match = velocity_updates[-1]
    indent = re.match(r'[ \t]*', body[velocity_match.start() :]).group(0)  # type: ignore[union-attr]
    replacement = (
        f"{indent}const integratedMotion = integrateMotionState(\n"
        f"{indent}  {{\n"
        f"{indent}    position: this.motionPosition,\n"
        f"{indent}    velocity: this.motionVelocity,\n"
        f"{indent}    acceleration: this.motionAcceleration,\n"
        f"{indent}  }},\n"
        f"{indent}  {target},\n"
        f"{indent}  {delta},\n"
        f"{indent}  {settings}.motion.dynamics,\n"
        f"{indent}  {stride},\n"
        f"{indent});\n"
        f"{indent}this.motionPosition = integratedMotion.position;\n"
        f"{indent}this.motionVelocity = integratedMotion.velocity;\n"
        f"{indent}this.motionAcceleration = integratedMotion.acceleration;"
    )
    body = body[: velocity_match.start()] + replacement + body[position_match.end() :]
    return text[: opening + 1] + body + text[closing:]


def patch_carousel(text: str) -> str:
    if 'from "./spatialDynamics"' not in text:
        insertion = text.find("\n", text.rfind("import ", 0, text.find("export ")))
        expect(insertion >= 0, "Could not find carousel import insertion")
        spatial_import = (
            '\nimport {\n'
            '  integrateMotionState,\n'
            '  surfaceModeIndex,\n'
            '  surfacePhaseAtTime,\n'
            '  SURFACE_PROFILES,\n'
            '} from "./spatialDynamics";'
        )
        text = text[: insertion + 1] + spatial_import + text[insertion + 1 :]

    interface = re.search(r'interface\s+SlidePoolItem\s*\{', text)
    expect(interface is not None, "SlidePoolItem interface not found")
    interface_open = text.find("{", interface.start(), interface.end())
    interface_close = matching_brace(text, interface_open)
    interface_body = text[interface_open + 1 : interface_close]
    if re.search(r'\bshell\s*:', interface_body) is None:
        mesh_line = re.search(r'(?m)^(?P<indent>[ \t]*)mesh:\s*[^;]+;\s*$', interface_body)
        expect(mesh_line is not None, "SlidePoolItem mesh field not found")
        insertion = interface_open + 1 + mesh_line.end()
        indent = mesh_line.group("indent")
        text = text[:insertion] + f"\n{indent}shell: THREE.Mesh;" + text[insertion:]

    if "private motionAcceleration" not in text:
        velocity_field = re.search(r'(?m)^(?P<indent>[ \t]*)private\s+motionVelocity\s*=\s*[^;]+;\s*$', text)
        expect(velocity_field is not None, "motionVelocity field not found")
        text = text[: velocity_field.end()] + f"\n{velocity_field.group('indent')}private motionAcceleration = 0;" + text[velocity_field.end() :]
    if "private activeExportMode" not in text:
        acceleration_field = re.search(r'(?m)^(?P<indent>[ \t]*)private\s+motionAcceleration\s*=\s*[^;]+;\s*$', text)
        expect(acceleration_field is not None, "motionAcceleration field not found")
        text = text[: acceleration_field.end()] + f"\n{acceleration_field.group('indent')}private activeExportMode = false;" + text[acceleration_field.end() :]

    create_start, create_end, create_open, create_close = method_span(text, "createPoolItem")
    create_body = text[create_open + 1 : create_close]
    if "new THREE.BoxGeometry" not in create_body:
        mesh_match = re.search(r'\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+THREE\.Mesh\s*\(', create_body)
        expect(mesh_match is not None, "Could not find slide mesh construction")
        mesh_name = mesh_match.group(1)
        statement_end = create_body.find(";", mesh_match.end())
        expect(statement_end >= 0, "Could not bound slide mesh construction")
        indent_start = create_body.rfind("\n", 0, mesh_match.start()) + 1
        indent = re.match(r'[ \t]*', create_body[indent_start:]).group(0)  # type: ignore[union-attr]
        shell_code = (
            f"\n{indent}const shellMaterial = new THREE.MeshBasicMaterial({{\n"
            f"{indent}  color: 0x171513,\n"
            f"{indent}  transparent: true,\n"
            f"{indent}  opacity: 0.62,\n"
            f"{indent}  depthWrite: true,\n"
            f"{indent}}});\n"
            f"{indent}const shell = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shellMaterial);\n"
            f"{indent}shell.position.z = -1;\n"
            f"{indent}shell.renderOrder = -1;\n"
            f"{indent}{mesh_name}.add(shell);"
        )
        create_body = create_body[: statement_end + 1] + shell_code + create_body[statement_end + 1 :]
        return_match = re.search(r'\breturn\s*\{', create_body)
        expect(return_match is not None, "createPoolItem return object not found")
        return_open = create_body.find("{", return_match.start(), return_match.end())
        return_close = matching_brace(create_body, return_open)
        return_body = create_body[return_open + 1 : return_close]
        mesh_property = re.search(r'(?m)^(?P<indent>[ \t]*)mesh,\s*$', return_body)
        if mesh_property:
            at = return_open + 1 + mesh_property.end()
            create_body = create_body[:at] + f"\n{mesh_property.group('indent')}shell," + create_body[at:]
        else:
            first_line = re.search(r'(?m)^(?P<indent>[ \t]*)[A-Za-z_$][\w$]*[,\s]', return_body)
            expect(first_line is not None, "Could not insert shell into pool return")
            create_body = create_body[: return_open + 1] + f"\n{first_line.group('indent')}shell," + create_body[return_open + 1 :]
        text = text[: create_open + 1] + create_body + text[create_close:]

    update_start, update_end, update_open, update_close = method_span(text, "updatePoolItem")
    update_body = text[update_open + 1 : update_close]
    phase_pattern = re.compile(r'(?m)^(?P<indent>[ \t]*)(?P<lhs>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.uPhase\.value)\s*=\s*[^;]+;\s*$')
    phase_match = phase_pattern.search(update_body)
    expect(phase_match is not None, "uPhase assignment not found in updatePoolItem")
    phase_replacement = (
        f"{phase_match.group('indent')}{phase_match.group('lhs')} = surfaceModeIndex(settings.slide.surface) +\n"
        f"{phase_match.group('indent')}  ((((logicalIndex % Math.max(1, this.assets.length)) + Math.max(1, this.assets.length)) %\n"
        f"{phase_match.group('indent')}    Math.max(1, this.assets.length)) / Math.max(1, this.assets.length));"
    )
    update_body = update_body[: phase_match.start()] + phase_replacement + update_body[phase_match.end() :]
    time_pattern = re.compile(r'(?m)^(?P<indent>[ \t]*)(?P<lhs>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.uTime\.value)\s*=\s*[^;]+;\s*$')
    time_match = time_pattern.search(update_body)
    expect(time_match is not None, "uTime assignment not found in updatePoolItem")
    time_replacement = (
        f"{time_match.group('indent')}{time_match.group('lhs')} = surfacePhaseAtTime(\n"
        f"{time_match.group('indent')}  settings,\n"
        f"{time_match.group('indent')}  time,\n"
        f"{time_match.group('indent')}  this.activeExportMode,\n"
        f"{time_match.group('indent')}  this.reducedMotionPreview,\n"
        f"{time_match.group('indent')});"
    )
    update_body = update_body[: time_match.start()] + time_replacement + update_body[time_match.end() :]
    if "const surfaceProfile = SURFACE_PROFILES" not in update_body:
        indent = "    "
        last_line_start = update_body.rfind("\n") + 1
        existing_indent = re.match(r'[ \t]*', update_body[last_line_start:]).group(0)  # type: ignore[union-attr]
        if existing_indent:
            indent = existing_indent
        shell_update = (
            f"\n{indent}const surfaceProfile = SURFACE_PROFILES[settings.slide.surface];\n"
            f"{indent}const thickness = Math.max(0, settings.slide.thickness);\n"
            f"{indent}item.shell.visible = thickness > 0.05 && evaluated.opacity > 0.015;\n"
            f"{indent}item.shell.scale.set(0.998, 0.998, Math.max(0.1, thickness));\n"
            f"{indent}item.shell.position.z = -Math.max(0.1, thickness) * 0.5 - 0.6;\n"
            f"{indent}const shellMaterial = item.shell.material as THREE.MeshBasicMaterial;\n"
            f"{indent}shellMaterial.color.set(settings.slide.borderColor).multiplyScalar(surfaceProfile.edgeTone);\n"
            f"{indent}shellMaterial.opacity = Math.min(0.94, Math.max(0.08, evaluated.opacity * surfaceProfile.edgeOpacity));\n"
        )
        update_body = update_body.rstrip() + shell_update
    text = text[: update_open + 1] + update_body + text[update_close:]

    # Recompute spans after edits, then switch export/preview material phase deterministically.
    _, _, render_open, render_close = method_span(text, "renderInternal")
    render_body = text[render_open + 1 : render_close]
    if "this.activeExportMode = exportMode;" not in render_body:
        render_body = "\n    this.activeExportMode = exportMode;" + render_body
        text = text[: render_open + 1] + render_body + text[render_close:]

    text = patch_motion_integrator(text)
    text = re.sub(
        r'(?m)^(?P<indent>[ \t]*)this\.motionVelocity\s*=\s*0\s*;\s*$',
        lambda match: match.group(0) + f"\n{match.group('indent')}this.motionAcceleration = 0;",
        text,
    )

    # Dispose the bounded shell resources alongside each resident slide.
    if "item.shell.geometry.dispose();" not in text:
        _, _, dispose_open, dispose_close = method_span(text, "dispose")
        dispose_body = text[dispose_open + 1 : dispose_close]
        loop_match = re.search(r'for\s*\(\s*const\s+([A-Za-z_$][\w$]*)\s+of\s+this\.([A-Za-z_$][\w$]*)\s*\)\s*\{', dispose_body)
        expect(loop_match is not None, "Could not find pool disposal loop")
        item_name = loop_match.group(1)
        loop_open = dispose_body.find("{", loop_match.start(), loop_match.end())
        indent_line = dispose_body.rfind("\n", 0, loop_open) + 1
        loop_indent = re.match(r'[ \t]*', dispose_body[indent_line:]).group(0) + "  "  # type: ignore[union-attr]
        shell_dispose = (
            f"\n{loop_indent}{item_name}.shell.geometry.dispose();\n"
            f"{loop_indent}({item_name}.shell.material as THREE.Material).dispose();"
        )
        dispose_body = dispose_body[: loop_open + 1] + shell_dispose + dispose_body[loop_open + 1 :]
        text = text[: dispose_open + 1] + dispose_body + text[dispose_close:]

    for required in (
        "motionAcceleration",
        "integrateMotionState(",
        "new THREE.BoxGeometry",
        "surfaceModeIndex(settings.slide.surface)",
        "surfacePhaseAtTime(",
        "SURFACE_PROFILES[settings.slide.surface]",
    ):
        expect(required in text, f"Carousel patch missing {required}")
    return text


def patch_readme(text: str) -> str:
    if "Spatial fabric dynamics" in text:
        return text
    return text.rstrip() + """

## Spatial fabric dynamics

The `gauntlet/spatial-fabric-dynamics` line adds tangent-led spatial paths, four authored material surfaces, bounded inertial preview physics, and scene-space slide thickness while preserving timestamp-deterministic export. See [`docs/SPATIAL_FABRIC_GAUNTLET.md`](docs/SPATIAL_FABRIC_GAUNTLET.md) for the architecture, guardrails, and acceptance gates.
"""


def main() -> None:
    # Full replacements establish one coherent contract before targeted integration patches.
    evaluate = EVALUATE.replace(
        "\n  }\n}\n\nfunction pathDerivative",
        "\n    default:\n      return { cross: 0, z: 0 };\n  }\n}\n\nfunction pathDerivative",
        1,
    )
    write("src/model.ts", MODEL)
    write("src/engine/spatialDynamics.ts", SPATIAL_DYNAMICS)
    write("src/engine/evaluate.ts", evaluate)
    write("src/engine/shaders.ts", SHADERS)
    write("tests/spatialDynamics.test.ts", TESTS)
    write("docs/SPATIAL_FABRIC_GAUNTLET.md", DOC)

    write("src/lib/settingsValidation.ts", patch_settings_validation(read("src/lib/settingsValidation.ts")))
    write("src/themes.ts", patch_themes(read("src/themes.ts")))
    write("src/components/ControlPanel.tsx", patch_control_panel(read("src/components/ControlPanel.tsx")))
    write("src/engine/CinematicCarousel.ts", patch_carousel(read("src/engine/CinematicCarousel.ts")))
    write("README.md", patch_readme(read("README.md")))

    # Bootstrap is intentionally self-removing. The validated branch contains product code and proof, not scaffolding.
    for relative in (
        ".github/workflows/spatial-gauntlet-bootstrap.yml",
        "scripts/apply_spatial_gauntlet.py",
        "scripts/spatial_templates.py",
    ):
        path = ROOT / relative
        if path.exists():
            path.unlink()


if __name__ == "__main__":
    main()
