"""Freeze or verify a tested native installer; never rebuild or re-sign it."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import plistlib
import re
import subprocess


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def verify(root, source):
    root = Path(root)
    record = json.loads((root / 'MacReleaseReceipt.json').read_text())
    require(record['schemaVersion'] == 2 and record['runtime'] == 'native', 'A native release receipt is required.')
    require(re.fullmatch(r'[0-9a-f]{40}', source) and record['sourceRevision'] == source, 'Source mismatch.')
    require(re.fullmatch(r'[0-9a-f]{40}', record['sourceTree']), 'Invalid source tree.')
    require(re.fullmatch(r'\d+\.\d+\.\d+', record['version']) and str(record['buildNumber']).isdigit(), 'Invalid version/build.')
    require(record['architecture'] == 'arm64' and record['bundleIdentifier'] == 'dog.pitch.drift', 'Wrong application.')
    require(record['minimumMacOS'] == '13.3', 'Unexpected deployment floor.')
    require(record['signing'] in ('ad-hoc', 'Developer ID'), 'Unknown signing identity.')
    require(record['signing'] != 'ad-hoc' or record['notarized'] is False, 'Ad-hoc apps cannot claim notarization.')
    require(record['signing'] != 'Developer ID' or record['notarized'] is True, 'Developer ID distribution requires notarization.')
    require(record['applicationJourney']['result'] == 'passed' and record['applicationJourney']['source'] == source,
            'Missing exact-source packaged application proof.')
    require(record['applicationJourney']['version'] == record['version'] and
            record['applicationJourney']['build'] == record['buildNumber'] and
            record['applicationJourney']['codeDirectoryHash'] == record['codeDirectoryHash'], 'Tested binary identity mismatch.')
    dmg = f"Drift-{record['version']}-macOS-arm64.dmg"
    names = {dmg, dmg + '.sha256', 'Install-Drift.command'}
    require(set(record['files']) == names, 'Missing or unexpected release assets.')
    for name, item in record['files'].items():
        require(Path(name).name == name, 'Unsafe asset name.')
        path = root / name
        require(not path.is_symlink() and path.is_file(), 'Missing regular asset: ' + name)
        require(path.stat().st_size == item['bytes'] and digest(path) == item['sha256'], 'Asset bytes differ: ' + name)
    checksum = (root / (dmg + '.sha256')).read_text().split()
    require(checksum == [record['files'][dmg]['sha256'], dmg], 'Mandatory installer checksum differs.')
    require(record['installer'] == dict(name=dmg, **record['files'][dmg]), 'Installer identity differs.')
    require(re.fullmatch(r'[0-9a-f]{40,64}', record['codeDirectoryHash']), 'Missing signed bundle identity.')
    return record


def freeze(root, app, proof):
    root, app, proof = Path(root), Path(app), Path(proof)
    source = command('git', 'rev-parse', 'HEAD')
    require(not command('git', 'status', '--porcelain', '--untracked-files=all'), 'Freeze requires a clean committed checkout.')
    require(not (root / 'MacReleaseReceipt.json').exists(), 'A frozen receipt already exists; do not overwrite accepted bytes.')
    info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
    identity = json.loads((app / 'Contents/Resources/BuildIdentity.json').read_text())
    result = json.loads(proof.read_text())
    require(result.get('result') == 'passed' and result.get('source') == source, 'The exact app journey must pass before freezing.')
    require(info['DriftSourceRevision'] == identity['source'] == source, 'Bundle source mismatch.')
    require(info['DriftRuntime'] == identity['runtime'] == 'native', 'A native bundle is required.')
    require(info['CFBundleShortVersionString'] == identity['version'] == result['version'], 'Bundle/proof version mismatch.')
    require(info['CFBundleVersion'] == identity['build'], 'Bundle build mismatch.')
    require(info['LSMinimumSystemVersion'] == identity['minimumMacOS'] == '13.3', 'Deployment floor mismatch.')
    command('codesign', '--verify', '--deep', '--strict', str(app))
    signature = subprocess.run(['codesign', '-dv', '--verbose=4', str(app)], capture_output=True, text=True, check=True).stderr
    cdhash = re.search(r'^CDHash=([0-9a-f]+)$', signature, re.M)
    require(cdhash is not None, 'Missing code-directory hash.')
    require(result['codeDirectoryHash'] == cdhash.group(1) and result['build'] == info['CFBundleVersion'], 'Tested binary identity mismatch.')
    signing = 'ad-hoc' if 'Signature=adhoc' in signature else 'Developer ID'
    require(signing == 'ad-hoc' or 'Authority=Developer ID Application:' in signature, 'Unsupported signing identity.')
    notarized = False
    if signing == 'Developer ID':
        command('xcrun', 'stapler', 'validate', str(app))
        notarized = True
    require(command('lipo', '-archs', str(app / 'Contents/MacOS/Drift')) == 'arm64', 'Wrong executable architecture.')
    version = info['CFBundleShortVersionString']
    dmg = f'Drift-{version}-macOS-arm64.dmg'
    names = [dmg, dmg + '.sha256', 'Install-Drift.command']
    hardware = json.loads(command('system_profiler', 'SPHardwareDataType', '-json'))['SPHardwareDataType'][0]
    record = {
        'schemaVersion': 2, 'runtime': 'native', 'version': version, 'buildNumber': info['CFBundleVersion'],
        'sourceRevision': source, 'sourceTree': command('git', 'rev-parse', 'HEAD^{tree}'),
        'bundleIdentifier': info['CFBundleIdentifier'], 'architecture': 'arm64', 'minimumMacOS': '13.3',
        'signing': signing, 'notarized': notarized, 'codeDirectoryHash': cdhash.group(1),
        'studioUI': identity.get('studioUI', {'mode': 'system'}),
        'testHardware': {key: hardware.get(key) for key in ('machine_model', 'chip_type', 'physical_memory')},
        'testedOS': command('sw_vers', '-productVersion'), 'workflowRun': os.environ.get('GITHUB_RUN_ID'),
        'hardwareLimits': ['macOS 13.3 not exercised', 'Physical M2/M1 Pro, battery, sleep/wake and external display acceptance not exercised by this hosted journey'],
        'applicationJourney': {key: result[key] for key in ('result', 'source', 'version', 'build', 'codeDirectoryHash', 'assertions')},
        'dependencySources': {p.parent.name: p.read_text().strip() for p in (app / 'Contents/Resources/ThirdPartyNotices').glob('*/SOURCE_SHA.txt')},
        'files': {name: {'bytes': (root / name).stat().st_size, 'sha256': digest(root / name)} for name in names},
    }
    record['installer'] = dict(name=dmg, **record['files'][dmg])
    (root / 'MacReleaseReceipt.json').write_text(json.dumps(record, indent=2, sort_keys=True) + '\n')
    verify(root, source)
    print(f'Frozen native installer {version} / {source} / build {record["buildNumber"]}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', nargs=2, metavar=('DIRECTORY', 'SOURCE'))
    parser.add_argument('--freeze', nargs=3, metavar=('DIRECTORY', 'APP', 'RESULT_JSON'))
    args = parser.parse_args()
    require(bool(args.verify) != bool(args.freeze), 'Choose --verify or --freeze.')
    if args.verify:
        record = verify(*args.verify)
        print(f'Verified native installer {record["version"]} / {record["sourceRevision"]}')
    else:
        freeze(*args.freeze)
