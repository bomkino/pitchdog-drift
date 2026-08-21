from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts/probe-macos-packaged-webview.sh"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one target, found {count}")
    return text.replace(old, new, 1)


source = SCRIPT.read_text(encoding="utf-8")
source = replace_once(
    source,
    'TIMEOUT_SECONDS="${DRIFT_WEBVIEW_MATRIX_TIMEOUT:-100}"\n',
    'TIMEOUT_SECONDS="${DRIFT_WEBVIEW_MATRIX_TIMEOUT:-75}"\n'
    'LOG_TIMEOUT_SECONDS="${DRIFT_WEBVIEW_LOG_TIMEOUT:-18}"\n'
    'COMMAND_TIMEOUT_SECONDS="${DRIFT_WEBVIEW_COMMAND_TIMEOUT:-20}"\n',
    "matrix budgets",
)

source = replace_once(
    source,
    "PY\n\ncapture_signature() {",
    r'''PY

cat > "$TEMP_ROOT/run-bounded.py" <<'PY'
from __future__ import annotations

import subprocess
import sys

timeout = float(sys.argv[1])
command = sys.argv[2:]
try:
    completed = subprocess.run(command, check=False, timeout=timeout)
except subprocess.TimeoutExpired:
    print(
        f"bounded command exceeded {timeout:g}s: {' '.join(command)}",
        file=sys.stderr,
    )
    raise SystemExit(124)
raise SystemExit(completed.returncode)
PY

bounded() {
  local seconds="$1"
  shift
  python3 "$TEMP_ROOT/run-bounded.py" "$seconds" "$@"
}

capture_signature() {''',
    "bounded command helper",
)

signature_replacements = {
    '  codesign -dv --verbose=4 "$app_path" >"$EVIDENCE/variants/$variant-signature.txt" 2>&1 || true\n':
        '  bounded "$COMMAND_TIMEOUT_SECONDS" codesign -dv --verbose=4 "$app_path" >"$EVIDENCE/variants/$variant-signature.txt" 2>&1 || true\n',
    '  codesign -d --entitlements :- "$app_path" >"$EVIDENCE/variants/$variant-entitlements.plist" 2>"$EVIDENCE/variants/$variant-entitlements.stderr" || true\n':
        '  bounded "$COMMAND_TIMEOUT_SECONDS" codesign -d --entitlements :- "$app_path" >"$EVIDENCE/variants/$variant-entitlements.plist" 2>"$EVIDENCE/variants/$variant-entitlements.stderr" || true\n',
    '  codesign --verify --deep --strict --all-architectures --verbose=4 "$app_path" >"$EVIDENCE/variants/$variant-codesign-verify.txt" 2>&1 || true\n':
        '  bounded "$COMMAND_TIMEOUT_SECONDS" codesign --verify --deep --strict --all-architectures --verbose=4 "$app_path" >"$EVIDENCE/variants/$variant-codesign-verify.txt" 2>&1 || true\n',
    '  spctl --assess --type execute --verbose=4 "$app_path" >"$EVIDENCE/variants/$variant-spctl.txt" 2>&1 || true\n':
        '  bounded "$COMMAND_TIMEOUT_SECONDS" spctl --assess --type execute --verbose=4 "$app_path" >"$EVIDENCE/variants/$variant-spctl.txt" 2>&1 || true\n',
}
for old, new in signature_replacements.items():
    source = replace_once(source, old, new, "signature evidence command")

start = source.index("capture_runtime_logs() {")
end = source.index("\nrun_variant() {", start)
source = source[:start] + r'''capture_runtime_logs() {
  local variant="$1"
  python3 - \
    "$EVIDENCE/logs/$variant-system.log" \
    "$LOG_TIMEOUT_SECONDS" <<'PY'
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

output = Path(sys.argv[1])
timeout = float(sys.argv[2])
command = [
    "log", "show",
    "--last", "4m",
    "--style", "compact",
    "--predicate",
    '(process == "Drift") OR (process == "sandboxd") OR (process CONTAINS[c] "WebKit") OR (eventMessage CONTAINS[c] "dog.pitch.drift")',
]
try:
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    text = completed.stdout
    if completed.stderr:
        text += "\n--- stderr ---\n" + completed.stderr
    if completed.returncode != 0:
        text += f"\nlog show returned {completed.returncode}\n"
except subprocess.TimeoutExpired as error:
    stdout = error.stdout if isinstance(error.stdout, str) else ""
    stderr = error.stderr if isinstance(error.stderr, str) else ""
    text = (
        stdout
        + ("\n--- stderr ---\n" + stderr if stderr else "")
        + f"\nlog collection stopped after its {timeout:g}s evidence budget.\n"
    )
output.write_text(text, encoding="utf-8")
PY

  local diagnostics="$HOME/Library/Logs/DiagnosticReports"
  if [[ -d "$diagnostics" ]]; then
    while IFS= read -r -d '' report; do
      local basename
      basename="$(basename "$report")"
      cp "$report" "$EVIDENCE/crashes/$variant-$basename" || true
    done < <(find "$diagnostics" -type f -mmin -10 \
      \( -name 'Drift*' -o -name 'WebKit*' -o -name 'com.apple.WebKit*' \) -print0 2>/dev/null)
  fi
}
''' + source[end:]

command_replacements = {
    'ditto "$APP" "$UNSANDBOXED"\n':
        'bounded "$COMMAND_TIMEOUT_SECONDS" ditto "$APP" "$UNSANDBOXED"\n',
    'codesign --force --options runtime --sign - --timestamp=none "$UNSANDBOXED"\n':
        'bounded "$COMMAND_TIMEOUT_SECONDS" codesign --force --options runtime --sign - --timestamp=none "$UNSANDBOXED"\n',
    'ditto "$APP" "$SELF_SIGNED"\n':
        'bounded "$COMMAND_TIMEOUT_SECONDS" ditto "$APP" "$SELF_SIGNED"\n',
    'openssl req \\\n':
        'bounded "$COMMAND_TIMEOUT_SECONDS" openssl req \\\n',
    '  openssl pkcs12 -export \\\n':
        '  bounded "$COMMAND_TIMEOUT_SECONDS" openssl pkcs12 -export \\\n',
    '  security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"\n':
        '  bounded "$COMMAND_TIMEOUT_SECONDS" security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"\n',
    '  security set-keychain-settings -lut 3600 "$KEYCHAIN"\n':
        '  bounded "$COMMAND_TIMEOUT_SECONDS" security set-keychain-settings -lut 3600 "$KEYCHAIN"\n',
    '  security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"\n':
        '  bounded "$COMMAND_TIMEOUT_SECONDS" security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"\n',
    '  security import "$TEMP_ROOT/identity.p12" \\\n':
        '  bounded "$COMMAND_TIMEOUT_SECONDS" security import "$TEMP_ROOT/identity.p12" \\\n',
    '  security set-key-partition-list \\\n':
        '  bounded "$COMMAND_TIMEOUT_SECONDS" security set-key-partition-list \\\n',
    '  security add-trusted-cert -d -r trustRoot -k "$KEYCHAIN" "$TEMP_ROOT/certificate.pem" \\\n':
        '  bounded "$COMMAND_TIMEOUT_SECONDS" security add-trusted-cert -d -r trustRoot -k "$KEYCHAIN" "$TEMP_ROOT/certificate.pem" \\\n',
    '  IDENTITY="$(security find-identity -v -p codesigning "$KEYCHAIN" | awk \'/Drift CI Runtime/ {print $2; exit}\')"\n':
        '  IDENTITY="$(bounded "$COMMAND_TIMEOUT_SECONDS" security find-identity -v -p codesigning "$KEYCHAIN" | awk \'/Drift CI Runtime/ {print $2; exit}\')"\n',
    '    codesign \\\n      --keychain "$KEYCHAIN" \\\n':
        '    bounded "$COMMAND_TIMEOUT_SECONDS" codesign \\\n      --keychain "$KEYCHAIN" \\\n',
}
for old, new in command_replacements.items():
    source = replace_once(source, old, new, f"bounded command {old.splitlines()[0]!r}")

SCRIPT.write_text(source, encoding="utf-8")

checker = r'''import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const matrixPath = join(root, "scripts/probe-macos-packaged-webview.sh");
if (!existsSync(matrixPath)) throw new Error("packaged-WebView matrix script is missing");
const source = readFileSync(matrixPath, "utf8");
const required = [
  'DRIFT_WEBVIEW_MATRIX_TIMEOUT:-75',
  'DRIFT_WEBVIEW_LOG_TIMEOUT:-18',
  'DRIFT_WEBVIEW_COMMAND_TIMEOUT:-20',
  'run-bounded.py',
  'except subprocess.TimeoutExpired',
  'log collection stopped after its',
  '"--last", "4m"',
  'bounded "$COMMAND_TIMEOUT_SECONDS" security',
  'bounded "$COMMAND_TIMEOUT_SECONDS" codesign',
  'bounded "$COMMAND_TIMEOUT_SECONDS" spctl',
  'bounded "$COMMAND_TIMEOUT_SECONDS" openssl',
  'bounded "$COMMAND_TIMEOUT_SECONDS" ditto',
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`packaged-WebView matrix lost ${JSON.stringify(marker)}`);
}
if (/^\s*log show\s/m.test(source)) {
  throw new Error("packaged-WebView logs are again collected by an unbounded shell command");
}
const launch = Number(source.match(/DRIFT_WEBVIEW_MATRIX_TIMEOUT:-(\d+)/)?.[1]);
const logs = Number(source.match(/DRIFT_WEBVIEW_LOG_TIMEOUT:-(\d+)/)?.[1]);
const commands = Number(source.match(/DRIFT_WEBVIEW_COMMAND_TIMEOUT:-(\d+)/)?.[1]);
if (!(launch <= 75 && logs <= 18 && commands <= 20)) {
  throw new Error(`matrix budgets expanded unexpectedly: launch=${launch}, logs=${logs}, commands=${commands}`);
}
console.log("Packaged-WebView evidence budget passed: app launches, system-log capture, signing inspection, identity setup, and bundle copies are bounded.");
'''
(ROOT / "scripts/check-macos-matrix-budget.mjs").write_text(checker, encoding="utf-8")

package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
current = package["scripts"]["check:mac-source"]
anchor = "node scripts/check-native-import-contract.mjs && "
if anchor not in current:
    raise RuntimeError("package.json matrix-check anchor changed")
if "check-macos-matrix-budget" not in current:
    package["scripts"]["check:mac-source"] = current.replace(
        anchor,
        anchor + "node scripts/check-macos-matrix-budget.mjs && ",
        1,
    )
package_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")

print("Applied bounded packaged-WebView evidence budgets.")
