#!/usr/bin/env python3
"""Generate DriftDocument.iconset using only Python's standard library."""

from __future__ import annotations

import math
import shutil
import struct
import sys
import zlib
from pathlib import Path

RGBA = tuple[int, int, int, int]


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


class Canvas:
    def __init__(self, size: int) -> None:
        self.size = size
        self.pixels = bytearray(size * size * 4)
        self.xs = [(x + 0.5) / size - 0.5 for x in range(size)]
        self.ys = [(y + 0.5) / size - 0.5 for y in range(size)]
        self.aa = 1.4 / size

    def blend(self, pixel_x: int, pixel_y: int, color: tuple[float, float, float], opacity: float) -> None:
        alpha = clamp(opacity)
        if alpha <= 0.0:
            return
        index = (pixel_y * self.size + pixel_x) * 4
        src_a = round(alpha * 255)
        dst_a = self.pixels[index + 3]
        out_a = src_a + (dst_a * (255 - src_a) + 127) // 255
        if out_a <= 0:
            return
        for channel in range(3):
            src = round(clamp(color[channel]) * 255)
            dst = self.pixels[index + channel]
            premul = src * src_a + (dst * dst_a * (255 - src_a) + 127) // 255
            self.pixels[index + channel] = min(255, (premul + out_a // 2) // out_a)
        self.pixels[index + 3] = min(255, out_a)

    def bounds(self, center_x: float, center_y: float, half_w: float, half_h: float, pad: float = 0.0) -> tuple[range, range]:
        left = max(0, int((center_x - half_w - pad + 0.5) * self.size) - 1)
        right = min(self.size, int((center_x + half_w + pad + 0.5) * self.size) + 2)
        top = max(0, int((center_y - half_h - pad + 0.5) * self.size) - 1)
        bottom = min(self.size, int((center_y + half_h + pad + 0.5) * self.size) + 2)
        return range(left, right), range(top, bottom)


def shape_coverage(distance: float, aa: float) -> float:
    return 1.0 - smoothstep(-aa, aa, distance)


def document_coverage(x: float, y: float, aa: float) -> float:
    body = shape_coverage(rounded_box_sdf(x, y + 0.004, 0.342, 0.433, 0.082), aa)
    return body * smoothstep(-aa, aa, y - (x - 0.585))


def draw_document_body(canvas: Canvas) -> None:
    xs, ys = canvas.bounds(0.0, 0.0, 0.38, 0.47, 0.04)
    for py in ys:
        y = canvas.ys[py]
        for px in xs:
            x = canvas.xs[px]
            shadow = document_coverage(x - 0.012, y - 0.020, canvas.aa * 1.8)
            if shadow:
                canvas.blend(px, py, (0.0, 0.0, 0.0), shadow * 0.20)

            body = document_coverage(x, y, canvas.aa)
            if body <= 0.0:
                continue
            vertical = clamp((y + 0.43) / 0.86)
            paper = (
                0.976 - 0.056 * vertical,
                0.968 - 0.061 * vertical,
                0.944 - 0.064 * vertical,
            )
            canvas.blend(px, py, paper, body)

            edge_distance = rounded_box_sdf(x, y + 0.004, 0.342, 0.433, 0.082)
            edge = 1.0 - smoothstep(0.006 - canvas.aa, 0.006 + canvas.aa, abs(edge_distance))
            edge *= smoothstep(-canvas.aa, canvas.aa, y - (x - 0.585))
            if edge:
                canvas.blend(px, py, (0.67, 0.65, 0.63), edge * 0.28)


def draw_fold(canvas: Canvas) -> None:
    xs, ys = canvas.bounds(0.252, -0.327, 0.105, 0.105, 0.01)
    for py in ys:
        y = canvas.ys[py]
        for px in xs:
            x = canvas.xs[px]
            fold = (
                smoothstep(-canvas.aa, canvas.aa, x - 0.158)
                * smoothstep(-canvas.aa, canvas.aa, -0.235 - y)
                * smoothstep(-canvas.aa, canvas.aa, y - (x - 0.585))
                * document_coverage(x, y, canvas.aa)
            )
            if fold <= 0.0:
                continue
            tone = clamp((x - 0.158) / 0.19)
            canvas.blend(px, py, (0.82 - 0.15 * tone, 0.81 - 0.15 * tone, 0.79 - 0.15 * tone), fold)

            seam = 1.0 - smoothstep(0.006 - canvas.aa, 0.006 + canvas.aa, abs(y - (x - 0.585)))
            if seam:
                canvas.blend(px, py, (0.40, 0.40, 0.41), seam * fold * 0.20)


def draw_panel(canvas: Canvas) -> None:
    center_y = -0.055
    half_w = 0.285
    half_h = 0.235
    radius = 0.058
    xs, ys = canvas.bounds(0.0, center_y, half_w, half_h, 0.01)
    for py in ys:
        y = canvas.ys[py]
        for px in xs:
            x = canvas.xs[px]
            coverage = shape_coverage(rounded_box_sdf(x, y - center_y, half_w, half_h, radius), canvas.aa)
            if coverage <= 0.0:
                continue
            base = [0.040, 0.043, 0.055]
            glows = (
                (-0.22, -0.18, 0.28, (0.10, 0.70, 0.70), 0.30),
                (0.25, 0.08, 0.31, (0.83, 0.12, 0.42), 0.34),
                (0.02, -0.22, 0.25, (0.94, 0.58, 0.18), 0.13),
            )
            for gx, gy, radius_glow, color, strength in glows:
                distance = math.hypot(x - gx, y - gy)
                amount = clamp(1.0 - distance / radius_glow)
                amount = amount * amount * strength
                for channel in range(3):
                    base[channel] = base[channel] * (1.0 - amount) + color[channel] * amount
            canvas.blend(px, py, (base[0], base[1], base[2]), coverage)


def draw_rotated_frame(canvas: Canvas) -> None:
    angle = -0.105
    cosine = math.cos(angle)
    sine = math.sin(angle)
    center_y = -0.064
    half_w = 0.163 if canvas.size >= 32 else 0.175
    half_h = 0.164 if canvas.size >= 32 else 0.176
    stroke = 0.011 if canvas.size >= 64 else 0.020 if canvas.size >= 32 else 0.030
    xs, ys = canvas.bounds(0.0, center_y, half_w + 0.04, half_h + 0.04, 0.01)
    specs = (
        (-0.012, 0.003, (0.14, 0.79, 0.80), 0.92),
        (0.012, -0.003, (0.90, 0.18, 0.45), 0.88),
        (0.000, 0.000, (0.96, 0.94, 0.84), 1.00),
    )
    for py in ys:
        y = canvas.ys[py]
        for px in xs:
            x = canvas.xs[px]
            for offset_x, offset_y, color, opacity in specs:
                dx = x - offset_x
                dy = y - (center_y + offset_y)
                local_x = cosine * dx + sine * dy
                local_y = -sine * dx + cosine * dy
                distance = rounded_box_sdf(local_x, local_y, half_w, half_h, 0.018)
                coverage = 1.0 - smoothstep(stroke - canvas.aa, stroke + canvas.aa, abs(distance))
                if coverage:
                    canvas.blend(px, py, color, coverage * opacity)

            dx = x
            dy = y - center_y
            local_x = cosine * dx + sine * dy
            local_y = -sine * dx + cosine * dy
            inner = shape_coverage(rounded_box_sdf(local_x, local_y, 0.126, 0.126, 0.008), canvas.aa)
            if inner:
                canvas.blend(px, py, (0.020, 0.021, 0.028), inner * 0.98)

            if canvas.size >= 64:
                for hole_y in (-0.116, -0.039, 0.039, 0.116):
                    for hole_x in (-0.153, 0.153):
                        hole = shape_coverage(
                            rounded_box_sdf(local_x - hole_x, local_y - hole_y, 0.009, 0.016, 0.004),
                            canvas.aa,
                        )
                        if hole:
                            canvas.blend(px, py, (0.96, 0.94, 0.84), hole * 0.94)


def draw_rounded_rect(
    canvas: Canvas,
    center_x: float,
    center_y: float,
    half_w: float,
    half_h: float,
    radius: float,
    color: tuple[float, float, float],
    opacity: float,
) -> None:
    xs, ys = canvas.bounds(center_x, center_y, half_w, half_h, canvas.aa * 2)
    for py in ys:
        y = canvas.ys[py] - center_y
        for px in xs:
            x = canvas.xs[px] - center_x
            coverage = shape_coverage(rounded_box_sdf(x, y, half_w, half_h, radius), canvas.aa)
            if coverage:
                canvas.blend(px, py, color, coverage * opacity)


def draw_metadata(canvas: Canvas) -> None:
    if canvas.size < 32:
        draw_rounded_rect(canvas, -0.045, 0.340, 0.205, 0.020, 0.020, (0.28, 0.28, 0.31), 0.52)
        return

    bars = [
        (-0.108, 0.300, 0.145, 0.013, 0.58),
        (-0.075, 0.347, 0.198, 0.010, 0.35),
    ]
    if canvas.size >= 64:
        bars.append((-0.112, 0.383, 0.142, 0.009, 0.28))
    for center_x, center_y, half_w, half_h, opacity in bars:
        draw_rounded_rect(canvas, center_x, center_y, half_w, half_h, half_h, (0.30, 0.30, 0.33), opacity)

    draw_rounded_rect(canvas, 0.245, 0.344, 0.042, 0.042, 0.016, (0.09, 0.09, 0.13), 1.0)
    xs, ys = canvas.bounds(0.245, 0.344, 0.026, 0.026, 0.004)
    for py in ys:
        y = canvas.ys[py] - 0.344
        for px in xs:
            x = canvas.xs[px] - 0.245
            distance = abs(math.hypot(x, y) - 0.015)
            coverage = 1.0 - smoothstep(0.006 - canvas.aa, 0.006 + canvas.aa, distance)
            if coverage:
                canvas.blend(px, py, (0.96, 0.94, 0.84), coverage)


def render(size: int) -> bytes:
    canvas = Canvas(size)
    draw_document_body(canvas)
    draw_fold(canvas)
    draw_panel(canvas)
    draw_rotated_frame(canvas)
    draw_metadata(canvas)
    return bytes(canvas.pixels)


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
    smoke = len(sys.argv) == 3 and sys.argv[1] == "--smoke"
    if not smoke and len(sys.argv) != 2:
        print(
            "usage: generate-macos-document-icon.py OUTPUT.iconset\n"
            "       generate-macos-document-icon.py --smoke OUTPUT.iconset",
            file=sys.stderr,
        )
        return 2

    output = Path(sys.argv[2] if smoke else sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    names = {
        "icon_16x16.png": 16,
        "icon_32x32@2x.png": 64,
    } if smoke else {
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
