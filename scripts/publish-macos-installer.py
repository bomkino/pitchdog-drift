"""Publish frozen exact-main native assets by release ID, including draft retries."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import quote

spec = importlib.util.spec_from_file_location('freeze', Path(__file__).with_name('freeze-macos-artifact.py'))
freeze = importlib.util.module_from_spec(spec)
spec.loader.exec_module(freeze)
require = freeze.require


class GitHub:
    def request(self, path, method='GET', payload=None, file=None):
        args = ['gh', 'api', '--method', method, path]
        with tempfile.TemporaryDirectory(prefix='drift-release-') as work:
            if payload is not None:
                body = Path(work) / 'request.json'
                body.write_text(json.dumps(payload))
                args += ['--input', str(body)]
            if file is not None:
                args += ['-H', 'Content-Type: application/octet-stream', '--input', str(file)]
            result = subprocess.run(args, capture_output=True, text=True)
        if result.returncode:
            if 'HTTP 404' in result.stderr:
                raise FileNotFoundError(path)
            raise RuntimeError(result.stderr.strip())
        return json.loads(result.stdout) if result.stdout.strip() else None

    def releases(self, repo):
        pages = json.loads(subprocess.check_output(['gh', 'api', '--paginate', '--slurp', f'repos/{repo}/releases?per_page=100'], text=True))
        return [release for page in pages for release in page]


def tag_source(api, repo, tag):
    try:
        ref = api.request(f'repos/{repo}/git/ref/tags/{quote(tag, safe="")}')['object']
    except FileNotFoundError:
        return None
    for _ in range(4):
        if ref['type'] == 'commit':
            return ref['sha']
        require(ref['type'] == 'tag', 'Unexpected tag object type.')
        ref = api.request(f'repos/{repo}/git/tags/{ref["sha"]}')['object']
    raise ValueError('Tag nesting exceeds the release contract.')


def publish(api, repo, source, tag, root, notes):
    root = Path(root)
    record = freeze.verify(root, source)
    require(tag == 'v' + record['version'], 'Tag/version mismatch.')
    require(api.request(f'repos/{repo}')['visibility'] == 'public', 'This publisher targets the public Drift download.')
    require(api.request(f'repos/{repo}/branches/main')['commit']['sha'] == source, 'Main advanced; reconcile before publishing.')
    require(api.request(f'repos/{repo}/git/commits/{source}')['tree']['sha'] == record['sourceTree'], 'Source tree mismatch.')
    files = [root / name for name in sorted(record['files'])] + [root / 'MacReleaseReceipt.json']
    expected = {p.name: {'digest': 'sha256:' + freeze.digest(p), 'size': p.stat().st_size} for p in files}
    matching = [r for r in api.releases(repo) if r['tag_name'] == tag]
    require(len(matching) <= 1, 'Multiple releases claim this version.')
    release = matching[0] if matching else None
    resolved = tag_source(api, repo, tag)
    require(resolved in (None, source), 'Never move an existing tag.')
    require(resolved is not None or release is None, 'An existing release has no matching immutable tag.')
    if resolved is None:
        # A lightweight immutable tag is sufficient; no local tag rewriting.
        api.request(f'repos/{repo}/git/refs', 'POST', {'ref': 'refs/tags/' + tag, 'sha': source})
        require(tag_source(api, repo, tag) == source, 'New tag did not resolve to the accepted source.')
    if release is None:
        release = api.request(f'repos/{repo}/releases', 'POST', {
            'tag_name': tag, 'target_commitish': source, 'draft': True, 'prerelease': False,
            'name': f'Drift {tag} — Apple silicon Mac', 'body': notes,
        })
    release_id = release['id']
    endpoint = f'repos/{repo}/releases/{release_id}'

    def read_assets():
        value = api.request(endpoint)
        require(value['tag_name'] == tag, 'Release ID changed identity.')
        present = {asset['name']: asset for asset in value['assets']}
        require(len(present) == len(value['assets']) and set(present) <= set(expected), 'Unexpected or duplicate release assets.')
        for name, asset in present.items():
            require(asset.get('digest') == expected[name]['digest'] and asset['size'] == expected[name]['size'],
                    'Refusing mismatched release bytes: ' + name)
        return value, present

    release, present = read_assets()
    if not release['draft']:
        require(set(present) == set(expected), 'Published release is incomplete; never mutate public bytes.')
    else:
        for path in files:
            if path.name not in present:
                api.request(f'https://uploads.github.com/repos/{repo}/releases/{release_id}/assets?name={quote(path.name)}', 'POST', file=path)
        release, present = read_assets()
        require(set(present) == set(expected), 'Release upload incomplete.')
        require(api.request(f'repos/{repo}/branches/main')['commit']['sha'] == source, 'Main changed before publication.')
        require(tag_source(api, repo, tag) == source, 'Tag changed before publication.')
        api.request(endpoint, 'PATCH', {
            'tag_name': tag, 'target_commitish': source,
            'name': f'Drift {tag} — Apple silicon Mac', 'body': notes,
            'draft': False, 'prerelease': False, 'make_latest': 'true',
        })
    release, present = read_assets()
    latest = api.request(f'repos/{repo}/releases/latest')
    require(not release['draft'] and not release['prerelease'] and latest['id'] == release_id, 'Current public release mismatch.')
    require(set(present) == set(expected) and tag_source(api, repo, tag) == source, 'Published identity mismatch.')
    return release


if __name__ == '__main__':
    release = publish(GitHub(), os.environ['GITHUB_REPOSITORY'], os.environ['RELEASE_SHA'], os.environ['TAG'],
                      os.environ['ARTIFACT_DIR'], Path(os.environ['NOTES_PATH']).read_text())
    print(f'Published verified native installer: {release["html_url"]} (release {release["id"]})')
