#!/usr/bin/env python3
"""Reject an unpublished component pilot before creating a distributable archive."""
import json
import pathlib
import re
import sys


def verify(identity: object) -> None:
    if not isinstance(identity, dict):
        raise ValueError("Invalid application build identity.")
    studio = identity.get("studioUI", {"mode": "system"})
    if isinstance(studio, dict) and studio.get("mode") == "canonical":
        repository = "https://github.com/bomkino/pitchdog-studio-ui.git"
        manifest = pathlib.Path(__file__).resolve().parents[1] / "macos/NativeCore/Package.swift"
        pin = re.search(r'url:"' + re.escape(repository) + r'",revision:"([0-9a-f]{40})"', manifest.read_text())
        if not pin or studio.get("repository") != repository or studio.get("revision") != pin.group(1):
            raise ValueError("The canonical studio UI must match the application's immutable package pin.")
        return
    if not isinstance(studio, dict) or studio.get("mode") != "system":
        raise ValueError("The studio UI pilot is an engineering build, not a distributable release. Canonical package and application acceptance are still required.")
    if studio.get("revision") is not None:
        raise ValueError("A system-UI build must not claim an external component revision.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify-studio-ui-distribution.py BuildIdentity.json")
    try:
        verify(json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")))
    except (OSError, ValueError) as error:
        raise SystemExit(str(error)) from error
