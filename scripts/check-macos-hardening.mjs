import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (path) => join(root, path);
const fail = (message) => { throw new Error(`macOS hardening contract failed: ${message}`); };
const read = (path) => {
  if (!existsSync(at(path))) fail(`missing ${path}`);
  return readFileSync(at(path), "utf8");
};
const requireMarkers = (path, markers) => {
  const text = read(path);
  for (const marker of markers) {
    if (!text.includes(marker)) fail(`${path} is missing ${JSON.stringify(marker)}`);
  }
  return text;
};
const forbidMarkers = (path, markers) => {
  const text = read(path);
  for (const marker of markers) {
    if (text.includes(marker)) fail(`${path} contains forbidden ${JSON.stringify(marker)}`);
  }
};

const broker = requireMarkers("macos/App/NativeFileBroker.swift", [
  "private let driftRenameExclusiveFlag: UInt32 = 0x00000004",
  "enum WriteDisposition",
  "case createOnly",
  "writeDisposition: .createOnly",
  "Darwin.renamex_np(sourcePath, destinationPath, driftRenameExclusiveFlag)",
  "guard !exists else { throw frameCollision(name) }",
  "Existing PNG sequence files are never overwritten.",
  "create:true leaked an empty sequence frame before commit",
  "Commit-time frame collision unexpectedly overwrote a file",
  "Aborted sequence write left a final frame behind",
  "fileGrants.removeAll()",
  "directoryGrants.removeAll()",
  "abortAll left a stale file capability usable",
]);
if ((broker.match(/Darwin\.renamex_np/g) ?? []).length !== 1) {
  fail("create-only sequence commit must have exactly one exclusive rename path");
}
forbidMarkers("macos/App/NativeFileBroker.swift", [
  "if !exists && create && !fileManager.createFile(atPath: fileURL.path",
  "return try registerFile(fileURL, mode: .readWrite)\n    }\n\n    func removeDirectoryEntry",
]);

const host = requireMarkers("macos/App/NativeBridgeHost.swift", [
  "case \"runtime-info\":\n            resetCapabilitiesForDocumentBoot()",
  "private func resetCapabilitiesForDocumentBoot()",
  "broker.abortAll()",
  "aacBroker.closeAll()",
  "inputIntent = nil",
  "clientState = ClientState()",
  "clientStateDidChange?(clientState)",
  "This covers manual reload",
]);
const resetStart = host.indexOf("private func resetCapabilitiesForDocumentBoot()");
const resetEnd = host.indexOf("private func runtimeInfo()", resetStart);
const resetBody = host.slice(resetStart, resetEnd);
for (const marker of ["exportActivityGuard.end()", "broker.abortAll()", "aacBroker.closeAll()", "inputIntent = nil", "clientState = ClientState()"]) {
  if (!resetBody.includes(marker)) fail(`document-boot reset lost ${JSON.stringify(marker)}`);
}

const bridge = read("macos/NativeBridge.js");
const runtimeBootCalls = bridge.match(/callNative\("runtime-info"\)/g) ?? [];
if (runtimeBootCalls.length !== 1) {
  fail(`NativeBridge.js must make exactly one runtime-info call per document; found ${runtimeBootCalls.length}`);
}
requireMarkers("macos/NativeBridge.js", [
  "const boot = () => {",
  "document.addEventListener(\"DOMContentLoaded\", boot, { once: true })",
]);

requireMarkers("src/components/NativeFileInputBridge.tsx", [
  "nativeImportKindForInput",
  "assignFilesAndDispatchChange",
  "document.addEventListener(\"click\", onClick, true)",
  "event.preventDefault()",
  "event.stopImmediatePropagation()",
  "pickNativeMacFiles(kind, input.multiple)",
  "Finish or cancel the open file chooser",
  "role=\"alert\"",
  "aria-live=\"assertive\"",
]);
requireMarkers("src/main.tsx", [
  "import { NativeFileInputBridge }",
  "<NativeFileInputBridge />",
]);
requireMarkers("tests/nativeFileInputBridge.test.ts", [
  "routes portable projects",
  "routes every supported presenter spelling",
  "routes image and unknown file contracts",
]);

console.log(
  "macOS hardening contract passed: PNG sequence commits are exclusive and crash-clean, document boots revoke stale capabilities, and File-menu imports use explicit typed native pickers.",
);
