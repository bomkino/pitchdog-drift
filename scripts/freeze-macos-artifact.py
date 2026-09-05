"""Freeze or verify an already-tested installer. Never rebuilds or re-signs."""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import sys


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify(root, source):
    record = json.loads((root / 'MacReleaseReceipt.json').read_text())
    assert record['sourceRevision'] == source
    assert record['architecture'] == 'arm64' and record['notarized'] is False
    assert record['signing'] == 'ad-hoc'
    assert set(record['files']) == {f"Drift-{record['version']}-macOS-arm64.dmg", f"Drift-{record['version']}-macOS-arm64.dmg.sha256", 'BuildReceipt.txt', 'TestEnvironment.txt'}
    for name, item in record['files'].items():
        assert Path(name).name == name
        path = root / name
        assert not path.is_symlink() and path.is_file()
        assert path.stat().st_size == item['bytes'] and digest(path) == item['sha256'], name
    receipt = dict(line.split('=', 1) for line in (root / 'BuildReceipt.txt').read_text().splitlines() if '=' in line)
    assert receipt['source_revision'] == source and receipt['version'] == record['version']
    assert receipt['architectures'] == 'arm64' and receipt['build_channel'] == 'release'
    dmg = f"Drift-{record['version']}-macOS-arm64.dmg"
    checksum = (root / (dmg + '.sha256')).read_text().split()
    assert checksum[0] == digest(root / dmg) and Path(checksum[1]).name == dmg
    print(f"Verified installer {record['version']} / {source} / build {receipt['build_number']}")
    return record


def freeze():
    root = Path('build/macos/release-artifact')
    source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    assert re.fullmatch('[0-9a-f]{40}', source)
    build = dict(line.split('=', 1) for line in (root / 'BuildReceipt.txt').read_text().splitlines() if '=' in line)
    version = build['version']
    assert build['source_revision'] == source and build['architectures'] == 'arm64'
    signature = subprocess.run(['codesign', '-dv', '--verbose=4', 'build/macos/Drift.app'], capture_output=True, text=True, check=True).stderr
    assert 'Signature=adhoc' in signature, 'This publication lane labels ad-hoc signing only.'
    matrix = json.loads(Path('build/macos/packaged-webview/matrix-summary.json').read_text())
    assert matrix['productionVariantPassed'] is True
    # Require the production variant, not a successful unsandboxed control.
    variant = json.loads(Path('build/macos/packaged-webview/variants/sandbox-adhoc.json').read_text())
    assert variant['variant'] == 'sandbox-adhoc' and variant['passed'] is True
    receipt = variant['receipt']
    assert receipt['ok'] is True and receipt['sourceRevision'] == source
    assert receipt['bundleIdentifier'] == 'dog.pitch.drift' and receipt['sandboxed'] is True
    assert receipt['videoSlideOutput']['verified'] is True, 'Missing packaged V2 video-output evidence.'
    names = [f'Drift-{version}-macOS-arm64.dmg', f'Drift-{version}-macOS-arm64.dmg.sha256', 'BuildReceipt.txt', 'TestEnvironment.txt']
    hardware = json.loads(subprocess.check_output(['system_profiler', 'SPHardwareDataType', '-json'], text=True))['SPHardwareDataType'][0]
    record = {
        'testHardware': {key: hardware.get(key) for key in ('machine_model', 'chip_type', 'physical_memory')},
        'schemaVersion': 1, 'version': version, 'sourceRevision': source, 'buildNumber': build['build_number'],
        'architecture': 'arm64', 'signing': 'ad-hoc', 'notarized': False, 'physicalTargetMacsTested': False,
        'workflowRun': os.environ.get('GITHUB_RUN_ID'), 'packagedLifecyclePassed': True,
        'videoSlideOutput': receipt['videoSlideOutput'],
        'files': {name: {'bytes': (root / name).stat().st_size, 'sha256': digest(root / name)} for name in names},
    }
    (root / 'MacReleaseReceipt.json').write_text(json.dumps(record, indent=2, sort_keys=True) + '\n')
    verify(root, source)


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == '--verify':
        verify(Path(sys.argv[2]), sys.argv[3])
    elif len(sys.argv) == 1:
        freeze()
    else:
        raise SystemExit('Usage: freeze-macos-artifact.py [--verify directory source-sha]')
