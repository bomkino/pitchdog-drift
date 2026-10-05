#!/usr/bin/env python3
"""Finds pops and loop seams in an exported video.

A pop changes part of the frame in one step and then holds; motion changes it
over several frames. The frame is split into tiles; a tile is flagged when its
change in one frame is at least four times its usual change, and both
neighbouring frames change less than 40 % as much. The step from the last
frame back to the first is checked too, so a loop that does not close shows up
as SEAM.

Intended motion can also trip the check: stepped poses (Celluloid Archive),
throws (Shuffle, Deck) and feature exchanges (Deck Story) sweep a big edge
through a tile in one frame, and an edge that clips the side of a tile for a
single frame before passing behind another card looks like a pop too (Vortex
in landscape). Look at the flagged frames before calling them bugs.

Usage: motion-audit.py video.mp4 [more.mp4 ...]
Needs ffmpeg, ffprobe and numpy.
"""
import json
import subprocess
import sys

import numpy as np


def audit(path):
    probe = json.loads(subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path],
        capture_output=True, text=True).stdout)['streams'][0]
    portrait = probe['height'] > probe['width']
    W, H, TX, TY = (108, 192, 6, 8) if portrait else (192, 108, 8, 6)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={W}:{H}:flags=area,format=gray',
                          '-f', 'rawvideo', '-'], capture_output=True).stdout
    f = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
    n = len(f)

    def tiles(a):
        return a.reshape(TY, H // TY, TX, W // TX).mean(axis=(1, 3))

    d = np.stack([tiles(np.abs(f[(i + 1) % n] - f[i])) for i in range(n)])
    flags = []
    for i in range(n):
        prev, nxt = d[(i - 1) % n], d[(i + 1) % n]
        ref = np.median(d[[j % n for j in range(i - 8, i + 9) if abs(j - i) > 1]], axis=0)
        spike = (d[i] > 4 * np.maximum(ref, 0.2)) & (d[i] > ref + 2.0) & (prev < 0.4 * d[i]) & (nxt < 0.4 * d[i])
        if spike.any():
            ty, tx = np.unravel_index(np.argmax(np.where(spike, d[i], 0)), spike.shape)
            flags.append((i, int(tx), int(ty), round(float(d[i][ty, tx]), 1), round(float(ref[ty, tx]), 1)))
    seam = any(x[0] == n - 1 for x in flags)
    return n, flags, seam


if __name__ == '__main__':
    for path in sys.argv[1:]:
        n, flags, seam = audit(path)
        name = path.rsplit('/', 1)[-1]
        detail = ' '.join(f'{i}@({tx},{ty}) {v}/{r}' for i, tx, ty, v, r in flags[:6])
        print(f'{name:34s} {n:5d} frames  {len(flags):3d} flags{"  SEAM" if seam else ""}  {detail}')
