#!/usr/bin/env python3
"""Falsify destructive sonic vendoring without contacting the network."""

from __future__ import annotations

import importlib.util
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ASSETS = ROOT / "src" / "sonic" / "assets"
VENDOR_PATH = ROOT / "scripts" / "vendor-sonic-assets.py"


def load_vendor_module():
    module_name = "pitchdog_drift_sonic_vendor_safety"
    spec = importlib.util.spec_from_file_location(module_name, VENDOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load the sonic vendor utility.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def snapshot_files(root: Path) -> dict[str, bytes]:
    return {
        str(path.relative_to(root)).replace("\\", "/"): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def local_upstream_reader(module, url: str) -> bytes:
    prefix = f"{module.RAW_ROOT}/"
    if not url.startswith(prefix):
        raise RuntimeError(f"Unexpected vendor URL: {url}")
    upstream_path = url[len(prefix):]
    for recording in module.RECORDINGS:
        if recording.upstream_path == upstream_path:
            return (
                SOURCE_ASSETS
                / "recordings"
                / recording.local_name
            ).read_bytes()
    for pack, license_path in module.LICENSES.items():
        if license_path == upstream_path:
            return (
                SOURCE_ASSETS
                / "licenses"
                / f"{pack}-CC0-1.0.txt"
            ).read_bytes()
    raise RuntimeError(f"No local pinned fixture for {upstream_path}")


def main() -> int:
    module = load_vendor_module()
    with tempfile.TemporaryDirectory(prefix="drift-sonic-vendor-") as temporary:
        project_root = Path(temporary) / "project"
        asset_root = project_root / "src" / "sonic" / "assets"
        asset_root.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(SOURCE_ASSETS, asset_root)

        module.ROOT = project_root
        module.ASSET_ROOT = asset_root
        module.RECORDING_ROOT = asset_root / "recordings"
        module.LICENSE_ROOT = asset_root / "licenses"
        module.MANIFEST_PATH = asset_root / "manifest.json"

        before_failure = snapshot_files(asset_root)

        def fail_download(_url: str) -> bytes:
            raise RuntimeError("intentional offline failure")

        module.read_url = fail_download
        try:
            module.vendor()
        except RuntimeError as error:
            if "intentional offline failure" not in str(error):
                raise
        else:
            raise RuntimeError("Vendor unexpectedly succeeded through a forced download failure.")

        after_failure = snapshot_files(asset_root)
        if after_failure != before_failure:
            raise RuntimeError("A failed vendor run mutated the committed sonic corpus.")

        # Prove a successful run replaces stale vendored bytes while preserving
        # the independent acoustic-treatment ledger.
        treatment_path = asset_root / "treatments.json"
        treatment_before = treatment_path.read_bytes()
        stale_recording = module.RECORDING_ROOT / module.RECORDINGS[0].local_name
        stale_recording.write_bytes(b"stale recording")

        module.read_url = lambda url: local_upstream_reader(module, url)
        module.vendor()
        module.verify()

        if treatment_path.read_bytes() != treatment_before:
            raise RuntimeError("Successful vendoring rewrote the acoustic-treatment ledger.")
        if stale_recording.read_bytes() == b"stale recording":
            raise RuntimeError("Successful vendoring did not replace stale recording bytes.")

        manifest = json.loads(module.MANIFEST_PATH.read_text(encoding="utf-8"))
        if manifest.get("runtimeThirdPartyRequests") is not False:
            raise RuntimeError("Manifest does not declare the third-party runtime boundary.")
        if manifest.get("delivery") != "same-origin-lazy":
            raise RuntimeError("Manifest does not declare lazy same-origin delivery.")

    print("Sonic vendor safety gate passed: failure is non-destructive; treatments survive refresh.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
