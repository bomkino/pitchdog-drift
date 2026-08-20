#!/usr/bin/env python3
"""Vendor and verify Drift's pinned CC0 tactile recordings.

This script is a development/release utility. The application never contacts
the network at runtime: every recording is committed under src/sonic/assets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
ASSET_ROOT: Final = ROOT / "src" / "sonic" / "assets"
RECORDING_ROOT: Final = ASSET_ROOT / "recordings"
LICENSE_ROOT: Final = ASSET_ROOT / "licenses"
MANIFEST_PATH: Final = ASSET_ROOT / "manifest.json"

UPSTREAM_REPOSITORY: Final = "Daarko/sparkstream-sounds"
UPSTREAM_REVISION: Final = "a7a3ee178d2ec48f4354782f244ab777a0e238df"
RAW_ROOT: Final = (
    f"https://raw.githubusercontent.com/{UPSTREAM_REPOSITORY}/{UPSTREAM_REVISION}"
)

PACK_SOURCES: Final = {
    "casino-audio": "https://kenney.nl/assets/casino-audio",
    "rpg-audio": "https://kenney.nl/assets/rpg-audio",
    "impact-sounds": "https://kenney.nl/assets/impact-sounds",
}


@dataclass(frozen=True)
class Recording:
    local_name: str
    upstream_path: str
    git_blob_sha1: str
    pack: str
    material: str
    use: str


RECORDINGS: Final = (
    Recording(
        "card-slide-1.wav",
        "sounds/casino-wins/casino-audio-card-slide-1.wav",
        "91c7bf15d7ca63720f37b79f7a3d651f711bd4b1",
        "casino-audio",
        "playing card",
        "studio passage",
    ),
    Recording(
        "card-slide-2.wav",
        "sounds/casino-wins/casino-audio-card-slide-2.wav",
        "4abfbbb3f67012c85ce2f36f5d04b94b9c9fc73d",
        "casino-audio",
        "playing card",
        "studio passage variation",
    ),
    Recording(
        "card-place-2.wav",
        "sounds/casino-wins/casino-audio-card-place-2.wav",
        "0102a2433c1ad8b1249066639fef9c1dae613f55",
        "casino-audio",
        "playing card",
        "studio release",
    ),
    Recording(
        "card-place-3.wav",
        "sounds/casino-wins/casino-audio-card-place-3.wav",
        "3c145ed034348d6cb4c8c52a6960f61bb975486f",
        "casino-audio",
        "playing card",
        "cinematic success",
    ),
    Recording(
        "card-shove-1.wav",
        "sounds/casino-wins/casino-audio-card-shove-1.wav",
        "d24b6ebbed083fea76a35c2de4dac99be9a51a1d",
        "casino-audio",
        "playing card",
        "cinematic passage",
    ),
    Recording(
        "card-shove-2.wav",
        "sounds/casino-wins/casino-audio-card-shove-2.wav",
        "a40caf8acd54abe4afe6eb7cd7f0929f6521aa8d",
        "casino-audio",
        "playing card",
        "cinematic passage variation",
    ),
    Recording(
        "book-close.wav",
        "sounds/rpg-quest/rpg-audio-bookClose.wav",
        "2e3759e841a7ffb309da5f9ac3679dae25284876",
        "rpg-audio",
        "book",
        "paper control",
    ),
    Recording(
        "book-flip-1.wav",
        "sounds/rpg-quest/rpg-audio-bookFlip1.wav",
        "ac54338e9005cec97cf1a51cb88c9a326309856f",
        "rpg-audio",
        "paper",
        "paper passage",
    ),
    Recording(
        "book-flip-2.wav",
        "sounds/rpg-quest/rpg-audio-bookFlip2.wav",
        "99ae3a30fddc2f8c76aa92e3426d49b3374a8af6",
        "rpg-audio",
        "paper",
        "paper passage variation",
    ),
    Recording(
        "book-place-1.wav",
        "sounds/rpg-quest/rpg-audio-bookPlace1.wav",
        "7d2518bde89a8594cb22cf1a098c8841fdfde7bb",
        "rpg-audio",
        "book",
        "studio success and paper settle",
    ),
    Recording(
        "book-place-3.wav",
        "sounds/rpg-quest/rpg-audio-bookPlace3.wav",
        "ab818116a9f54be65e4d0ff242e6374a81035bb5",
        "rpg-audio",
        "book",
        "paper success",
    ),
    Recording(
        "cloth-2.wav",
        "sounds/rpg-quest/rpg-audio-cloth2.wav",
        "4d0802aa823aaefd92dffe4972d71a017f893e80",
        "rpg-audio",
        "cloth",
        "paper grab",
    ),
    Recording(
        "cloth-4.wav",
        "sounds/rpg-quest/rpg-audio-cloth4.wav",
        "3553116daad51c61526a7263dac9d79541c955ea",
        "rpg-audio",
        "cloth",
        "paper release",
    ),
    Recording(
        "leather-handle-1.wav",
        "sounds/rpg-quest/rpg-audio-handleSmallLeather.wav",
        "acec738129cc570a58c2a2713850e76ed113d932",
        "rpg-audio",
        "leather",
        "studio grab",
    ),
    Recording(
        "leather-handle-2.wav",
        "sounds/rpg-quest/rpg-audio-handleSmallLeather2.wav",
        "c3cd7e277e7bf40ad9695fdcdfcf933592ee59ec",
        "rpg-audio",
        "leather",
        "studio grab variation",
    ),
    Recording(
        "leather-drop.wav",
        "sounds/rpg-quest/rpg-audio-dropLeather.wav",
        "7b77faa0f7b07caa70772c4d04e7ab90db297926",
        "rpg-audio",
        "leather",
        "restrained failure",
    ),
    Recording(
        "metal-click.wav",
        "sounds/rpg-quest/rpg-audio-metalClick.wav",
        "982c46a742a6619fa77bfe9bd742d9e157e23b20",
        "rpg-audio",
        "metal",
        "studio control",
    ),
    Recording(
        "metal-latch.wav",
        "sounds/rpg-quest/rpg-audio-metalLatch.wav",
        "f1f4e77e9808b88fd5307a1183caa5657c93f91c",
        "rpg-audio",
        "metal",
        "cinematic grab and control",
    ),
    Recording(
        "soft-impact-1.wav",
        "sounds/impacts/impact-sounds-impactSoft_medium_000.wav",
        "30c91d7e66b87b76d5469fb9d6252aebf25a0047",
        "impact-sounds",
        "soft surface",
        "studio settle",
    ),
    Recording(
        "soft-impact-2.wav",
        "sounds/impacts/impact-sounds-impactSoft_medium_001.wav",
        "6b699229c349460682f14d67adaf440813ef150c",
        "impact-sounds",
        "soft surface",
        "studio settle variation",
    ),
    Recording(
        "generic-impact-1.wav",
        "sounds/impacts/impact-sounds-impactGeneric_light_000.wav",
        "a3869c88ab527de6bb528e9174fbd22fb3986dcc",
        "impact-sounds",
        "hard surface",
        "cinematic settle",
    ),
    Recording(
        "generic-impact-2.wav",
        "sounds/impacts/impact-sounds-impactGeneric_light_001.wav",
        "28e18a42ea03c0373dfaa749bc09bdafcca8fa0c",
        "impact-sounds",
        "hard surface",
        "cinematic release variation",
    ),
    Recording(
        "wood-impact-1.wav",
        "sounds/impacts/impact-sounds-impactWood_light_000.wav",
        "750d059835d9deac2e981521b02ad287596fcc32",
        "impact-sounds",
        "wood",
        "cinematic release",
    ),
)

LICENSES: Final = {
    "casino-audio": "credits/casino-audio-License.txt",
    "rpg-audio": "credits/rpg-audio-License.txt",
    "impact-sounds": "credits/impact-sounds-License.txt",
}


def git_blob_sha1(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_url(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "pitchdog-drift-sonic-vendor/1.0"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read()


def assert_wav(data: bytes, label: str) -> None:
    if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise RuntimeError(f"{label} is not a valid RIFF/WAVE recording.")


def manifest_entry(recording: Recording, data: bytes) -> dict[str, object]:
    return {
        "localPath": f"src/sonic/assets/recordings/{recording.local_name}",
        "upstreamRepository": UPSTREAM_REPOSITORY,
        "upstreamRevision": UPSTREAM_REVISION,
        "upstreamPath": recording.upstream_path,
        "gitBlobSha1": recording.git_blob_sha1,
        "sha256": sha256(data),
        "bytes": len(data),
        "pack": recording.pack,
        "material": recording.material,
        "use": recording.use,
        "canonicalSource": PACK_SOURCES[recording.pack],
        "license": "CC0-1.0",
    }


def vendor() -> None:
    if ASSET_ROOT.exists():
        shutil.rmtree(ASSET_ROOT)
    RECORDING_ROOT.mkdir(parents=True, exist_ok=True)
    LICENSE_ROOT.mkdir(parents=True, exist_ok=True)

    entries: list[dict[str, object]] = []
    for recording in RECORDINGS:
        data = read_url(f"{RAW_ROOT}/{recording.upstream_path}")
        assert_wav(data, recording.upstream_path)
        actual_blob = git_blob_sha1(data)
        if actual_blob != recording.git_blob_sha1:
            raise RuntimeError(
                f"{recording.upstream_path}: expected Git blob "
                f"{recording.git_blob_sha1}, got {actual_blob}."
            )
        (RECORDING_ROOT / recording.local_name).write_bytes(data)
        entries.append(manifest_entry(recording, data))
        print(f"vendored {recording.local_name} ({len(data)} bytes)")

    license_entries: list[dict[str, object]] = []
    for pack, upstream_path in LICENSES.items():
        data = read_url(f"{RAW_ROOT}/{upstream_path}")
        if b"CC0" not in data.upper():
            raise RuntimeError(f"{upstream_path} does not identify CC0.")
        destination = LICENSE_ROOT / f"{pack}-CC0-1.0.txt"
        destination.write_bytes(data)
        license_entries.append(
            {
                "localPath": str(destination.relative_to(ROOT)).replace("\\", "/"),
                "upstreamPath": upstream_path,
                "sha256": sha256(data),
                "bytes": len(data),
                "pack": pack,
                "canonicalSource": PACK_SOURCES[pack],
                "license": "CC0-1.0",
            }
        )

    manifest = {
        "schemaVersion": 1,
        "generatedAt": "2026-08-21",
        "upstreamRepository": UPSTREAM_REPOSITORY,
        "upstreamRevision": UPSTREAM_REVISION,
        "runtimeNetworkRequests": False,
        "license": "CC0-1.0",
        "recordings": entries,
        "licenseFiles": license_entries,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    verify()


def verify() -> None:
    if not MANIFEST_PATH.exists():
        raise RuntimeError("Sonic asset manifest is missing.")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest.get("upstreamRevision") != UPSTREAM_REVISION:
        raise RuntimeError("Sonic manifest is not pinned to the expected revision.")
    if manifest.get("runtimeNetworkRequests") is not False:
        raise RuntimeError("Sonic manifest must declare zero runtime network requests.")

    by_local = {
        entry["localPath"]: entry
        for entry in manifest.get("recordings", [])
    }
    expected_paths = {
        f"src/sonic/assets/recordings/{recording.local_name}"
        for recording in RECORDINGS
    }
    if set(by_local) != expected_paths:
        missing = sorted(expected_paths - set(by_local))
        extra = sorted(set(by_local) - expected_paths)
        raise RuntimeError(f"Sonic manifest mismatch; missing={missing}, extra={extra}.")

    for recording in RECORDINGS:
        relative = f"src/sonic/assets/recordings/{recording.local_name}"
        path = ROOT / relative
        data = path.read_bytes()
        assert_wav(data, relative)
        if git_blob_sha1(data) != recording.git_blob_sha1:
            raise RuntimeError(f"{relative}: Git blob checksum mismatch.")
        entry = by_local[relative]
        if entry.get("sha256") != sha256(data) or entry.get("bytes") != len(data):
            raise RuntimeError(f"{relative}: manifest digest or byte length mismatch.")
        if entry.get("license") != "CC0-1.0":
            raise RuntimeError(f"{relative}: licence metadata mismatch.")

    for pack in LICENSES:
        path = LICENSE_ROOT / f"{pack}-CC0-1.0.txt"
        data = path.read_bytes()
        if b"CC0" not in data.upper():
            raise RuntimeError(f"{path}: CC0 notice is missing.")

    print(f"verified {len(RECORDINGS)} pinned CC0 tactile recordings")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--verify",
        action="store_true",
        help="verify committed recordings without downloading",
    )
    args = parser.parse_args()
    if args.verify:
        verify()
    else:
        vendor()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"sonic asset error: {error}", file=sys.stderr)
        raise
