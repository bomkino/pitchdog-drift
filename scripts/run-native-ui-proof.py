#!/usr/bin/env python3
"""Drive the exact round-tripped app through external XCUITest; never alter it."""
import json
import pathlib
import plistlib
import subprocess
import sys
import uuid

repo = pathlib.Path(__file__).resolve().parent.parent
app = (repo / (sys.argv[1] if len(sys.argv) > 1 else "build/native-roundtrip/Drift.app")).resolve()
with (app / "Contents/Info.plist").open("rb") as stream:
    identity = plistlib.load(stream)
source = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
if identity.get("DriftSourceRevision") != source:
    raise SystemExit("The archived application does not match the checked-out source.")
run_id = str(uuid.uuid4()).upper()
work = repo / "build/native-ui-driver" / run_id
work.mkdir(parents=True)
evidence = repo / "build/native-app-evidence"
evidence.mkdir(parents=True, exist_ok=True)
spec = {
    "name": "DriftAcceptance",
    "options": {"bundleIdPrefix": "dog.pitch.drift.acceptance", "projectFormat": "xcode16_0"},
    "settings": {"SWIFT_VERSION": "5.0", "CODE_SIGN_IDENTITY": "-", "ENABLE_APP_SANDBOX": "NO"},
    "targets": {"NativeJourneyUITests": {
        "type": "bundle.ui-testing", "platform": "macOS", "deploymentTarget": "13.3",
        "sources": [str(repo / "macos/AcceptanceUI")],
        "info": {"path": "DriverInfo.plist", "properties": {
            "DriftApplicationPath": str(app), "DriftSourceRevision": source, "DriftProofRunID": run_id
        }}
    }},
    "schemes": {"DriftAcceptance": {
        "build": {"targets": {"NativeJourneyUITests": ["test"]}},
        "test": {"targets": [{"name": "NativeJourneyUITests", "parallelizable": False}]}
    }}
}
(work / "project.json").write_text(json.dumps(spec, indent=2))
subprocess.run(["xcodegen", "generate", "--spec", str(work / "project.json"), "--project", str(work)], check=True)
result_path = evidence / ("NativeJourney-" + run_id + ".xcresult")
command = ["xcodebuild", "test", "-project", str(work / "DriftAcceptance.xcodeproj"),
           "-scheme", "DriftAcceptance", "-destination", "platform=macOS", "-derivedDataPath", str(work / "DerivedData"),
           "-resultBundlePath", str(result_path), "-parallel-testing-enabled", "NO"]
try:
    result = subprocess.run(command, check=False, timeout=720)
except subprocess.TimeoutExpired:
    raise SystemExit("XCUITest exceeded its bounded acceptance deadline.")
root = pathlib.Path.home() / "Library/Application Support/Drift Native Proof" / run_id
result_file = root / "RESULT.json"
if result_file.exists():
    value = json.loads(result_file.read_text())
    print(json.dumps(value, indent=2), flush=True)
else:
    value = {}
if result.returncode or value.get("result") != "passed" or value.get("source") != source:
    raise SystemExit(result.returncode or 1)
print("DRIFT_ARCHIVED_UI_PROOF_PASS " + source, flush=True)
