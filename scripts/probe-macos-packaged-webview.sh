#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-${DRIFT_MACOS_OUTPUT_DIR:-$ROOT/build/macos}/Drift.app}"
EVIDENCE="${DRIFT_WEBVIEW_MATRIX_DIR:-$ROOT/build/macos/packaged-webview}"
TIMEOUT_SECONDS="${DRIFT_WEBVIEW_MATRIX_TIMEOUT:-100}"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/drift-webview-matrix.XXXXXX")"
KEYCHAIN="$TEMP_ROOT/DriftCIRuntime.keychain-db"
KEYCHAIN_PASSWORD="drift-ci-$(uuidgen | tr '[:upper:]' '[:lower:]')"

cleanup() {
  pkill -x Drift >/dev/null 2>&1 || true
  security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT

fail() {
  echo "packaged-webview-matrix(mac): $*" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "the packaged WKWebView matrix must run on macOS"
[[ -d "$APP" ]] || fail "app bundle is missing: $APP"
for command in codesign ditto log node open openssl plutil python3 security spctl uuidgen; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done

rm -rf "$EVIDENCE"
mkdir -p "$EVIDENCE/variants" "$EVIDENCE/logs" "$EVIDENCE/crashes" "$TEMP_ROOT/variants"

cat > "$TEMP_ROOT/run-receipt.py" <<'PY'
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

variant, app_raw, receipt_name, output_raw, timeout_raw = sys.argv[1:]
app = Path(app_raw).resolve()
output = Path(output_raw).resolve()
timeout = float(timeout_raw)
info = app / "Contents" / "Info.plist"
expected_bundle_id = subprocess.check_output(
    ["plutil", "-extract", "CFBundleIdentifier", "raw", "-o", "-", str(info)],
    text=True,
).strip()

home = Path.home()
roots = [
    home / "Library" / "Containers" / expected_bundle_id / "Data" / "Library" / "Caches" / "Drift" / "SelfTests",
    home / "Library" / "Caches" / "Drift" / "SelfTests",
]
for root in roots:
    (root / receipt_name).unlink(missing_ok=True)

command = [
    "open", "-W", "-n", str(app), "--args",
    "--webview-self-test",
    f"--webview-self-test-report-name={receipt_name}",
]
launch_started = time.monotonic()
launch: dict[str, object]
try:
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    launch = {
        "timedOut": False,
        "returnCode": completed.returncode,
        "stdout": completed.stdout[-16_384:],
        "stderr": completed.stderr[-16_384:],
    }
except subprocess.TimeoutExpired as error:
    launch = {
        "timedOut": True,
        "returnCode": None,
        "stdout": (error.stdout or "")[-16_384:] if isinstance(error.stdout, str) else "",
        "stderr": (error.stderr or "")[-16_384:] if isinstance(error.stderr, str) else "",
        "message": str(error),
    }
finally:
    launch["elapsedSeconds"] = time.monotonic() - launch_started

receipt_path: Path | None = None
deadline = time.monotonic() + 8
while time.monotonic() < deadline and receipt_path is None:
    for root in roots:
        candidate = root / receipt_name
        if candidate.is_file():
            receipt_path = candidate
            break
    if receipt_path is None:
        time.sleep(0.1)

container = home / "Library" / "Containers" / expected_bundle_id
if receipt_path is None and container.is_dir():
    matches = list(container.rglob(receipt_name))
    if len(matches) == 1:
        receipt_path = matches[0]

receipt: dict[str, object] | None = None
receipt_error: str | None = None
if receipt_path is not None:
    try:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    except Exception as error:  # noqa: BLE001 - evidence path
        receipt_error = f"{type(error).__name__}: {error}"
    finally:
        receipt_path.unlink(missing_ok=True)

failures: list[str] = []
def expect(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)

expect(receipt is not None, "application wrote no self-test receipt")
if receipt is not None:
    expect(receipt.get("schemaVersion") == 1, "unknown receipt schema")
    expect(receipt.get("ok") is True, str(receipt.get("message") or "packaged WebView self-test failed"))
    expect(receipt.get("bundleIdentifier") == expected_bundle_id, "receipt bundle identifier changed")
    expect(receipt.get("startedNavigation") is True, "WKWebView never started navigation")
    expect(receipt.get("committedNavigation") is True, "WKWebView never committed navigation")
    expect(receipt.get("finishedNavigation") is True, "WKWebView never finished navigation")
    expect(int(receipt.get("contentProcessTerminationCount", 99)) <= 1, "WebKit content process terminated more than once")
    expect(receipt.get("saveState") == "saved", "React project state never settled to saved")
    expect(receipt.get("projectBusy") is False, "React project operation remained busy")
    expect(receipt.get("exportInProgress") is False, "React export remained in progress")
if receipt_error:
    failures.append(f"receipt could not be decoded: {receipt_error}")

result = {
    "schemaVersion": 1,
    "variant": variant,
    "app": str(app),
    "bundleIdentifier": expected_bundle_id,
    "passed": not failures,
    "failures": failures,
    "launch": launch,
    "receipt": receipt,
    "receiptError": receipt_error,
}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2, sort_keys=True))
raise SystemExit(0 if result["passed"] else 1)
PY

capture_signature() {
  local app_path="$1"
  local variant="$2"
  codesign -dv --verbose=4 "$app_path" >"$EVIDENCE/variants/$variant-signature.txt" 2>&1 || true
  codesign -d --entitlements :- "$app_path" >"$EVIDENCE/variants/$variant-entitlements.plist" 2>"$EVIDENCE/variants/$variant-entitlements.stderr" || true
  codesign --verify --deep --strict --all-architectures --verbose=4 "$app_path" >"$EVIDENCE/variants/$variant-codesign-verify.txt" 2>&1 || true
  spctl --assess --type execute --verbose=4 "$app_path" >"$EVIDENCE/variants/$variant-spctl.txt" 2>&1 || true
}

capture_runtime_logs() {
  local variant="$1"
  log show \
    --last 8m \
    --style compact \
    --predicate '(process == "Drift") OR (process == "sandboxd") OR (process CONTAINS[c] "WebKit") OR (eventMessage CONTAINS[c] "dog.pitch.drift")' \
    >"$EVIDENCE/logs/$variant-system.log" 2>&1 || true

  local diagnostics="$HOME/Library/Logs/DiagnosticReports"
  if [[ -d "$diagnostics" ]]; then
    while IFS= read -r -d '' report; do
      local basename
      basename="$(basename "$report")"
      cp "$report" "$EVIDENCE/crashes/$variant-$basename" || true
    done < <(find "$diagnostics" -type f -mmin -20 \
      \( -name 'Drift*' -o -name 'WebKit*' -o -name 'com.apple.WebKit*' \) -print0 2>/dev/null)
  fi
}

run_variant() {
  local variant="$1"
  local app_path="$2"
  local result="$EVIDENCE/variants/$variant.json"
  local receipt="matrix-$variant-$(date +%s)-${RANDOM}.json"

  pkill -x Drift >/dev/null 2>&1 || true
  capture_signature "$app_path" "$variant"
  set +e
  python3 "$TEMP_ROOT/run-receipt.py" \
    "$variant" "$app_path" "$receipt" "$result" "$TIMEOUT_SECONDS"
  local status=$?
  set -e
  capture_runtime_logs "$variant"
  return "$status"
}

SANDBOX_ADHOC_STATUS=0
run_variant "sandbox-adhoc" "$APP" || SANDBOX_ADHOC_STATUS=$?

UNSANDBOXED="$TEMP_ROOT/variants/Drift-unsandboxed-adhoc.app"
ditto "$APP" "$UNSANDBOXED"
codesign --force --options runtime --sign - --timestamp=none "$UNSANDBOXED"
UNSANDBOXED_STATUS=0
run_variant "unsandboxed-adhoc" "$UNSANDBOXED" || UNSANDBOXED_STATUS=$?

SELF_SIGNED="$TEMP_ROOT/variants/Drift-sandbox-self-signed.app"
ditto "$APP" "$SELF_SIGNED"
cat > "$TEMP_ROOT/certificate.cnf" <<'EOF'
[req]
prompt = no
distinguished_name = distinguished_name
x509_extensions = extensions

[distinguished_name]
CN = Drift CI Runtime
OU = DRFTCI001
O = pitch.dog
C = US

[extensions]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = codeSigning
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
EOF

SELF_SIGNED_STATUS=125
set +e
openssl req \
  -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
  -config "$TEMP_ROOT/certificate.cnf" \
  -keyout "$TEMP_ROOT/private-key.pem" \
  -out "$TEMP_ROOT/certificate.pem" \
  >"$EVIDENCE/variants/self-signed-openssl.txt" 2>&1
CERT_STATUS=$?
if [[ $CERT_STATUS -eq 0 ]]; then
  openssl pkcs12 -export \
    -inkey "$TEMP_ROOT/private-key.pem" \
    -in "$TEMP_ROOT/certificate.pem" \
    -out "$TEMP_ROOT/identity.p12" \
    -passout "pass:$KEYCHAIN_PASSWORD" \
    >>"$EVIDENCE/variants/self-signed-openssl.txt" 2>&1
  CERT_STATUS=$?
fi
if [[ $CERT_STATUS -eq 0 ]]; then
  security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
  security set-keychain-settings -lut 3600 "$KEYCHAIN"
  security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
  security import "$TEMP_ROOT/identity.p12" \
    -k "$KEYCHAIN" -P "$KEYCHAIN_PASSWORD" -T /usr/bin/codesign \
    >"$EVIDENCE/variants/self-signed-security-import.txt" 2>&1
  CERT_STATUS=$?
fi
if [[ $CERT_STATUS -eq 0 ]]; then
  security set-key-partition-list \
    -S apple-tool:,apple:,codesign: \
    -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" \
    >>"$EVIDENCE/variants/self-signed-security-import.txt" 2>&1
  security add-trusted-cert -d -r trustRoot -k "$KEYCHAIN" "$TEMP_ROOT/certificate.pem" \
    >>"$EVIDENCE/variants/self-signed-security-import.txt" 2>&1 || true
  IDENTITY="$(security find-identity -v -p codesigning "$KEYCHAIN" | awk '/Drift CI Runtime/ {print $2; exit}')"
  if [[ -n "$IDENTITY" ]]; then
    codesign \
      --keychain "$KEYCHAIN" \
      --force \
      --options runtime \
      --entitlements "$ROOT/macos/Drift.entitlements" \
      --sign "$IDENTITY" \
      --timestamp=none \
      "$SELF_SIGNED" \
      >"$EVIDENCE/variants/self-signed-codesign.txt" 2>&1
    CERT_STATUS=$?
  else
    echo "No code-signing identity was discovered in the temporary keychain." \
      >"$EVIDENCE/variants/self-signed-codesign.txt"
    CERT_STATUS=1
  fi
fi
set -e

if [[ $CERT_STATUS -eq 0 ]]; then
  SELF_SIGNED_STATUS=0
  run_variant "sandbox-self-signed" "$SELF_SIGNED" || SELF_SIGNED_STATUS=$?
else
  python3 - "$EVIDENCE/variants/sandbox-self-signed.json" "$CERT_STATUS" <<'PY'
import json
import sys
from pathlib import Path
path = Path(sys.argv[1])
status = int(sys.argv[2])
path.write_text(json.dumps({
    "schemaVersion": 1,
    "variant": "sandbox-self-signed",
    "passed": False,
    "failures": [f"temporary signing identity setup failed with status {status}"],
}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY
fi

python3 - \
  "$EVIDENCE/variants/sandbox-adhoc.json" \
  "$EVIDENCE/variants/unsandboxed-adhoc.json" \
  "$EVIDENCE/variants/sandbox-self-signed.json" \
  "$EVIDENCE/matrix-summary.json" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

sandbox_path, unsandboxed_path, self_signed_path, output_path = map(Path, sys.argv[1:])
def load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:  # noqa: BLE001 - evidence synthesis
        return {"variant": path.stem, "passed": False, "failures": [f"unreadable result: {error}"]}

sandbox = load(sandbox_path)
unsandboxed = load(unsandboxed_path)
self_signed = load(self_signed_path)

if sandbox.get("passed"):
    diagnosis = "The production sandboxed app survived its packaged WKWebView lifecycle."
elif self_signed.get("passed"):
    diagnosis = "WebKit accepts the sandboxed app with a real signing identity but rejects the ad-hoc signature."
elif unsandboxed.get("passed"):
    diagnosis = "The packaged runtime works without App Sandbox; the failure is isolated to the sandbox/signing boundary."
else:
    diagnosis = "All packaged variants failed; the defect is inside the packaged runtime or hosted WindowServer lifecycle, not only App Sandbox."

summary = {
    "schemaVersion": 1,
    "productionVariantPassed": bool(sandbox.get("passed")),
    "diagnosis": diagnosis,
    "variants": [sandbox, unsandboxed, self_signed],
}
output_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps(summary, indent=2, sort_keys=True))
raise SystemExit(0 if summary["productionVariantPassed"] else 1)
PY
