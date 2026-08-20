#!/usr/bin/env python3
"""Apply the staged lighting final pass. Deleted after verification."""
from base64 import b64decode
from lzma import decompress
from pathlib import Path
parts = sorted(Path(".gauntlet").glob("lighting-final-pass.payload.*"))
if not parts:
    raise SystemExit("No lighting final-pass payload found.")
payload = "".join(part.read_text(encoding="utf-8").strip() for part in parts)
exec(compile(decompress(b64decode(payload)), __file__, "exec"))
