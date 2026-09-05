"""Publish only the already-verified exact-main artifact; retain prior releases."""
import hashlib
import json
import os
from pathlib import Path
import subprocess


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def api(path):
    return json.loads(run('gh', 'api', '--method', 'GET', path))


repo, source, tag = (os.environ[k] for k in ('GITHUB_REPOSITORY', 'RELEASE_SHA', 'TAG'))
root, notes = Path(os.environ['ARTIFACT_DIR']), Path(os.environ['NOTES_PATH'])
assert api(f'repos/{repo}/branches/main')['commit']['sha'] == source
assert api(f'repos/{repo}')['visibility'] == 'public'
record = json.loads((root / 'MacReleaseReceipt.json').read_text())
assert record['sourceRevision'] == source and tag == 'v' + record['version']
files = [root / name for name in sorted(record['files'])] + [root / 'MacReleaseReceipt.json']
expected = {p.name: 'sha256:' + hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
releases = json.loads(run('gh', 'api', '--method', 'GET', '--paginate', '--slurp', f'repos/{repo}/releases?per_page=100'))
existing = next((r for page in releases for r in page if r['tag_name'] == tag), None)
subprocess.run(['git', 'fetch', '--tags', 'origin'], check=True)
ref = subprocess.run(['git', 'rev-parse', '--verify', f'refs/tags/{tag}'], capture_output=True, text=True)
if ref.returncode == 0:
    assert run('git', 'rev-list', '-n', '1', tag) == source, 'Never move a published tag.'
else:
    assert existing is None, 'Published release has no corresponding immutable tag.'
    subprocess.run(['git', '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'tag', '-a', tag, source, '-m', f'Drift {tag} Mac release'], check=True)
    subprocess.run(['git', 'push', 'origin', f'refs/tags/{tag}'], check=True)
if existing and not existing['draft']:
    assert {a['name']: a.get('digest') for a in existing['assets']} == expected, 'Public assets differ; publish a new version, never clobber.'
else:
    if existing is None:
        subprocess.run(['gh', 'release', 'create', tag, '--repo', repo, '--verify-tag', '--draft', '--title', f'Drift {tag} — Apple silicon Mac', '--notes-file', str(notes)], check=True)
    existing = api(f'repos/{repo}/releases/tags/{tag}')
    present = {a['name']: a for a in existing['assets']}
    assert set(present) <= set(expected)
    for path in files:
        if path.name in present:
            assert present[path.name].get('digest') == expected[path.name], 'Do not replace a mismatched draft asset.'
        else:
            subprocess.run(['gh', 'release', 'upload', tag, str(path), '--repo', repo], check=True)
    release = api(f'repos/{repo}/releases/tags/{tag}')
    assert {a['name']: a.get('digest') for a in release['assets']} == expected
    assert api(f'repos/{repo}/branches/main')['commit']['sha'] == source
    subprocess.run(['gh', 'release', 'edit', tag, '--repo', repo, '--draft=false', '--latest'], check=True)
release = api(f'repos/{repo}/releases/latest')
assert release['tag_name'] == tag and release['draft'] is False
assert {a['name']: a.get('digest') for a in release['assets']} == expected
print(f"Published exact installer: {tag} / {source} / {release['html_url']}")
