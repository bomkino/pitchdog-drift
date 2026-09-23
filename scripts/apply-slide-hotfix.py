"""One-use patch application on the authorized Drift repair branch only."""
from pathlib import Path
import base64, gzip, hashlib, subprocess, json, os
BASE = '78bffdcc2d4cc7d1a08d2d8e849540c52563c26a'
BRANCH = 'codex/drift-slide-geometry-20260923'
def git(*args, **kw):
    return subprocess.run(['git', *args], check=True, text=True, capture_output=True, **kw).stdout.strip()
assert os.environ['GITHUB_REPOSITORY'] == 'bomkino/pitchdog-drift'
assert os.environ['GITHUB_REF'] == 'refs/heads/' + BRANCH
assert git('rev-parse','HEAD^') == BASE, 'Bootstrap is no longer based on the reviewed main.'
assert git('ls-remote','origin','refs/heads/main').split()[0] == BASE, 'Main advanced; reconcile before applying.'
expected = json.loads(Path('scripts/slide-hotfix-inputs.json').read_text())
for path, sha in expected['upstreamBlobs'].items():
    assert git('hash-object',path) == sha, 'Upstream file changed: ' + path
patch = gzip.decompress(base64.b64decode(expected['patchGzipBase64'], validate=True))
assert hashlib.sha256(patch).hexdigest() == expected['patchSHA256']
subprocess.run(['git','apply','--check','--index','-'], input=patch, check=True)
subprocess.run(['git','apply','--index','-'], input=patch, check=True)
def replace(path, old, new, count=1):
    p=Path(path); text=p.read_text(); assert text.count(old)==count, 'Unexpected source: '+path
    p.write_text(text.replace(old,new))
replace('package.json','"version": "0.5.0"','"version": "0.5.1"')
replace('package-lock.json','"version": "0.5.0"','"version": "0.5.1"',2)
replace('README.md','The new-document canvas is **2576 × 1080**; changing World or using Recut never changes those dimensions.',
    'New documents use a **1080 × 1920 (9:16) output frame**, independent **2576 × 1080 slide frames**, and **vertical motion**. Slide spacing uses the actual adjacent slide dimensions. Changing World or using Recut never changes the output dimensions.')
replace('README.md','For the 0.5.0 studio UI candidate, use the [prerelease listing](https://github.com/bomkino/pitchdog-drift/releases) and follow its explicit release-directory installation instructions. Running the installer without that option selects the stable release.',
    'Version 0.5.1 fixes custom slide sizing and vertical slide spacing. Existing projects retain their saved frame and motion settings; the portrait defaults apply to new documents. For an existing project, set the output frame to 1080 × 1920, select its slides and set their Custom frame to 2576:1080, then choose Vertical in Motion.')
replace('docs/MACOS_USER_GUIDE.md','Choose **File → New**. The default canvas is **2576 × 1080**. Click the dimensions in the toolbar for exact dimensions or a ratio; `25.76:10.80` represents `322:135`. A World or Recut changes creative decisions, never canvas dimensions.',
    'Choose **File → New**. The output frame defaults to **1080 × 1920 (9:16)** and motion starts **Vertical**. Imported slide frames default independently to **2576 × 1080**. Click the toolbar dimensions to change output pixels. In the **Slide** tab, Custom changes the slide ratio: `2576:1080` and `25.76:10.80` both represent `322:135`. A World or Recut never changes output dimensions. Existing documents retain their saved settings.\n\nIn **Motion → Path and surface response → Path**, Gap controls spacing relative to the actual adjacent slides, not the output frame. New documents start at `0.04`; use `0` for touching edges on a straight, unscaled path. Curvature, focus scaling and perspective can change the visible projected gap.')
p=Path('CHANGELOG.md');s=p.read_text();assert '## [0.5.0]' in s and '## [0.5.1]' not in s
notes='''## [0.5.1] — 2026-09-23

### Fixed

- Custom slide and Pin sizing no longer reads the stored document journal while it is being mutated. Edits are staged as a value transaction; validation, Undo/Redo and rollback remain intact.
- Vertical spacing, entry offsets and visibility use each slide's actual frame rather than a shared card or output aspect ratio. Mixed-size slides use adjacent edge extents, including the repeat seam; geometry rebuilds after sizing edits.
- Extremely thin custom ratios have bounded virtual-copy counts. Invalid preview interaction values are rejected before integer conversion.

### Defaults

- New output frames: **1080 × 1920 (9:16)**.
- New slide frames: **2576 × 1080**, independent of output dimensions.
- Motion: **Vertical**, with the portrait World arrangement and a compact `0.04` gap. A zero gap joins edges on a straight, unscaled path; authored depth and focus effects retain their visual behavior.
- Existing projects retain their saved dimensions, framing and direction. No automatic project migration or media modification.

Core regressions cover defaults, World recuts, exact sizing, mixed ratios, scale offsets, reverse travel, cycle seams and bounded edge cases. The packaged-app journey additionally exercises the original custom-frame crash callback and Undo/Redo. Exact-source macOS integration, application and installer checks remain required for publication.

Distribution remains **ad-hoc signed and unnotarized** for Apple silicon / macOS 13.3+. Physical hardware, minimum-OS and VoiceOver acceptance are not claimed by this hotfix. The release receipt identifies the actual tested build and download bytes.

'''
s=s.replace('## [0.5.0]',notes+'## [0.5.0]',1);p.write_text(s)
paths=list(expected['changedPaths'])+['package.json','package-lock.json','README.md','docs/MACOS_USER_GUIDE.md','CHANGELOG.md']
git('add','--',*paths)
changed=set(git('diff','--cached','--name-only').splitlines())
assert changed==set(paths), 'Unexpected staged paths: '+repr(changed.symmetric_difference(paths))
git('diff','--cached','--check')
git('config','user.name','pitch.dog')
git('config','user.email','111725271+bomkino@users.noreply.github.com')
git('commit','-m','fix: separate portrait output from slide geometry and prevent custom-size crashes')
print(git('show','--stat','--oneline','HEAD'))
assert git('ls-remote','origin','refs/heads/main').split()[0] == BASE, 'Main advanced; no branch push performed.'
git('push','origin','HEAD:refs/heads/'+BRANCH)
print('HOTFIX_HEAD='+git('rev-parse','HEAD'))
print('HOTFIX_TREE='+git('rev-parse','HEAD^{tree}'))
