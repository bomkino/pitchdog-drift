import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../linux/main.cjs", import.meta.url), "utf8");
const preload = await readFile(new URL("../linux/preload.cjs", import.meta.url), "utf8");
const authority = await readFile(new URL("../linux/documentAuthority.cjs", import.meta.url), "utf8");
const ipc = await readFile(new URL("../linux/ipcContract.cjs", import.meta.url), "utf8");
const builder = await readFile(new URL("./build-linux-tracer.mjs", import.meta.url), "utf8");

function requireText(source, fragment, label) {
  if (!source.includes(fragment)) throw new Error(`Linux tracer source is missing ${label}.`);
}

for (const [fragment, label] of [
  ["sandbox: true", "renderer sandbox"],
  ["contextIsolation: true", "context isolation"],
  ["nodeIntegration: false", "Node-disabled renderer"],
  ["allowRunningInsecureContent: false", "insecure-content denial"],
  ['setWindowOpenHandler(() => ({ action: "deny" }))', "window denial"],
  ["setPermissionRequestHandler", "permission denial"],
  ["setPermissionCheckHandler", "permission checks"],
  ["will-download", "download denial"],
  ["will-navigate", "navigation denial"],
  ["drift://app", "packaged application origin"],
  ["connect-src 'none'", "network CSP"],
]) requireText(main, fragment, label);

requireText(preload, 'contextBridge.exposeInMainWorld("__DRIFT_LINUX_DESKTOP__"', "narrow preload API");
requireText(preload, "validateDesktopReply", "renderer-side reply validation");
for (const method of [
  "choosePortableProject",
  "finalizePortableProjectOpen",
  "abandonPortableProjectOpen",
  "savePortableProject",
  "revertPortableProject",
]) requireText(preload, method, `${method} preload method`);

for (const forbidden of [
  /\b(?:exec|execFile|spawn|fork)\s*\(/u,
  /shell\.open/u,
  /process\.env/u,
  /\bfetch\s*\(/u,
  /\bWebSocket\b/u,
  /readFile|writeFile|readdir|statSync/u,
]) {
  if (forbidden.test(preload)) throw new Error(`Linux preload exposes forbidden authority: ${forbidden}`);
}

for (const fragment of [
  "MAX_PROJECT_BYTES",
  "MAX_ACTIVE_GRANTS",
  "randomUUID()",
  'scope: "pending-open"',
  "readbackVerified: true",
  "drift-stage-",
  "revokeAll()",
]) requireText(authority, fragment, `document-authority marker ${fragment}`);

for (const fragment of [
  "MAX_CONTROL_BYTES",
  "exactKeys",
  "validateDesktopReply",
  "validateDesktopRequest",
  "safeDesktopFailure",
]) requireText(ipc, fragment, `IPC marker ${fragment}`);

requireText(builder, 'ELECTRON_VERSION = "44.0.0"', "Electron version pin");
requireText(builder, 'ELECTRON_ARCHIVE_SHA256 = "d65286d812719f2b4c1a1b806a80f288a1058c89c7b058dae1e03ab25e499446"', "Electron archive pin");
if (/electron-on-mac|darwin-electron/iu.test(main + preload + authority + ipc + builder)) {
  throw new Error("Linux tracer source contains an Electron-on-Mac route.");
}

console.log("Linux tracer source contract passed: pinned external Electron toolchain, strict packaged origin, sandbox/context isolation/Node denial, narrow preload, bounded opaque grants, runtime IPC validation, readback, revocation, and default-deny navigation/network authority.");
