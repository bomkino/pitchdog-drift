"""Release-boundary regressions: immutable public bytes and disposable installs."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('publisher', HERE / 'publish-macos-installer.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)
SOURCE, TREE = 'a' * 40, 'b' * 40

class FakeGitHub:
    def __init__(self, release=None, source=None):
        self.release = copy.deepcopy(release)
        self.source = source
        self.calls = []
        self.main = SOURCE
        self.upload_failure = False
    def releases(self, repo):
        # Deliberately no GET /releases/tags: draft recovery uses the list + ID.
        return [copy.deepcopy(self.release)] if self.release else []
    def request(self, path, method='GET', payload=None, file=None):
        self.calls.append((method, path))
        if path == 'repos/bomkino/pitchdog-drift': return {'visibility': 'public'}
        if path.endswith('/branches/main'): return {'commit': {'sha': self.main}}
        if '/git/commits/' in path: return {'tree': {'sha': TREE}}
        if '/git/ref/tags/' in path:
            if self.source is None: raise FileNotFoundError(path)
            return {'object': {'type': 'commit', 'sha': self.source}}
        if path.endswith('/git/refs'):
            self.source = payload['sha']; return {}
        if path.endswith('/releases') and method == 'POST':
            self.release = dict(payload, id=79, assets=[], html_url='https://example.invalid/release')
            return copy.deepcopy(self.release)
        if 'uploads.github.com' in path:
            assert '/releases/79/assets?' in path
            if self.upload_failure:
                self.upload_failure = False
                raise RuntimeError('interrupted upload')
            self.release['assets'].append({'name': file.name, 'size': file.stat().st_size,
                                          'digest': 'sha256:' + publisher.freeze.digest(file)})
            return copy.deepcopy(self.release['assets'][-1])
        if path.endswith('/releases/79'):
            if method == 'PATCH': self.release.update(payload)
            return copy.deepcopy(self.release)
        if path.endswith('/releases/latest'):
            assert not self.release['draft']
            return copy.deepcopy(self.release)
        raise AssertionError((method, path))

class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='drift-release-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        dmg = 'Drift-0.4.0-macOS-arm64.dmg'
        (self.root / dmg).write_bytes(b'Synthetic installer bytes')
        digest = publisher.freeze.digest(self.root / dmg)
        (self.root / (dmg + '.sha256')).write_text(digest + '  ' + dmg + '\n')
        (self.root / 'Install-Drift.command').write_text('#!/bin/bash\nexit 0\n')
        files = {p.name: {'bytes': p.stat().st_size, 'sha256': publisher.freeze.digest(p)} for p in self.root.iterdir()}
        self.record = dict(schemaVersion=2, runtime='native', sourceRevision=SOURCE, sourceTree=TREE,
                           version='0.4.0', buildNumber='42', architecture='arm64', bundleIdentifier='dog.pitch.drift',
                           minimumMacOS='13.3', signing='ad-hoc', notarized=False, codeDirectoryHash='c'*40,
                           applicationJourney=dict(result='passed', source=SOURCE, version='0.4.0', build='42', codeDirectoryHash='c'*40),
                           files=files, installer=dict(name=dmg, **files[dmg]))
        self.receipt()
    def receipt(self):
        (self.root / 'MacReleaseReceipt.json').write_text(json.dumps(self.record))
    def publish(self, api):
        return publisher.publish(api, 'bomkino/pitchdog-drift', SOURCE, 'v0.4.0', self.root, 'Native release.')
    def test_new_release_and_public_retry_use_id_and_identical_bytes(self):
        api = FakeGitHub()
        result = self.publish(api)
        self.assertFalse(result['draft']); self.assertEqual(len(result['assets']), 4)
        before = len(api.calls)
        self.publish(api)
        self.assertTrue(all(method == 'GET' for method, _ in api.calls[before:]))
    def test_interrupted_draft_upload_resumes_by_id(self):
        api = FakeGitHub(); api.upload_failure = True
        with self.assertRaises(RuntimeError): self.publish(api)
        self.assertTrue(api.release['draft'])
        self.publish(api)
        self.assertEqual(sum(method == 'POST' and path.endswith('/releases') for method, path in api.calls), 1)
    def test_existing_tag_is_never_moved(self):
        api = FakeGitHub(source='d'*40)
        with self.assertRaisesRegex(ValueError, 'Never move'): self.publish(api)
        self.assertTrue(all(method == 'GET' for method, _ in api.calls))
    def test_different_public_asset_is_never_replaced(self):
        api = FakeGitHub(); self.publish(api); api.release['assets'][0]['digest'] = 'sha256:' + '0'*64
        before = len(api.calls)
        with self.assertRaisesRegex(ValueError, 'mismatched'): self.publish(api)
        self.assertTrue(all(method == 'GET' for method, _ in api.calls[before:]))
    def test_incomplete_public_release_is_not_repaired_in_place(self):
        api = FakeGitHub(); self.publish(api); api.release['assets'].pop()
        with self.assertRaisesRegex(ValueError, 'incomplete'): self.publish(api)
    def test_main_must_match_before_any_mutation(self):
        api = FakeGitHub(); api.main = 'd'*40
        with self.assertRaisesRegex(ValueError, 'Main advanced'): self.publish(api)
        self.assertTrue(all(method == 'GET' for method, _ in api.calls))
    def test_checksum_missing_or_corrupt_fails_before_network(self):
        path = self.root / 'Drift-0.4.0-macOS-arm64.dmg.sha256'
        for mode in ('corrupt', 'missing'):
            with self.subTest(mode=mode):
                if mode == 'corrupt': path.write_text('wrong')
                else: path.unlink()
                api = FakeGitHub()
                with self.assertRaises(ValueError): self.publish(api)
                self.assertEqual(api.calls, [])
    def test_identity_and_proof_tampering_rejected(self):
        for key, value in [('sourceRevision','d'*40), ('version','0.3.0'), ('runtime','hybrid'), ('notarized',True), ('buildNumber','43')]:
            with self.subTest(key=key):
                original = self.record[key]; self.record[key] = value; self.receipt()
                with self.assertRaises(ValueError): publisher.freeze.verify(self.root, SOURCE)
                self.record[key] = original
        self.receipt()

@unittest.skipUnless(sys.platform == 'darwin', 'Disposable installer filesystem tests use macOS ditto')
class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='drift-install-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.destination = self.root / 'Applications'; self.destination.mkdir()
        self.target = self.destination / 'Drift.app'; self.target.mkdir(); (self.target / 'original').write_text('old app')
        self.source = self.root / 'Incoming.app'; self.source.mkdir(); (self.source / 'replacement').write_text('new app')
        self.receipt = self.root / 'receipt.json'; self.receipt.write_text('{}')
        (self.root / 'Project.pitched').write_bytes(b'original project bytes')
    def install(self, failure='none'):
        # Platform verification/quit are replaced only for failure injection.
        # Actual copied directories, renames, traps and rollback are exercised.
        script = '''source "$1"
verify_bundle() {
  case "$FAILURE:$1" in
    source:*Incoming.app|staging:*Replacement.app|after:*/Applications/Drift.app) fail 'injected verification failure' ;;
  esac
  [[ -f "$1/replacement" ]]
}
normal_quit() { [[ "$FAILURE" != cancel ]] || fail 'injected cancelled Quit'; }
app_running() { [[ "$FAILURE" == running ]]; }
install_bundle "$2" "$3" "$4"
'''
        import os
        return subprocess.run(['/bin/bash','-c',script,'drift-test',str(HERE/'install-drift.sh'),str(self.source),str(self.receipt),str(self.destination)],
                              env=dict(os.environ, FAILURE=failure), text=True,capture_output=True)
    def test_success_retains_old_app_and_projects(self):
        result = self.install(); self.assertEqual(result.returncode,0,result.stderr)
        self.assertTrue((self.target/'replacement').exists())
        backups = list(self.destination.glob('.drift-install-*/Previous.app/original'))
        self.assertEqual(len(backups),1); self.assertEqual(backups[0].read_text(),'old app')
        self.assertEqual((self.root/'Project.pitched').read_bytes(),b'original project bytes')
    def test_preflight_cancel_restart_and_post_install_failure_preserve_old(self):
        for failure in ('source','staging','cancel','running','after'):
            with self.subTest(failure=failure):
                result = self.install(failure)
                self.assertNotEqual(result.returncode,0,result.stdout)
                self.assertEqual((self.target/'original').read_text(),'old app')
                self.assertFalse((self.target/'replacement').exists())
    def test_symlink_target_and_concurrent_lock_rejected(self):
        lock=self.destination/'.drift-install-lock';lock.mkdir()
        self.assertNotEqual(self.install().returncode,0);lock.rmdir()
        self.target.rename(self.root/'Old.app');self.target.symlink_to(self.root/'Old.app',target_is_directory=True)
        self.assertNotEqual(self.install().returncode,0)
        self.assertTrue((self.root/'Old.app/original').exists())
    def test_interrupted_rename_restores_before_failing_preflight(self):
        work=self.destination/'.drift-install-interrupted';work.mkdir()
        (work/'state').write_text('replacing\n');self.target.rename(work/'Previous.app')
        self.assertNotEqual(self.install('source').returncode,0)
        self.assertEqual((self.target/'original').read_text(),'old app')
        self.assertEqual((work/'state').read_text(),'restored\n')
    def test_ambiguous_interruption_preserves_both_apps(self):
        work=self.destination/'.drift-install-interrupted';work.mkdir();(work/'state').write_text('replacing\n')
        (work/'Previous.app').mkdir();(work/'Previous.app/backup').write_text('rollback')
        self.assertNotEqual(self.install().returncode,0)
        self.assertTrue((self.target/'original').exists());self.assertTrue((work/'Previous.app/backup').exists())

if __name__ == '__main__': unittest.main(verbosity=2)
