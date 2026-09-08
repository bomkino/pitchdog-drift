#!/usr/bin/env python3
"""Verify the app-owned native handoff; no font installation or network access."""
import hashlib
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])
receipt = json.loads((root / 'SOURCE.json').read_text())
assert receipt['commit'] == '786b4a2b671182319320f922b8de8f927ea3a002'
for entry in receipt['files']:
    file = root / Path(entry['outputPath']).name
    assert file.stat().st_size == entry['bytes'], file
    assert hashlib.sha256(file.read_bytes()).hexdigest() == entry['sha256'], file
assert len(receipt['files']) == 3 and len(receipt['roles']) == 14
print('Verified three native font binaries and the pinned 14-role receipt.')
