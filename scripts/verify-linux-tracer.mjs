import { createHash } from "node:crypto";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const artifactInput = process.env.DRIFT_LINUX_TRACER_DIR;
if (!artifactInput) {
  console.error("Set DRIFT_LINUX_TRACER_DIR to one exact packaged-directory tracer.");
  process.exit(1);
}
const artifact = resolve(artifactInput);
const appRoot = join(artifact, "resources", "app");
const buildReceiptPath = join(appRoot, "BuildReceipt.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const receipt = JSON.parse(await readFile(buildReceiptPath, "utf8").catch(() => fail("Linux build receipt is unavailable.")));
if (receipt.schema !== "dog.pitch.drift/linux-tracer-build-receipt/1"
  || receipt.product !== "dog.pitch.drift"
  || !/^[a-f0-9]{40}$/u.test(receipt.sourceCommit)
  || !/^[a-f0-9]{40}$/u.test(receipt.sourceTree)
  || receipt.electron?.version !== "44.0.0"
  || receipt.electron?.archiveSha256 !== "d65286d812719f2b4c1a1b806a80f288a1058c89c7b058dae1e03ab25e499446") {
  fail("Linux build receipt identity is invalid.");
}
for (const entry of receipt.appFiles) {
  if (!entry.path || entry.path.startsWith("/") || entry.path.split("/").includes("..")) {
    fail("Linux build receipt contains an unsafe app path.");
  }
  const bytes = await readFile(join(appRoot, entry.path));
  if (bytes.byteLength !== entry.bytes || sha256(bytes) !== entry.sha256) {
    fail(`Linux app file failed receipt verification: ${entry.path}`);
  }
}
const sandboxMode = (await stat(join(artifact, "chrome-sandbox"))).mode & 0o7777;
if (sandboxMode !== 0o4755) fail("Electron chrome-sandbox is not root-owned setuid 4755 in the tracer artifact.");

const mainSource = await readFile(join(appRoot, "linux", "main.cjs"), "utf8");
const preloadSource = await readFile(join(appRoot, "linux", "preload.cjs"), "utf8");
for (const required of [
  "sandbox: true",
  "contextIsolation: true",
  "nodeIntegration: false",
  'setWindowOpenHandler(() => ({ action: "deny" }))',
  'setPermissionRequestHandler((_contents, _permission, callback) => callback(false))',
  "connect-src 'none'",
]) {
  if (!mainSource.includes(required)) fail(`Linux host source is missing security marker: ${required}`);
}
if (!preloadSource.includes('contextBridge.exposeInMainWorld("__DRIFT_LINUX_DESKTOP__"')
  || /readFile|writeFile|exec|spawn|shell|process\.env/u.test(preloadSource)) {
  fail("Linux preload does not retain its narrow authority shape.");
}

const work = await mkdtemp(join(tmpdir(), "drift-linux-runtime-"));
const fixture = join(work, "fixture.pitched");
const destination = join(work, "saved.pitched");
const runtimeReceipt = join(work, "runtime-receipt.json");
const fixtureResult = spawnSync(process.execPath, [join(appRoot, "linux", "fixtureGenerator.mjs"), fixture], {
  cwd: artifact,
  encoding: "utf8",
  timeout: 30_000,
});
if (fixtureResult.status !== 0) {
  await rm(work, { recursive: true, force: true });
  fail(`Canonical Linux fixture generation failed:\n${fixtureResult.stdout ?? ""}${fixtureResult.stderr ?? ""}`);
}
await chmod(fixture, 0o666);
await chmod(work, 0o777);

const result = spawnSync("setpriv", [
  "--reuid=65534",
  "--regid=65534",
  "--clear-groups",
  join(artifact, "electron"),
  "--headless",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--drift-linux-self-test",
  `--drift-linux-self-test-fixture=${fixture}`,
  `--drift-linux-self-test-destination=${destination}`,
  `--drift-linux-self-test-receipt=${runtimeReceipt}`,
], {
  cwd: artifact,
  encoding: "utf8",
  timeout: 60_000,
  env: {
    PATH: process.env.PATH,
    HOME: work,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "false",
  },
});
if (result.status !== 0) {
  await rm(work, { recursive: true, force: true });
  fail(`Linux packaged runtime self-test failed (${String(result.status)}):\n${result.stdout ?? ""}${result.stderr ?? ""}`);
}
const runtime = JSON.parse(await readFile(runtimeReceipt, "utf8"));
if (runtime.ok !== true
  || runtime.sourceCommit !== receipt.sourceCommit
  || runtime.sourceTree !== receipt.sourceTree
  || runtime.security?.sandbox !== true
  || runtime.security?.contextIsolation !== true
  || runtime.security?.nodeIntegration !== false
  || runtime.document?.guessedGrantRejected !== true
  || runtime.document?.rawPathExposed !== false
  || runtime.renderer?.nodeReachable !== false) {
  await rm(work, { recursive: true, force: true });
  fail("Linux runtime receipt failed verification.");
}
const retained = process.env.DRIFT_LINUX_RUNTIME_RECEIPT;
if (retained) await writeFile(resolve(retained), `${JSON.stringify(runtime, null, 2)}\n`, { mode: 0o600 });
await rm(work, { recursive: true, force: true });
console.log("Drift Linux packaged-directory tracer verified.");
