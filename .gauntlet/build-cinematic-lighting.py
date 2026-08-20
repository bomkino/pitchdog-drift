from __future__ import annotations

import base64
import hashlib
from pathlib import Path
import zlib

HERE = Path(__file__).resolve().parent
encoded = "".join(
    (HERE / "lighting-payload" / f"{index}.b64").read_text(encoding="utf-8")
    for index in range(4)
)
compressed = base64.b64decode(encoded, validate=True)
if hashlib.sha256(compressed).hexdigest() != "704331a259e5f041b32d97a766ee852bd8e2c36d04028138c6f8f4f31a88c6e8":
    raise RuntimeError("Lighting payload checksum mismatch")
source = zlib.decompress(compressed)
if hashlib.sha256(source).hexdigest() != "1b9aa90893eeb8bc2f2702e78269515c6abd99c04384454ad3f8793d80ec0a98":
    raise RuntimeError("Lighting source checksum mismatch")
exec(
    compile(source.decode("utf-8"), __file__ + "<payload>", "exec"),
    {"__file__": __file__, "__name__": "__main__"},
)
