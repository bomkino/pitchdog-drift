from __future__ import annotations

import base64
import hashlib
from pathlib import Path
import zlib

# Bootstrap trigger: land the generated implementation as ordinary,
# reviewable source before continuing the browser and visual gauntlets.
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

test_path = HERE.parent / "tests" / "engineShader.test.ts"
test_source = test_path.read_text(encoding="utf-8")
old_import = 'import { backgroundFragmentShader, shadowFragmentShader, slideFragmentShader } from "../src/engine/shaders";'
new_import = 'import { backgroundFragmentShader, shadowFragmentShader, slideFragmentShader, slideVertexShader } from "../src/engine/shaders";'
if test_source.count(old_import) != 1:
    raise RuntimeError("Expected one shader test import to upgrade")
test_path.write_text(test_source.replace(old_import, new_import, 1), encoding="utf-8")

lighting_path = HERE.parent / "src" / "lighting.ts"
lighting_source = lighting_path.read_text(encoding="utf-8")
old_distance = "  const distance = settings.shadowDistance * elevationScale * pulse;"
new_distance = "  const distance = Math.min(settings.shadowDistance, settings.shadowDistance * elevationScale * pulse);"
if lighting_source.count(old_distance) != 1:
    raise RuntimeError("Expected one lighting distance expression to bound")
lighting_path.write_text(lighting_source.replace(old_distance, new_distance, 1), encoding="utf-8")
