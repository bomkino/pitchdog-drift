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


def render(size: int) -> bytes:
    pixels = bytearray(size * size * 4)
    antialias = 1.35 / size

    for pixel_y in range(size):
        y = (pixel_y + 0.5) / size - 0.5
        for pixel_x in range(size):
            x = (pixel_x + 0.5) / size - 0.5

            shell_distance = rounded_box_sdf(x, y, 0.475, 0.475, 0.205)
            shell_alpha = 1.0 - smoothstep(-antialias, antialias, shell_distance)

            radial = math.hypot(x * 0.94, y * 1.03)
            vignette = clamp((radial - 0.17) / 0.58)
            rgb = (
                0.052 - 0.018 * vignette,
                0.052 - 0.020 * vignette,
                0.066 - 0.016 * vignette,
            )

            glows = (
                ((-0.26, 0.27), 0.22, (0.22, 0.76, 0.74), 0.66),
                ((0.28, -0.25), 0.25, (0.92, 0.24, 0.47), 0.58),
                ((0.18, 0.29), 0.20, (0.96, 0.63, 0.22), 0.34),
            )
            for (center_x, center_y), radius, color, strength in glows:
                distance_sq = (x - center_x) ** 2 + (y - center_y) ** 2
                glow = math.exp(-distance_sq / (2.0 * radius * radius)) * strength
                rgb = blend(rgb, color, glow)

            # Three offset cards: a restrained chromatic echo around the primary frame.
            card_specs = (
                (0.017, -0.002, -0.115, (0.18, 0.82, 0.85), 0.42),
                (-0.014, 0.010, -0.115, (0.94, 0.22, 0.49), 0.38),
                (0.000, 0.000, -0.115, (0.97, 0.96, 0.90), 0.94),
            )
            for offset_x, offset_y, angle, color, opacity in card_specs:
                card_distance = rotated_box_sdf(
                    x,
                    y,
                    offset_x,
                    offset_y,
                    0.258,
                    0.338,
                    0.052,
                    angle,
                )
                stroke_width = 0.018 if size >= 64 else 0.025
                stroke = 1.0 - smoothstep(stroke_width - antialias, stroke_width + antialias, abs(card_distance))
                rgb = blend(rgb, color, stroke * opacity)

            # A soft inner exposure window prevents the mark from reading as a generic rectangle.
            inner_distance = rotated_box_sdf(x, y, 0.0, -0.012, 0.192, 0.262, 0.032, -0.115)
            inner_fill = 1.0 - smoothstep(-antialias, antialias, inner_distance)
            rgb = blend(rgb, (0.025, 0.027, 0.037), inner_fill * 0.72)

            # Film-perforation lights. Deliberately sparse at small icon sizes.
            if size >= 32:
                cosine = math.cos(-0.115)
                sine = math.sin(-0.115)
                local_x = cosine * x - sine * (y + 0.012)
                local_y = sine * x + cosine * (y + 0.012)
                for hole_y in (-0.205, -0.067, 0.071, 0.209):
                    for hole_x in (-0.218, 0.218):
                        hole = rounded_box_sdf(local_x - hole_x, local_y - hole_y, 0.018, 0.030, 0.009)
                        coverage = 1.0 - smoothstep(-antialias, antialias, hole)
                        rgb = blend(rgb, (0.98, 0.95, 0.84), coverage * 0.80)

            grain = deterministic_noise(pixel_x, pixel_y, size) * (0.018 if size >= 64 else 0.009)
            rgb = tuple(clamp(channel + grain) for channel in rgb)

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
    if len(sys.argv) != 2:
        print("usage: generate-macos-icon.py OUTPUT.iconset", file=sys.stderr)
        return 2

    output = Path(sys.argv[1]).resolve()
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
        write_png(target, size, render(size))
        rendered[size] = target

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
