#!/usr/bin/env python3
"""Bound the packaged journey; a debugger diagnostic never converts failure to success."""
import pathlib
import shutil
import subprocess
import sys
import time

app = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'build/native-roundtrip/Drift.app').resolve()
evidence = pathlib.Path('build/native-app-evidence')
evidence.mkdir(parents=True, exist_ok=True)
command = [str(app / 'Contents/MacOS/Drift'), '--native-self-test']
started = time.time()
try:
    result = subprocess.run(command, timeout=600, check=False)
except subprocess.TimeoutExpired:
    print('DRIFT_NATIVE_PROOF_TIMEOUT: packaged application exceeded its test deadline.', file=sys.stderr)
    sys.exit(124)
except OSError as error:
    print(f'DRIFT_NATIVE_PROOF_LAUNCH_FAIL: {error}', file=sys.stderr)
    sys.exit(126)
if result.returncode < 0:
    print(f'DRIFT_NATIVE_PROOF_SIGNAL: {-result.returncode}', file=sys.stderr, flush=True)
    # Synthetic self-test only. Preserve the original failing status, and never
    # re-sign or change the archived binary merely to make debugging easier.
    try:
        with (evidence / 'crash-backtrace.txt').open('w') as log:
            subprocess.run(['xcrun', 'lldb', '--batch', '-o', 'run', '-o', 'thread backtrace all',
                            '-o', 'quit', '--', *command], stdout=log, stderr=subprocess.STDOUT,
                           timeout=120, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        print(f'DRIFT_NATIVE_DIAGNOSTIC: {error}', file=sys.stderr)
    for directory in (pathlib.Path.home() / 'Library/Logs/DiagnosticReports', pathlib.Path('/Library/Logs/DiagnosticReports')):
        if directory.is_dir():
            for report in directory.glob('Drift*'):
                try:
                    if report.is_file() and report.stat().st_mtime >= started:
                        shutil.copy2(report, evidence / report.name)
                except OSError as error:
                    print(f'DRIFT_NATIVE_DIAGNOSTIC: {error}', file=sys.stderr)
sys.exit(result.returncode if result.returncode >= 0 else 128 - result.returncode)
