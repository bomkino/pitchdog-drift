#!/usr/bin/env python3
"""Generate Drift.iconset using only Python's standard library."""

from __future__ import annotations

import math
import shutil
import struct
import sys
import zlib
from pathlib import Path


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 0.0
    t = clamp((value - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def rounded_box_sdf(x: float, y: float, half_w: float, half_h: float, radius: float) -> float:
    qx = abs(x) - half_w + radius
    qy = abs(y) - half_h + radius
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    inside = min(max(qx, qy), 0.0)
    return outside + inside - radius


def rotated_box_sdf(
    x: float,
    y: float,
    center_x: float,
    center_y: float,
    half_w: float,
    half_h: float,
    radius: float,
    angle: float,
) -> float:
    cosine = math.cos(angle)
    sine = math.sin(angle)
    dx = x - center_x
    dy = y - center_y
    local_x = cosine * dx + sine * dy
    local_y = -sine * dx + cosine * dy
    return rounded_box_sdf(local_x, local_y, half_w, half_h, radius)


def blend(rgb: tuple[float, float, float], overlay: tuple[float, float, float], alpha: float) -> tuple[float, float, float]:
    amount = clamp(alpha)
    return tuple(base * (1.0 - amount) + top * amount for base, top in zip(rgb, overlay))


def deterministic_noise(x: int, y: int, size: int) -> float:
    value = (x * 374761393 + y * 668265263 + size * 2246822519) & 0xFFFFFFFF
    value = (value ^ (value >> 13)) * 1274126177 & 0xFFFFFFFF
    value ^= value >> 16
    return (value / 0xFFFFFFFF) * 2.0 - 1.0


def line_segment_distance(
    x: float,
    y: float,
    start_x: float,
    start_y: float,
    end_x: float,
    end_y: float,
) -> float:
    dx = end_x - start_x
    dy = end_y - start_y
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(x - start_x, y - start_y)
    amount = clamp(((x - start_x) * dx + (y - start_y) * dy) / length_sq)
    return math.hypot(x - (start_x + amount * dx), y - (start_y + amount * dy))


def render(size: int, variant: str = "release") -> bytes:
    pixels = bytearray(size * size * 4)
    antialias = 1.35 / size
    angle = -0.065
    cosine = math.cos(angle)
    sine = math.sin(angle)

    for pixel_y in range(size):
        y = (pixel_y + 0.5) / size - 0.5
        for pixel_x in range(size):
            x = (pixel_x + 0.5) / size - 0.5

            shell_distance = rounded_box_sdf(x, y, 0.475, 0.475, 0.205)
            shell_alpha = 1.0 - smoothstep(-antialias, antialias, shell_distance)

            # A single slide in motion: editorial object first, application
            # glyph second. The coral thread remains legible at 16 px and the
            # broad, off-axis frame avoids the usual glossy software cube.
            rgb = (0.050, 0.054, 0.066)
            trail_distance = min(
                line_segment_distance(x, y, -0.39, 0.20, -0.22, 0.30),
                line_segment_distance(x, y, -0.22, 0.30, 0.02, 0.27),
                line_segment_distance(x, y, 0.02, 0.27, 0.38, 0.15),
            )
            trail = 1.0 - smoothstep(0.030 - antialias, 0.030 + antialias, trail_distance)
            rgb = blend(rgb, (0.66, 0.60, 1.00), trail)

            shadow_distance = rotated_box_sdf(x, y, 0.018, 0.018, 0.335, 0.220, 0.034, angle)
            shadow = 1.0 - smoothstep(-antialias, antialias, shadow_distance)
            rgb = blend(rgb, (0.012, 0.014, 0.018), shadow * 0.92)

            slide_distance = rotated_box_sdf(x, y, 0.0, -0.012, 0.335, 0.220, 0.034, angle)
            slide = 1.0 - smoothstep(-antialias, antialias, slide_distance)
            rgb = blend(rgb, (0.89, 0.86, 0.91), slide)

            local_x = cosine * x + sine * (y + 0.012)
            local_y = -sine * x + cosine * (y + 0.012)
            accent_panel = (
                1.0 - smoothstep(-antialias, antialias, rounded_box_sdf(local_x - 0.205, local_y, 0.130, 0.220, 0.028))
            ) * slide
            rgb = blend(rgb, (0.47, 0.40, 0.91), accent_panel)

            title_bar = max(
                1.0 - smoothstep(-antialias, antialias, rounded_box_sdf(local_x + 0.150, local_y + 0.060, 0.115, 0.025, 0.008)),
                1.0 - smoothstep(-antialias, antialias, rounded_box_sdf(local_x + 0.185, local_y - 0.012, 0.080, 0.020, 0.007)),
            ) * slide
            rgb = blend(rgb, (0.050, 0.054, 0.066), title_bar * 0.98)

            caption = (
                1.0 - smoothstep(-antialias, antialias, rounded_box_sdf(local_x + 0.198, local_y - 0.112, 0.068, 0.007, 0.003))
            ) * slide
            rgb = blend(rgb, (0.38, 0.36, 0.40), caption * 0.82)

            outline_width = 0.010 if size >= 64 else 0.017
            outline = 1.0 - smoothstep(
                outline_width - antialias,
                outline_width + antialias,
                abs(slide_distance),
            )
            rgb = blend(rgb, (0.035, 0.038, 0.046), outline * 0.92)

            if size >= 64:
                grain = deterministic_noise(pixel_x, pixel_y, size) * 0.010
                rgb = tuple(clamp(channel + grain * shell_alpha) for channel in rgb)

            if variant == "v2-dev":
                # A precise registration mark makes the side-by-side developer
                # app impossible to mistake for the production Dock icon.
                shell_keyline = 1.0 - smoothstep(
                    0.011 - antialias,
                    0.011 + antialias,
                    abs(shell_distance),
                )
                rgb = blend(rgb, (0.30, 0.46, 0.98), shell_keyline * 0.92)
                marker_distance = rounded_box_sdf(x - 0.322, y + 0.318, 0.070, 0.052, 0.012)
                marker = 1.0 - smoothstep(-antialias, antialias, marker_distance)
                rgb = blend(rgb, (0.98, 0.25, 0.14), marker * 0.98)

            index = (pixel_y * size + pixel_x) * 4
            pixels[index] = round(rgb[0] * 255)
            pixels[index + 1] = round(rgb[1] * 255)
            pixels[index + 2] = round(rgb[2] * 255)
            pixels[index + 3] = round(shell_alpha * 255)

    return bytes(pixels)


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + chunk_type
        + data
        + struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
    )


def write_png(path: Path, size: int, rgba: bytes) -> None:
    stride = size * 4
    scanlines = b"".join(b"\x00" + rgba[row * stride : (row + 1) * stride] for row in range(size))
    payload = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + png_chunk(b"IDAT", zlib.compress(scanlines, 9))
        + png_chunk(b"IEND", b"")
    )
    path.write_bytes(payload)


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print("usage: generate-macos-icon.py OUTPUT.iconset [release|v2-dev]", file=sys.stderr)
        return 2

    output = Path(sys.argv[1]).resolve()
    variant = sys.argv[2] if len(sys.argv) == 3 else "release"
    if variant not in {"release", "v2-dev"}:
        print(f"unsupported icon variant: {variant}", file=sys.stderr)
        return 2
    output.mkdir(parents=True, exist_ok=True)

    names = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }

    rendered: dict[int, Path] = {}
    for filename, size in names.items():
        target = output / filename
        if size in rendered:
            shutil.copyfile(rendered[size], target)
            continue
        write_png(target, size, render(size, variant))
        rendered[size] = target

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
