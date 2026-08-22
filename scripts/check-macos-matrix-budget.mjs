import { existsSync, readFileSync } from "node:fs";
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
  '"--start", start_text',
  'processIdentifier == {pid}',
  'No exact app/WebContent PIDs were recorded; broad logs were intentionally not collected.',
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
if (source.includes('"--last", "4m"')) {
  throw new Error("packaged-WebView logs are again collected across a broad time window");
}
if (source.includes("add-trusted-cert")) {
  throw new Error("packaged-WebView verification may not mutate an admin trust domain");
}
const launch = Number(source.match(/DRIFT_WEBVIEW_MATRIX_TIMEOUT:-(\d+)/)?.[1]);
const logs = Number(source.match(/DRIFT_WEBVIEW_LOG_TIMEOUT:-(\d+)/)?.[1]);
const commands = Number(source.match(/DRIFT_WEBVIEW_COMMAND_TIMEOUT:-(\d+)/)?.[1]);
if (!(launch <= 75 && logs <= 18 && commands <= 20)) {
  throw new Error(`matrix budgets expanded unexpectedly: launch=${launch}, logs=${logs}, commands=${commands}`);
}
console.log("Packaged-WebView evidence budget passed: app launches, system-log capture, signing inspection, identity setup, and bundle copies are bounded.");
