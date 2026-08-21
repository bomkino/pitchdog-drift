#!/usr/bin/env python3
"""Apply the final large-file sound hardening patches on the isolated branch."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def replace_once(relative: str, before: str, after: str) -> None:
    source = read(relative)
    count = source.count(before)
    if count != 1:
        raise RuntimeError(
            f"{relative}: expected one patch target, found {count}: {before[:100]!r}"
        )
    write(relative, source.replace(before, after, 1))


# Preview and export must share the exact same physical focus hand-off.
replace_once(
    "src/engine/CinematicCarousel.ts",
    'import type { StudioAsset, StudioSettings } from "../model";\nimport {\n',
    'import type { StudioAsset, StudioSettings } from "../model";\n'
    'import { getSonicPassageStep } from "../sonic/plan";\nimport {\n',
)
replace_once(
    "src/engine/CinematicCarousel.ts",
    "    const step = Math.round(this.motionPosition / stride);",
    "    const step = getSonicPassageStep(this.motionPosition, stride);",
)

# Stale async sound work must not report after teardown, and successful retry
# must clear the generic core-error suppression key.
replace_once(
    "src/sonic/SonicEngine.ts",
    """      await this.ensureCore(this.settings.palette);
      this.primeMotionCues(this.settings.palette);""",
    """      await this.ensureCore(this.settings.palette);
      if (this.disposed) return;
      this.primeMotionCues(this.settings.palette);""",
)
replace_once(
    "src/sonic/SonicEngine.ts",
    """  private primeMotionCues(palette: SonicPalette): void {
    for (const cue of MOTION_PRIME_CUES) {""",
    """  private primeMotionCues(palette: SonicPalette): void {
    if (this.disposed) return;
    for (const cue of MOTION_PRIME_CUES) {""",
)
replace_once(
    "src/sonic/SonicEngine.ts",
    """      paletteBuffers.set(cue, assets);
      this.reportedLoadErrors.delete(key);
      return assets;""",
    """      paletteBuffers.set(cue, assets);
      this.reportedLoadErrors.delete(key);
      if (this.hasCore(palette)) this.reportedLoadErrors.delete("core");
      return assets;""",
)
replace_once(
    "src/sonic/SonicEngine.ts",
    """  private reportRecoverable(error: unknown, key: string): void {
    if (this.reportedLoadErrors.has(key)) return;""",
    """  private reportRecoverable(error: unknown, key: string): void {
    if (this.disposed || this.reportedLoadErrors.has(key)) return;""",
)
replace_once(
    "src/sonic/SonicEngine.ts",
    """  private publishState(): void {
    const state = this.runtimeState;""",
    """  private publishState(): void {
    if (this.disposed) return;
    const state = this.runtimeState;""",
)

# H.264 capability probing must not eagerly fetch or initialize the software AAC
# encoder. Audio capability remains available when an explicit caller asks.
replace_once(
    "src/lib/exportStudio.ts",
    """export async function probeExportCapabilities(
  settings: ExportSettings = DEFAULT_EXPORT_SETTINGS,
): Promise<ExportCapabilityReport> {""",
    """export type ExportCapabilityProbeOptions = Readonly<{
  includeAudio?: boolean;
}>;

export async function probeExportCapabilities(
  settings: ExportSettings = DEFAULT_EXPORT_SETTINGS,
  options: ExportCapabilityProbeOptions = {},
): Promise<ExportCapabilityReport> {""",
)
replace_once(
    "src/lib/exportStudio.ts",
    """  try {
    await ensureSoftwareAacEncoder();
    aac = await canEncodeAudio("aac", {
      numberOfChannels: AUDIO_CHANNELS,
      sampleRate: AUDIO_SAMPLE_RATE,
      quality: aacQuality(),
    });
  } catch {
    aac = false;
  }
  if (!aac) reasons.push("Browser has no compatible AAC encoder; audio-bearing masters cannot be exported safely.");
  const presenterAudioFpsSupported = settings.fps <= 30;
  if (!presenterAudioFpsSupported) {
    reasons.push("Audio-bearing masters are limited to 30 fps; disable exported sound for a higher-frame-rate master.");
  }""",
    """  const includeAudio = options.includeAudio ?? true;
  if (includeAudio) {
    try {
      await ensureSoftwareAacEncoder();
      aac = await canEncodeAudio("aac", {
        numberOfChannels: AUDIO_CHANNELS,
        sampleRate: AUDIO_SAMPLE_RATE,
        quality: aacQuality(),
      });
    } catch {
      aac = false;
    }
    if (!aac) reasons.push("Browser has no compatible AAC encoder; audio-bearing masters cannot be exported safely.");
  }
  const presenterAudioFpsSupported = settings.fps <= 30;
  if (includeAudio && !presenterAudioFpsSupported) {
    reasons.push("Audio-bearing masters are limited to 30 fps; disable exported sound for a higher-frame-rate master.");
  }""",
)
replace_once(
    "src/App.tsx",
    "probeExportCapabilities(settingsRef.current.output)",
    "probeExportCapabilities(settingsRef.current.output, { includeAudio: false })",
)
replace_once(
    "src/App.tsx",
    """    if (mp4Supported === false) {
      announce("This browser cannot encode the requested H.264 master. Use current desktop Chromium or Brave, or export PNG frames.", "error");
      return;
    }
    let fileHandle: FileSystemFileHandle | null = null;""",
    """    if (mp4Supported === false) {
      announce("This browser cannot encode the requested H.264 master. Use current desktop Chromium or Brave, or export PNG frames.", "error");
      return;
    }
    if (
      settingsRef.current.sound.exportEnabled
      && settingsRef.current.output.fps > 30
    ) {
      const { buildSonicTimeline } = await import("./sonic/plan");
      const hasAuthoredSound = buildSonicTimeline(
        settingsRef.current,
        assetsRef.current.length,
      ).length > 0;
      if (hasAuthoredSound) {
        announce("Tactile MP4 sound is verified at 24, 25, or 30 fps. Choose 30 fps or disable Include in MP4 before selecting a destination.", "error");
        return;
      }
    }
    let fileHandle: FileSystemFileHandle | null = null;""",
)

replace_once(
    "src/components/ControlPanel.tsx",
    "AAC 48 kHz at 24–30 fps · mute presenter audio for 50/60 fps",
    "AAC 48 kHz at 24–30 fps · disable exported foley and mute presenter audio for 50/60 fps",
)

# Build a transactional vendor utility: all downloads and hashes complete first;
# each filesystem component tracks whether it was actually installed; failures
# at any swap boundary restore only the components that were touched.
replace_once(
    "scripts/vendor-sonic-assets.py",
    "import sys\nimport urllib.request\n",
    "import sys\nimport tempfile\nimport urllib.request\n",
)
replace_once(
    "scripts/vendor-sonic-assets.py",
    """LICENSES: Final = {
    "casino-audio": "credits/casino-audio-License.txt",
    "rpg-audio": "credits/rpg-audio-License.txt",
    "impact-sounds": "credits/impact-sounds-License.txt",
}
""",
    """LICENSES: Final = {
    "casino-audio": "credits/casino-audio-License.txt",
    "rpg-audio": "credits/rpg-audio-License.txt",
    "impact-sounds": "credits/impact-sounds-License.txt",
}
LICENSE_SHA256S: Final = {
    "casino-audio": "418596902a86b3bedc8b36bc7c3fd125b2b5d5f53740e0f8185d53acedaf4c1c",
    "rpg-audio": "842c42cc1942963f6fcdc18fe57e9e0631e8a4936f9803688e8152e830088eb9",
    "impact-sounds": "b49aa9c56b04528b95913de13e506a0f7c5e807b9925db9bfef86af1f91120db",
}
""",
)

vendor_source = read("scripts/vendor-sonic-assets.py")
vendor_start = vendor_source.index("def vendor() -> None:\n")
verify_start = vendor_source.index("\ndef verify() -> None:\n", vendor_start)
new_vendor = r'''def commit_staged_assets(
    staged_recordings: Path,
    staged_licenses: Path,
    staged_manifest: Path,
    stage: Path,
    *,
    fail_after: str | None = None,
) -> None:
    backup_recordings = stage / "recordings-old"
    backup_licenses = stage / "licenses-old"
    backup_manifest = stage / "manifest-old.json"
    installed_recordings = False
    installed_licenses = False
    installed_manifest = False

    try:
        if RECORDING_ROOT.exists():
            RECORDING_ROOT.replace(backup_recordings)
        staged_recordings.replace(RECORDING_ROOT)
        installed_recordings = True
        if fail_after == "recordings":
            raise RuntimeError("intentional failure after recordings swap")

        if LICENSE_ROOT.exists():
            LICENSE_ROOT.replace(backup_licenses)
        staged_licenses.replace(LICENSE_ROOT)
        installed_licenses = True
        if fail_after == "licenses":
            raise RuntimeError("intentional failure after licences swap")

        if MANIFEST_PATH.exists():
            MANIFEST_PATH.replace(backup_manifest)
        staged_manifest.replace(MANIFEST_PATH)
        installed_manifest = True
        if fail_after == "manifest":
            raise RuntimeError("intentional failure after manifest swap")
        verify()
    except Exception:
        if installed_manifest and MANIFEST_PATH.exists():
            MANIFEST_PATH.unlink()
        if backup_manifest.exists():
            if MANIFEST_PATH.exists():
                MANIFEST_PATH.unlink()
            backup_manifest.replace(MANIFEST_PATH)

        if installed_licenses and LICENSE_ROOT.exists():
            shutil.rmtree(LICENSE_ROOT)
        if backup_licenses.exists():
            if LICENSE_ROOT.exists():
                shutil.rmtree(LICENSE_ROOT)
            backup_licenses.replace(LICENSE_ROOT)

        if installed_recordings and RECORDING_ROOT.exists():
            shutil.rmtree(RECORDING_ROOT)
        if backup_recordings.exists():
            if RECORDING_ROOT.exists():
                shutil.rmtree(RECORDING_ROOT)
            backup_recordings.replace(RECORDING_ROOT)
        raise


def vendor() -> None:
    recording_payloads: list[tuple[Recording, bytes]] = []
    for recording in RECORDINGS:
        data = read_url(f"{RAW_ROOT}/{recording.upstream_path}")
        assert_wav(data, recording.upstream_path)
        actual_blob = git_blob_sha1(data)
        if actual_blob != recording.git_blob_sha1:
            raise RuntimeError(
                f"{recording.upstream_path}: expected Git blob "
                f"{recording.git_blob_sha1}, got {actual_blob}."
            )
        recording_payloads.append((recording, data))

    license_payloads: list[tuple[str, str, bytes]] = []
    for pack, upstream_path in LICENSES.items():
        data = read_url(f"{RAW_ROOT}/{upstream_path}")
        if b"CC0" not in data.upper():
            raise RuntimeError(f"{upstream_path} does not identify CC0.")
        digest = sha256(data)
        if digest != LICENSE_SHA256S[pack]:
            raise RuntimeError(
                f"{upstream_path}: expected SHA-256 {LICENSE_SHA256S[pack]}, got {digest}."
            )
        license_payloads.append((pack, upstream_path, data))

    entries = [
        manifest_entry(recording, data)
        for recording, data in recording_payloads
    ]
    license_entries = [
        {
            "localPath": str(
                (LICENSE_ROOT / f"{pack}-CC0-1.0.txt").relative_to(ROOT)
            ).replace("\\", "/"),
            "upstreamPath": upstream_path,
            "sha256": LICENSE_SHA256S[pack],
            "bytes": len(data),
            "pack": pack,
            "canonicalSource": PACK_SOURCES[pack],
            "license": "CC0-1.0",
        }
        for pack, upstream_path, data in license_payloads
    ]
    manifest = {
        "schemaVersion": 1,
        "generatedAt": "2026-08-21",
        "upstreamRepository": UPSTREAM_REPOSITORY,
        "upstreamRevision": UPSTREAM_REVISION,
        "runtimeThirdPartyRequests": False,
        "delivery": "same-origin-lazy",
        "license": "CC0-1.0",
        "recordings": entries,
        "licenseFiles": license_entries,
    }

    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=".drift-sonic-vendor-",
        dir=ASSET_ROOT.parent,
    ) as temporary:
        stage = Path(temporary)
        staged_recordings = stage / "recordings-new"
        staged_licenses = stage / "licenses-new"
        staged_manifest = stage / "manifest-new.json"
        staged_recordings.mkdir()
        staged_licenses.mkdir()

        for recording, data in recording_payloads:
            (staged_recordings / recording.local_name).write_bytes(data)
        for pack, _upstream_path, data in license_payloads:
            (staged_licenses / f"{pack}-CC0-1.0.txt").write_bytes(data)
        staged_manifest.write_text(
            json.dumps(manifest, indent=2) + "\n",
            encoding="utf-8",
        )
        commit_staged_assets(
            staged_recordings,
            staged_licenses,
            staged_manifest,
            stage,
        )

    for recording, data in recording_payloads:
        print(f"vendored {recording.local_name} ({len(data)} bytes)")
'''
write(
    "scripts/vendor-sonic-assets.py",
    vendor_source[:vendor_start] + new_vendor + vendor_source[verify_start:],
)

vendor_source = read("scripts/vendor-sonic-assets.py")
verify_start = vendor_source.index("def verify() -> None:\n")
main_start = vendor_source.index("\ndef main() -> int:\n", verify_start)
new_verify = r'''def verify() -> None:
    if not MANIFEST_PATH.exists():
        raise RuntimeError("Sonic asset manifest is missing.")

    def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise RuntimeError(f"Sonic manifest contains duplicate key {key!r}.")
            result[key] = value
        return result

    manifest = json.loads(
        MANIFEST_PATH.read_text(encoding="utf-8"),
        object_pairs_hook=reject_duplicate_keys,
    )
    if manifest.get("schemaVersion") != 1:
        raise RuntimeError("Sonic manifest schema version is not supported.")
    if manifest.get("upstreamRepository") != UPSTREAM_REPOSITORY:
        raise RuntimeError("Sonic manifest upstream repository changed.")
    if manifest.get("upstreamRevision") != UPSTREAM_REVISION:
        raise RuntimeError("Sonic manifest is not pinned to the expected revision.")
    if manifest.get("runtimeThirdPartyRequests") is not False:
        raise RuntimeError("Sonic manifest must reject third-party runtime requests.")
    if manifest.get("delivery") != "same-origin-lazy":
        raise RuntimeError("Sonic manifest must declare lazy same-origin delivery.")
    if manifest.get("license") != "CC0-1.0":
        raise RuntimeError("Sonic manifest licence identifier changed.")

    recordings = manifest.get("recordings")
    if not isinstance(recordings, list) or len(recordings) != len(RECORDINGS):
        raise RuntimeError("Sonic manifest recording count changed.")
    by_local = {entry.get("localPath"): entry for entry in recordings}
    if len(by_local) != len(recordings):
        raise RuntimeError("Sonic manifest contains duplicate recording paths.")

    expected_paths = {
        f"src/sonic/assets/recordings/{recording.local_name}"
        for recording in RECORDINGS
    }
    actual_paths = {
        str(path.relative_to(ROOT)).replace("\\", "/")
        for path in RECORDING_ROOT.glob("*.wav")
    }
    if set(by_local) != expected_paths or actual_paths != expected_paths:
        raise RuntimeError(
            f"Sonic recording set mismatch; manifest={sorted(by_local)}, "
            f"files={sorted(actual_paths)}."
        )

    for recording in RECORDINGS:
        relative = f"src/sonic/assets/recordings/{recording.local_name}"
        data = (ROOT / relative).read_bytes()
        assert_wav(data, relative)
        if git_blob_sha1(data) != recording.git_blob_sha1:
            raise RuntimeError(f"{relative}: pinned Git blob checksum mismatch.")
        expected = manifest_entry(recording, data)
        if by_local[relative] != expected:
            raise RuntimeError(f"{relative}: manifest provenance or digest mismatch.")

    license_files = manifest.get("licenseFiles")
    if not isinstance(license_files, list) or len(license_files) != len(LICENSES):
        raise RuntimeError("Sonic manifest licence count changed.")
    by_pack = {entry.get("pack"): entry for entry in license_files}
    if len(by_pack) != len(license_files) or set(by_pack) != set(LICENSES):
        raise RuntimeError("Sonic manifest licence packs are missing or duplicated.")

    expected_license_paths: set[str] = set()
    for pack, upstream_path in LICENSES.items():
        path = LICENSE_ROOT / f"{pack}-CC0-1.0.txt"
        data = path.read_bytes()
        if b"CC0" not in data.upper():
            raise RuntimeError(f"{path}: CC0 notice is missing.")
        digest = sha256(data)
        if digest != LICENSE_SHA256S[pack]:
            raise RuntimeError(f"{path}: pinned licence SHA-256 mismatch.")
        relative = str(path.relative_to(ROOT)).replace("\\", "/")
        expected_license_paths.add(relative)
        expected = {
            "localPath": relative,
            "upstreamPath": upstream_path,
            "sha256": LICENSE_SHA256S[pack],
            "bytes": len(data),
            "pack": pack,
            "canonicalSource": PACK_SOURCES[pack],
            "license": "CC0-1.0",
        }
        if by_pack[pack] != expected:
            raise RuntimeError(f"{path}: licence provenance or digest mismatch.")

    actual_license_paths = {
        str(path.relative_to(ROOT)).replace("\\", "/")
        for path in LICENSE_ROOT.glob("*.txt")
    }
    if actual_license_paths != expected_license_paths:
        raise RuntimeError("Committed sonic licence-file set changed.")
    if not (ASSET_ROOT / "treatments.json").is_file():
        raise RuntimeError("Acoustic-treatment ledger is missing.")

    print(f"verified {len(RECORDINGS)} pinned CC0 tactile recordings")
'''
write(
    "scripts/vendor-sonic-assets.py",
    vendor_source[:verify_start] + new_verify + vendor_source[main_start:],
)

replace_once(
    "tests/sonicAssets.test.js",
    """    expect(manifest.runtimeNetworkRequests).toBe(false);
    expect(manifest.recordings).toHaveLength(23);""",
    """    expect(manifest.runtimeThirdPartyRequests).toBe(false);
    expect(manifest.delivery).toBe("same-origin-lazy");
    expect(manifest.recordings).toHaveLength(23);""",
)

package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
scripts = package.setdefault("scripts", {})
scripts["test:e2e:dev"] = "playwright test --config=playwright.config.ts"
scripts["test:e2e:production"] = (
    "npm run build && playwright test --config=playwright.production.config.ts"
)
scripts["test:e2e"] = "npm run test:e2e:dev && npm run test:e2e:production"
scripts["sound:vendor-safety"] = "python3 scripts/check-sonic-vendor-safety.py"
scripts["check"] = (
    "npm run typecheck && npm run test && npm run sound:vendor-safety && npm run build"
)
package_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")

replace_once(
    "README.md",
    "python3 scripts/vendor-sonic-assets.py --verify  # Pinned CC0 foley integrity",
    "npm run sound:verify  # Pinned CC0 foley integrity",
)
replace_once(
    "docs/SONIC_DESIGN.md",
    """`scripts/vendor-sonic-assets.py` verifies each downloaded file against its
expected Git blob SHA-1, verifies RIFF/WAVE headers, computes SHA-256, preserves
the pack licence texts, and writes `src/sonic/assets/manifest.json`.""",
    """`scripts/vendor-sonic-assets.py` downloads and verifies the complete candidate
corpus before touching committed assets, then replaces recordings, licences, and
the manifest through a per-component rollback transaction. A failed download or
mid-swap fault preserves the previous corpus and the independent treatment
ledger. Every recording is checked against its pinned Git blob SHA-1; every WAV
and original pack licence is checked against a pinned SHA-256 before
`src/sonic/assets/manifest.json` is accepted.""",
)
replace_once(
    "ASSET-LICENSE.md",
    """For reproducible vendoring, the exact files are retrieved from
`Daarko/sparkstream-sounds` at pinned revision
`a7a3ee178d2ec48f4354782f244ab777a0e238df`. This mirror is a transport and
provenance boundary; the canonical source pages remain Kenney.""",
    """For reproducible vendoring, the committed WAV conversions are retrieved from
`Daarko/sparkstream-sounds` at pinned revision
`a7a3ee178d2ec48f4354782f244ab777a0e238df`. The hashes therefore identify the
mirror's explicitly documented WAV conversions, not a claim that these bytes are
the untouched files inside Kenney's original archives. The mirror is a transport
and provenance boundary; the canonical source pages and CC0 authorship remain
Kenney.""",
)
replace_once(
    "ASSET-LICENSE.md",
    "`scripts/vendor-sonic-assets.py --verify` checks the committed corpus without",
    "`npm run sound:verify` checks the committed corpus without",
)
replace_once(
    "THIRD_PARTY_NOTICES.md",
    """The Kenney files are transported from `Daarko/sparkstream-sounds` at exact
revision `a7a3ee178d2ec48f4354782f244ab777a0e238df`. Canonical source pages,
licence copies, hashes, and per-file purposes are preserved with the assets.""",
    """The Kenney recordings are transported as the mirror's documented WAV
conversions from `Daarko/sparkstream-sounds` at exact revision
`a7a3ee178d2ec48f4354782f244ab777a0e238df`. Canonical source pages, original
pack licence copies, conversion-byte hashes, and per-file purposes are preserved
with the assets.""",
)
replace_once(
    ".github/workflows/ci.yml",
    "timeout-minutes: 25",
    "timeout-minutes: 35",
)
replace_once(
    ".github/workflows/ci.yml",
    """            playwright-report/
            test-results/""",
    """            playwright-report/
            playwright-production-report/
            test-results/""",
)

write(
    "e2e/sonic-preflight.e2e.ts",
    '''import { expect, test } from "@playwright/test";

async function waitForStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".asset-list li").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".stage-frame")).toHaveAttribute(
    "data-context",
    /ready|restored/,
  );
}

test("50/60 fps authored sound fails before opening a destination picker", async ({ page }) => {
  await page.addInitScript(() => {
    const tracked = window as Window & {
      __driftPickerCalls?: number;
      showSaveFilePicker?: () => Promise<FileSystemFileHandle>;
    };
    tracked.__driftPickerCalls = 0;
    tracked.showSaveFilePicker = async () => {
      tracked.__driftPickerCalls = (tracked.__driftPickerCalls ?? 0) + 1;
      throw new Error("picker should not open");
    };
  });

  await waitForStudio(page);
  await page.getByLabel("Open sound direction controls").click();
  await page.getByRole("switch", { name: /Include in MP4/ }).check();
  await page.getByRole("group", { name: "Frame rate" })
    .getByRole("radio", { name: "60", exact: true })
    .check();
  await page.getByRole("button", { name: "Export MP4 master" }).click();

  await expect(page.getByRole("alert")).toContainText(
    /24, 25, or 30 fps/i,
  );
  const pickerCalls = await page.evaluate(() => (
    window as Window & { __driftPickerCalls?: number }
  ).__driftPickerCalls ?? 0);
  expect(pickerCalls).toBe(0);
});
''',
)

print("Final sonic hardening patches applied.")
