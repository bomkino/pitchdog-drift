#!/usr/bin/env python3
"""Bound the real packaged app proof; preserve its exit status and diagnostics."""
import pathlib
import subprocess
import sys

app = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'build/native-roundtrip/Drift.app')
try:
    result = subprocess.run([str(app / 'Contents/MacOS/Drift'), '--native-self-test'], timeout=600, check=False)
except subprocess.TimeoutExpired:
    print('DRIFT_NATIVE_PROOF_TIMEOUT: packaged application did not finish within its test deadline.', file=sys.stderr)
    sys.exit(124)
except OSError as error:
    print(f'DRIFT_NATIVE_PROOF_LAUNCH_FAIL: {error}', file=sys.stderr)
    sys.exit(126)
sys.exit(result.returncode if result.returncode >= 0 else 128 - result.returncode)
